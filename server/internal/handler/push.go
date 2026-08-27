package handler

import (
	"net/http"

	"aarogyaruchi/internal/db/sqlc"
	"aarogyaruchi/internal/middleware"
	"aarogyaruchi/internal/webpush"
)

// ---- Web-push subscription management (customers + admins) ----

type pushSubscribeRequest struct {
	Endpoint string `json:"endpoint"`
	Keys     struct {
		P256dh string `json:"p256dh"`
		Auth   string `json:"auth"`
	} `json:"keys"`
}

// PushPublicKey exposes the VAPID public key the browser needs to
// subscribe. Public: the key is not a secret.
func (h *Handler) PushPublicKey(w http.ResponseWriter, r *http.Request) {
	h.JSON(w, http.StatusOK, map[string]string{"public_key": h.config.VAPID.PublicKey})
}

// PushSubscribe stores (or refreshes) the caller's push subscription. The
// role (customer vs admin) comes from the session, never the request body.
func (h *Handler) PushSubscribe(w http.ResponseWriter, r *http.Request) {
	var req pushSubscribeRequest
	if err := decodeJSON(r, &req); err != nil || req.Endpoint == "" || req.Keys.P256dh == "" || req.Keys.Auth == "" {
		h.Error(w, http.StatusBadRequest, "endpoint, keys.p256dh, and keys.auth are required")
		return
	}

	userID, isUser := middleware.GetUserID(r.Context())
	adminID, isAdmin := middleware.GetAdminID(r.Context())
	if !isUser && !isAdmin {
		h.Error(w, http.StatusForbidden, "unsupported role")
		return
	}

	var params sqlc.UpsertPushSubscriptionParams
	params.Endpoint = req.Endpoint
	params.P256dh = req.Keys.P256dh
	params.Auth = req.Keys.Auth
	params.UserAgent = pgText(r.Header.Get("User-Agent"))
	if isUser {
		params.Role = "user"
		params.UserID = pgInt8(userID)
	} else {
		params.Role = "admin"
		params.AdminID = pgInt8(adminID)
	}

	sub, err := h.queries.UpsertPushSubscription(r.Context(), params)
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to save subscription")
		return
	}
	h.JSON(w, http.StatusCreated, map[string]any{"id": sub.ID, "role": sub.Role})
}

// PushUnsubscribe removes a subscription (called on push unsubscribe
// events and on logout from devices).
func (h *Handler) PushUnsubscribe(w http.ResponseWriter, r *http.Request) {
	var req pushSubscribeRequest
	if err := decodeJSON(r, &req); err != nil || req.Endpoint == "" {
		h.Error(w, http.StatusBadRequest, "endpoint is required")
		return
	}
	_, _ = h.queries.DeletePushSubscriptionByEndpoint(r.Context(), req.Endpoint)
	h.JSON(w, http.StatusOK, map[string]string{"message": "unsubscribed"})
}

// notifyUser delivers a push to every device of one customer. Only
// subscriptions the push service confirms gone (404/410) are pruned;
// transient failures keep the row for the next event.
func (h *Handler) notifyUser(r *http.Request, userID int64, n webpush.Notification) {
	subs, err := h.queries.ListPushSubscriptionsForUser(r.Context(), pgInt8(userID))
	if err != nil {
		return
	}
	for _, sub := range subs {
		if h.push.Send(r.Context(), sub, n) == webpush.SendGone {
			_, _ = h.queries.DeletePushSubscription(r.Context(), sub.ID)
		}
	}
}

// notifyAdmins delivers a push to every subscribed admin device.
func (h *Handler) notifyAdmins(r *http.Request, n webpush.Notification) {
	subs, err := h.queries.ListPushSubscriptionsForAdmins(r.Context())
	if err != nil {
		return
	}
	for _, sub := range subs {
		if h.push.Send(r.Context(), sub, n) == webpush.SendGone {
			_, _ = h.queries.DeletePushSubscription(r.Context(), sub.ID)
		}
	}
}
