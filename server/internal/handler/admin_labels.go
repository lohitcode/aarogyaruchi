package handler

import (
	"errors"
	"net/http"
	"strconv"

	"aarogyaruchi/internal/db/sqlc"
	"aarogyaruchi/internal/labels"

	"github.com/go-chi/chi/v5"
)

// buildOrderLabel assembles label data for one order, including its run/stop
// position when assigned.
func (h *Handler) buildOrderLabel(r *http.Request, orderRow sqlc.GetOrderForAdminRow, items []sqlc.GetOrderItemsRow, localityName string) (labels.LabelData, error) {
	label := labels.LabelData{
		OrderCode:    orderRow.Code.String,
		CustomerName: orderRow.UserName.String,
		AddressLine:  orderRow.ShipAddressLine.String,
		Landmark:     orderRow.ShipLandmark.String,
		LocalityName: localityName,
		Instructions: orderRow.ShipInstructions.String,
		DeliveryDate: orderRow.DeliveryDate.Time.Format("02 Jan 2006"),
		PackageToken: orderRow.PackageToken.String,
		Phone:        orderRow.UserPhone,
	}

	if orderRow.PackageToken.String == "" {
		return label, errors.New("order has no package token")
	}

	for _, it := range items {
		label.Items = append(label.Items, labels.ItemLine{
			Name:     it.ProductName,
			Size:     it.ProductSizeLabel.String,
			Quantity: it.Quantity,
		})
	}

	// Run/stop annotation when the order sits in a run.
	stops, err := h.queries.ListRunStopsForOrder(r.Context(), orderRow.ID)
	if err == nil {
		for _, s := range stops {
			if s.Status == "skipped" {
				continue
			}
			label.RunLabel = "Run #" + strconv.FormatInt(s.RunID, 10) + " · Stop " + strconv.FormatInt(int64(s.Position), 10)
			break
		}
	}
	if localityName == "" && orderRow.ShipLocalityID.Valid {
		if loc, err := h.queries.GetLocality(r.Context(), orderRow.ShipLocalityID.Int64); err == nil {
			label.LocalityName = loc.Name
		}
	}

	return label, nil
}

func (h *Handler) writeLabelHTML(w http.ResponseWriter, html string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(html))
}

// AdminOrderLabel returns the print-ready label for one order.
func (h *Handler) AdminOrderLabel(w http.ResponseWriter, r *http.Request) {
	orderID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		h.Error(w, http.StatusBadRequest, "invalid order id")
		return
	}

	order, err := h.queries.GetOrderForAdmin(r.Context(), orderID)
	if err != nil {
		h.Error(w, http.StatusNotFound, "order not found")
		return
	}
	items, _ := h.queries.GetOrderItems(r.Context(), orderID)

	label, err := h.buildOrderLabel(r, order, items, "")
	if err != nil {
		h.Error(w, http.StatusConflict, "label unavailable")
		return
	}

	html, err := labels.HTML([]labels.LabelData{label})
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to render label")
		return
	}
	h.writeLabelHTML(w, html)
}

// AdminBatchLabels returns one printable document with a label per
// (non-cancelled) order in the batch.
func (h *Handler) AdminBatchLabels(w http.ResponseWriter, r *http.Request) {
	batchID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		h.Error(w, http.StatusBadRequest, "invalid batch id")
		return
	}

	orders, err := h.queries.ListOrdersForBatch(r.Context(), pgInt8(batchID))
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to list orders")
		return
	}

	labelList := make([]labels.LabelData, 0, len(orders))
	for _, o := range orders {
		if o.Status.String == "cancelled" {
			continue
		}
		full, err := h.queries.GetOrderForAdmin(r.Context(), o.ID)
		if err != nil {
			continue
		}
		items, _ := h.queries.GetOrderItems(r.Context(), o.ID)
		label, err := h.buildOrderLabel(r, full, items, "")
		if err != nil {
			continue
		}
		labelList = append(labelList, label)
	}

	if len(labelList) == 0 {
		h.Error(w, http.StatusNotFound, "no printable orders in this batch")
		return
	}

	html, err := labels.HTML(labelList)
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to render labels")
		return
	}
	h.writeLabelHTML(w, html)
}

// AdminBatchLabelData returns label data as JSON (for custom client-side
// printing) in addition to the server-rendered HTML.
func (h *Handler) AdminBatchLabelData(w http.ResponseWriter, r *http.Request) {
	batchID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		h.Error(w, http.StatusBadRequest, "invalid batch id")
		return
	}
	orders, err := h.queries.ListOrdersForBatch(r.Context(), pgInt8(batchID))
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to list orders")
		return
	}

	type labelJSON struct {
		OrderID      int64  `json:"order_id"`
		Code         string `json:"code"`
		Customer     string `json:"customer"`
		Phone        string `json:"phone"`
		Address      string `json:"address"`
		DeliveryDate string `json:"delivery_date"`
		RunLabel     string `json:"run_label,omitempty"`
		PackageToken string `json:"package_token"`
	}
	out := make([]labelJSON, 0, len(orders))
	for _, o := range orders {
		if o.Status.String == "cancelled" {
			continue
		}
		row := labelJSON{
			OrderID:      o.ID,
			Code:         o.Code.String,
			Customer:     o.UserName.String,
			Phone:        o.UserPhone,
			Address:      o.ShipAddressLine.String,
			DeliveryDate: o.DeliveryDate.Time.Format("2006-01-02"),
			PackageToken: o.PackageToken.String,
		}
		out = append(out, row)
	}
	h.JSON(w, http.StatusOK, map[string]any{"labels": out})
}
