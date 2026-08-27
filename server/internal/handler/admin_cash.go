package handler

import (
	"errors"
	"net/http"
	"strconv"

	"aarogyaruchi/internal/db/sqlc"
	"aarogyaruchi/internal/middleware"
	"aarogyaruchi/internal/websocket"

	"github.com/go-chi/chi/v5"
)

// AdminCashSummary returns a run's expected cash, submission, and
// reconciliation state for the admin cash screen.
func (h *Handler) AdminCashSummary(w http.ResponseWriter, r *http.Request) {
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
	totals, err := h.queries.RunCashTotals(r.Context(), runID)
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to compute totals")
		return
	}

	resp := map[string]any{
		"run_id":          run.ID,
		"status":          run.Status,
		"partner_id":      run.PartnerID.Int64,
		"collected_paise": totals.CollectedPaise,
		"pending_paise":   totals.PendingPaise,
		"failed_paise":    totals.FailedPaise,
	}

	if handover, err := h.queries.GetCashHandoverByRun(r.Context(), runID); err == nil {
		resp["handover"] = map[string]any{
			"status":            handover.Status,
			"expected_paise":    handover.ExpectedPaise,
			"submitted_paise":   handover.SubmittedPaise.Int64,
			"submitted_note":    handover.SubmittedNote.String,
			"submitted_at":      handover.SubmittedAt.Time,
			"confirmed_paise":   handover.ConfirmedPaise.Int64,
			"confirmed_at":      handover.ConfirmedAt.Time,
			"discrepancy_paise": handover.DiscrepancyPaise.Int64,
			"admin_id":          handover.AdminID.Int64,
		}
	}

	h.JSON(w, http.StatusOK, resp)
}

type confirmHandoverRequest struct {
	ConfirmedPaise int64  `json:"confirmed_paise"`
	Note           string `json:"note"`
}

// AdminConfirmHandover confirms the partner's cash handover; only admin
// confirmation moves the run to reconciled. Discrepancy is computed and kept.
func (h *Handler) AdminConfirmHandover(w http.ResponseWriter, r *http.Request) {
	adminID, _ := middleware.GetAdminID(r.Context())
	runID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		h.Error(w, http.StatusBadRequest, "invalid run id")
		return
	}

	var req confirmHandoverRequest
	if err := decodeJSON(r, &req); err != nil || req.ConfirmedPaise < 0 {
		h.Error(w, http.StatusBadRequest, "confirmed_paise (>= 0) is required")
		return
	}

	err = h.withTx(r.Context(), func(q *sqlc.Queries) error {
		handover, err := q.GetCashHandoverByRun(r.Context(), runID)
		if err != nil {
			return errNotFound
		}
		if handover.Status != "submitted" {
			return errHandoverState
		}
		discrepancy := req.ConfirmedPaise - handover.SubmittedPaise.Int64
		rows, err := q.ConfirmCashHandover(r.Context(), sqlc.ConfirmCashHandoverParams{
			RunID:            runID,
			ConfirmedPaise:   pgInt8(req.ConfirmedPaise),
			DiscrepancyPaise: pgInt8(discrepancy),
			AdminID:          pgInt8(adminID),
		})
		if err != nil || rows == 0 {
			return errHandoverState
		}
		if _, err := q.ReconcileRun(r.Context(), runID); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		switch {
		case errors.Is(err, errNotFound):
			h.Error(w, http.StatusNotFound, "no handover submitted for this run")
		case errors.Is(err, errHandoverState):
			h.Error(w, http.StatusConflict, "handover not in submitted state")
		default:
			h.Error(w, http.StatusInternalServerError, "failed to confirm handover")
		}
		return
	}

	run, _ := h.queries.GetDeliveryRun(r.Context(), runID)
	h.hub.PublishCashReconciled(websocket.CashPayload{
		RunID: runID, PartnerID: run.PartnerID.Int64, ConfirmedPaise: req.ConfirmedPaise,
	})
	h.JSON(w, http.StatusOK, map[string]any{"run_id": runID, "status": "reconciled"})
}

// AdminHandoverHistory lists handovers with discrepancy visibility.
func (h *Handler) AdminHandoverHistory(w http.ResponseWriter, r *http.Request) {
	handovers, err := h.queries.ListHandoverHistory(r.Context(), 100)
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to fetch history")
		return
	}
	views := make([]map[string]any, 0, len(handovers))
	for _, hv := range handovers {
		views = append(views, map[string]any{
			"run_id":            hv.RunID,
			"delivery_date":     hv.DeliveryDate.Time.Format("2006-01-02"),
			"partner_name":      hv.PartnerName.String,
			"status":            hv.Status,
			"expected_paise":    hv.ExpectedPaise,
			"submitted_paise":   hv.SubmittedPaise.Int64,
			"confirmed_paise":   hv.ConfirmedPaise.Int64,
			"discrepancy_paise": hv.DiscrepancyPaise.Int64,
			"submitted_at":      hv.SubmittedAt.Time,
			"confirmed_at":      hv.ConfirmedAt.Time,
		})
	}
	h.JSON(w, http.StatusOK, map[string]any{"handovers": views})
}
