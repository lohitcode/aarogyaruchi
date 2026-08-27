package websocket

import (
	"encoding/json"
	"log"
	"time"
)

// envelope builds a versioned envelope for an event.
func (h *Hub) envelope(event string, payload any) []byte {
	env := Envelope{
		Type:      event,
		Payload:   payload,
		Timestamp: time.Now().UTC(),
		Version:   h.version.Add(1),
	}
	data, err := json.Marshal(env)
	if err != nil {
		log.Printf("websocket: failed to marshal %s: %v", event, err)
		return nil
	}
	return data
}

// PublishOrderCreated notifies admins of a new order.
func (h *Hub) PublishOrderCreated(payload OrderCreatedPayload) {
	if data := h.envelope(EventOrderCreated, payload); data != nil {
		h.SendToAllAdmins(data)
	}
}

// PublishOrderStatus notifies the customer, admins, and (when assigned) the
// partner about a status change.
func (h *Hub) PublishOrderStatus(payload OrderStatusPayload, userID int64, partnerID int64) {
	if data := h.envelope(EventOrderStatusChange, payload); data != nil {
		if userID > 0 {
			h.SendToUser(userID, data)
		}
		if partnerID > 0 {
			h.SendToPartner(partnerID, data)
		}
		h.SendToAllAdmins(data)
	}
}

// PublishOrderCancelled is the terminal-cancel variant of the status event.
func (h *Hub) PublishOrderCancelled(payload OrderStatusPayload, userID int64) {
	if data := h.envelope(EventOrderCancelled, payload); data != nil {
		if userID > 0 {
			h.SendToUser(userID, data)
		}
		h.SendToAllAdmins(data)
	}
}

// PublishBatchSummary nudges admins to refetch batch aggregates.
func (h *Hub) PublishBatchSummary(payload BatchSummaryPayload) {
	if data := h.envelope(EventBatchSummary, payload); data != nil {
		h.SendToAllAdmins(data)
	}
}

// PublishRunCreated notifies admins of a new run.
func (h *Hub) PublishRunCreated(payload RunPayload) {
	if data := h.envelope(EventRunCreated, payload); data != nil {
		h.SendToAllAdmins(data)
	}
}

// PublishRunAssigned notifies admins and the assigned partner.
func (h *Hub) PublishRunAssigned(payload RunPayload) {
	if data := h.envelope(EventRunAssigned, payload); data != nil {
		h.SendToAllAdmins(data)
		if payload.PartnerID > 0 {
			h.SendToPartner(payload.PartnerID, data)
		}
	}
}

// PublishRunDispatched notifies admins and the dispatched partner.
func (h *Hub) PublishRunDispatched(payload RunPayload) {
	if data := h.envelope(EventRunDispatched, payload); data != nil {
		h.SendToAllAdmins(data)
		if payload.PartnerID > 0 {
			h.SendToPartner(payload.PartnerID, data)
		}
	}
}

// PublishRunUpdated is the generic run change signal (stop updates, status).
func (h *Hub) PublishRunUpdated(payload RunPayload) {
	if data := h.envelope(EventRunUpdated, payload); data != nil {
		h.SendToAllAdmins(data)
		if payload.PartnerID > 0 {
			h.SendToPartner(payload.PartnerID, data)
		}
	}
}

// PublishPartnerLocation fans a partner GPS fix out to admins and to the
// customers whose out-for-delivery orders sit in that run. The handler layer
// computes the authorized audience.
func (h *Hub) PublishPartnerLocation(payload PartnerLocationPayload, customerUserIDs []int64) {
	if data := h.envelope(EventPartnerLocation, payload); data != nil {
		h.SendToAllAdmins(data)
		h.SendToUsers(customerUserIDs, data)
	}
}

// PublishCashSubmitted notifies admins that a partner submitted a handover.
func (h *Hub) PublishCashSubmitted(payload CashPayload) {
	if data := h.envelope(EventCashSubmitted, payload); data != nil {
		h.SendToAllAdmins(data)
	}
}

// PublishCashReconciled notifies admins and the partner after confirmation.
func (h *Hub) PublishCashReconciled(payload CashPayload) {
	if data := h.envelope(EventCashReconciled, payload); data != nil {
		h.SendToAllAdmins(data)
		if payload.PartnerID > 0 {
			h.SendToPartner(payload.PartnerID, data)
		}
	}
}

// PublishChatMessage fans a new chat message out to the customer it belongs
// to and to every admin console.
func (h *Hub) PublishChatMessage(payload ChatMessagePayload, userID int64) {
	if data := h.envelope(EventChatMessage, payload); data != nil {
		h.SendToUser(userID, data)
		h.SendToAllAdmins(data)
	}
}
