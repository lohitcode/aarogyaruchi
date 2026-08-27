package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestClientIP(t *testing.T) {
	tests := []struct {
		name   string
		cfIP   string
		xff    string
		remote string
		want   string
	}{
		{
			name:   "CF-Connecting-IP wins (prod: Cloudflare, dev: cloudflared)",
			cfIP:   "203.0.113.7",
			xff:    "198.51.100.9, 203.0.113.2",
			remote: "172.18.0.4:53210",
			want:   "203.0.113.7",
		},
		{
			name:   "rightmost XFF hop when CF header absent (Caddy-only path)",
			xff:    "198.51.100.9, 203.0.113.2",
			remote: "172.18.0.4:53210",
			want:   "203.0.113.2",
		},
		{
			name:   "socket address for direct local/LAN traffic",
			remote: "192.168.0.8:51234",
			want:   "192.168.0.8",
		},
		{
			name:   "IPv6 socket address without port",
			remote: "2001:db8::1",
			want:   "2001:db8::1",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodPost, "/v1/auth/customer/send-otp", nil)
			r.RemoteAddr = tt.remote
			if tt.cfIP != "" {
				r.Header.Set("CF-Connecting-IP", tt.cfIP)
			}
			if tt.xff != "" {
				r.Header.Set("X-Forwarded-For", tt.xff)
			}
			if got := clientIP(r); got != tt.want {
				t.Fatalf("clientIP = %q, want %q", got, tt.want)
			}
		})
	}
}
