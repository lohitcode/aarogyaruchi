// AI assistant (/chat/stream) — kept separate from the support chat in chat.go.
package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"aarogyaruchi/internal/chatbot"
)

const (
	// chatStreamTimeout bounds a whole streaming reply, provider included.
	chatStreamTimeout = 60 * time.Second
	// chatMaxBodyBytes bounds the JSON payload (12 capped messages is a few
	// KB; 64KB leaves generous headroom).
	chatMaxBodyBytes = 64 * 1024
)

// ChatStream handles the public POST /chat/stream SSE endpoint. It validates
// and rate-limits the request, then streams provider deltas as typed SSE
// events. Message contents and provider credentials are never logged.
func (h *Handler) ChatStream(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	ip := chatbot.ClientIP(r.Header.Get("X-Forwarded-For"), r.RemoteAddr)
	if !h.chat.Allowed(ctx, ip) {
		writeChatError(w, http.StatusTooManyRequests, "rate_limited",
			"Too many requests. Please wait a little and try again.")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, chatMaxBodyBytes)
	var req chatbot.ChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeChatError(w, http.StatusBadRequest, "bad_request", "Invalid request body.")
		return
	}
	if err := req.Validate(); err != nil {
		// Validation errors are generic by construction; safe to return.
		writeChatError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	streamCtx, cancel := context.WithTimeout(ctx, chatStreamTimeout)
	defer cancel()

	providerMsgs := chatbot.BuildProviderMessages(req.Locale, req.Messages)
	events, err := h.chat.Client.StreamChat(streamCtx, providerMsgs, chatbot.MaxOutputTokens)
	if err != nil {
		// Misconfiguration or provider outage; no internals are exposed.
		writeChatError(w, http.StatusServiceUnavailable, "provider_error",
			"The assistant is unavailable right now. Please try again in a moment.")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	// Hint for reverse proxies (Caddy/nginx) not to buffer the stream.
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	if !chatbot.ReplyLocaleSupported(req.Locale) {
		writeChatEvent(w, "fallback", map[string]string{"reason": "unsupported_locale"})
	}

	var reply strings.Builder
	for event := range events {
		if event.Err != nil {
			writeChatEvent(w, "error", map[string]string{
				"kind":    "provider_error",
				"message": "The assistant is unavailable right now. Please try again in a moment.",
			})
			return
		}
		if event.Done {
			writeChatEvent(w, "done", map[string]any{
				"products": chatbot.MatchProducts(reply.String()),
			})
			return
		}
		if event.Delta != "" {
			reply.WriteString(event.Delta)
			writeChatEvent(w, "delta", map[string]string{"text": event.Delta})
		}
	}

	// Channel closed without Done (client disconnect or provider hangup).
	writeChatEvent(w, "error", map[string]string{
		"kind":    "provider_error",
		"message": "The assistant is unavailable right now. Please try again in a moment.",
	})
}

func writeChatEvent(w http.ResponseWriter, name string, payload any) {
	data, err := json.Marshal(payload)
	if err != nil {
		return
	}
	fmt.Fprintf(w, "event: %s\ndata: %s\n\n", name, data)
	if flusher, ok := w.(http.Flusher); ok {
		flusher.Flush()
	}
}

func writeChatError(w http.ResponseWriter, status int, kind, message string) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.WriteHeader(status)
	writeChatEvent(w, "error", map[string]string{"kind": kind, "message": message})
}

// ChatCORS restricts browser access to the chat endpoint to the production
// website and local development origins. It also answers the preflight.
func (h *Handler) ChatCORS() func(http.Handler) http.Handler {
	allowed := make(map[string]bool, len(h.config.ChatAllowedOrigins))
	for _, origin := range h.config.ChatAllowedOrigins {
		allowed[origin] = true
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin != "" && allowed[origin] {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Vary", "Origin")
				w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
				w.Header().Set("Access-Control-Max-Age", "86400")
			}
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
