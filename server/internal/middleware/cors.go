package middleware

import (
	"net/http"
	"slices"
	"strings"
)

// CORS returns middleware that allows credentialed cross-origin requests from
// the configured origins only. The customer site, admin panel, and API share
// the aarogyaruchi.com registrable domain, so the session cookie flows on
// same-site requests; the explicit echo + Allow-Credentials headers cover the
// localhost dev origins too.
func CORS(allowedOrigins []string) func(http.Handler) http.Handler {
	allowed := make(map[string]bool, len(allowedOrigins))
	for _, o := range allowedOrigins {
		allowed[strings.TrimSuffix(o, "/")] = true
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin != "" && allowed[strings.TrimSuffix(origin, "/")] {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Credentials", "true")
				w.Header().Set("Vary", "Origin")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, Idempotency-Key")
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
				w.Header().Set("Access-Control-Max-Age", "600")
			}

			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// OriginAllowed reports whether an origin is in the allowlist (useful for
// WebSocket upgrades, which cannot use the middleware pattern).
func OriginAllowed(allowedOrigins []string, origin string) bool {
	return slices.ContainsFunc(allowedOrigins, func(o string) bool {
		return strings.TrimSuffix(o, "/") == strings.TrimSuffix(origin, "/")
	})
}
