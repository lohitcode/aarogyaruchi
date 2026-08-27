package session_test

import (
	"context"
	"os"
	"testing"
	"time"

	"aarogyaruchi/internal/cache"
	"aarogyaruchi/internal/session"
)

// Tests against a live Valkey, following the repo's AR_TEST_CACHE_URL skip
// pattern:
//
//	AR_TEST_CACHE_URL=localhost:6379 go test ./internal/session -v
func newStore(t *testing.T, ttl time.Duration) (*session.Store, *cache.Cache) {
	t.Helper()
	url := os.Getenv("AR_TEST_CACHE_URL")
	if url == "" {
		t.Skip("AR_TEST_CACHE_URL not set; skipping session test")
	}
	ctx := context.Background()
	c, err := cache.Connect(ctx, url)
	if err != nil {
		t.Fatalf("connect cache: %v", err)
	}
	t.Cleanup(c.Close)
	return session.NewStore(c, ttl), c
}

func TestCreateSetsIdleTTL(t *testing.T) {
	store, c := newStore(t, 2*time.Hour)
	ctx := context.Background()

	id, err := store.Create(ctx, session.Data{UserID: 1, Phone: "+910000000001", UserType: "user"})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	ttl, err := c.TTL(ctx, "session:"+id)
	if err != nil {
		t.Fatalf("ttl: %v", err)
	}
	if ttl < time.Hour || ttl > 2*time.Hour {
		t.Fatalf("expected TTL close to 2h, got %v", ttl)
	}
}

func TestGetSlidesIdleWindowWithThrottle(t *testing.T) {
	store, c := newStore(t, time.Hour)
	ctx := context.Background()

	id, err := store.Create(ctx, session.Data{UserID: 1, Phone: "+910000000001", UserType: "user"})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	key := "session:" + id

	// Decay the key to simulate an idle stretch, then Get: the touch must
	// restore the full idle window.
	if err := c.Expire(ctx, key, 30*time.Second); err != nil {
		t.Fatalf("decay: %v", err)
	}
	if _, err := store.Get(ctx, id); err != nil {
		t.Fatalf("get: %v", err)
	}
	ttl, err := c.TTL(ctx, key)
	if err != nil {
		t.Fatalf("ttl: %v", err)
	}
	if ttl < 50*time.Minute {
		t.Fatalf("expected touch to restore ~1h TTL, got %v", ttl)
	}

	// Decay again and Get immediately: the throttle must hold — the TTL
	// stays low instead of being rewritten on every request.
	if err := c.Expire(ctx, key, 30*time.Second); err != nil {
		t.Fatalf("decay: %v", err)
	}
	if _, err := store.Get(ctx, id); err != nil {
		t.Fatalf("get: %v", err)
	}
	ttl, err = c.TTL(ctx, key)
	if err != nil {
		t.Fatalf("ttl: %v", err)
	}
	if ttl > time.Minute {
		t.Fatalf("expected throttle to skip the touch, got TTL %v", ttl)
	}
}

func TestExpiredSessionIsNotFound(t *testing.T) {
	store, c := newStore(t, time.Hour)
	ctx := context.Background()

	id, err := store.Create(ctx, session.Data{UserID: 1, Phone: "+910000000001", UserType: "user"})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	// Force the idle window shut: after full expiry the device is logged out.
	if err := c.Expire(ctx, "session:"+id, time.Second); err != nil {
		t.Fatalf("decay: %v", err)
	}
	time.Sleep(1100 * time.Millisecond)

	if _, err := store.Get(ctx, id); err != session.ErrSessionNotFound {
		t.Fatalf("expected ErrSessionNotFound after expiry, got %v", err)
	}
}

func TestDeleteLogsOutOnlyThatSession(t *testing.T) {
	store, _ := newStore(t, time.Hour)
	ctx := context.Background()

	first, err := store.Create(ctx, session.Data{UserID: 1, Phone: "+910000000001", UserType: "user"})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	second, err := store.Create(ctx, session.Data{UserID: 1, Phone: "+910000000001", UserType: "user"})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	if err := store.Delete(ctx, first); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if _, err := store.Get(ctx, first); err != session.ErrSessionNotFound {
		t.Fatalf("expected deleted session to be gone, got %v", err)
	}
	if _, err := store.Get(ctx, second); err != nil {
		t.Fatalf("other device's session must survive logout elsewhere: %v", err)
	}
}

func TestGetReportsStoreOutageAsUnavailable(t *testing.T) {
	// A Valkey outage must surface as ErrSessionUnavailable — never as
	// "not found". That distinction is what keeps a store blip (restart
	// window, AOF load) from reading as a logout: middleware answers 503
	// instead of 401.
	_, c := newStore(t, time.Hour)
	dead := session.NewStore(c, time.Hour)
	c.Close() // simulate the store going away after startup

	if _, err := dead.Get(context.Background(), "deadbeef"); err != session.ErrSessionUnavailable {
		t.Fatalf("expected ErrSessionUnavailable during store outage, got %v", err)
	}
}
