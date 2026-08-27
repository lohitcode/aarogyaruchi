package handler

import (
	"context"
	"errors"
	"log"
	"net/http"

	"aarogyaruchi/internal/session"
	"aarogyaruchi/internal/websocket"

	ws "github.com/coder/websocket"
)

// WebSocket upgrades /v1/ws connections. Auth is the web session cookie or a
// partner `?access_token=` query parameter. Partner connections may push GPS
// fixes; all events flow server→client with role-scoped fan-out.
func (h *Handler) WebSocket(w http.ResponseWriter, r *http.Request) {
	var (
		userType  string
		userID    int64
		adminID   int64
		partnerID int64
	)

	// Partner app: Bearer-style token in the query string (WS cannot set
	// headers in browsers/RN). Same active-account check as the HTTP
	// middleware — a deactivated partner loses the socket too.
	if token := r.URL.Query().Get("access_token"); token != "" {
		claims, err := h.tokens.VerifyAccess(token)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		partner, err := h.queries.GetDeliveryPartner(r.Context(), claims.PartnerID)
		if err != nil || !partner.IsActive.Bool {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		userType = "delivery_partner"
		partnerID = claims.PartnerID
	} else {
		var data *session.Data
		cookie, err := r.Cookie("session_id")
		if err == nil {
			data, err = h.sessions.Get(r.Context(), cookie.Value)
		}
		if err != nil || data == nil {
			if errors.Is(err, session.ErrSessionUnavailable) {
				http.Error(w, "session store unavailable", http.StatusServiceUnavailable)
				return
			}
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		switch data.UserType {
		case "user":
			userType, userID = "user", data.UserID
		case "admin":
			admin, err := h.queries.GetAdmin(r.Context(), data.AdminID)
			if err != nil || !admin.IsActive.Bool {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			userType, adminID = "admin", data.AdminID
		default:
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
	}

	conn, err := ws.Accept(w, r, &ws.AcceptOptions{
		OriginPatterns: h.config.AllowedOrigins,
	})
	if err != nil {
		log.Printf("websocket accept error: %v", err)
		return
	}

	client := websocket.NewClient(h.hub, conn, userType, h.HandlePartnerWSLocation)
	client.UserID = userID
	client.AdminID = adminID
	client.PartnerID = partnerID

	h.hub.Register(client)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go client.WritePump(ctx)
	client.ReadPump(ctx)
}
