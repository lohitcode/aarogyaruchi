package handler

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"strconv"
	"time"
)

// Image uploads flow through the existing images-cdn Cloudflare Worker,
// which holds the R2 binding. The Go API mints a short-lived HMAC upload
// token (R2_UPLOAD_SECRET, shared with the worker via wrangler secret);
// the worker validates it and streams the object into R2 directly, so no
// image bytes touch the VPS and no R2 credentials live on it either.
//
// The token response also carries an og_upload_url for the link-preview
// variant (a canvas-resized ~90 KB JPEG the admin browser produces from the
// same file). Both URLs share one UUID key stem, so the variant's address
// stays derivable from the original: products/<stem>.<ext> and
// products/<stem>.og.jpg.

const uploadTTL = 15 * time.Minute

// CreateImageUploadToken returns upload URLs for the admin product editor.
// The browser PUTs the file bytes to the worker URLs.
func (h *Handler) CreateImageUploadToken(w http.ResponseWriter, r *http.Request) {
	secret := h.config.R2UploadSecret
	base := h.config.ImagesCDNBase
	if secret == "" || base == "" {
		h.Error(w, http.StatusServiceUnavailable, "image uploads are not configured")
		return
	}

	exp := time.Now().Add(uploadTTL).Unix()
	sig := uploadSignature(secret, exp)
	stem := newUploadStem()
	query := "exp=" + strconv.FormatInt(exp, 10) + "&sig=" + sig + "&stem=" + stem
	h.JSON(w, http.StatusOK, map[string]any{
		"upload_url":    base + "/upload?" + query,
		"og_upload_url": base + "/upload?" + query + "&v=og",
		"expires_at":    exp,
	})
}

// uploadSignature = hex(HMAC-SHA256(secret, "upload:" + exp)).
func uploadSignature(secret string, exp int64) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte("upload:" + strconv.FormatInt(exp, 10)))
	return hex.EncodeToString(mac.Sum(nil))
}

// newUploadStem mints a UUID v4 key stem for a paired original + og-variant
// upload. Kept dependency-free (no google/uuid for one call).
func newUploadStem() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		// crypto/rand never fails on Linux/macOS; a time-based stem simply
		// keeps uploads working if it ever did.
		return fmt.Sprintf("%032x", time.Now().UnixNano())
	}
	b[6] = (b[6] & 0x0f) | 0x40 // version 4
	b[8] = (b[8] & 0x3f) | 0x80 // RFC 4122 variant
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

// ValidUploadSignature lets tests confirm the scheme matches the worker's
// verifier.
func ValidUploadSignature(secret string, exp int64, sig string) bool {
	return hmac.Equal([]byte(uploadSignature(secret, exp)), []byte(sig))
}
