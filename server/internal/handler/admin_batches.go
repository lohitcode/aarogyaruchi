package handler

import (
	"net/http"
	"strconv"

	"aarogyaruchi/internal/db/sqlc"
	"aarogyaruchi/internal/middleware"
	"aarogyaruchi/internal/websocket"

	"github.com/go-chi/chi/v5"
)

// AdminListBatches returns recent daily batches with aggregate counts.
func (h *Handler) AdminListBatches(w http.ResponseWriter, r *http.Request) {
	batches, err := h.queries.ListBatches(r.Context(), sqlc.ListBatchesParams{MaxRows: 60})
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to fetch batches")
		return
	}

	views := make([]map[string]any, 0, len(batches))
	for _, b := range batches {
		counts, err := h.queries.BatchOrderCounts(r.Context(), pgInt8(b.ID))
		if err != nil {
			h.Error(w, http.StatusInternalServerError, "failed to aggregate batch")
			return
		}
		views = append(views, map[string]any{
			"batch_id":        b.ID,
			"order_date":      b.OrderDate.Time.Format("2006-01-02"),
			"delivery_date":   b.DeliveryDate.Time.Format("2006-01-02"),
			"cutoff_policy":   b.CutoffPolicy,
			"status":          b.Status,
			"order_count":     counts.OrderCount,
			"cancelled_count": counts.CancelledCount,
			"delivered_count": counts.DeliveredCount,
			"total_paise":     counts.TotalPaise,
		})
	}
	h.JSON(w, http.StatusOK, map[string]any{"batches": views})
}

// AdminGetBatch returns one batch with its preparation summary and orders.
func (h *Handler) AdminGetBatch(w http.ResponseWriter, r *http.Request) {
	batchID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		h.Error(w, http.StatusBadRequest, "invalid batch id")
		return
	}

	b, err := h.queries.GetBatch(r.Context(), batchID)
	if err != nil {
		h.Error(w, http.StatusNotFound, "batch not found")
		return
	}

	counts, err := h.queries.BatchOrderCounts(r.Context(), pgInt8(batchID))
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to aggregate batch")
		return
	}

	summary, err := h.queries.BatchPreparationSummary(r.Context(), pgInt8(batchID))
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to compute preparation summary")
		return
	}
	prepViews := make([]map[string]any, 0, len(summary))
	for _, row := range summary {
		prepViews = append(prepViews, map[string]any{
			"variant_id":     row.VariantID,
			"product_id":     row.ProductID,
			"name":           row.ProductName,
			"slug":           row.ProductSlug,
			"size_label":     row.ProductSizeLabel.String,
			"unit":           row.ProductUnit.String,
			"total_quantity": row.TotalQuantity,
			"order_count":    row.OrderCount,
		})
	}

	orders, err := h.queries.ListOrdersForBatch(r.Context(), pgInt8(batchID))
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to fetch orders")
		return
	}
	orderViews := make([]map[string]any, 0, len(orders))
	for _, o := range orders {
		orderViews = append(orderViews, orderSummaryView(o.ID, o.Code.String, o.Status.String, o.DeliveryDate, o.TotalAmountPaise, o.CreatedAt))
	}

	h.JSON(w, http.StatusOK, map[string]any{
		"batch_id":      b.ID,
		"order_date":    b.OrderDate.Time.Format("2006-01-02"),
		"delivery_date": b.DeliveryDate.Time.Format("2006-01-02"),
		"cutoff_policy": b.CutoffPolicy,
		"status":        b.Status,
		"closed_at":     b.ClosedAt.Time,
		"counts": map[string]any{
			"order_count":     counts.OrderCount,
			"cancelled_count": counts.CancelledCount,
			"total_paise":     counts.TotalPaise,
			"delivered_count": counts.DeliveredCount,
		},
		"preparation_summary": prepViews,
		"orders":              orderViews,
	})
}

// AdminCloseBatch closes a batch early. Closed batches never reopen, and
// already-placed orders are untouched.
func (h *Handler) AdminCloseBatch(w http.ResponseWriter, r *http.Request) {
	adminID, _ := middleware.GetAdminID(r.Context())

	batchID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		h.Error(w, http.StatusBadRequest, "invalid batch id")
		return
	}

	b, err := h.queries.GetBatch(r.Context(), batchID)
	if err != nil {
		h.Error(w, http.StatusNotFound, "batch not found")
		return
	}
	if b.Status != "open" {
		h.Error(w, http.StatusConflict, "batch already closed")
		return
	}

	rows, err := h.queries.CloseBatch(r.Context(), sqlc.CloseBatchParams{ID: batchID, ClosedBy: pgInt8(adminID)})
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to close batch")
		return
	}
	if rows == 0 {
		h.Error(w, http.StatusConflict, "batch already closed")
		return
	}

	h.hub.PublishBatchSummary(websocket.BatchSummaryPayload{
		BatchID:      b.ID,
		OrderDate:    b.OrderDate.Time.Format("2006-01-02"),
		DeliveryDate: b.DeliveryDate.Time.Format("2006-01-02"),
	})

	h.JSON(w, http.StatusOK, map[string]any{
		"batch_id": b.ID,
		"status":   "closed",
	})
}

// CurrentBatch exposes today's batch state (for the admin dashboard header).
func (h *Handler) CurrentBatch(w http.ResponseWriter, r *http.Request) {
	b, res, err := h.resolveCurrentBatch(r.Context(), h.queries)
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to resolve batch")
		return
	}
	h.JSON(w, http.StatusOK, map[string]any{
		"batch_id":      b.ID,
		"order_date":    res.OrderDate.Format("2006-01-02"),
		"delivery_date": b.DeliveryDate.Time.Format("2006-01-02"),
		"cutoff_policy": b.CutoffPolicy,
		"status":        b.Status,
	})
}
