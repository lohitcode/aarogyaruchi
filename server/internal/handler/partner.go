package handler

import (
	"errors"
	"net/http"
	"strconv"

	"aarogyaruchi/internal/db/sqlc"
	"aarogyaruchi/internal/middleware"
	"aarogyaruchi/internal/orderstate"
	"aarogyaruchi/internal/websocket"

	"github.com/go-chi/chi/v5"
)

// requirePartnerID extracts the partner identity set by RequirePartner.
func requirePartnerID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	partnerID, ok := middleware.GetDeliveryPartnerID(r.Context())
	if !ok || partnerID <= 0 {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return 0, false
	}
	return partnerID, true
}

// GetPartnerMe returns the logged-in partner's profile.
func (h *Handler) GetPartnerMe(w http.ResponseWriter, r *http.Request) {
	partnerID, _ := middleware.GetDeliveryPartnerID(r.Context())
	partner, err := h.queries.GetDeliveryPartner(r.Context(), partnerID)
	if err != nil {
		h.Error(w, http.StatusNotFound, "partner not found")
		return
	}
	h.JSON(w, http.StatusOK, map[string]any{
		"partner_id": partner.ID,
		"name":       partner.Name.String,
		"phone":      partner.Phone,
		"is_active":  partner.IsActive.Bool,
	})
}

// ListPartnerRuns returns the runs assigned to this partner.
func (h *Handler) ListPartnerRuns(w http.ResponseWriter, r *http.Request) {
	partnerID, _ := middleware.GetDeliveryPartnerID(r.Context())

	params := sqlc.ListRunsForPartnerParams{PartnerID: pgInt8(partnerID)}
	if dateStr := r.URL.Query().Get("date"); dateStr != "" {
		if d, ok := pgDateText(dateStr); ok {
			params.DeliveryDate = d
		} else {
			h.Error(w, http.StatusBadRequest, "invalid date (use YYYY-MM-DD)")
			return
		}
	}

	runs, err := h.queries.ListRunsForPartner(r.Context(), params)
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to fetch runs")
		return
	}

	views := make([]map[string]any, 0, len(runs))
	for _, run := range runs {
		views = append(views, map[string]any{
			"run_id":        run.ID,
			"delivery_date": run.DeliveryDate.Time.Format("2006-01-02"),
			"name":          run.Name.String,
			"status":        run.Status,
			"stop_count":    run.StopCount,
		})
	}
	h.JSON(w, http.StatusOK, map[string]any{"runs": views})
}

// GetPartnerRun returns one assigned run with ordered stops, package
// summaries, customer contact/address, coordinates, and cash due.
func (h *Handler) GetPartnerRun(w http.ResponseWriter, r *http.Request) {
	partnerID, _ := middleware.GetDeliveryPartnerID(r.Context())
	runID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		h.Error(w, http.StatusBadRequest, "invalid run id")
		return
	}

	run, err := h.queries.GetDeliveryRun(r.Context(), runID)
	if err != nil || !run.PartnerID.Valid || run.PartnerID.Int64 != partnerID {
		h.Error(w, http.StatusNotFound, "run not found")
		return
	}

	stops, err := h.queries.ListRunStops(r.Context(), runID)
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to fetch stops")
		return
	}

	stopViews := make([]map[string]any, 0, len(stops))
	var cashDue int64
	for _, s := range stops {
		if s.Status == "delivered" && s.CollectedAmountPaise.Valid {
			cashDue += s.CollectedAmountPaise.Int64
		}
		stopViews = append(stopViews, map[string]any{
			"stop_id":         s.ID,
			"position":        s.Position,
			"status":          s.Status,
			"order_id":        s.OrderID,
			"order_code":      s.OrderCode.String,
			"order_status":    s.OrderStatus.String,
			"total_paise":     s.TotalAmountPaise,
			"customer_name":   s.CustomerName.String,
			"customer_phone":  s.CustomerPhone,
			"address_line":    s.ShipAddressLine.String,
			"landmark":        s.ShipLandmark.String,
			"instructions":    s.ShipInstructions.String,
			"locality":        s.LocalityName.String,
			"latitude":        s.ShipLatitude.Float64,
			"longitude":       s.ShipLongitude.Float64,
			"collected_paise": s.CollectedAmountPaise.Int64,
			"failure_reason":  s.FailureReason.String,
			"note":            s.Note.String,
			"items":           h.orderItemSummaries(r, s.OrderID),
		})
	}

	totals, _ := h.queries.RunCashTotals(r.Context(), runID)

	h.JSON(w, http.StatusOK, map[string]any{
		"run_id":        run.ID,
		"delivery_date": run.DeliveryDate.Time.Format("2006-01-02"),
		"name":          run.Name.String,
		"status":        run.Status,
		"stops":         stopViews,
		"cash": map[string]any{
			"collected_paise": totals.CollectedPaise,
			"pending_paise":   totals.PendingPaise,
			"failed_paise":    totals.FailedPaise,
		},
	})
}

// orderItemSummaries returns the package contents for a stop (id + quantity
// + product name), used on run detail and scan views.
func (h *Handler) orderItemSummaries(r *http.Request, orderID int64) []map[string]any {
	items, err := h.queries.GetOrderItems(r.Context(), orderID)
	if err != nil {
		return []map[string]any{}
	}
	views := make([]map[string]any, 0, len(items))
	for _, it := range items {
		views = append(views, map[string]any{
			"variant_id": it.VariantID,
			"name":       it.ProductName,
			"size_label": it.ProductSizeLabel.String,
			"quantity":   it.Quantity,
		})
	}
	return views
}

// runPartnerAction wraps the common authz for run-level partner actions: the
// run must exist and be assigned to the calling partner.
func (h *Handler) runForPartner(w http.ResponseWriter, r *http.Request, allowedStatuses ...string) (sqlc.DeliveryRun, bool) {
	partnerID, _ := middleware.GetDeliveryPartnerID(r.Context())
	runID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		h.Error(w, http.StatusBadRequest, "invalid run id")
		return sqlc.DeliveryRun{}, false
	}
	run, err := h.queries.GetDeliveryRun(r.Context(), runID)
	if err != nil || !run.PartnerID.Valid || run.PartnerID.Int64 != partnerID {
		h.Error(w, http.StatusNotFound, "run not found")
		return sqlc.DeliveryRun{}, false
	}
	for _, s := range allowedStatuses {
		if run.Status == s {
			return run, true
		}
	}
	h.Error(w, http.StatusConflict, "run is "+run.Status)
	return sqlc.DeliveryRun{}, false
}

// AcceptPartnerRun acknowledges an assigned/dispatched run (idempotent).
func (h *Handler) AcceptPartnerRun(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.runForPartner(w, r, "assigned", "dispatched", "in_progress"); !ok {
		return
	}
	h.JSON(w, http.StatusOK, map[string]string{"message": "run accepted"})
}

// PickupPartnerRun marks every open order in the run as picked up.
func (h *Handler) PickupPartnerRun(w http.ResponseWriter, r *http.Request) {
	run, ok := h.runForPartner(w, r, "dispatched", "in_progress")
	if !ok {
		return
	}
	partnerID, _ := middleware.GetDeliveryPartnerID(r.Context())

	var picked int
	err := h.withTx(r.Context(), func(q *sqlc.Queries) error {
		stops, err := q.ListRunStops(r.Context(), run.ID)
		if err != nil {
			return err
		}
		for _, s := range stops {
			if s.OrderStatus.String != orderstate.Assigned {
				continue
			}
			order, err := q.GetOrderForUpdate(r.Context(), s.OrderID)
			if err != nil {
				return err
			}
			if err := applyOrderTransition(r.Context(), q, order, orderstate.PickedUp, "partner", partnerID, "packages picked up"); err != nil {
				var te transitionError
				if errors.As(err, &te) {
					continue // someone else moved it; skip
				}
				return err
			}
			picked++
		}
		return nil
	})
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to record pickup")
		return
	}

	h.hub.PublishRunUpdated(websocket.RunPayload{RunID: run.ID, PartnerID: run.PartnerID.Int64})
	h.JSON(w, http.StatusOK, map[string]any{"picked_up_orders": picked})
}

type scanRequest struct {
	Token string `json:"token"`
}

// ScanPackage resolves a QR package token and validates that the package
// belongs to a run assigned to the calling partner.
func (h *Handler) ScanPackage(w http.ResponseWriter, r *http.Request) {
	partnerID, _ := middleware.GetDeliveryPartnerID(r.Context())

	var req scanRequest
	if err := decodeJSON(r, &req); err != nil || req.Token == "" {
		h.Error(w, http.StatusBadRequest, "token is required")
		return
	}

	order, err := h.queries.GetOrderByPackageToken(r.Context(), pgText(req.Token))
	if err != nil {
		if isNoRows(err) {
			h.Error(w, http.StatusNotFound, "package not found")
			return
		}
		h.Error(w, http.StatusInternalServerError, "scan failed")
		return
	}

	// Find the stop + run for this order and validate assignment.
	stops, err := h.queries.ListRunStopsForOrder(r.Context(), order.ID)
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "scan failed")
		return
	}
	for _, s := range stops {
		if s.Status == "skipped" {
			continue
		}
		run, err := h.queries.GetDeliveryRun(r.Context(), s.RunID)
		if err != nil || !run.PartnerID.Valid || run.PartnerID.Int64 != partnerID {
			break
		}
		h.JSON(w, http.StatusOK, map[string]any{
			"stop_id":       s.ID,
			"run_id":        s.RunID,
			"position":      s.Position,
			"order_id":      order.ID,
			"order_code":    order.Code.String,
			"status":        s.Status,
			"customer_name": order.UserName.String,
			"items":         h.orderItemSummaries(r, order.ID),
			"total_paise":   order.TotalAmountPaise,
		})
		return
	}

	// Exists but not assigned to this partner: reveal nothing.
	h.Error(w, http.StatusForbidden, "package not assigned to you")
}

// StartPartnerStop begins a delivery attempt and — for the first stop —
// sends the run out for delivery (all picked-up orders go out together).
func (h *Handler) StartPartnerStop(w http.ResponseWriter, r *http.Request) {
	stop, run, ok := h.stopForPartner(w, r)
	if !ok {
		return
	}
	partnerID, _ := middleware.GetDeliveryPartnerID(r.Context())

	err := h.withTx(r.Context(), func(q *sqlc.Queries) error {
		if rows, err := q.StartStop(r.Context(), stop.ID); err != nil || rows == 0 {
			return errStopState
		}
		if _, err := q.StartRun(r.Context(), run.ID); err != nil {
			return err
		}
		// First departure: every picked_up order in the run is now out.
		if run.Status == "dispatched" {
			stops, err := q.ListRunStops(r.Context(), run.ID)
			if err != nil {
				return err
			}
			for _, s := range stops {
				if s.OrderStatus.String != orderstate.PickedUp {
					continue
				}
				order, err := q.GetOrderForUpdate(r.Context(), s.OrderID)
				if err != nil {
					return err
				}
				if err := applyOrderTransition(r.Context(), q, order, orderstate.OutForDelivery, "partner", partnerID, ""); err != nil {
					var te transitionError
					if errors.As(err, &te) {
						continue
					}
					return err
				}
				h.hub.PublishOrderStatus(websocket.OrderStatusPayload{
					OrderID: order.ID, Code: order.Code.String,
					Status: orderstate.OutForDelivery, From: orderstate.PickedUp,
				}, order.UserID, partnerID)
			}
		}
		return nil
	})
	if err != nil {
		if errors.Is(err, errStopState) {
			h.Error(w, http.StatusConflict, "stop already started or finished")
			return
		}
		h.Error(w, http.StatusInternalServerError, "failed to start stop")
		return
	}

	h.hub.PublishRunUpdated(websocket.RunPayload{RunID: run.ID, PartnerID: run.PartnerID.Int64})
	h.JSON(w, http.StatusOK, map[string]any{"stop_id": stop.ID, "status": "in_progress"})
}

type deliveredRequest struct {
	CollectedAmountPaise *int64 `json:"collected_amount_paise"`
	Note                 string `json:"note"`
}

// CompletePartnerStop records a successful delivery with its cash result.
func (h *Handler) CompletePartnerStop(w http.ResponseWriter, r *http.Request) {
	stop, run, ok := h.stopForPartner(w, r)
	if !ok {
		return
	}
	partnerID, _ := middleware.GetDeliveryPartnerID(r.Context())

	var req deliveredRequest
	if err := decodeJSON(r, &req); err != nil || req.CollectedAmountPaise == nil {
		h.Error(w, http.StatusBadRequest, "collected_amount_paise is required")
		return
	}
	if *req.CollectedAmountPaise < 0 {
		h.Error(w, http.StatusBadRequest, "collected amount cannot be negative")
		return
	}

	err := h.withTx(r.Context(), func(q *sqlc.Queries) error {
		order, err := q.GetOrderForUpdate(r.Context(), stop.OrderID)
		if err != nil {
			return err
		}
		// Delivered requires a recorded cash result; a full collection must
		// match the order total, a waiver must be explicit (0 with note).
		if *req.CollectedAmountPaise > order.TotalAmountPaise {
			return errAmountTooHigh
		}
		if rows, err := q.CompleteStop(r.Context(), sqlc.CompleteStopParams{ID: stop.ID, CollectedAmountPaise: pgInt8(*req.CollectedAmountPaise), Note: pgText(req.Note)}); err != nil || rows == 0 {
			return errStopState
		}
		if _, err := q.SetOrderDelivered(r.Context(), sqlc.SetOrderDeliveredParams{ID: stop.OrderID, UpdatedByActor: pgText("partner")}); err != nil {
			return err
		}
		if err := q.InsertOrderStatusHistory(r.Context(), sqlc.InsertOrderStatusHistoryParams{
			OrderID:    order.ID,
			FromStatus: pgText(order.Status.String),
			ToStatus:   orderstate.Delivered,
			ActorType:  "partner",
			ActorID:    pgInt8(partnerID),
			Note:       pgText(cashNote(*req.CollectedAmountPaise, order.TotalAmountPaise, req.Note)),
		}); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		switch {
		case errors.Is(err, errStopState):
			h.Error(w, http.StatusConflict, "stop already finished")
		case errors.Is(err, errAmountTooHigh):
			h.Error(w, http.StatusBadRequest, "collected amount exceeds order total")
		default:
			h.Error(w, http.StatusInternalServerError, "failed to record delivery")
		}
		return
	}

	h.hub.PublishOrderStatus(websocket.OrderStatusPayload{
		OrderID: stop.OrderID, Code: stop.OrderCode.String, Status: orderstate.Delivered,
	}, stop.CustomerID, partnerID)
	h.hub.PublishRunUpdated(websocket.RunPayload{RunID: run.ID, PartnerID: run.PartnerID.Int64})
	h.JSON(w, http.StatusOK, map[string]any{"stop_id": stop.ID, "status": "delivered"})
}

func cashNote(collected, total int64, note string) string {
	if note != "" {
		return note
	}
	if collected == total {
		return "full cash collected"
	}
	if collected == 0 {
		return "cash waived (admin-approved exception)"
	}
	return "partial cash collected"
}

var failureReasons = map[string]bool{
	"customer_unavailable": true,
	"wrong_address":        true,
	"customer_refused":     true,
	"payment_issue":        true,
	"other":                true,
}

type failedRequest struct {
	Reason string `json:"reason"`
	Note   string `json:"note"`
}

// FailPartnerStop records a failed delivery attempt with a controlled reason.
func (h *Handler) FailPartnerStop(w http.ResponseWriter, r *http.Request) {
	stop, run, ok := h.stopForPartner(w, r)
	if !ok {
		return
	}
	partnerID, _ := middleware.GetDeliveryPartnerID(r.Context())

	var req failedRequest
	if err := decodeJSON(r, &req); err != nil || !failureReasons[req.Reason] {
		h.Error(w, http.StatusBadRequest, "reason must be one of customer_unavailable, wrong_address, customer_refused, payment_issue, other")
		return
	}

	err := h.withTx(r.Context(), func(q *sqlc.Queries) error {
		if rows, err := q.FailStop(r.Context(), sqlc.FailStopParams{ID: stop.ID, FailureReason: pgText(req.Reason), Note: pgText(req.Note)}); err != nil || rows == 0 {
			return errStopState
		}
		order, err := q.GetOrderForUpdate(r.Context(), stop.OrderID)
		if err != nil {
			return err
		}
		if _, err := q.SetOrderDeliveryFailed(r.Context(), sqlc.SetOrderDeliveryFailedParams{ID: stop.OrderID, FailureReason: pgText(req.Reason), UpdatedByActor: pgText("partner")}); err != nil {
			return err
		}
		return q.InsertOrderStatusHistory(r.Context(), sqlc.InsertOrderStatusHistoryParams{
			OrderID:    order.ID,
			FromStatus: pgText(order.Status.String),
			ToStatus:   orderstate.DeliveryFailed,
			ActorType:  "partner",
			ActorID:    pgInt8(partnerID),
			Note:       pgText(req.Reason + ": " + req.Note),
		})
	})
	if err != nil {
		if errors.Is(err, errStopState) {
			h.Error(w, http.StatusConflict, "stop already finished")
			return
		}
		h.Error(w, http.StatusInternalServerError, "failed to record failure")
		return
	}

	h.hub.PublishOrderStatus(websocket.OrderStatusPayload{
		OrderID: stop.OrderID, Code: stop.OrderCode.String, Status: orderstate.DeliveryFailed,
	}, stop.CustomerID, partnerID)
	h.hub.PublishRunUpdated(websocket.RunPayload{RunID: run.ID, PartnerID: run.PartnerID.Int64})
	h.JSON(w, http.StatusOK, map[string]any{"stop_id": stop.ID, "status": "failed"})
}

// CompletePartnerRun closes the run once every stop is terminal.
func (h *Handler) CompletePartnerRun(w http.ResponseWriter, r *http.Request) {
	run, ok := h.runForPartner(w, r, "in_progress", "dispatched")
	if !ok {
		return
	}

	var remaining int64
	err := h.withTx(r.Context(), func(q *sqlc.Queries) error {
		counts, err := q.CountOpenStopsForRun(r.Context(), run.ID)
		if err != nil {
			return err
		}
		remaining = counts.OpenCount
		if counts.OpenCount > 0 {
			return errStopsOpen
		}
		_, err = q.CompleteRun(r.Context(), run.ID)
		return err
	})
	if err != nil {
		if errors.Is(err, errStopsOpen) {
			h.Error(w, http.StatusConflict, "run still has open stops")
			return
		}
		h.Error(w, http.StatusInternalServerError, "failed to complete run")
		return
	}

	h.hub.PublishRunUpdated(websocket.RunPayload{RunID: run.ID, PartnerID: run.PartnerID.Int64})
	h.JSON(w, http.StatusOK, map[string]any{"run_id": run.ID, "status": "completed", "open_stops": remaining})
}

type cashHandoverRequest struct {
	AmountPaise int64  `json:"amount_paise"`
	Note        string `json:"note"`
}

// SubmitCashHandover reports the actual cash the partner is handing over.
func (h *Handler) SubmitCashHandover(w http.ResponseWriter, r *http.Request) {
	run, ok := h.runForPartner(w, r, "completed")
	if !ok {
		return
	}
	partnerID, _ := middleware.GetDeliveryPartnerID(r.Context())

	var req cashHandoverRequest
	if err := decodeJSON(r, &req); err != nil || req.AmountPaise < 0 {
		h.Error(w, http.StatusBadRequest, "amount_paise (>= 0) is required")
		return
	}

	totals, err := h.queries.RunCashTotals(r.Context(), run.ID)
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to compute cash totals")
		return
	}

	err = h.withTx(r.Context(), func(q *sqlc.Queries) error {
		if _, err := q.GetCashHandoverByRun(r.Context(), run.ID); isNoRows(err) {
			if _, err := q.CreateCashHandover(r.Context(), sqlc.CreateCashHandoverParams{
				RunID: run.ID, ExpectedPaise: totals.CollectedPaise,
			}); err != nil {
				return err
			}
		} else if err != nil {
			return err
		}
		rows, err := q.SubmitCashHandover(r.Context(), sqlc.SubmitCashHandoverParams{RunID: run.ID, SubmittedPaise: pgInt8(req.AmountPaise), SubmittedNote: pgText(req.Note)})
		if err != nil || rows == 0 {
			return errHandoverState
		}
		return nil
	})
	if err != nil {
		if errors.Is(err, errHandoverState) {
			h.Error(w, http.StatusConflict, "handover already submitted or confirmed")
			return
		}
		h.Error(w, http.StatusInternalServerError, "failed to submit handover")
		return
	}

	h.hub.PublishCashSubmitted(websocket.CashPayload{
		RunID: run.ID, PartnerID: partnerID, SubmittedPaise: req.AmountPaise,
	})
	h.JSON(w, http.StatusOK, map[string]any{
		"run_id":          run.ID,
		"expected_paise":  totals.CollectedPaise,
		"submitted_paise": req.AmountPaise,
	})
}

var (
	errStopState     = errors.New("stop state conflict")
	errStopsOpen     = errors.New("stops still open")
	errAmountTooHigh = errors.New("collected exceeds total")
	errHandoverState = errors.New("handover state conflict")
)

// stopForPartner resolves a stop and verifies it belongs to a run assigned
// to the calling partner (and the run is on the road).
func (h *Handler) stopForPartner(w http.ResponseWriter, r *http.Request) (sqlc.GetStopWithOrderRow, sqlc.DeliveryRun, bool) {
	partnerID, _ := middleware.GetDeliveryPartnerID(r.Context())
	stopID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		h.Error(w, http.StatusBadRequest, "invalid stop id")
		return sqlc.GetStopWithOrderRow{}, sqlc.DeliveryRun{}, false
	}

	stop, err := h.queries.GetStopWithOrder(r.Context(), stopID)
	if err != nil || !stop.PartnerID.Valid || stop.PartnerID.Int64 != partnerID {
		h.Error(w, http.StatusNotFound, "stop not found")
		return sqlc.GetStopWithOrderRow{}, sqlc.DeliveryRun{}, false
	}
	run, err := h.queries.GetDeliveryRun(r.Context(), stop.RunID)
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to fetch run")
		return sqlc.GetStopWithOrderRow{}, sqlc.DeliveryRun{}, false
	}
	if run.Status != "dispatched" && run.Status != "in_progress" {
		h.Error(w, http.StatusConflict, "run is "+run.Status)
		return sqlc.GetStopWithOrderRow{}, sqlc.DeliveryRun{}, false
	}
	return stop, run, true
}

// GetPartnerStop returns one stop (with order context) for the assigned run.
func (h *Handler) GetPartnerStop(w http.ResponseWriter, r *http.Request) {
	partnerID, _ := middleware.GetDeliveryPartnerID(r.Context())
	stopID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		h.Error(w, http.StatusBadRequest, "invalid stop id")
		return
	}

	stop, err := h.queries.GetStopWithOrder(r.Context(), stopID)
	if err != nil || !stop.PartnerID.Valid || stop.PartnerID.Int64 != partnerID {
		h.Error(w, http.StatusNotFound, "stop not found")
		return
	}

	run, err := h.queries.GetDeliveryRun(r.Context(), stop.RunID)
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to fetch run")
		return
	}

	h.JSON(w, http.StatusOK, map[string]any{
		"stop_id":        stop.ID,
		"run_id":         stop.RunID,
		"position":       stop.Position,
		"status":         stop.Status,
		"order_id":       stop.OrderID,
		"order_code":     stop.OrderCode.String,
		"order_status":   stop.OrderStatus.String,
		"total_paise":    stop.TotalAmountPaise,
		"customer_id":    stop.CustomerID,
		"customer_name":  stop.CustomerName.String,
		"customer_phone": stop.CustomerPhone,
		"address_line":   stop.ShipAddressLine.String,
		"landmark":       stop.ShipLandmark.String,
		"instructions":   "",
		"latitude":       stop.ShipLatitude.Float64,
		"longitude":      stop.ShipLongitude.Float64,
		"partner_id":     stop.PartnerID.Int64,
		"run_status":     run.Status,
		"items":          h.orderItemSummaries(r, stop.OrderID),
	})
}
