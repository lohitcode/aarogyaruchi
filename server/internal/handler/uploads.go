package handler

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strconv"
	"time"
)

// Image uploads flow through the existing images-cdn Cloudflare Worker,
// which holds the R2 binding. The Go API mints a short-lived HMAC upload
// token (R2_UPLOAD_SECRET, shared with the worker via wrangler secret);
// the worker validates it and streams the object into R2 directly, so no
// image bytes touch the VPS and no R2 credentials live on it either.

const uploadTTL = 15 * time.Minute

// CreateImageUploadToken returns a one-shot upload URL for the admin
// product editor. The browser PUTs the file bytes to the worker URL.
func (h *Handler) CreateImageUploadToken(w http.ResponseWriter, r *http.Request) {
	secret := h.config.R2UploadSecret
	base := h.config.ImagesCDNBase
	if secret == "" || base == "" {
		h.Error(w, http.StatusServiceUnavailable, "image uploads are not configured")
		return
	}

	exp := time.Now().Add(uploadTTL).Unix()
	sig := uploadSignature(secret, exp)
	h.JSON(w, http.StatusOK, map[string]any{
		"upload_url": base + "/upload?exp=" + strconv.FormatInt(exp, 10) + "&sig=" + sig,
		"expires_at": exp,
	})
}

// uploadSignature = hex(HMAC-SHA256(secret, "upload:" + exp)).
func uploadSignature(secret string, exp int64) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte("upload:" + strconv.FormatInt(exp, 10)))
	return hex.EncodeToString(mac.Sum(nil))
}

// ValidUploadSignature lets tests confirm the scheme matches the worker's
// verifier.
func ValidUploadSignature(secret string, exp int64, sig string) bool {
	return hmac.Equal([]byte(uploadSignature(secret, exp)), []byte(sig))
}
