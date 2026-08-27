// Package ratelimit provides small fixed-window counters backed by Valkey.
package ratelimit

import (
	"context"
	"fmt"
	"time"

	"aarogyaruchi/internal/cache"
)

// Allow increments the counter for key and reports whether it is still under
// limit within window. Fails open when Valkey is unreachable (login is more
// important than perfect counting).
func Allow(ctx context.Context, c *cache.Cache, key string, limit int64, window time.Duration) bool {
	count, err := c.Incr(ctx, key, window)
	if err != nil {
		return true
	}
	return count <= limit
}

// Check is Allow without incrementing (peeks are not supported by the fixed
// window, so this simply increments; prefer Allow).
func Key(scope, id string) string {
	return fmt.Sprintf("rl:%s:%s", scope, id)
}
