package middleware

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"aarogyaruchi/internal/db/sqlc"
	"aarogyaruchi/internal/session"
	"aarogyaruchi/internal/token"
)

type contextKey string

const (
	UserIDKey            contextKey = "user_id"
	UserTypeKey          contextKey = "user_type"
	UserPhoneKey         contextKey = "user_phone"
	AdminIDKey           contextKey = "admin_id"
	AdminRoleKey         contextKey = "admin_role"
	DeliveryPartnerIDKey contextKey = "delivery_partner_id"
	SessionIDKey         contextKey = "session_id"
)

type AuthMiddleware struct {
	sessions *session.Store
	tokens   *token.Manager
	queries  *sqlc.Queries
}

func NewAuth(sessions *session.Store, tokens *token.Manager, queries *sqlc.Queries) *AuthMiddleware {
	return &AuthMiddleware{sessions: sessions, tokens: tokens, queries: queries}
}

// PartnerActive reports whether the partner still exists and is enabled.
// Deactivating a partner must cut off API access immediately, not just at
// the next login — access JWTs are short-lived but refresh tokens are not.
func (m *AuthMiddleware) PartnerActive(ctx context.Context, partnerID int64) bool {
	partner, err := m.queries.GetDeliveryPartner(ctx, partnerID)
	return err == nil && partner.IsActive.Bool
}

// SessionFromRequest resolves the cookie session, if any. Shared by HTTP
// middleware and the WebSocket upgrade path.
func (m *AuthMiddleware) SessionFromRequest(r *http.Request) (*session.Data, string, error) {
	cookie, err := r.Cookie("session_id")
	if err != nil {
		return nil, "", err
	}
	sessionID := cookie.Value
	data, err := m.sessions.Get(r.Context(), sessionID)
	if err != nil {
		return nil, "", err
	}
	return data, sessionID, nil
}

// writeAuthError separates "no valid session" (401) from "cannot reach the
// session store" (503). A Valkey restart window must read as retryable,
// never as a logout.
func writeAuthError(w http.ResponseWriter, err error) {
	if errors.Is(err, session.ErrSessionUnavailable) {
		http.Error(w, `{"error":"session store unavailable"}`, http.StatusServiceUnavailable)
		return
	}
	http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
}

func (m *AuthMiddleware) requireSessionType(w http.ResponseWriter, r *http.Request, want string) (*session.Data, string, bool) {
	data, sessionID, err := m.SessionFromRequest(r)
	if err != nil {
		writeAuthError(w, err)
		return nil, "", false
	}
	if data.UserType != want {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return nil, "", false
	}
	return data, sessionID, true
}

func withSession(ctx context.Context, data *session.Data, sessionID string) context.Context {
	ctx = context.WithValue(ctx, UserTypeKey, data.UserType)
	ctx = context.WithValue(ctx, UserPhoneKey, data.Phone)
	ctx = context.WithValue(ctx, SessionIDKey, sessionID)
	return ctx
}

// RequireUser guards customer endpoints (cookie session).
func (m *AuthMiddleware) RequireUser(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		data, sessionID, ok := m.requireSessionType(w, r, "user")
		if !ok {
			return
		}
		ctx := withSession(r.Context(), data, sessionID)
		ctx = context.WithValue(ctx, UserIDKey, data.UserID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// RequireAdmin guards admin endpoints (any admin role).
func (m *AuthMiddleware) RequireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		data, sessionID, ok := m.requireSessionType(w, r, "admin")
		if !ok {
			return
		}
		ctx := withSession(r.Context(), data, sessionID)
		ctx = context.WithValue(ctx, AdminIDKey, data.AdminID)
		ctx = context.WithValue(ctx, AdminRoleKey, data.Role)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// RequireSuperAdmin guards privileged management endpoints.
func (m *AuthMiddleware) RequireSuperAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		data, sessionID, ok := m.requireSessionType(w, r, "admin")
		if !ok {
			return
		}
		if data.Role != "super_admin" {
			http.Error(w, `{"error":"super admin required"}`, http.StatusForbidden)
			return
		}
		ctx := withSession(r.Context(), data, sessionID)
		ctx = context.WithValue(ctx, AdminIDKey, data.AdminID)
		ctx = context.WithValue(ctx, AdminRoleKey, data.Role)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// RequirePartner guards delivery-partner endpoints. Accepts the Bearer access
// token (Expo app) — partner sessions are token-based, not cookie-based. The
// signature check alone is not enough: a deactivated partner must lose
// access immediately, so the account is re-checked on every request.
func (m *AuthMiddleware) RequirePartner(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}
		claims, err := m.tokens.VerifyAccess(strings.TrimPrefix(header, "Bearer "))
		if err != nil || !m.PartnerActive(r.Context(), claims.PartnerID) {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}
		ctx := context.WithValue(r.Context(), DeliveryPartnerIDKey, claims.PartnerID)
		ctx = context.WithValue(ctx, UserTypeKey, "delivery_partner")
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// Helper functions to get values from context
func GetUserID(ctx context.Context) (int64, bool) {
	id, ok := ctx.Value(UserIDKey).(int64)
	return id, ok
}

func GetAdminID(ctx context.Context) (int64, bool) {
	id, ok := ctx.Value(AdminIDKey).(int64)
	return id, ok
}

func GetAdminRole(ctx context.Context) (string, bool) {
	role, ok := ctx.Value(AdminRoleKey).(string)
	return role, ok
}

func GetDeliveryPartnerID(ctx context.Context) (int64, bool) {
	id, ok := ctx.Value(DeliveryPartnerIDKey).(int64)
	return id, ok
}

func GetSessionID(ctx context.Context) (string, bool) {
	id, ok := ctx.Value(SessionIDKey).(string)
	return id, ok
}

// RequireUserOrAdmin guards endpoints usable by either a customer session
// or an admin session (push subscriptions, shared utilities). The context
// carries whichever identity matched.
func (m *AuthMiddleware) RequireUserOrAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		data, sessionID, err := m.SessionFromRequest(r)
		if err != nil {
			writeAuthError(w, err)
			return
		}
		ctx := withSession(r.Context(), data, sessionID)
		switch data.UserType {
		case "user":
			ctx = context.WithValue(ctx, UserIDKey, data.UserID)
		case "admin":
			ctx = context.WithValue(ctx, AdminIDKey, data.AdminID)
			ctx = context.WithValue(ctx, AdminRoleKey, data.Role)
		default:
			http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
