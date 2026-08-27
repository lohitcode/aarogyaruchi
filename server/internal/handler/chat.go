package handler

import (
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"aarogyaruchi/internal/db/sqlc"
	"aarogyaruchi/internal/middleware"
	"aarogyaruchi/internal/webpush"
	"aarogyaruchi/internal/websocket"

	"github.com/go-chi/chi/v5"
)

/**
 * Admin <-> customer support chat.
 *
 * One thread per customer. Delivery is realtime over WebSocket when the
 * recipient is connected; otherwise a web-push notification goes out with
 * the sender identified by phone number (customer) or "Support" (admin).
 */

const maxChatBodyRunes = 2000

type sendMessageRequest struct {
	Body string `json:"body"`
}

func sanitizeChatBody(raw string) (string, bool) {
	body := strings.TrimSpace(strings.ReplaceAll(raw, "\r\n", "\n"))
	if body == "" {
		return "", false
	}
	if utf8.RuneCountInString(body) > maxChatBodyRunes {
		return "", false
	}
	return body, true
}

type chatMessageView struct {
	ID         int64     `json:"id"`
	ThreadID   int64     `json:"thread_id"`
	SenderRole string    `json:"sender_role"`
	SenderID   int64     `json:"sender_id"`
	Body       string    `json:"body"`
	CreatedAt  time.Time `json:"created_at"`
}

func toChatMessageView(m sqlc.ChatMessage) chatMessageView {
	return chatMessageView{
		ID:         m.ID,
		ThreadID:   m.ThreadID,
		SenderRole: m.SenderRole,
		SenderID:   m.SenderID,
		Body:       m.Body,
		CreatedAt:  m.CreatedAt.Time,
	}
}

func websocketChatPayload(view chatMessageView, senderLabel string) websocket.ChatMessagePayload {
	return websocket.ChatMessagePayload{
		ThreadID:    view.ThreadID,
		MessageID:   view.ID,
		SenderRole:  view.SenderRole,
		SenderLabel: senderLabel,
		Body:        view.Body,
		CreatedAt:   view.CreatedAt,
	}
}

// sendMessage persists a message, publishes it over WS, and falls back to
// web push for recipients without a live socket. Returns the stored view.
func (h *Handler) sendMessage(w http.ResponseWriter, r *http.Request, thread sqlc.ChatThread, senderRole string, senderID int64, user sqlc.User) (chatMessageView, bool) {
	var req sendMessageRequest
	if err := decodeJSON(r, &req); err != nil {
		h.Error(w, http.StatusBadRequest, "invalid request")
		return chatMessageView{}, false
	}
	body, ok := sanitizeChatBody(req.Body)
	if !ok {
		h.Error(w, http.StatusBadRequest, "message body is required (max 2000 characters)")
		return chatMessageView{}, false
	}

	msg, err := h.queries.InsertChatMessage(r.Context(), sqlc.InsertChatMessageParams{
		ThreadID:   thread.ID,
		SenderRole: senderRole,
		SenderID:   senderID,
		Body:       body,
	})
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to send message")
		return chatMessageView{}, false
	}
	_ = h.queries.TouchChatThread(r.Context(), thread.ID)

	// Sender label: customers are identified by phone, admins are Support.
	senderLabel := "Support"
	if senderRole == "user" {
		senderLabel = user.Phone
	}
	view := toChatMessageView(msg)

	if h.hub != nil {
		h.hub.PublishChatMessage(websocketChatPayload(view, senderLabel), thread.UserID)
	}

	// Web push goes to every subscribed device; the service worker on a
	// device with the chat open and visible suppresses the notification
	// itself. No server-side "is the recipient connected" guess — a live
	// socket on one device (or a suspended phone's half-open socket) must
	// not silence notifications on every other device.
	if h.push != nil && h.push.Enabled() {
		if senderRole == "user" {
			h.notifyAdmins(r, webpush.Notification{
				Title: "Customer message · " + user.Phone,
				Body:  truncateRunes(body, 120),
				// Ops console routes are top-level since the admin app
				// moved to its own origin (admin.aarogyaruchi.com).
				URL: "/users/" + strconv.FormatInt(thread.UserID, 10),
				Tag: "chat-" + strconv.FormatInt(thread.ID, 10),
			})
		} else {
			h.notifyUser(r, thread.UserID, webpush.Notification{
				Title: "Aarogya Ruchi Support",
				Body:  truncateRunes(body, 120),
				URL:   "/support",
				Tag:   "chat-" + strconv.FormatInt(thread.ID, 10),
			})
		}
	}

	return view, true
}

func truncateRunes(s string, n int) string {
	runes := []rune(s)
	if len(runes) <= n {
		return s
	}
	return string(runes[:n]) + "…"
}

// ---- Customer endpoints ----

// GetMyChat returns the customer's support thread (created on demand).
func (h *Handler) GetMyChat(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.GetUserID(r.Context())

	thread, err := h.queries.GetOrCreateChatThread(r.Context(), userID)
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to load chat")
		return
	}
	messages, err := h.queries.ListChatMessages(r.Context(), thread.ID)
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to load messages")
		return
	}
	_ = h.queries.MarkChatThreadReadByUser(r.Context(), thread.ID)

	views := make([]chatMessageView, 0, len(messages))
	for _, m := range messages {
		views = append(views, chatMessageView{
			ID: m.ID, ThreadID: m.ThreadID, SenderRole: m.SenderRole,
			SenderID: m.SenderID, Body: m.Body, CreatedAt: m.CreatedAt.Time,
		})
	}
	h.JSON(w, http.StatusOK, map[string]any{
		"thread_id": thread.ID,
		"messages":  views,
	})
}

// GetMyChatUnread reports how many support replies the customer hasn't read.
// Backs the persistent red-dot indicator in the site navigation.
func (h *Handler) GetMyChatUnread(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.GetUserID(r.Context())

	unread, err := h.queries.CountUnreadChatForUser(r.Context(), userID)
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to load unread count")
		return
	}
	h.JSON(w, http.StatusOK, map[string]any{"unread": unread})
}

// SendMyChatMessage lets the customer message support.
func (h *Handler) SendMyChatMessage(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.GetUserID(r.Context())

	user, err := h.queries.GetUser(r.Context(), userID)
	if err != nil {
		h.Error(w, http.StatusNotFound, "user not found")
		return
	}
	thread, err := h.queries.GetOrCreateChatThread(r.Context(), userID)
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to load chat")
		return
	}

	view, ok := h.sendMessage(w, r, thread, "user", userID, user)
	if !ok {
		return
	}
	h.JSON(w, http.StatusCreated, view)
}

// ---- Admin endpoints ----

// AdminListChatThreads is the support inbox (users with threads).
func (h *Handler) AdminListChatThreads(w http.ResponseWriter, r *http.Request) {
	threads, err := h.queries.AdminListChatThreads(r.Context())
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to load threads")
		return
	}
	views := make([]map[string]any, 0, len(threads))
	for _, t := range threads {
		views = append(views, map[string]any{
			"thread_id":    t.ThreadID,
			"user_id":      t.UserID,
			"user_phone":   t.UserPhone,
			"user_name":    t.UserName.String,
			"last_message": t.LastMessage,
			"last_at":      t.LastMessageAt.Time,
			"unread_count": t.UnreadCount,
		})
	}
	h.JSON(w, http.StatusOK, map[string]any{"threads": views})
}

// AdminListUsers lists every customer with chat/order state for the Users
// page — the phone number is the primary identity shown to operators.
func (h *Handler) AdminListUsers(w http.ResponseWriter, r *http.Request) {
	users, err := h.queries.AdminListUsers(r.Context())
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to load users")
		return
	}
	views := make([]map[string]any, 0, len(users))
	for _, u := range users {
		entry := map[string]any{
			"user_id":     u.UserID,
			"phone":       u.Phone,
			"name":        u.Name.String,
			"created_at":  u.CreatedAt.Time,
			"order_count": u.OrderCount,
			"thread_id":   nil,
		}
		if u.ThreadID.Valid {
			entry["thread_id"] = u.ThreadID.Int64
			entry["last_message"] = u.LastMessage
			entry["last_at"] = u.LastMessageAt.Time
			entry["unread_count"] = u.UnreadCount
		}
		views = append(views, entry)
	}
	h.JSON(w, http.StatusOK, map[string]any{"users": views})
}

// AdminGetChatThread returns one thread's messages (marked read).
func (h *Handler) AdminGetChatThread(w http.ResponseWriter, r *http.Request) {
	userID, err := strconv.ParseInt(chi.URLParam(r, "user_id"), 10, 64)
	if err != nil {
		h.Error(w, http.StatusBadRequest, "invalid user id")
		return
	}

	// Create-on-demand, like the customer endpoint: an admin opening a
	// customer's chat before any message exists must get an empty thread,
	// not a 404.
	thread, err := h.queries.GetOrCreateChatThread(r.Context(), userID)
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to load chat")
		return
	}
	user, err := h.queries.GetUser(r.Context(), userID)
	if err != nil {
		h.Error(w, http.StatusNotFound, "user not found")
		return
	}
	messages, err := h.queries.ListChatMessages(r.Context(), thread.ID)
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to load messages")
		return
	}
	_ = h.queries.MarkChatThreadReadByAdmin(r.Context(), thread.ID)

	views := make([]chatMessageView, 0, len(messages))
	for _, m := range messages {
		views = append(views, chatMessageView{
			ID: m.ID, ThreadID: m.ThreadID, SenderRole: m.SenderRole,
			SenderID: m.SenderID, Body: m.Body, CreatedAt: m.CreatedAt.Time,
		})
	}
	h.JSON(w, http.StatusOK, map[string]any{
		"thread_id":  thread.ID,
		"user_id":    user.ID,
		"user_phone": user.Phone,
		"user_name":  user.Name.String,
		"messages":   views,
	})
}

// AdminSendChatMessage replies to a customer's thread.
func (h *Handler) AdminSendChatMessage(w http.ResponseWriter, r *http.Request) {
	adminID, _ := middleware.GetAdminID(r.Context())

	userID, err := strconv.ParseInt(chi.URLParam(r, "user_id"), 10, 64)
	if err != nil {
		h.Error(w, http.StatusBadRequest, "invalid user id")
		return
	}
	user, err := h.queries.GetUser(r.Context(), userID)
	if err != nil {
		h.Error(w, http.StatusNotFound, "user not found")
		return
	}
	thread, err := h.queries.GetOrCreateChatThread(r.Context(), userID)
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to load chat")
		return
	}

	view, ok := h.sendMessage(w, r, thread, "admin", adminID, user)
	if !ok {
		return
	}
	h.JSON(w, http.StatusCreated, view)
}
