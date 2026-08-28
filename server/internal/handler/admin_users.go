package handler

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
)

// ---- Admin customer profile ----

// AdminGetUser returns one customer's profile for the ops console: identity,
// best address (default first, else most recent), and notification
// reachability. Backs the customer-details dialog in the chat.
func (h *Handler) AdminGetUser(w http.ResponseWriter, r *http.Request) {
	userID, err := strconv.ParseInt(chi.URLParam(r, "user_id"), 10, 64)
	if err != nil {
		h.Error(w, http.StatusBadRequest, "invalid user id")
		return
	}

	u, err := h.queries.AdminGetUserDetail(r.Context(), userID)
	if err != nil {
		if isNoRows(err) {
			h.Error(w, http.StatusNotFound, "user not found")
			return
		}
		h.Error(w, http.StatusInternalServerError, "failed to load user")
		return
	}

	var address any
	if u.AddressCount > 0 {
		address = map[string]any{
			"label":          u.AddressLabel.String,
			"address_line":   u.AddressLine,
			"landmark":       u.Landmark.String,
			"locality_name":  u.LocalityName.String,
			"locality_city":  u.LocalityCity.String,
			"latitude":       u.Latitude.Float64,
			"longitude":      u.Longitude.Float64,
		}
	}

	var notification any
	if u.NotifPermission.Valid || u.PushSubscribed {
		permission := u.NotifPermission.String
		if !u.NotifPermission.Valid && u.PushSubscribed {
			// Never reported (pre-update client) but a live subscription
			// exists — permission must have been granted when it was made.
			permission = "granted"
		}
		notification = map[string]any{
			"permission":      permission,
			"reported_at":     u.NotifReportedAt.Time,
			"push_subscribed": u.PushSubscribed,
		}
	}

	h.JSON(w, http.StatusOK, map[string]any{
		"user": map[string]any{
			"user_id":     u.ID,
			"phone":       u.Phone,
			"name":        u.Name.String,
			"created_at":  u.CreatedAt.Time,
			"address":     address,
			"address_count": u.AddressCount,
			"notification": notification,
		},
	})
}
