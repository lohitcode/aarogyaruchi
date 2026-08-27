package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"regexp"
	"strings"
	"time"

	"aarogyaruchi/internal/db/sqlc"
	"aarogyaruchi/internal/otp"
	"aarogyaruchi/internal/ratelimit"
	"aarogyaruchi/internal/session"
	"aarogyaruchi/internal/token"

	"github.com/jackc/pgx/v5"
)

type SendOTPRequest struct {
	Phone string `json:"phone"`
}

type SendOTPResponse struct {
	Token     string `json:"token"`
	ExpiresIn int    `json:"expires_in"` // seconds
}

type VerifyOTPRequest struct {
	Token string `json:"token"`
	Code  string `json:"code"`
	Name  string `json:"name,omitempty"` // customer registration
}

var phoneDigits = regexp.MustCompile(`^\+?[0-9]{10,15}$`)

// normalizePhone strips spaces and requires a 10–15 digit number.
func normalizePhone(raw string) (string, bool) {
	phone := strings.ReplaceAll(strings.TrimSpace(raw), " ", "")
	if !phoneDigits.MatchString(phone) {
		return "", false
	}
	return phone, true
}

// clientIP resolves the caller's IP. The API always sits behind proxies
// (Cloudflare -> Caddy in prod, cloudflared on the dev box), so RemoteAddr
// is the proxy's address — pooling every visitor into one rate-limit
// bucket. Prefer Cloudflare's CF-Connecting-IP (authoritative on both
// paths), then the rightmost X-Forwarded-For hop (appended by our own
// trusted Caddy), and fall back to the socket address only when neither
// exists (local dev / LAN).
func clientIP(r *http.Request) string {
	if ip := strings.TrimSpace(r.Header.Get("CF-Connecting-IP")); ip != "" {
		return ip
	}
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		if ip := strings.TrimSpace(parts[len(parts)-1]); ip != "" {
			return ip
		}
	}
	// SplitHostPort handles both "ip:port" and bracketed "[v6]:port";
	// a bare IPv6 address is returned as-is.
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}

// otpRateGate limits OTP send/verify attempts per phone and per IP through
// Valkey, even while the OTP itself is fixed.
func (h *Handler) otpRateGate(w http.ResponseWriter, r *http.Request, phone, scope string, perPhone, perIP int64) bool {
	ctx := r.Context()
	if !ratelimit.Allow(ctx, h.cache, ratelimit.Key("otp:"+scope+":p", phone), perPhone, time.Hour) {
		h.Error(w, http.StatusTooManyRequests, "too many attempts, try again later")
		return false
	}
	if !ratelimit.Allow(ctx, h.cache, ratelimit.Key("otp:"+scope+":ip", clientIP(r)), perIP, time.Hour) {
		h.Error(w, http.StatusTooManyRequests, "too many attempts from this network")
		return false
	}
	return true
}

// sendOTPFor is shared by all three role entry points; role separation
// matters at verify time, not at send time.
func (h *Handler) sendOTPFor(w http.ResponseWriter, r *http.Request) {
	var req SendOTPRequest
	if err := decodeJSON(r, &req); err != nil {
		h.Error(w, http.StatusBadRequest, "invalid request")
		return
	}
	phone, ok := normalizePhone(req.Phone)
	if !ok {
		h.Error(w, http.StatusBadRequest, "invalid phone number")
		return
	}
	if !h.otpRateGate(w, r, phone, "send", 10, 60) {
		return
	}

	tkn, err := h.otp.Send(r.Context(), phone)
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to send otp")
		return
	}
	h.JSON(w, http.StatusOK, SendOTPResponse{Token: tkn, ExpiresIn: 300})
}

func (h *Handler) SendCustomerOTP(w http.ResponseWriter, r *http.Request) { h.sendOTPFor(w, r) }
func (h *Handler) SendAdminOTP(w http.ResponseWriter, r *http.Request)    { h.sendOTPFor(w, r) }
func (h *Handler) SendPartnerOTP(w http.ResponseWriter, r *http.Request)  { h.sendOTPFor(w, r) }

// verifyOTP resolves and consumes the OTP token, returning the phone and
// the parsed request (registration fields ride along on verify).
func (h *Handler) verifyOTP(w http.ResponseWriter, r *http.Request) (string, VerifyOTPRequest, bool) {
	var req VerifyOTPRequest
	if err := decodeJSON(r, &req); err != nil || req.Token == "" || req.Code == "" {
		h.Error(w, http.StatusBadRequest, "invalid request")
		return "", VerifyOTPRequest{}, false
	}
	phone, err := h.otp.Verify(r.Context(), req.Token, req.Code)
	if err != nil {
		switch {
		case errors.Is(err, otp.ErrTokenInvalid):
			h.Error(w, http.StatusBadRequest, "invalid or expired token")
		case errors.Is(err, otp.ErrOTPInvalid):
			h.Error(w, http.StatusBadRequest, "invalid otp")
		case errors.Is(err, otp.ErrOTPExpired):
			h.Error(w, http.StatusBadRequest, "otp expired")
		default:
			h.Error(w, http.StatusInternalServerError, "verification failed")
		}
		return "", VerifyOTPRequest{}, false
	}
	if !h.otpRateGate(w, r, phone, "verify", 30, 90) {
		return "", VerifyOTPRequest{}, false
	}
	return phone, req, true
}

// VerifyCustomerOTP logs a customer in, auto-registering new phones.
func (h *Handler) VerifyCustomerOTP(w http.ResponseWriter, r *http.Request) {
	phone, req, ok := h.verifyOTP(w, r)
	if !ok {
		return
	}

	ctx := r.Context()
	user, err := h.queries.GetUserByPhone(ctx, phone)
	isNew := false
	if errors.Is(err, pgx.ErrNoRows) {
		name := strings.TrimSpace(req.Name)
		if name == "" {
			name = "Guest"
		}
		user, err = h.queries.CreateUser(ctx, sqlc.CreateUserParams{Phone: phone, Name: pgText(name)})
		if err != nil {
			h.Error(w, http.StatusInternalServerError, "failed to create account")
			return
		}
		isNew = true
	} else if err != nil {
		h.Error(w, http.StatusInternalServerError, "verification failed")
		return
	}

	sessionID, err := h.sessions.Create(ctx, session.Data{
		UserID:   user.ID,
		Phone:    user.Phone,
		UserType: "user",
	})
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to create session")
		return
	}
	h.setSessionCookie(w, sessionID)

	h.JSON(w, http.StatusOK, map[string]any{
		"type":           "customer",
		"is_new":         isNew,
		"user_id":        user.ID,
		"phone":          user.Phone,
		"name":           user.Name.String,
		"profile_complete": h.profileComplete(ctx, user.Name.String, user.ID),
	})
}

// VerifyAdminOTP succeeds only for active, pre-provisioned admin phones.
func (h *Handler) VerifyAdminOTP(w http.ResponseWriter, r *http.Request) {
	phone, _, ok := h.verifyOTP(w, r)
	if !ok {
		return
	}

	ctx := r.Context()
	admin, err := h.queries.GetAdminByPhone(ctx, phone)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && !admin.IsActive.Bool) {
		// Same error for unknown and inactive: no account enumeration.
		h.Error(w, http.StatusForbidden, "admin account not found or inactive")
		return
	}
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "verification failed")
		return
	}

	sessionID, err := h.sessions.Create(ctx, session.Data{
		AdminID:  admin.ID,
		Phone:    admin.Phone,
		UserType: "admin",
		Role:     admin.Role,
	})
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to create session")
		return
	}
	h.setSessionCookie(w, sessionID)

	h.JSON(w, http.StatusOK, map[string]any{
		"type": "admin",
		"id":   admin.ID,
		"role": admin.Role,
		"name": admin.Name.String,
	})
}

// VerifyPartnerOTP logs a delivery partner in with token credentials.
func (h *Handler) VerifyPartnerOTP(w http.ResponseWriter, r *http.Request) {
	phone, _, ok := h.verifyOTP(w, r)
	if !ok {
		return
	}

	ctx := r.Context()
	partner, err := h.queries.GetDeliveryPartnerByPhone(ctx, phone)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && !partner.IsActive.Bool) {
		h.Error(w, http.StatusForbidden, "partner account not found or inactive")
		return
	}
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "verification failed")
		return
	}

	access, rawRefresh, err := h.mintPartnerTokens(ctx, h.queries, partner.ID)
	if err != nil {
		h.Error(w, http.StatusInternalServerError, "failed to issue tokens")
		return
	}

	h.JSON(w, http.StatusOK, map[string]any{
		"type":          "partner",
		"partner_id":    partner.ID,
		"name":          partner.Name.String,
		"phone":         partner.Phone,
		"access_token":  access,
		"refresh_token": rawRefresh,
		"expires_in":    int(token.AccessTTL.Seconds()),
	})
}

// mintPartnerTokens issues an access JWT plus a new opaque refresh token,
// persisting only the refresh token's hash.
func (h *Handler) mintPartnerTokens(ctx context.Context, q *sqlc.Queries, partnerID int64) (access, refresh string, err error) {
	access, err = h.tokens.IssueAccess(partnerID, time.Now())
	if err != nil {
		return "", "", err
	}
	refresh, hash, err := token.NewRefresh()
	if err != nil {
		return "", "", err
	}
	if err := q.InsertRefreshToken(ctx, sqlc.InsertRefreshTokenParams{
		PartnerID: partnerID,
		TokenHash: hash,
		ExpiresAt: pgTS(time.Now().Add(token.RefreshTTL)),
	}); err != nil {
		return "", "", err
	}
	return access, refresh, nil
}

type refreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

// RefreshPartnerTokens rotates the refresh token: the old one is revoked and
// a new pair is issued atomically.
func (h *Handler) RefreshPartnerTokens(w http.ResponseWriter, r *http.Request) {
	var req refreshRequest
	if err := decodeJSON(r, &req); err != nil || req.RefreshToken == "" {
		h.Error(w, http.StatusBadRequest, "refresh_token is required")
		return
	}
	hash := token.HashRefresh(req.RefreshToken)

	var access, refresh string
	err := h.withTx(r.Context(), func(q *sqlc.Queries) error {
		stored, err := q.GetRefreshToken(r.Context(), hash)
		if err != nil {
			return errUnauthorized
		}
		if _, err := q.RevokeRefreshToken(r.Context(), hash); err != nil {
			return err
		}
		// Deactivated (or deleted) partners must not be able to keep
		// refreshing forever — the presented token is revoked above, so
		// this is the last rotation it can perform.
		partner, err := q.GetDeliveryPartner(r.Context(), stored.PartnerID)
		if err != nil || !partner.IsActive.Bool {
			return errUnauthorized
		}
		access, refresh, err = h.mintPartnerTokens(r.Context(), q, stored.PartnerID)
		return err
	})
	if err != nil {
		if errors.Is(err, errUnauthorized) {
			h.Error(w, http.StatusUnauthorized, "invalid or expired refresh token")
			return
		}
		h.Error(w, http.StatusInternalServerError, "failed to refresh tokens")
		return
	}

	h.JSON(w, http.StatusOK, map[string]any{
		"access_token":  access,
		"refresh_token": refresh,
		"expires_in":    int(token.AccessTTL.Seconds()),
	})
}

var errUnauthorized = errors.New("unauthorized")

type logoutRequest struct {
	RefreshToken string `json:"refresh_token,omitempty"`
}

// Logout destroys the caller's session. Web clients send the session cookie;
// the partner app additionally passes its refresh token for revocation.
func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	var req logoutRequest
	_ = decodeJSON(r, &req)

	if req.RefreshToken != "" {
		_, _ = h.queries.RevokeRefreshToken(r.Context(), token.HashRefresh(req.RefreshToken))
	}

	if cookie, err := r.Cookie("session_id"); err == nil {
		_ = h.sessions.Delete(r.Context(), cookie.Value)
	}

	sameSite, secure := h.sessionCookieAttrs()
	http.SetCookie(w, &http.Cookie{
		Name:     "session_id",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   secure,
		SameSite: sameSite,
	})

	h.JSON(w, http.StatusOK, map[string]string{"message": "logged out"})
}

// profileComplete: a real name (not the auto-created placeholder) and at
// least one saved address. Clients gate the UI on this.
func (h *Handler) profileComplete(ctx context.Context, name string, userID int64) bool {
	if strings.TrimSpace(name) == "" || strings.TrimSpace(name) == "Guest" {
		return false
	}
	count, err := h.queries.CountAddressesByUser(ctx, userID)
	return err == nil && count > 0
}

// GetSession reports the caller's current identity for client bootstrap.
func (h *Handler) GetSession(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("session_id")
	if err != nil {
		h.JSON(w, http.StatusOK, map[string]any{"authenticated": false})
		return
	}
	data, err := h.sessions.Get(r.Context(), cookie.Value)
	if err != nil {
		if errors.Is(err, session.ErrSessionUnavailable) {
			h.JSON(w, http.StatusServiceUnavailable, map[string]any{"error": "session store unavailable"})
			return
		}
		h.JSON(w, http.StatusOK, map[string]any{"authenticated": false})
		return
	}

	switch data.UserType {
	case "user":
		user, err := h.queries.GetUser(r.Context(), data.UserID)
		if err != nil {
			h.JSON(w, http.StatusOK, map[string]any{"authenticated": false})
			return
		}
		h.JSON(w, http.StatusOK, map[string]any{
			"authenticated": true,
			"type":          "customer",
			"user": map[string]any{
				"id":              user.ID,
				"phone":           user.Phone,
				"name":            user.Name.String,
				"profile_complete": h.profileComplete(r.Context(), user.Name.String, user.ID),
			},
		})
	case "admin":
		admin, err := h.queries.GetAdmin(r.Context(), data.AdminID)
		if err != nil || !admin.IsActive.Bool {
			h.JSON(w, http.StatusOK, map[string]any{"authenticated": false})
			return
		}
		h.JSON(w, http.StatusOK, map[string]any{
			"authenticated": true,
			"type":          "admin",
			"admin":         map[string]any{"id": admin.ID, "phone": admin.Phone, "name": admin.Name.String, "role": admin.Role},
		})
	default:
		h.JSON(w, http.StatusOK, map[string]any{"authenticated": false})
	}
}

// sessionCookieAttrs derives SameSite/Secure for the web session cookie.
// Default is Lax (same-site subdomain flows + localhost). With
// SESSION_COOKIE_SAMESITE_NONE the cookie becomes None; Secure so browsers
// accept it on genuinely cross-site origins (dev site on *.workers.dev).
func (h *Handler) sessionCookieAttrs() (http.SameSite, bool) {
	if h.config.SessionCookieSameSiteNone {
		return http.SameSiteNoneMode, true
	}
	return http.SameSiteLaxMode, !h.config.IsDev()
}

func (h *Handler) setSessionCookie(w http.ResponseWriter, sessionID string) {
	sameSite, secure := h.sessionCookieAttrs()
	// The Valkey session is the authoritative expiry (idle window, slid
	// forward on activity). The cookie only needs to outlive that window
	// so a continuously active device isn't dropped client-side while its
	// session is still alive; a stale cookie whose session evaporated is
	// rejected server-side and reads as logged-out.
	http.SetCookie(w, &http.Cookie{
		Name:     "session_id",
		Value:    sessionID,
		Path:     "/",
		MaxAge:   90 * 24 * 60 * 60,
		HttpOnly: true,
		Secure:   secure,
		SameSite: sameSite,
	})
}

// decodeJSON decodes a JSON body into dst with a size guard.
func decodeJSON(r *http.Request, dst any) error {
	if r.Body == nil {
		return errors.New("empty body")
	}
	return json.NewDecoder(http.MaxBytesReader(nil, r.Body, 1<<20)).Decode(dst)
}

// IntegrationSession mints a customer session; used by integration tests
// to authenticate requests without driving the OTP flow.
func (h *Handler) IntegrationSession(ctx context.Context, userID int64, phone string) (string, error) {
	return h.sessions.Create(ctx, session.Data{UserID: userID, Phone: phone, UserType: "user"})
}
