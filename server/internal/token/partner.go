// Package token issues and verifies the delivery-partner credential pair:
// a short-lived stateless access token (compact HS256 JWT, stdlib only) and
// an opaque rotating refresh token whose SHA-256 hash is stored server-side.
package token

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

const (
	AccessTTL  = 15 * time.Minute
	RefreshTTL = 30 * 24 * time.Hour
)

var (
	ErrInvalidToken = errors.New("invalid token")
	ErrExpiredToken = errors.New("token expired")
)

// PartnerAccess is the access-token payload.
type PartnerAccess struct {
	PartnerID int64     `json:"sub"`
	IssuedAt  time.Time `json:"iat"`
	ExpiresAt time.Time `json:"exp"`
}

type jwtHeader struct {
	Alg string `json:"alg"`
	Typ string `json:"typ"`
}

// Manager signs and verifies partner access tokens.
type Manager struct {
	secret []byte
}

func NewManager(secret string) *Manager {
	return &Manager{secret: []byte(secret)}
}

// IssueAccess returns a signed compact JWT for the partner.
func (m *Manager) IssueAccess(partnerID int64, now time.Time) (string, error) {
	header, err := json.Marshal(jwtHeader{Alg: "HS256", Typ: "JWT"})
	if err != nil {
		return "", err
	}
	claims, err := json.Marshal(PartnerAccess{
		PartnerID: partnerID,
		IssuedAt:  now,
		ExpiresAt: now.Add(AccessTTL),
	})
	if err != nil {
		return "", err
	}

	signingInput := b64(header) + "." + b64(claims)
	sig := m.sign(signingInput)
	return signingInput + "." + sig, nil
}

// VerifyAccess validates a signed token and returns its claims.
func (m *Manager) VerifyAccess(token string) (*PartnerAccess, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, ErrInvalidToken
	}
	signingInput := parts[0] + "." + parts[1]
	if !hmac.Equal([]byte(m.sign(signingInput)), []byte(parts[2])) {
		return nil, ErrInvalidToken
	}

	claimsJSON, err := unb64(parts[1])
	if err != nil {
		return nil, ErrInvalidToken
	}
	var claims PartnerAccess
	if err := json.Unmarshal(claimsJSON, &claims); err != nil {
		return nil, ErrInvalidToken
	}
	if time.Now().After(claims.ExpiresAt) {
		return nil, ErrExpiredToken
	}
	if claims.PartnerID <= 0 {
		return nil, ErrInvalidToken
	}
	return &claims, nil
}

func (m *Manager) sign(input string) string {
	mac := hmac.New(sha256.New, m.secret)
	mac.Write([]byte(input))
	return b64(mac.Sum(nil))
}

// NewRefresh returns a fresh opaque refresh token plus its SHA-256 hash for
// storage. Only the hash is persisted; the raw token exists solely on the
// partner's device (SecureStore).
func NewRefresh() (raw string, hash string, err error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", "", err
	}
	raw = base64.RawURLEncoding.EncodeToString(buf)
	return raw, HashRefresh(raw), nil
}

// HashRefresh computes the storage form of a raw refresh token.
func HashRefresh(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func b64(data []byte) string { return base64.RawURLEncoding.EncodeToString(data) }

func unb64(s string) ([]byte, error) {
	return base64.RawURLEncoding.DecodeString(s)
}
