// Package webpush wraps web-push delivery with the account's VAPID keys.
//
// Push complements the WebSocket hub: the server pushes every chat event to
// every subscribed device and the service worker decides per device whether
// to display it (a window that is open and visible stays silent).
package webpush

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strings"

	webpush "github.com/SherClockHolmes/webpush-go"

	"aarogyaruchi/internal/db/sqlc"
)

// Notification is the payload sent to the service worker.
type Notification struct {
	Title string `json:"title"`
	Body  string `json:"body"`
	URL   string `json:"url"`
	Tag   string `json:"tag,omitempty"`
}

// Sender delivers notifications through VAPID-authenticated web push.
type Sender struct {
	publicKey  string
	privateKey string
	subject    string
}

// NewSender stores the VAPID identity. webpush-go prepends "mailto:" to the
// JWT subject itself (unless it is an https URL), so a subject configured
// with the prefix must be stripped first: "mailto:mailto:…" is rejected by
// APNs with 403 BadJwtToken on every send while FCM tolerates it, which
// silently kills all push on Apple devices.
func NewSender(publicKey, privateKey, subject string) *Sender {
	subject = strings.TrimSpace(subject)
	if len(subject) >= len("mailto:") && strings.EqualFold(subject[:len("mailto:")], "mailto:") {
		subject = subject[len("mailto:"):]
	}
	return &Sender{publicKey: publicKey, privateKey: privateKey, subject: subject}
}

func (s *Sender) Enabled() bool {
	return s.publicKey != "" && s.privateKey != "" && s.subject != ""
}

// SendResult classifies one delivery attempt so callers can prune dead
// subscriptions without deleting live ones on transient failures.
type SendResult int

const (
	SendDelivered SendResult = iota // push service accepted (2xx)
	SendGone                        // 404/410 — subscription expired, prune it
	SendFailed                      // transport error or rejection — keep and retry later
)

// Notify one subscription and report how it went. Rejections are logged
// with the push service's status and body; they must be visible, not
// swallowed (a failing push must never break the message flow, but it
// should never look like a success either).
func (s *Sender) Send(ctx context.Context, sub sqlc.PushSubscription, n Notification) SendResult {
	if !s.Enabled() {
		return SendFailed
	}
	payload, err := json.Marshal(n)
	if err != nil {
		return SendFailed
	}

	resp, err := webpush.SendNotificationWithContext(ctx, payload, &webpush.Subscription{
		Endpoint: sub.Endpoint,
		Keys: webpush.Keys{
			P256dh: sub.P256dh,
			Auth:   sub.Auth,
		},
	}, &webpush.Options{
		VAPIDPublicKey:  s.publicKey,
		VAPIDPrivateKey: s.privateKey,
		Subscriber:      s.subject,
		TTL:             24 * 60 * 60, // seconds
	})
	if err != nil {
		log.Printf("webpush: send error (endpoint %d): %v", sub.ID, err)
		return SendFailed
	}
	defer resp.Body.Close()

	switch {
	case resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusGone:
		return SendGone
	case resp.StatusCode > 299:
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 256))
		log.Printf("webpush: endpoint %d rejected push: %s %s", sub.ID, resp.Status, strings.TrimSpace(string(body)))
		return SendFailed
	default:
		return SendDelivered
	}
}
