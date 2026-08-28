package handler_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"aarogyaruchi/internal/cache"
	"aarogyaruchi/internal/config"
	"aarogyaruchi/internal/db"
	"aarogyaruchi/internal/db/sqlc"
	"aarogyaruchi/internal/handler"
	"aarogyaruchi/internal/middleware"
	"aarogyaruchi/internal/orderstate"
	"aarogyaruchi/internal/router"
	"aarogyaruchi/internal/session"
	"aarogyaruchi/internal/token"
	"aarogyaruchi/internal/websocket"

	"context"

	"github.com/jackc/pgx/v5/pgtype"
)

// Integration tests against a live Postgres + Valkey. Skipped unless
// AR_TEST_DATABASE_URL is set:
//
//	AR_TEST_DATABASE_URL=postgres://aarogyaruchi:aarogya123@localhost:5434/aarogya_ruchi?sslmode=disable \
//	AR_TEST_CACHE_URL=localhost:6380 \
//	go test ./internal/handler -run Integration -v
func integrationServer(t *testing.T) (http.Handler, *handler.Handler, *sqlc.Queries, context.Context) {
	t.Helper()
	dbURL := os.Getenv("AR_TEST_DATABASE_URL")
	if dbURL == "" {
		t.Skip("AR_TEST_DATABASE_URL not set; skipping integration test")
	}
	cacheURL := os.Getenv("AR_TEST_CACHE_URL")
	if cacheURL == "" {
		cacheURL = "localhost:6380"
	}

	ctx := context.Background()
	pool, err := db.Connect(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect db: %v", err)
	}
	t.Cleanup(pool.Close)

	c, err := cache.Connect(ctx, cacheURL, "")
	if err != nil {
		t.Fatalf("connect cache: %v", err)
	}
	t.Cleanup(c.Close)

	sessions := session.NewStore(c, time.Hour)
	tokens := token.NewManager("integration-test-secret")
	hub := websocket.NewHub()
	go hub.Run()
	t.Cleanup(hub.Stop)

	cfg := &config.Config{Env: "development"}
	h := handler.New(pool, c, nil, tokens, sessions, hub, cfg, nil, nil)
	auth := middleware.NewAuth(sessions, tokens, sqlc.New(pool))
	mux := router.New(h, auth, []string{"http://localhost:3000"}, true)
	return mux, h, sqlc.New(pool), ctx
}

func uniquePhone() string {
	return fmt.Sprintf("+919%09d", rand.Intn(1_000_000_000))
}

// userSession creates a user plus a valid session cookie.
func userSession(t *testing.T, q *sqlc.Queries, h *handler.Handler, ctx context.Context) *http.Cookie {
	t.Helper()
	user, err := q.CreateUser(ctx, sqlc.CreateUserParams{Phone: uniquePhone(), Name: pgtype.Text{String: "Integration Tester", Valid: true}})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	// OTP login against the real endpoint with the fixed OTP enabled by the
	// dev environment would need Valkey state; simpler: mint the session via
	// the same store the middleware reads. Exported via handler.IntegrationSession.
	sess, err := h.IntegrationSession(ctx, user.ID, user.Phone)
	if err != nil {
		t.Fatalf("mint session: %v", err)
	}
	return &http.Cookie{Name: "session_id", Value: sess}
}

func call(t *testing.T, h http.Handler, cookie *http.Cookie, method, path string, body any, headers map[string]string) (int, map[string]any) {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			t.Fatalf("encode: %v", err)
		}
	}
	req := httptest.NewRequest(method, path, &buf)
	if cookie != nil {
		req.AddCookie(cookie)
	}
	req.Header.Set("Content-Type", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	var out map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	return rec.Code, out
}

// seedVariant creates a parent + one sellable variant; returns variant id.
func seedVariant(t *testing.T, q *sqlc.Queries, ctx context.Context, name, slugFmt string, pricePaise int64) int64 {
	t.Helper()
	base := fmt.Sprintf(slugFmt, rand.Int63())
	parent, err := q.AdminCreateProduct(ctx, sqlc.AdminCreateProductParams{
		Slug: base, Name: name,
		Ingredients: []string{},
		Nutrition:   []byte("{}"),
		Tags:        []string{},
		IsAvailable: true,
	})
	if err != nil {
		t.Fatalf("create parent: %v", err)
	}
	variant, err := q.AdminCreateVariant(ctx, sqlc.AdminCreateVariantParams{
		ProductID:   parent.ID,
		Slug:        pgtype.Text{String: base + "-std", Valid: true},
		SizeLabel:   pgtype.Text{String: "Regular", Valid: true},
		PricePaise:  pricePaise,
		IsAvailable: pgtype.Bool{Bool: true, Valid: true},
	})
	if err != nil {
		t.Fatalf("create variant: %v", err)
	}
	return variant.ID
}

func TestIntegrationOrderLifecycle(t *testing.T) {
	mux, h, q, ctx := integrationServer(t)

	cookie := userSession(t, q, h, ctx)

	locality, err := q.CreateLocality(ctx, sqlc.CreateLocalityParams{
		Name: fmt.Sprintf("Testville-%d", rand.Intn(1_000_000)), City: "Hyderabad",
		Perimeters: []byte("[]"), // NOT NULL since migration 000005
	})
	if err != nil {
		t.Fatalf("locality: %v", err)
	}

	status, body := call(t, mux, cookie, "POST", "/v1/customers/me/addresses", map[string]any{
		"label": "Home", "address_line": "42 Test Lane", "locality_id": locality.ID,
		"latitude": 17.5, "longitude": 78.3, "is_default": true,
	}, nil)
	if status != http.StatusCreated {
		t.Fatalf("address create status=%d body=%v", status, body)
	}
	addressID := int64(body["id"].(float64))

	v1 := seedVariant(t, q, ctx, "Integration Parent One", "it-p1-%d", 4000)
	v2 := seedVariant(t, q, ctx, "Integration Parent Two", "it-p2-%d", 9000)

	// Quote computes server-side prices in paise.
	qStatus, quote := call(t, mux, cookie, "POST", "/v1/orders/quote", map[string]any{
		"items": []map[string]any{{"variant_id": v1, "quantity": 2}, {"variant_id": v2, "quantity": 1}},
	}, nil)
	if qStatus != http.StatusOK {
		t.Fatalf("quote status=%d body=%v", qStatus, quote)
	}
	if got := quote["total_paise"].(float64); got != 17000 {
		t.Fatalf("quote total = %v, want 17000", got)
	}

	// Order creation with idempotency.
	idem := map[string]string{"Idempotency-Key": fmt.Sprintf("it-key-%d", rand.Int63())}
	items := map[string]any{
		"address_id": addressID,
		"items":      []map[string]any{{"variant_id": v1, "quantity": 2}, {"variant_id": v2, "quantity": 1}},
	}
	oStatus, order := call(t, mux, cookie, "POST", "/v1/orders", items, idem)
	if oStatus != http.StatusCreated {
		t.Fatalf("order status=%d body=%v", oStatus, order)
	}
	orderID := int64(order["order_id"].(float64))
	if order["status"].(string) != orderstate.Placed {
		t.Fatalf("initial status = %v", order["status"])
	}

	// Replay: same key + same body returns the same order.
	rStatus, replay := call(t, mux, cookie, "POST", "/v1/orders", items, idem)
	if rStatus != http.StatusCreated || int64(replay["order_id"].(float64)) != orderID {
		t.Fatalf("idempotent replay got status=%d body=%v", rStatus, replay)
	}

	// Price snapshot survives a variant price change.
	if _, err := q.AdminUpdateVariant(ctx, sqlc.AdminUpdateVariantParams{
		ID: v1, Slug: pgtype.Text{String: fmt.Sprintf("it-p1b-%d", v1), Valid: true},
		PricePaise: 99000, IsAvailable: pgtype.Bool{Bool: true, Valid: true},
	}); err != nil {
		t.Fatalf("price bump: %v", err)
	}
	_, detail := call(t, mux, cookie, "GET", fmt.Sprintf("/v1/orders/%d", orderID), nil, nil)
	if got := detail["total_paise"].(float64); got != 17000 {
		t.Fatalf("order total after price change = %v, want 17000 (snapshot)", got)
	}
	if len(detail["items"].([]any)) != 2 {
		t.Fatalf("expected 2 item snapshots, got %v", detail["items"])
	}

	// Customer cancellation before preparing succeeds; a second attempt 409s.
	if cStatus, _ := call(t, mux, cookie, "POST", fmt.Sprintf("/v1/orders/%d/cancel", orderID), nil, nil); cStatus != http.StatusOK {
		t.Fatalf("cancel (placed) status=%d", cStatus)
	}
	if c2Status, _ := call(t, mux, cookie, "POST", fmt.Sprintf("/v1/orders/%d/cancel", orderID), nil, nil); c2Status != http.StatusConflict {
		t.Fatalf("re-cancel status=%d, want 409", c2Status)
	}

	// Immutable timeline: placed → cancelled, customer actor.
	history, err := q.ListOrderStatusHistory(ctx, orderID)
	if err != nil {
		t.Fatalf("history: %v", err)
	}
	if len(history) != 2 {
		t.Fatalf("history rows = %d, want 2", len(history))
	}
	if history[0].ToStatus != orderstate.Placed || history[1].ToStatus != orderstate.Cancelled {
		t.Fatalf("history = %+v", history)
	}
	if history[1].ActorType != "customer" {
		t.Fatalf("cancel actor = %q", history[1].ActorType)
	}
}

func TestIntegrationDuplicateIdempotencyKeyDifferentBody(t *testing.T) {
	mux, h, q, ctx := integrationServer(t)
	cookie := userSession(t, q, h, ctx)

	locality, err := q.CreateLocality(ctx, sqlc.CreateLocalityParams{
		Name: fmt.Sprintf("Keyville-%d", rand.Intn(1_000_000)), City: "Hyderabad",
		Perimeters: []byte("[]"), // NOT NULL since migration 000005
	})
	if err != nil {
		t.Fatalf("locality: %v", err)
	}
	status, body := call(t, mux, cookie, "POST", "/v1/customers/me/addresses", map[string]any{
		"address_line": "9 Key Street", "locality_id": locality.ID, "is_default": true,
	}, nil)
	if status != http.StatusCreated {
		t.Fatalf("address status=%d", status)
	}

	v := seedVariant(t, q, ctx, "Key Test Product", "it-key-%d", 5000)

	idem := map[string]string{"Idempotency-Key": fmt.Sprintf("it-dup-%d", rand.Int63())}
	first := map[string]any{
		"address_id": body["id"],
		"items":      []map[string]any{{"variant_id": v, "quantity": 1}},
	}
	if s, b := call(t, mux, cookie, "POST", "/v1/orders", first, idem); s != http.StatusCreated {
		t.Fatalf("first order status=%d body=%v", s, b)
	}

	// Same key, different body → conflict, not a second order.
	second := map[string]any{
		"address_id": body["id"],
		"items":      []map[string]any{{"variant_id": v, "quantity": 3}},
	}
	if s, _ := call(t, mux, cookie, "POST", "/v1/orders", second, idem); s != http.StatusConflict {
		t.Fatalf("reused key with different body status=%d, want 409", s)
	}
}
