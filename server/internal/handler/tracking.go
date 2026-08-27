package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"sort"
	"strconv"
	"sync"
	"time"

	"aarogyaruchi/internal/db/sqlc"
	"aarogyaruchi/internal/websocket"
)

const (
	partnerLocKeyPrefix = "partner:loc:"
	partnerLocTTL       = 2 * time.Hour
	// A fix older than this is displayed as stale, not live.
	locationFreshWindow = 2 * time.Minute
	// Minimum gap between persisted history samples per partner.
	persistInterval = 15 * time.Second
)

// liveLocation is the JSON blob kept in Valkey for fast fan-out.
type liveLocation struct {
	RunID      int64     `json:"run_id"`
	PartnerID  int64     `json:"partner_id"`
	Latitude   float64   `json:"latitude"`
	Longitude  float64   `json:"longitude"`
	AccuracyM  *float64  `json:"accuracy_m,omitempty"`
	SpeedMps   *float64  `json:"speed_mps,omitempty"`
	HeadingDeg *float64  `json:"heading_deg,omitempty"`
	RecordedAt time.Time `json:"recorded_at"`
}

// persistTracker throttles history-sample persistence in memory; the latest
// fix always lives in Valkey, Postgres keeps a coarser trail.
type persistTracker struct {
	mu sync.Map // partnerID -> time.Time of last persist
}

func (p *persistTracker) shouldPersist(partnerID int64, now time.Time) bool {
	last, ok := p.mu.Load(partnerID)
	if !ok || now.Sub(last.(time.Time)) >= persistInterval {
		p.mu.Store(partnerID, now)
		return true
	}
	return false
}

var locationPersist persistTracker

// plausibleFix rejects physically impossible coordinates and sanitizes
// readings whose ranges are meaningless (they become nil rather than
// dropping an otherwise usable position).
func plausibleFix(loc *websocket.IncomingLocation) bool {
	if loc.Latitude < -90 || loc.Latitude > 90 || loc.Longitude < -180 || loc.Longitude > 180 {
		return false
	}
	if loc.AccuracyM != nil && *loc.AccuracyM < 0 {
		loc.AccuracyM = nil
	}
	if loc.SpeedMps != nil && *loc.SpeedMps < 0 {
		loc.SpeedMps = nil
	}
	if loc.HeadingDeg != nil && (*loc.HeadingDeg < 0 || *loc.HeadingDeg >= 360) {
		loc.HeadingDeg = nil
	}
	return true
}

// ingestPartnerLocation processes one GPS fix from a partner: it validates
// the partner has an active run, stores the latest position in Valkey,
// persists a throttled history sample, and fans the fix out to admins plus
// the customers currently being delivered to.
func (h *Handler) ingestPartnerLocation(ctx context.Context, partnerID int64, loc websocket.IncomingLocation) error {
	if !h.trackingEnabled(ctx) {
		return nil
	}
	now := time.Now()
	if loc.RecordedAt.IsZero() {
		loc.RecordedAt = now
	}
	// Drop fixes from the distant past or future (clock skew).
	if loc.RecordedAt.After(now.Add(5*time.Minute)) || loc.RecordedAt.Before(now.Add(-24*time.Hour)) {
		loc.RecordedAt = now
	}
	if !plausibleFix(&loc) {
		// Garbage coordinates (or readings outside physical ranges):
		// discard before storing or broadcasting anything.
		return nil
	}

	run, err := h.queries.GetActiveRunForPartner(ctx, pgInt8(partnerID))
	if err != nil {
		// No active run: stop sharing.
		return nil
	}

	live := liveLocation{
		RunID:      run.ID,
		PartnerID:  partnerID,
		Latitude:   loc.Latitude,
		Longitude:  loc.Longitude,
		AccuracyM:  loc.AccuracyM,
		SpeedMps:   loc.SpeedMps,
		HeadingDeg: loc.HeadingDeg,
		RecordedAt: loc.RecordedAt,
	}
	if data, err := json.Marshal(live); err == nil {
		_ = h.cache.Set(ctx, partnerLocKeyPrefix+int64Str(partnerID), string(data), partnerLocTTL)
	}

	if locationPersist.shouldPersist(partnerID, now) {
		_ = h.queries.InsertLocationSample(ctx, sqlc.InsertLocationSampleParams{
			PartnerID:  partnerID,
			RunID:      pgInt8(run.ID),
			Latitude:   loc.Latitude,
			Longitude:  loc.Longitude,
			AccuracyM:  pgFloatPtr(loc.AccuracyM),
			SpeedMps:   pgFloatPtr(loc.SpeedMps),
			HeadingDeg: pgFloatPtr(loc.HeadingDeg),
			RecordedAt: pgTS(loc.RecordedAt),
		})
	}

	if h.hub != nil {
		customerIDs, _ := h.queries.ListTrackingCustomerIDsForRun(ctx, run.ID)
		h.hub.PublishPartnerLocation(websocket.PartnerLocationPayload{
			RunID:      live.RunID,
			PartnerID:  live.PartnerID,
			Latitude:   live.Latitude,
			Longitude:  live.Longitude,
			AccuracyM:  live.AccuracyM,
			SpeedMps:   live.SpeedMps,
			HeadingDeg: live.HeadingDeg,
			RecordedAt: live.RecordedAt,
		}, customerIDs)
	}
	return nil
}

// HandlePartnerWSLocation is the WS onMessage callback for partner GPS.
func (h *Handler) HandlePartnerWSLocation(client *websocket.Client, msg websocket.IncomingMessage) {
	if msg.Location == nil {
		return
	}
	// Read pump goroutine: give up rather than block the connection.
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = h.ingestPartnerLocation(ctx, client.PartnerID, *msg.Location)
}

// PartnerLocationBatch is the HTTP fallback for buffered GPS samples after
// the app reconnects. Samples replay in order.
func (h *Handler) PartnerLocationBatch(w http.ResponseWriter, r *http.Request) {
	partnerID, ok := requirePartnerID(w, r)
	if !ok {
		return
	}

	var req struct {
		Samples []websocket.IncomingLocation `json:"samples"`
	}
	if err := decodeJSON(r, &req); err != nil {
		h.Error(w, http.StatusBadRequest, "invalid request")
		return
	}
	if len(req.Samples) == 0 {
		h.Error(w, http.StatusBadRequest, "samples are required")
		return
	}
	if len(req.Samples) > 200 {
		h.Error(w, http.StatusBadRequest, "too many samples (max 200)")
		return
	}

	// Chronological replay. The buffer is normally in order already, but
	// offline replay can interleave foreground/background batches — a real
	// sort, not an assume-one-inversion-and-reverse.
	sorted := append([]websocket.IncomingLocation(nil), req.Samples...)
	sort.SliceStable(sorted, func(i, j int) bool {
		return sorted[i].RecordedAt.Before(sorted[j].RecordedAt)
	})

	accepted := 0
	for _, loc := range sorted {
		if err := h.ingestPartnerLocation(r.Context(), partnerID, loc); err != nil {
			break
		}
		accepted++
	}

	h.JSON(w, http.StatusOK, map[string]any{"accepted": accepted})
}

// livePartnerLocation reads the partner's freshest position from Valkey and
// reports it with an explicit freshness flag. A stale fix is still returned
// (with is_live=false) so clients can show it as historical.
func (h *Handler) livePartnerLocation(r *http.Request, partnerID int64) map[string]any {
	raw, err := h.cache.Get(r.Context(), partnerLocKeyPrefix+int64Str(partnerID))
	if err != nil {
		return nil
	}
	var live liveLocation
	if err := json.Unmarshal([]byte(raw), &live); err != nil {
		return nil
	}
	age := time.Since(live.RecordedAt)
	return map[string]any{
		"latitude":    live.Latitude,
		"longitude":   live.Longitude,
		"accuracy_m":  live.AccuracyM,
		"recorded_at": live.RecordedAt,
		"age_seconds": int(age.Seconds()),
		"is_live":     age <= locationFreshWindow,
	}
}

// trackingEnabled consults operating settings; GPS sharing can be disabled
// globally. Defaults to enabled when settings are unreadable.
func (h *Handler) trackingEnabled(ctx context.Context) bool {
	settings, err := h.queries.GetOperatingSettings(ctx)
	if err != nil {
		return true
	}
	return settings.TrackingEnabled
}

func int64Str(i int64) string {
	return strconv.FormatInt(i, 10)
}

// PruneLocationHistory caps retained GPS history (14-day window).
func (h *Handler) PruneLocationHistory(ctx context.Context) error {
	_, err := h.queries.PruneLocationSamples(ctx)
	return err
}
