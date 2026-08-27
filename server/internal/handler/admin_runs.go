package handler

import (
	"errors"
	"net/http"
	"strconv"

	"aarogyaruchi/internal/db/sqlc"
	"aarogyaruchi/internal/orderstate"
	"aarogyaruchi/internal/websocket"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type createRunRequest struct {
	BatchID    int64   `json:"batch_id"`
	LocalityID int64   `json:"locality_id"`
	Name       string  `json:"name"`
	PartnerID  *int64  `json:"partner_id"`
	OrderIDs   []int64 `json:"order_ids"`
}

// AdminCreateRun builds a delivery run from ready orders in a batch. When a
// partner is assigned immediately, the orders move to `assigned`.
func (h *Handler) AdminCreateRun(w http.ResponseWriter, r *http.Request) {
	var req createRunRequest
	if err := decodeJSON(r, &req); err != nil || req.BatchID == 0 {
		h.Error(w, http.StatusBadRequest, "batch_id is required")
		return
	}

	batch, err := h.queries.GetBatch(r.Context(), req.BatchID)
	if err != nil {
		h.Error(w, http.StatusNotFound, "batch not found")
		return
	}

	if req.PartnerID != nil {
		if _, err := h.queries.GetDeliveryPartner(r.Context(), *req.PartnerID); err != nil {
			h.Error(w, http.StatusBadRequest, "partner not found")
			return
		}
	}

	orderIDs := req.OrderIDs
	if len(orderIDs) == 0 && req.LocalityID != 0 {
		ready, err := h.queries.ListReadyOrdersForBatchLocality(r.Context(), sqlc.ListReadyOrdersForBatchLocalityParams{BatchID: pgInt8(req.BatchID), ShipLocalityID: pgInt8(req.LocalityID)})
		if err != nil {
			h.Error(w, http.StatusInternalServerError, "failed to list ready orders")
			return
		}
		for _, o := range ready {
			orderIDs = append(orderIDs, o.ID)
		}
	}
	if len(orderIDs) == 0 {
		h.Error(w, http.StatusBadRequest, "no orders to add (pass order_ids or locality_id with ready orders)")
		return
	}

	status := "draft"
	partner := pgtype.Int8{}
	if req.PartnerID != nil {
		status = "assigned"
		partner = pgInt8(*req.PartnerID)
	}

	var run sqlc.DeliveryRun
	var added int
	err = h.withTx(r.Context(), func(q *sqlc.Queries) error {
		var err error
		run, err = q.CreateDeliveryRun(r.Context(), sqlc.CreateDeliveryRunParams{
			BatchID:      req.BatchID,
			DeliveryDate: batch.DeliveryDate,
			Name:         pgText(req.Name),
			PartnerID:    partner,
			Status:       status,
		})
		if err != nil {
			return err
		}
		for _, orderID := range orderIDs {
			order, err := q.GetOrderForUpdate(r.Context(), orderID)
			if err != nil {
				return errOrderNotReady
			}
			if order.BatchID.Int64 != req.BatchID || order.Status.String != orderstate.Ready {
				return errOrderNotReady
			}
			if _, err := q.AddStop(r.Context(), sqlc.AddStopParams{RunID: run.ID, OrderID: orderID}); err != nil {
				return err
			}
			if req.PartnerID != nil {
				if err := applyOrderTransition(r.Context(), q, order, orderstate.Assigned, "admin", 0, "assigned to run"); err != nil {
					return err
				}
				if _, err := q.SetOrderRunAssignment(r.Context(), sqlc.SetOrderRunAssignmentParams{ID: orderID, DeliveryPartnerID: pgInt8(*req.PartnerID), Column3: true}); err != nil {
					return err
				}
			}
			added++
		}
		return nil
	})
	if err != nil {
		if errors.Is(err, errOrderNotReady) {
			h.Error(w, http.StatusBadRequest, "all orders must be ready and belong to this batch")
			return
		}
		h.Error(w, http.StatusInternalServerError, "failed to create run")
		return
	}

	h.hub.PublishRunCreated(websocket.RunPayload{RunID: run.ID, PartnerID: run.PartnerID.Int64})
	h.JSON(w, http.StatusCreated, map[string]any{
		"run_id": run.ID,
		"status": run.Status,
		"stops":  added,
	})
}

var errOrderNotReady = errors.New("order not ready")

// AdminListRuns lists runs with optional date/partner/status filters.
func (h *Handler) AdminListRuns(w http.ResponseWriter, r *http.Request) {
	params := sqlc.ListDeliveryRunsParams{MaxRows: int32(100)}
	if v := r.URL.Query().Get("delivery_date"); v != "" {
		if d, ok := pgDateText(v); ok {
			params.DeliveryDate = d
		}
	}
	if v := r.URL.Query().Get("partner_id"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			params.PartnerID = pgInt8(n)
		}
	}
	if v := r.URL.Query().Get("status"); v != "" {
		params.Status = pgText(v)
	}

	runs, err := h.queries.ListDeliveryRuns(r.Context(), params)
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to list runs")
		return
	}
	views := make([]map[string]any, 0, len(runs))
	for _, run := range runs {
		views = append(views, map[string]any{
			"run_id":        run.ID,
			"delivery_date": run.DeliveryDate.Time.Format("2006-01-02"),
			"name":          run.Name.String,
			"status":        run.Status,
			"partner_id":    run.PartnerID.Int64,
			"partner_name":  run.PartnerName.String,
			"stop_count":    run.StopCount,
		})
	}
	h.JSON(w, http.StatusOK, map[string]any{"runs": views})
}

// AdminGetRun returns a run with its ordered stops and cash state.
func (h *Handler) AdminGetRun(w http.ResponseWriter, r *http.Request) {
	runID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		h.Error(w, http.StatusBadRequest, "invalid run id")
		return
	}

	run, err := h.queries.GetDeliveryRun(r.Context(), runID)
	if err != nil {
		h.Error(w, http.StatusNotFound, "run not found")
		return
	}
	stops, err := h.queries.ListRunStops(r.Context(), runID)
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to fetch stops")
		return
	}

	stopViews := make([]map[string]any, 0, len(stops))
	for _, s := range stops {
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
			"locality":        s.LocalityName.String,
			"latitude":        s.ShipLatitude.Float64,
			"longitude":       s.ShipLongitude.Float64,
			"collected_paise": s.CollectedAmountPaise.Int64,
			"failure_reason":  s.FailureReason.String,
		})
	}

	resp := map[string]any{
		"run_id":        run.ID,
		"batch_id":      run.BatchID,
		"delivery_date": run.DeliveryDate.Time.Format("2006-01-02"),
		"name":          run.Name.String,
		"status":        run.Status,
		"partner_id":    run.PartnerID.Int64,
		"stops":         stopViews,
	}
	if totals, err := h.queries.RunCashTotals(r.Context(), runID); err == nil {
		resp["cash"] = map[string]any{
			"collected_paise": totals.CollectedPaise,
			"pending_paise":   totals.PendingPaise,
			"failed_paise":    totals.FailedPaise,
		}
	}
	h.JSON(w, http.StatusOK, resp)
}

type updateRunRequest struct {
	Name      *string `json:"name"`
	PartnerID *int64  `json:"partner_id"`
	Status    *string `json:"status"`
}

// AdminUpdateRun edits run metadata and assignment (draft/assigned only).
func (h *Handler) AdminUpdateRun(w http.ResponseWriter, r *http.Request) {
	runID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		h.Error(w, http.StatusBadRequest, "invalid run id")
		return
	}

	var req updateRunRequest
	if err := decodeJSON(r, &req); err != nil {
		h.Error(w, http.StatusBadRequest, "invalid request")
		return
	}

	var run sqlc.DeliveryRun
	err = h.withTx(r.Context(), func(q *sqlc.Queries) error {
		var err error
		run, err = q.GetDeliveryRunForUpdate(r.Context(), runID)
		if err != nil {
			return errNotFound
		}
		if run.Status != "draft" && run.Status != "assigned" {
			return errors.New("run already dispatched")
		}

		if req.Name != nil {
			run, err = q.UpdateRunMeta(r.Context(), sqlc.UpdateRunMetaParams{
				ID: runID, Name: pgText(*req.Name), Status: run.Status,
			})
			if err != nil {
				return err
			}
		}
		if req.PartnerID != nil {
			if *req.PartnerID != 0 {
				if _, err := q.GetDeliveryPartner(r.Context(), *req.PartnerID); err != nil {
					return errors.New("partner not found")
				}
				run, err = q.AssignRunPartner(r.Context(), sqlc.AssignRunPartnerParams{ID: runID, PartnerID: pgInt8(*req.PartnerID)})
				if err != nil {
					return err
				}
			} else {
				run, err = q.AssignRunPartner(r.Context(), sqlc.AssignRunPartnerParams{ID: runID})
				if err != nil {
					return err
				}
			}
			// Sync orders to the new assignment state.
			stops, err := q.ListRunStops(r.Context(), runID)
			if err != nil {
				return err
			}
			for _, s := range stops {
				if s.Status == "skipped" {
					continue
				}
				order, err := q.GetOrderForUpdate(r.Context(), s.OrderID)
				if err != nil {
					return err
				}
				if req.PartnerID != nil && *req.PartnerID != 0 {
					if order.Status.String == orderstate.Ready {
						if err := applyOrderTransition(r.Context(), q, order, orderstate.Assigned, "admin", 0, ""); err != nil {
							return err
						}
					}
					if _, err := q.SetOrderRunAssignment(r.Context(), sqlc.SetOrderRunAssignmentParams{ID: order.ID, DeliveryPartnerID: pgInt8(*req.PartnerID)}); err != nil {
						return err
					}
				} else if order.Status.String == orderstate.Assigned {
					if _, err := q.RevertOrderToReady(r.Context(), order.ID); err != nil {
						return err
					}
				}
			}
		}
		if req.Status != nil && *req.Status == "cancelled" {
			if _, err := q.CancelRun(r.Context(), runID); err != nil {
				return err
			}
			// Free the orders back to ready.
			stops, err := q.ListRunStops(r.Context(), runID)
			if err != nil {
				return err
			}
			for _, s := range stops {
				if s.Status != "pending" && s.Status != "in_progress" {
					continue
				}
				order, err := q.GetOrderForUpdate(r.Context(), s.OrderID)
				if err != nil {
					return err
				}
				if _, err := q.RevertOrderToReady(r.Context(), order.ID); err != nil {
					return err
				}
			}
			if err := q.SkipStopsForRun(r.Context(), runID); err != nil {
				return err
			}
			run.Status = "cancelled"
		}
		return nil
	})
	if err != nil {
		if errors.Is(err, errNotFound) {
			h.Error(w, http.StatusNotFound, "run not found")
			return
		}
		h.Error(w, http.StatusConflict, err.Error())
		return
	}

	h.hub.PublishRunUpdated(websocket.RunPayload{RunID: run.ID, PartnerID: run.PartnerID.Int64})
	h.JSON(w, http.StatusOK, map[string]any{
		"run_id":     run.ID,
		"status":     run.Status,
		"partner_id": run.PartnerID.Int64,
	})
}

// AdminAddStop appends an order to a draft/assigned run.
func (h *Handler) AdminAddStop(w http.ResponseWriter, r *http.Request) {
	runID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		h.Error(w, http.StatusBadRequest, "invalid run id")
		return
	}

	var req struct {
		OrderID int64 `json:"order_id"`
	}
	if err := decodeJSON(r, &req); err != nil || req.OrderID == 0 {
		h.Error(w, http.StatusBadRequest, "order_id is required")
		return
	}

	var stop sqlc.RunStop
	err = h.withTx(r.Context(), func(q *sqlc.Queries) error {
		run, err := q.GetDeliveryRunForUpdate(r.Context(), runID)
		if err != nil {
			return errNotFound
		}
		if run.Status != "draft" && run.Status != "assigned" {
			return errors.New("run already dispatched")
		}
		order, err := q.GetOrderForUpdate(r.Context(), req.OrderID)
		if err != nil {
			return errOrderNotReady
		}
		if order.BatchID.Int64 != run.BatchID || order.Status.String != orderstate.Ready {
			return errOrderNotReady
		}
		stop, err = q.AddStop(r.Context(), sqlc.AddStopParams{RunID: runID, OrderID: req.OrderID})
		if err != nil {
			return err
		}
		if run.PartnerID.Valid {
			if err := applyOrderTransition(r.Context(), q, order, orderstate.Assigned, "admin", 0, ""); err != nil {
				return err
			}
			_, err = q.SetOrderRunAssignment(r.Context(), sqlc.SetOrderRunAssignmentParams{ID: req.OrderID, DeliveryPartnerID: run.PartnerID})
		}
		return err
	})
	if err != nil {
		switch {
		case errors.Is(err, errOrderNotReady):
			h.Error(w, http.StatusBadRequest, "order must be ready and in this run's batch")
		case errors.Is(err, errNotFound):
			h.Error(w, http.StatusNotFound, "run not found")
		default:
			h.Error(w, http.StatusConflict, err.Error())
		}
		return
	}

	h.hub.PublishRunUpdated(websocket.RunPayload{RunID: runID})
	h.JSON(w, http.StatusCreated, map[string]any{"stop_id": stop.ID, "position": stop.Position})
}

// AdminRemoveStop drops a stop from an undispatched run.
func (h *Handler) AdminRemoveStop(w http.ResponseWriter, r *http.Request) {
	runID, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	stopID, err := strconv.ParseInt(chi.URLParam(r, "stop_id"), 10, 64)
	if err != nil || runID == 0 {
		h.Error(w, http.StatusBadRequest, "invalid ids")
		return
	}

	err = h.withTx(r.Context(), func(q *sqlc.Queries) error {
		run, err := q.GetDeliveryRunForUpdate(r.Context(), runID)
		if err != nil {
			return errNotFound
		}
		if run.Status != "draft" && run.Status != "assigned" {
			return errors.New("run already dispatched")
		}
		stop, err := q.GetStop(r.Context(), stopID)
		if err != nil || stop.RunID != runID {
			return errNotFound
		}
		order, err := q.GetOrderForUpdate(r.Context(), stop.OrderID)
		if err != nil {
			return err
		}
		if _, err := q.RemoveStop(r.Context(), sqlc.RemoveStopParams{ID: stopID, RunID: runID}); err != nil {
			return err
		}
		if order.Status.String == orderstate.Assigned {
			_, err = q.RevertOrderToReady(r.Context(), order.ID)
		}
		return err
	})
	if err != nil {
		if errors.Is(err, errNotFound) {
			h.Error(w, http.StatusNotFound, "run or stop not found")
			return
		}
		h.Error(w, http.StatusConflict, err.Error())
		return
	}

	// Renumber remaining positions 1..n.
	stops, _ := h.queries.ListRunStops(r.Context(), runID)
	for i, s := range stops {
		if int32(i+1) != s.Position {
			_ = h.queries.UpdateStopPosition(r.Context(), sqlc.UpdateStopPositionParams{ID: s.ID, Position: int32(i + 1)})
		}
	}

	h.hub.PublishRunUpdated(websocket.RunPayload{RunID: runID})
	h.JSON(w, http.StatusOK, map[string]string{"message": "stop removed"})
}

type reorderRequest struct {
	StopIDs []int64 `json:"stop_ids"` // desired order, position 1..n
}

// AdminReorderStops rewrites stop positions atomically.
func (h *Handler) AdminReorderStops(w http.ResponseWriter, r *http.Request) {
	runID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		h.Error(w, http.StatusBadRequest, "invalid run id")
		return
	}

	var req reorderRequest
	if err := decodeJSON(r, &req); err != nil || len(req.StopIDs) == 0 {
		h.Error(w, http.StatusBadRequest, "stop_ids are required")
		return
	}

	err = h.withTx(r.Context(), func(q *sqlc.Queries) error {
		run, err := q.GetDeliveryRunForUpdate(r.Context(), runID)
		if err != nil {
			return errNotFound
		}
		if run.Status == "dispatched" || run.Status == "in_progress" || run.Status == "completed" || run.Status == "reconciled" {
			return errors.New("run already dispatched")
		}
		existing, err := q.ListRunStops(r.Context(), runID)
		if err != nil {
			return err
		}
		if len(req.StopIDs) != len(existing) {
			return errors.New("stop_ids must contain every stop exactly once")
		}
		seen := make(map[int64]bool)
		for i, id := range req.StopIDs {
			if seen[id] {
				return errors.New("duplicate stop id")
			}
			seen[id] = true
			if err := q.UpdateStopPosition(r.Context(), sqlc.UpdateStopPositionParams{ID: id, Position: int32(i + 1)}); err != nil {
				return err
			}
		}
		for _, s := range existing {
			if !seen[s.ID] {
				return errors.New("stop_ids must contain every stop exactly once")
			}
		}
		return nil
	})
	if err != nil {
		if errors.Is(err, errNotFound) {
			h.Error(w, http.StatusNotFound, "run not found")
			return
		}
		h.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	h.hub.PublishRunUpdated(websocket.RunPayload{RunID: runID})
	h.JSON(w, http.StatusOK, map[string]string{"message": "stops reordered"})
}

// AdminDispatchRun releases an assigned run to its partner.
func (h *Handler) AdminDispatchRun(w http.ResponseWriter, r *http.Request) {
	runID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		h.Error(w, http.StatusBadRequest, "invalid run id")
		return
	}

	var run sqlc.DeliveryRun
	err = h.withTx(r.Context(), func(q *sqlc.Queries) error {
		var err error
		run, err = q.GetDeliveryRunForUpdate(r.Context(), runID)
		if err != nil {
			return errNotFound
		}
		if !run.PartnerID.Valid {
			return errors.New("assign a partner first")
		}
		rows, err := q.DispatchRun(r.Context(), runID)
		if err != nil || rows == 0 {
			return errors.New("run must be assigned")
		}
		// Orders must be at least assigned; promote ready ones (race safety).
		stops, err := q.ListRunStops(r.Context(), runID)
		if err != nil {
			return err
		}
		for _, s := range stops {
			if s.Status == "skipped" {
				continue
			}
			order, err := q.GetOrderForUpdate(r.Context(), s.OrderID)
			if err != nil {
				return err
			}
			if order.Status.String == orderstate.Ready {
				if err := applyOrderTransition(r.Context(), q, order, orderstate.Assigned, "admin", 0, "run dispatched"); err != nil {
					return err
				}
			}
			_, err = q.SetOrderRunAssignment(r.Context(), sqlc.SetOrderRunAssignmentParams{ID: s.OrderID, DeliveryPartnerID: run.PartnerID})
			if err != nil {
				return err
			}
		}
		run.Status = "dispatched"
		return nil
	})
	if err != nil {
		if errors.Is(err, errNotFound) {
			h.Error(w, http.StatusNotFound, "run not found")
			return
		}
		h.Error(w, http.StatusConflict, err.Error())
		return
	}

	h.hub.PublishRunDispatched(websocket.RunPayload{RunID: run.ID, PartnerID: run.PartnerID.Int64})
	h.JSON(w, http.StatusOK, map[string]any{"run_id": run.ID, "status": "dispatched"})
}

// AdminRunTracking returns live positions for an active run: stop list plus
// the partner's freshest GPS fix (Valkey) with fallback trail (Postgres).
func (h *Handler) AdminRunTracking(w http.ResponseWriter, r *http.Request) {
	runID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		h.Error(w, http.StatusBadRequest, "invalid run id")
		return
	}

	run, err := h.queries.GetDeliveryRun(r.Context(), runID)
	if err != nil {
		h.Error(w, http.StatusNotFound, "run not found")
		return
	}
	stops, err := h.queries.ListRunStops(r.Context(), runID)
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to fetch stops")
		return
	}

	stopViews := make([]map[string]any, 0, len(stops))
	for _, s := range stops {
		stopViews = append(stopViews, map[string]any{
			"stop_id":       s.ID,
			"position":      s.Position,
			"status":        s.Status,
			"order_code":    s.OrderCode.String,
			"customer_name": s.CustomerName.String,
			"latitude":      s.ShipLatitude.Float64,
			"longitude":     s.ShipLongitude.Float64,
			"address_line":  s.ShipAddressLine.String,
		})
	}

	resp := map[string]any{
		"run_id": run.ID,
		"status": run.Status,
		"stops":  stopViews,
	}
	if run.PartnerID.Valid {
		if live := h.livePartnerLocation(r, run.PartnerID.Int64); live != nil {
			resp["partner_location"] = live
		} else {
			samples, _ := h.queries.ListLocationSamplesForRun(r.Context(), sqlc.ListLocationSamplesForRunParams{RunID: pgInt8(runID), Limit: 5})
			trail := make([]map[string]any, 0, len(samples))
			for _, s := range samples {
				trail = append(trail, map[string]any{
					"latitude":    s.Latitude,
					"longitude":   s.Longitude,
					"recorded_at": s.RecordedAt.Time,
				})
			}
			resp["partner_trail"] = trail
		}
	}
	h.JSON(w, http.StatusOK, resp)
}

// ActiveRunsOverview powers the admin live map.
func (h *Handler) ActiveRunsOverview(w http.ResponseWriter, r *http.Request) {
	runs, err := h.queries.ListActiveRunsWithPartnerLocation(r.Context())
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to fetch active runs")
		return
	}
	views := make([]map[string]any, 0, len(runs))
	for _, run := range runs {
		view := map[string]any{
			"run_id":        run.RunID,
			"partner_id":    run.PartnerID,
			"partner_name":  run.PartnerName,
			"delivery_date": run.DeliveryDate.Time.Format("2006-01-02"),
		}
		if run.PartnerID.Valid {
			if live := h.livePartnerLocation(r, run.PartnerID.Int64); live != nil {
				view["location"] = live
			} else {
				view["location"] = map[string]any{
					"latitude":    run.Latitude,
					"longitude":   run.Longitude,
					"recorded_at": run.RecordedAt,
					"is_live":     false,
				}
			}
		}
		views = append(views, view)
	}
	h.JSON(w, http.StatusOK, map[string]any{"runs": views})
}
