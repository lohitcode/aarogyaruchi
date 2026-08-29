package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"slices"
	"time"

	"aarogyaruchi/internal/batch"
	"aarogyaruchi/internal/cache"
	"aarogyaruchi/internal/cfkv"
	"aarogyaruchi/internal/chatbot"
	"aarogyaruchi/internal/config"
	"aarogyaruchi/internal/db/sqlc"
	"aarogyaruchi/internal/orderstate"
	"aarogyaruchi/internal/otp"
	"aarogyaruchi/internal/session"
	"aarogyaruchi/internal/token"
	"aarogyaruchi/internal/webpush"
	"aarogyaruchi/internal/websocket"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Handler struct {
	db       *pgxpool.Pool
	cache    *cache.Cache
	queries  *sqlc.Queries
	otp      *otp.Service
	tokens   *token.Manager
	sessions *session.Store
	hub      *websocket.Hub
	config   *config.Config
	chat     *chatbot.Service
	push     *webpush.Sender
	cfkv     *cfkv.Syncer
}

func New(db *pgxpool.Pool, cache *cache.Cache, otpService *otp.Service, tokens *token.Manager, sessions *session.Store, hub *websocket.Hub, cfg *config.Config, chat *chatbot.Service, push *webpush.Sender, ogSync *cfkv.Syncer) *Handler {
	return &Handler{
		db:       db,
		cache:    cache,
		queries:  sqlc.New(db),
		otp:      otpService,
		tokens:   tokens,
		sessions: sessions,
		hub:      hub,
		config:   cfg,
		chat:     chat,
		push:     push,
		cfkv:     ogSync,
	}
}

// withTx runs fn inside a database transaction, committing on success and
// rolling back on error or panic.
func (h *Handler) withTx(ctx context.Context, fn func(q *sqlc.Queries) error) error {
	tx, err := h.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if err := fn(sqlc.New(tx)); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// syncOgCatalog refreshes the link-preview KV entries for the given slugs in
// the background after a product mutation has committed. Best-effort by
// design: a missed sync only means the site worker keeps serving the
// previous entry or the build-time snapshot. The goroutine must not use
// r.Context() — it is canceled the moment the handler returns — hence the
// detached context with its own deadline.
func (h *Handler) syncOgCatalog(slugs ...string) {
	if h.cfkv == nil || !h.cfkv.Enabled() {
		return
	}
	pending := make([]string, 0, len(slugs))
	for _, slug := range slugs {
		if slug != "" && !slices.Contains(pending, slug) {
			pending = append(pending, slug)
		}
	}
	if len(pending) == 0 {
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		for _, slug := range pending {
			h.cfkv.SyncProduct(ctx, h.queries, slug)
		}
	}()
}

// Health check endpoint - simple 200 OK for load balancers
func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
}

// HealthDetailed returns service status with response times
func (h *Handler) HealthDetailed(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	response := map[string]any{
		"status":   "ok",
		"services": map[string]any{},
	}
	services := response["services"].(map[string]any)
	allHealthy := true

	dbStart := time.Now()
	if err := h.db.Ping(ctx); err != nil {
		services["database"] = map[string]any{"status": "error", "error": err.Error(), "response_time_ms": time.Since(dbStart).Milliseconds()}
		allHealthy = false
	} else {
		services["database"] = map[string]any{"status": "ok", "response_time_ms": time.Since(dbStart).Milliseconds()}
	}

	cacheStart := time.Now()
	if err := h.cache.Ping(ctx); err != nil {
		services["cache"] = map[string]any{"status": "error", "error": err.Error(), "response_time_ms": time.Since(cacheStart).Milliseconds()}
		allHealthy = false
	} else {
		services["cache"] = map[string]any{"status": "ok", "response_time_ms": time.Since(cacheStart).Milliseconds()}
	}

	if !allHealthy {
		response["status"] = "degraded"
	}

	h.JSON(w, http.StatusOK, response)
}

// JSON response helper
func (h *Handler) JSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

// Error response helper
func (h *Handler) Error(w http.ResponseWriter, status int, message string) {
	h.JSON(w, status, map[string]string{"error": message})
}

// businessTimezone loads the configured business timezone, falling back to
// UTC when the stored name is invalid.
func (h *Handler) businessTimezone() *time.Location {
	loc, err := time.LoadLocation(h.config.BusinessTimezone)
	if err != nil {
		return time.UTC
	}
	return loc
}

// batchSettings builds the batch policy from current operating settings.
func (h *Handler) batchSettings(settings sqlc.OperatingSetting) batch.Settings {
	return batch.Settings{
		CutoffMinutes: int(settings.CutoffMinutes),
		Timezone:      h.businessTimezone(),
	}
}

// resolveCurrentBatch returns the batch an order placed now would join,
// synthesizing an open (unpersisted) view when none exists yet.
func (h *Handler) resolveCurrentBatch(ctx context.Context, q *sqlc.Queries) (sqlc.OrderBatch, batch.Resolution, error) {
	settings, err := q.GetOperatingSettings(ctx)
	if err != nil {
		return sqlc.OrderBatch{}, batch.Resolution{}, err
	}
	policy := h.batchSettings(settings)
	res := batch.Resolve(time.Now(), policy)
	existing, err := q.GetBatchByOrderDate(ctx, pgtype.Date{Time: res.OrderDate, Valid: true})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return sqlc.OrderBatch{
				OrderDate:    pgtype.Date{Time: res.OrderDate, Valid: true},
				DeliveryDate: pgtype.Date{Time: res.DeliveryDate, Valid: true},
				CutoffPolicy: policy.Policy(),
				Status:       "open",
			}, res, nil
		}
		return sqlc.OrderBatch{}, res, err
	}
	return existing, res, nil
}

// applyOrderTransition validates a status change through the orderstate
// machine, applies it with a concurrency guard, and records the immutable
// history row. Must run inside the caller's transaction.
func applyOrderTransition(ctx context.Context, q *sqlc.Queries, order sqlc.Order, to string, actorType string, actorID int64, note string) error {
	from := order.Status.String
	if !orderstate.CanTransition(from, to, actorType) {
		return transitionError{from: from, to: to, actor: actorType}
	}
	rows, err := q.TransitionOrderStatus(ctx, sqlc.TransitionOrderStatusParams{
		ID:             order.ID,
		Status:         pgtype.Text{String: to, Valid: true},
		UpdatedByActor: pgtype.Text{String: actorType, Valid: true},
		Status_2:       pgtype.Text{String: from, Valid: true},
	})
	if err != nil {
		return err
	}
	if rows == 0 {
		return errConcurrentTransition
	}
	return q.InsertOrderStatusHistory(ctx, sqlc.InsertOrderStatusHistoryParams{
		OrderID:    order.ID,
		FromStatus: pgtype.Text{String: from, Valid: from != ""},
		ToStatus:   to,
		ActorType:  actorType,
		ActorID:    pgtype.Int8{Int64: actorID, Valid: actorID > 0},
		Note:       pgtype.Text{String: note, Valid: note != ""},
	})
}

type transitionError struct {
	from, to, actor string
}

func (e transitionError) Error() string {
	return "invalid transition " + e.from + " → " + e.to + " for " + e.actor
}

var errConcurrentTransition = errors.New("order was modified concurrently, retry")

// isNoRows reports whether err is pgx.ErrNoRows.
func isNoRows(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}

// pgtype helpers for the nullable columns.
func pgText(s string) pgtype.Text {
	return pgtype.Text{String: s, Valid: s != ""}
}

func pgInt8(i int64) pgtype.Int8 {
	return pgtype.Int8{Int64: i, Valid: true}
}

func pgFloat(f float64) pgtype.Float8 {
	return pgtype.Float8{Float64: f, Valid: true}
}

func pgDate(t time.Time) pgtype.Date {
	return pgtype.Date{Time: t, Valid: true}
}

func pgTS(t time.Time) pgtype.Timestamptz {
	return pgtype.Timestamptz{Time: t, Valid: true}
}

func pgDateText(s string) (pgtype.Date, bool) {
	t, err := time.ParseInLocation("2006-01-02", s, time.UTC)
	if err != nil {
		return pgtype.Date{}, false
	}
	return pgtype.Date{Time: t, Valid: true}, true
}

// pgInt8OrNil keeps zero ids NULL instead of inserting a bogus FK value.
func pgInt8OrNil(i int64) pgtype.Int8 {
	if i <= 0 {
		return pgtype.Int8{}
	}
	return pgtype.Int8{Int64: i, Valid: true}
}
