package chatbot

import (
	"context"
	"log"
	"time"

	"aarogyaruchi/internal/cache"
)

// RateLimiter decides whether a caller may proceed. Implementations must be
// safe for concurrent use.
type RateLimiter interface {
	Allow(ctx context.Context, key string, limit int, window time.Duration) (bool, error)
}

// ValkeyRateLimiter is a fixed-window counter in Valkey. On cache errors it
// fails open: the chat endpoint stays available and the error is logged
// without any message content.
type ValkeyRateLimiter struct {
	cache *cache.Cache
}

func NewValkeyRateLimiter(c *cache.Cache) *ValkeyRateLimiter {
	return &ValkeyRateLimiter{cache: c}
}

func (l *ValkeyRateLimiter) Allow(ctx context.Context, key string, limit int, window time.Duration) (bool, error) {
	count, err := l.cache.Incr(ctx, key, window)
	if err != nil {
		log.Printf("chat rate limiter: cache error for window %s: %v", window, err)
		return true, nil
	}
	return count <= int64(limit), nil
}

// Per-IP request budgets for the public chat endpoint.
const (
	RequestsPerMinute = 10
	RequestsPerDay    = 100
)

// Service wires the provider client together with rate limiting.
type Service struct {
	Client  *ZaiClient
	Limiter RateLimiter
}

func NewService(client *ZaiClient, limiter RateLimiter) *Service {
	return &Service{Client: client, Limiter: limiter}
}

// Allowed checks both the per-minute and per-day windows for an IP.
func (s *Service) Allowed(ctx context.Context, ip string) bool {
	okMinute, err := s.Limiter.Allow(ctx, "chat:rl:m:"+ip, RequestsPerMinute, time.Minute)
	if err == nil && !okMinute {
		return false
	}
	okDay, err := s.Limiter.Allow(ctx, "chat:rl:d:"+ip, RequestsPerDay, 24*time.Hour)
	if err == nil && !okDay {
		return false
	}
	return true
}
