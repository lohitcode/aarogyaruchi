package cfkv

import (
	"context"
	"strings"
	"testing"
)

func TestOgSyncSignatureMatchesURL(t *testing.T) {
	const secret = "test-secret"
	s := New("https://images-cdn.example", secret)
	raw, err := s.syncURL("ragi-malt-sweet")
	if err != nil {
		t.Fatalf("syncURL: %v", err)
	}
	if !strings.HasPrefix(raw, "https://images-cdn.example/og/ragi-malt-sweet?exp=") {
		t.Fatalf("unexpected URL shape: %s", raw)
	}
	sig := raw[strings.Index(raw, "&sig=")+len("&sig="):]
	if len(sig) != 64 {
		t.Fatalf("signature should be hex sha256, got %q", sig)
	}
}

func TestOgImageURLDerivation(t *testing.T) {
	const base = "https://images-cdn.example"
	cases := []struct {
		image string
		want  string
	}{
		{base + "/products/6ba7b810-9dad-11d1-80b4-00c04fd430c8.png", base + "/products/6ba7b810-9dad-11d1-80b4-00c04fd430c8.og.jpg"},
		{base + "/products/6ba7b810-9dad-11d1-80b4-00c04fd430c8.jpg", base + "/products/6ba7b810-9dad-11d1-80b4-00c04fd430c8.og.jpg"},
		// Foreign host, non-product path, or empty → not derivable.
		{"https://elsewhere.example/products/abc.png", ""},
		{base + "/misc/abc.png", ""},
		{"", ""},
	}
	for _, c := range cases {
		if got := ogImageURL(base, c.image); got != c.want {
			t.Errorf("ogImageURL(%q) = %q, want %q", c.image, got, c.want)
		}
	}
}

// A nil-safe disabled Syncer must never touch the network: SyncProduct on a
// disabled client returns before building any request.
func TestDisabledSyncerNoops(t *testing.T) {
	s := New("", "")
	if s.Enabled() {
		t.Fatal("empty base/secret must be disabled")
	}
	s.SyncProduct(context.Background(), nil, "ragi-jawa") // must not panic
}
