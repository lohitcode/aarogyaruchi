package websocket

import "time"

// Server → client event types.
const (
	EventOrderCreated      = "order.created"
	EventOrderStatusChange = "order.status_changed"
	EventOrderCancelled    = "order.cancelled"
	EventBatchSummary      = "batch.summary_changed"
	EventRunCreated        = "run.created"
	EventRunAssigned       = "run.assigned"
	EventRunDispatched     = "run.dispatched"
	EventRunUpdated        = "run.updated"
	EventPartnerLocation   = "partner.location_updated"
	EventCashSubmitted     = "cash.handover_submitted"
	EventCashReconciled    = "cash.reconciled"
	EventPing              = "ping"
	EventPong              = "pong"
)

// Client → server message types.
const (
	EventPartnerLocationReport = "partner.location"
)

// Envelope wraps every server event. Version is a monotonic counter: clients
// persist the highest version they have seen and refetch on gaps or reconnect.
type Envelope struct {
	Type      string    `json:"type"`
	Payload   any       `json:"payload,omitempty"`
	Timestamp time.Time `json:"timestamp"`
	Version   uint64    `json:"version"`
}

type OrderCreatedPayload struct {
	OrderID      int64  `json:"order_id"`
	Code         string `json:"code"`
	UserID       int64  `json:"user_id"`
	BatchID      int64  `json:"batch_id"`
	DeliveryDate string `json:"delivery_date"`
	TotalPaise   int64  `json:"total_paise"`
	LocalityID   int64  `json:"locality_id,omitempty"`
}

type OrderStatusPayload struct {
	OrderID int64  `json:"order_id"`
	Code    string `json:"code"`
	Status  string `json:"status"`
	From    string `json:"from,omitempty"`
	Note    string `json:"note,omitempty"`
}

type BatchSummaryPayload struct {
	BatchID      int64  `json:"batch_id"`
	OrderDate    string `json:"order_date"`
	DeliveryDate string `json:"delivery_date"`
}

type RunPayload struct {
	RunID        int64  `json:"run_id"`
	PartnerID    int64  `json:"partner_id,omitempty"`
	DeliveryDate string `json:"delivery_date,omitempty"`
}

type PartnerLocationPayload struct {
	RunID      int64     `json:"run_id"`
	PartnerID  int64     `json:"partner_id"`
	Latitude   float64   `json:"latitude"`
	Longitude  float64   `json:"longitude"`
	AccuracyM  *float64  `json:"accuracy_m,omitempty"`
	SpeedMps   *float64  `json:"speed_mps,omitempty"`
	HeadingDeg *float64  `json:"heading_deg,omitempty"`
	RecordedAt time.Time `json:"recorded_at"`
}

type CashPayload struct {
	RunID          int64 `json:"run_id"`
	PartnerID      int64 `json:"partner_id,omitempty"`
	SubmittedPaise int64 `json:"submitted_paise,omitempty"`
	ConfirmedPaise int64 `json:"confirmed_paise,omitempty"`
}

// IncomingLocation is one GPS fix reported by the partner app (via WS or the
// HTTP batch fallback).
type IncomingLocation struct {
	Latitude   float64   `json:"latitude"`
	Longitude  float64   `json:"longitude"`
	AccuracyM  *float64  `json:"accuracy_m,omitempty"`
	SpeedMps   *float64  `json:"speed_mps,omitempty"`
	HeadingDeg *float64  `json:"heading_deg,omitempty"`
	RecordedAt time.Time `json:"recorded_at"`
}

// IncomingMessage is any client → server message.
type IncomingMessage struct {
	Type     string            `json:"type"`
	Location *IncomingLocation `json:"location,omitempty"`
}

const EventChatMessage = "chat.message_new"

type ChatMessagePayload struct {
	ThreadID    int64     `json:"thread_id"`
	MessageID   int64     `json:"message_id"`
	SenderRole  string    `json:"sender_role"`  // user | admin
	SenderLabel string    `json:"sender_label"` // phone for users, "Support" for admins
	Body        string    `json:"body"`
	CreatedAt   time.Time `json:"created_at"`
}
