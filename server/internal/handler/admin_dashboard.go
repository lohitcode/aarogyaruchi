package handler

import (
	"net/http"
	"time"

	"aarogyaruchi/internal/db/sqlc"

	"github.com/jackc/pgx/v5/pgtype"
)

// maxDashboardRange bounds the placed-time window so a stray query cannot
// scan the whole table.
const maxDashboardRange = 366 * 24 * time.Hour

// AdminDashboard aggregates the day at a glance: status buckets, totals,
// active runs, and orders needing action.
//
// Day mode (default): delivery_date = today, overridable via
// ?delivery_date=YYYY-MM-DD. Range mode: ?start and ?end (both required,
// RFC3339) switch the order aggregates to the placed-time window
// [start, end) and count runs across the covered delivery dates.
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

	var startTS, endTS pgtype.Timestamptz
	if v := r.URL.Query().Get("start"); v != "" || r.URL.Query().Get("end") != "" {
		s, err := time.Parse(time.RFC3339, r.URL.Query().Get("start"))
		if err != nil {
			h.Error(w, http.StatusBadRequest, "invalid start (use RFC3339, e.g. 2026-08-28T18:30:00Z)")
			return
		}
		e, err := time.Parse(time.RFC3339, r.URL.Query().Get("end"))
		if err != nil {
			h.Error(w, http.StatusBadRequest, "invalid end (use RFC3339, e.g. 2026-08-29T18:30:00Z)")
			return
		}
		if !s.Before(e) {
			h.Error(w, http.StatusBadRequest, "start must be before end")
			return
		}
		if e.Sub(s) > maxDashboardRange {
			h.Error(w, http.StatusBadRequest, "range too wide (max 366 days)")
			return
		}
		startTS, endTS = pgTS(s), pgTS(e)
	}

	// Range mode filters on placed time only; the delivery-date filter
	// stays unset so the two modes never combine.
	filterDate := deliveryDate
	if startTS.Valid {
		filterDate = pgtype.Date{}
	}

	counts, err := h.queries.DashboardStatusCounts(ctx, sqlc.DashboardStatusCountsParams{
		DeliveryDate: filterDate,
		StartTs:      startTS,
		EndTs:        endTS,
	})
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

	activeRuns, runCount := 0, 0
	if startTS.Valid {
		rc, err := h.queries.DashboardRunCounts(ctx, sqlc.DashboardRunCountsParams{
			DeliveryDate:   pgtypeDateOf(startTS.Time.In(h.businessTimezone())),
			DeliveryDate_2: pgtypeDateOf(endTS.Time.In(h.businessTimezone())),
		})
		if err != nil {
			h.Error(w, http.StatusInternalServerError, "failed to fetch runs")
			return
		}
		activeRuns, runCount = int(rc.ActiveCount), int(rc.RunCount)
	} else {
		runs, err := h.queries.ListDeliveryRuns(ctx, sqlc.ListDeliveryRunsParams{
			DeliveryDate: deliveryDate,
		})
		if err != nil {
			h.Error(w, http.StatusInternalServerError, "failed to fetch runs")
			return
		}
		runCount = len(runs)
		for _, run := range runs {
			if run.Status == "dispatched" || run.Status == "in_progress" {
				activeRuns++
			}
		}
	}

	attention, err := h.queries.OrdersNeedingAttention(ctx, sqlc.OrdersNeedingAttentionParams{
		DeliveryDate: filterDate,
		StartTs:      startTS,
		EndTs:        endTS,
	})
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

	resp := map[string]any{
		"delivery_date":   deliveryDate.Time.Format("2006-01-02"),
		"order_count":     orderCount,
		"total_paise":     totalPaise,
		"by_status":       statusCounts,
		"active_runs":     activeRuns,
		"run_count":       runCount,
		"needs_attention": attentionViews,
	}
	if startTS.Valid {
		resp["range"] = map[string]string{
			"start": startTS.Time.Format(time.RFC3339),
			"end":   endTS.Time.Format(time.RFC3339),
		}
	}
	h.JSON(w, http.StatusOK, resp)
}

// pgtypeDateOf converts a wall-clock time to a pg date value.
func pgtypeDateOf(t time.Time) pgtype.Date {
	y, m, d := t.Date()
	return pgtype.Date{Time: time.Date(y, m, d, 0, 0, 0, 0, time.UTC), Valid: true}
}
