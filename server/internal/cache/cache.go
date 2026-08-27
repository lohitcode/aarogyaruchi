package cache

import (
	"context"
	"time"

	"github.com/valkey-io/valkey-go"
)

// ErrNotFound is valkey's Nil reply: the key genuinely does not exist.
// Callers must distinguish it from connection/store failures, which say
// nothing about the key's existence.
var ErrNotFound = valkey.Nil

type Cache struct {
	client valkey.Client
}

func Connect(ctx context.Context, cacheURL string) (*Cache, error) {
	client, err := valkey.NewClient(valkey.ClientOption{
		InitAddress: []string{cacheURL},
	})
	if err != nil {
		return nil, err
	}

	// Verify connection
	if err := client.Do(ctx, client.B().Ping().Build()).Error(); err != nil {
		client.Close()
		return nil, err
	}

	return &Cache{client: client}, nil
}

func (c *Cache) Close() {
	c.client.Close()
}

func (c *Cache) Get(ctx context.Context, key string) (string, error) {
	return c.client.Do(ctx, c.client.B().Get().Key(key).Build()).ToString()
}

func (c *Cache) Set(ctx context.Context, key, value string, ttl time.Duration) error {
	return c.client.Do(ctx, c.client.B().Set().Key(key).Value(value).Ex(ttl).Build()).Error()
}

func (c *Cache) Delete(ctx context.Context, key string) error {
	return c.client.Do(ctx, c.client.B().Del().Key(key).Build()).Error()
}

// Expire refreshes a key's TTL in place, without rewriting its value —
// the sliding-window refresh for idle-expiring sessions.
func (c *Cache) Expire(ctx context.Context, key string, ttl time.Duration) error {
	return c.client.Do(ctx, c.client.B().Expire().Key(key).Seconds(int64(ttl.Seconds())).Build()).Error()
}

// TTL reports a key's remaining lifetime (0 when the key is gone).
func (c *Cache) TTL(ctx context.Context, key string) (time.Duration, error) {
	secs, err := c.client.Do(ctx, c.client.B().Ttl().Key(key).Build()).ToInt64()
	if err != nil {
		return 0, err
	}
	return time.Duration(secs) * time.Second, nil
}

// Incr atomically increments a counter and sets ttl on first increment.
// Used for fixed-window rate limiting.
func (c *Cache) Incr(ctx context.Context, key string, ttl time.Duration) (int64, error) {
	resp := c.client.Do(ctx, c.client.B().Incr().Key(key).Build())
	count, err := resp.ToInt64()
	if err != nil {
		return 0, err
	}
	if count == 1 {
		c.client.Do(ctx, c.client.B().Expire().Key(key).Seconds(int64(ttl.Seconds())).Build())
	}
	return count, nil
}

func (c *Cache) Ping(ctx context.Context) error {
	return c.client.Do(ctx, c.client.B().Ping().Build()).Error()
}
