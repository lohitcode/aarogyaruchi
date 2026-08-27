package handler

import (
	"net/http"
	"time"

	"aarogyaruchi/internal/db/sqlc"

	"github.com/jackc/pgx/v5/pgtype"
)

// AdminDashboard aggregates the day at a glance: status buckets, totals,
// active runs, and orders needing action.
func (h *Handler) AdminDashboard(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	deliveryDate := pgtypeDateOf(time.Now().In(h.businessTimezone()))
	if v := r.URL.Query().Get("delivery_date"); v != "" {
		if d, ok := pgDateText(v); ok {
			deliveryDate = d
		} else {
			h.Error(w, http.StatusBadRequest, "invalid delivery_date (use YYYY-MM-DD)")
			return
		}
	}

	counts, err := h.queries.DashboardStatusCounts(ctx, deliveryDate)
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to aggregate orders")
		return
	}
	statusCounts := make(map[string]map[string]int64, len(counts))
	var totalPaise int64
	var orderCount int64
	for _, c := range counts {
		statusCounts[c.Status.String] = map[string]int64{"count": c.Count, "total_paise": c.TotalPaise}
		totalPaise += c.TotalPaise
		orderCount += c.Count
	}

	runs, err := h.queries.ListDeliveryRuns(ctx, sqlc.ListDeliveryRunsParams{
		DeliveryDate: deliveryDate,
	})
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to fetch runs")
		return
	}
	activeRuns := 0
	for _, run := range runs {
		if run.Status == "dispatched" || run.Status == "in_progress" {
			activeRuns++
		}
	}

	attention, err := h.queries.OrdersNeedingAttention(ctx, deliveryDate)
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to fetch pending orders")
		return
	}
	attentionViews := make([]map[string]any, 0, len(attention))
	for _, o := range attention {
		attentionViews = append(attentionViews, map[string]any{
			"order_id":    o.ID,
			"code":        o.Code.String,
			"status":      o.Status.String,
			"customer":    o.UserName.String,
			"total_paise": o.TotalAmountPaise,
			"created_at":  o.CreatedAt.Time,
		})
	}

	h.JSON(w, http.StatusOK, map[string]any{
		"delivery_date":   deliveryDate.Time.Format("2006-01-02"),
		"order_count":     orderCount,
		"total_paise":     totalPaise,
		"by_status":       statusCounts,
		"active_runs":     activeRuns,
		"run_count":       len(runs),
		"needs_attention": attentionViews,
	})
}

// pgtypeDateOf converts a wall-clock time to a pg date value.
func pgtypeDateOf(t time.Time) pgtype.Date {
	y, m, d := t.Date()
	return pgtype.Date{Time: time.Date(y, m, d, 0, 0, 0, 0, time.UTC), Valid: true}
}
