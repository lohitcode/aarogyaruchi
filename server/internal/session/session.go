package session

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log"
	"sync"
	"time"

	"aarogyaruchi/internal/cache"
)

const (
	sessionPrefix = "session:"

	// touchInterval throttles the sliding-TTL refresh inside Get: a session
	// is re-EXPIREd at most this often, bounding Valkey write amplification
	// to ~2 extra commands per active device per hour. Any value well below
	// the session TTL keeps an active session alive.
	touchInterval = 30 * time.Minute
)

var (
	ErrSessionNotFound = errors.New("session not found")

	// ErrSessionUnavailable means the session store itself could not be
	// reached (Valkey down, still loading its AOF after a restart, timed
	// out). The session may well exist — callers must answer 503 and let
	// the client retry, never treat this as a logout. Before this existed,
	// every Valkey blip read as "session not found" and logged users out.
	ErrSessionUnavailable = errors.New("session store unavailable")
)

// Data stored in session
type Data struct {
	UserID   int64  `json:"user_id,omitempty"`
	GymID    int64  `json:"gym_id,omitempty"`
	AdminID  int64  `json:"admin_id,omitempty"`
	DPID     int64  `json:"dp_id,omitempty"` // Delivery Partner ID
	Phone    string `json:"phone"`
	UserType string `json:"user_type"`      // user, gym, admin, delivery_partner
	Role     string `json:"role,omitempty"` // For admin: super, locality
}

type Store struct {
	cache *cache.Cache
	ttl   time.Duration

	// lastTouch tracks when each session was last re-EXPIREd. In-memory is
	// sufficient: one API instance per deployment (same assumption as the
	// websocket hub), and a restart merely triggers one extra touch.
	lastTouch sync.Map // sessionID -> time.Time
}

func NewStore(cache *cache.Cache, ttl time.Duration) *Store {
	return &Store{cache: cache, ttl: ttl}
}

// Create creates a new session and returns session ID. Each login mints an
// independent key — logging in on a new device never disturbs the sessions
// of other devices.
func (s *Store) Create(ctx context.Context, data Data) (string, error) {
	sessionID, err := generateSessionID()
	if err != nil {
		return "", err
	}

	dataJSON, err := json.Marshal(data)
	if err != nil {
		return "", err
	}

	key := sessionPrefix + sessionID
	if err := s.cache.Set(ctx, key, string(dataJSON), s.ttl); err != nil {
		return "", err
	}

	return sessionID, nil
}

// Get retrieves session data by session ID and slides its idle window
// forward: every validated request refreshes the key's TTL (throttled to
// once per touchInterval), so a device that goes quiet for the full TTL
// simply evaporates from Valkey — that device is logged out while the
// user's other devices keep their own independent sessions.
func (s *Store) Get(ctx context.Context, sessionID string) (*Data, error) {
	key := sessionPrefix + sessionID
	dataJSON, err := s.cache.Get(ctx, key)
	if err != nil {
		if errors.Is(err, cache.ErrNotFound) {
			return nil, ErrSessionNotFound
		}
		return nil, ErrSessionUnavailable
	}

	var data Data
	if err := json.Unmarshal([]byte(dataJSON), &data); err != nil {
		return nil, ErrSessionNotFound
	}

	s.touch(ctx, sessionID)
	return &data, nil
}

// touch re-EXPIREs the session key unless it was touched recently.
func (s *Store) touch(ctx context.Context, sessionID string) {
	now := time.Now()
	if v, ok := s.lastTouch.Load(sessionID); ok && now.Sub(v.(time.Time)) < touchInterval {
		return
	}
	if err := s.cache.Expire(ctx, sessionPrefix+sessionID, s.ttl); err != nil {
		// Non-fatal: the session stays valid with its current TTL and the
		// next request retries the touch. Log a prefix only — the full ID
		// is a bearer credential.
		prefix := sessionID
		if len(prefix) > 8 {
			prefix = prefix[:8]
		}
		log.Printf("session: touch failed for %s…: %v", prefix, err)
		return
	}
	s.lastTouch.Store(sessionID, now)
}

// Delete removes a session (logout)
func (s *Store) Delete(ctx context.Context, sessionID string) error {
	s.lastTouch.Delete(sessionID)
	key := sessionPrefix + sessionID
	return s.cache.Delete(ctx, key)
}

func generateSessionID() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}
