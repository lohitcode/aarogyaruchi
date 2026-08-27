package handler

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"aarogyaruchi/internal/db/sqlc"
	"aarogyaruchi/internal/middleware"
	"aarogyaruchi/internal/orderstate"
	"aarogyaruchi/internal/websocket"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// AdminListOrders lists orders with date/batch/locality/run/partner/status/
// search filters and cursor pagination.
func (h *Handler) AdminListOrders(w http.ResponseWriter, r *http.Request) {
	params := sqlc.AdminListOrdersParams{MaxRows: int32(50)}

	q := r.URL.Query()
	if v := q.Get("delivery_date"); v != "" {
		if d, ok := pgDateText(v); ok {
			params.DeliveryDate = d
		} else {
			h.Error(w, http.StatusBadRequest, "invalid delivery_date")
			return
		}
	}
	for _, pair := range []struct {
		name string
		dst  *pgtype.Int8
	}{
		{"batch_id", &params.BatchID},
		{"locality_id", &params.LocalityID},
		{"run_id", &params.RunID},
		{"partner_id", &params.PartnerID},
		{"before_id", &params.BeforeID},
	} {
		if v := q.Get(pair.name); v != "" {
			if n, err := strconv.ParseInt(v, 10, 64); err == nil && n > 0 {
				*pair.dst = pgInt8(n)
			}
		}
	}
	if v := q.Get("status"); v != "" {
		if !orderstate.Valid(v) {
			h.Error(w, http.StatusBadRequest, "invalid status filter")
			return
		}
		params.Status = pgText(v)
	}
	if v := q.Get("search"); v != "" {
		params.Search = pgText(strings.TrimSpace(v))
	}
	if v := q.Get("limit"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 32); err == nil && n > 0 && n <= 200 {
			params.MaxRows = int32(n) + 1
		}
	}

	orders, err := h.queries.AdminListOrders(r.Context(), params)
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to list orders")
		return
	}

	limit := int32(50)
	if params.MaxRows != nil {
		if n, ok := params.MaxRows.(int32); ok && n > 1 {
			limit = n - 1
		}
	}
	hasMore := false
	if int32(len(orders)) > limit && limit > 0 {
		orders = orders[:limit]
		hasMore = true
	}

	views := make([]map[string]any, 0, len(orders))
	for _, o := range orders {
		view := orderSummaryView(o.ID, o.Code.String, o.Status.String, o.DeliveryDate, o.TotalAmountPaise, o.CreatedAt)
		view["customer_name"] = o.UserName.String
		view["customer_phone"] = o.UserPhone
		view["partner_name"] = o.PartnerName.String
		if o.RunID.Valid {
			view["run_id"] = o.RunID.Int64
			view["stop_position"] = o.StopPosition.Int32
			view["stop_status"] = o.StopStatus.String
		}
		views = append(views, view)
	}

	resp := map[string]any{"orders": views}
	if hasMore && len(orders) > 0 {
		resp["next_before_id"] = orders[len(orders)-1].ID
	}
	h.JSON(w, http.StatusOK, resp)
}

// AdminGetOrder returns full order detail for the admin panel.
func (h *Handler) AdminGetOrder(w http.ResponseWriter, r *http.Request) {
	orderID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		h.Error(w, http.StatusBadRequest, "invalid order id")
		return
	}

	order, err := h.queries.GetOrderForAdmin(r.Context(), orderID)
	if err != nil {
		if isNoRows(err) {
			h.Error(w, http.StatusNotFound, "order not found")
			return
		}
		h.Error(w, http.StatusInternalServerError, "failed to fetch order")
		return
	}

	items, _ := h.queries.GetOrderItems(r.Context(), orderID)
	history, _ := h.queries.ListOrderStatusHistory(r.Context(), orderID)

	itemViews := make([]map[string]any, 0, len(items))
	for _, it := range items {
		itemViews = append(itemViews, map[string]any{
			"variant_id":        it.VariantID,
			"name":              it.ProductName,
			"size_label":        it.ProductSizeLabel.String,
			"quantity":          it.Quantity,
			"unit_price_paise":  it.UnitPricePaise,
			"total_price_paise": it.UnitPricePaise * int64(it.Quantity),
		})
	}
	timeline := make([]map[string]any, 0, len(history))
	for _, row := range history {
		timeline = append(timeline, map[string]any{
			"status":     row.ToStatus,
			"from":       row.FromStatus.String,
			"actor_type": row.ActorType,
			"note":       row.Note.String,
			"at":         row.CreatedAt.Time,
		})
	}

	h.JSON(w, http.StatusOK, map[string]any{
		"order_id":       order.ID,
		"code":           order.Code.String,
		"status":         order.Status.String,
		"delivery_date":  order.DeliveryDate.Time.Format("2006-01-02"),
		"total_paise":    order.TotalAmountPaise,
		"payment_method": order.PaymentMethod,
		"created_at":     order.CreatedAt.Time,
		"customer": map[string]any{
			"id":    order.UserID,
			"name":  order.UserName.String,
			"phone": order.UserPhone,
		},
		"partner": map[string]any{
			"id":   order.DeliveryPartnerID.Int64,
			"name": order.PartnerName.String,
		},
		"address": map[string]any{
			"address_line": order.ShipAddressLine.String,
			"landmark":     order.ShipLandmark.String,
			"instructions": order.ShipInstructions.String,
			"latitude":     order.ShipLatitude.Float64,
			"longitude":    order.ShipLongitude.Float64,
		},
		"items":          itemViews,
		"timeline":       timeline,
		"failure_reason": order.FailureReason.String,
		"package_token":  order.PackageToken.String,
	})
}

type updateStatusRequest struct {
	Status string `json:"status"`
	Note   string `json:"note"`
}

// AdminUpdateOrderStatus applies a validated lifecycle transition.
func (h *Handler) AdminUpdateOrderStatus(w http.ResponseWriter, r *http.Request) {
	adminID, _ := middleware.GetAdminID(r.Context())
	orderID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		h.Error(w, http.StatusBadRequest, "invalid order id")
		return
	}

	var req updateStatusRequest
	if err := decodeJSON(r, &req); err != nil || !orderstate.Valid(req.Status) {
		h.Error(w, http.StatusBadRequest, "status is required")
		return
	}

	var order sqlc.Order
	err = h.withTx(r.Context(), func(q *sqlc.Queries) error {
		var err error
		order, err = q.GetOrderForUpdate(r.Context(), orderID)
		if err != nil {
			return errNotFound
		}
		return applyOrderTransition(r.Context(), q, order, req.Status, "admin", adminID, req.Note)
	})
	if err != nil {
		writeTransitionError(w, err)
		return
	}

	h.hub.PublishOrderStatus(websocket.OrderStatusPayload{
		OrderID: order.ID, Code: order.Code.String, Status: req.Status, From: order.Status.String,
	}, order.UserID, order.DeliveryPartnerID.Int64)

	h.JSON(w, http.StatusOK, map[string]any{"order_id": order.ID, "status": req.Status})
}

type bulkStatusRequest struct {
	OrderIDs []int64 `json:"order_ids"`
	Status   string  `json:"status"`
	Note     string  `json:"note"`
}

// AdminBulkStatus applies one transition to many orders atomically; orders
// that cannot make the transition are reported, not fatal.
func (h *Handler) AdminBulkStatus(w http.ResponseWriter, r *http.Request) {
	adminID, _ := middleware.GetAdminID(r.Context())

	var req bulkStatusRequest
	if err := decodeJSON(r, &req); err != nil || !orderstate.Valid(req.Status) || len(req.OrderIDs) == 0 {
		h.Error(w, http.StatusBadRequest, "order_ids and a valid status are required")
		return
	}
	if len(req.OrderIDs) > 500 {
		h.Error(w, http.StatusBadRequest, "too many orders (max 500)")
		return
	}

	updated := make([]int64, 0, len(req.OrderIDs))
	skipped := make([]map[string]any, 0)
	err := h.withTx(r.Context(), func(q *sqlc.Queries) error {
		for _, id := range req.OrderIDs {
			order, err := q.GetOrderForUpdate(r.Context(), id)
			if err != nil {
				skipped = append(skipped, map[string]any{"order_id": id, "reason": "not found"})
				continue
			}
			if err := applyOrderTransition(r.Context(), q, order, req.Status, "admin", adminID, req.Note); err != nil {
				var te transitionError
				if errors.As(err, &te) {
					skipped = append(skipped, map[string]any{"order_id": id, "reason": te.Error()})
					continue
				}
				return err
			}
			updated = append(updated, id)
			h.hub.PublishOrderStatus(websocket.OrderStatusPayload{
				OrderID: order.ID, Code: order.Code.String, Status: req.Status, From: order.Status.String,
			}, order.UserID, order.DeliveryPartnerID.Int64)
		}
		return nil
	})
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "bulk update failed")
		return
	}

	h.JSON(w, http.StatusOK, map[string]any{"updated": updated, "skipped": skipped})
}

// writeTransitionError maps transition failures to client responses.
func writeTransitionError(w http.ResponseWriter, err error) {
	var te transitionError
	switch {
	case errors.As(err, &te):
		http.Error(w, `{"error":"`+te.Error()+`"}`, http.StatusConflict)
	case errors.Is(err, errNotFound):
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
	case errors.Is(err, errConcurrentTransition):
		http.Error(w, `{"error":"order changed concurrently, retry"}`, http.StatusConflict)
	default:
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
	}
}
