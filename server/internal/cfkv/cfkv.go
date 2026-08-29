// Package cfkv mirrors link-preview (Open Graph) metadata for catalog
// products into a Cloudflare KV namespace, one entry per product slug.
//
// The site worker reads the namespace through its own KV binding when
// server-rendering /products/<slug> meta tags, so preview cards track the
// live catalog without a rebuild. Writes deliberately go through the
// images-cdn Worker's HMAC-authed /og/{slug} endpoint (same shared
// R2_UPLOAD_SECRET used for image uploads) instead of api.cloudflare.com,
// keeping Cloudflare credentials off the VPS.
//
// Every sync is best-effort: a missed write only means the worker keeps
// serving the previous entry, or the build-time snapshot beneath it.
package cfkv

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"aarogyaruchi/internal/db/sqlc"

	"github.com/jackc/pgx/v5"
)

// isNoRows reports whether err is pgx.ErrNoRows.
func isNoRows(err error) bool { return errors.Is(err, pgx.ErrNoRows) }

const syncTTL = 15 * time.Minute

// Entry is the KV value the site worker turns into og:* meta tags. Field
// names line up with the build-time snapshot's OgProduct shape in
// clients/apps/user/src/lib/og-catalog.generated.ts; image dimensions are
// unknown server-side, so the worker omits og:image:width/height for
// KV-backed entries.
type Entry struct {
	Name          string `json:"name"`
	Description   string `json:"description"`
	Image         string `json:"image,omitempty"`
	MinPricePaise int64  `json:"minPricePaise"`
	UpdatedAt     int64  `json:"updatedAt"`
}

// Syncer syncs product preview entries through the images-cdn worker.
type Syncer struct {
	base   string
	secret string
	client *http.Client
}

// New builds a Syncer from the same wiring as image uploads
// (IMAGES_CDN_BASE + R2_UPLOAD_SECRET). Empty values disable it.
func New(base, secret string) *Syncer {
	return &Syncer{
		base:   strings.TrimRight(base, "/"),
		secret: secret,
		client: &http.Client{
			Timeout:   10 * time.Second,
			Transport: &http.Transport{TLSHandshakeTimeout: 10 * time.Second},
		},
	}
}

func (s *Syncer) Enabled() bool { return s.base != "" && s.secret != "" }

// OgSyncSignature = hex(HMAC-SHA256(secret, "ogsync:" + slug + ":" + exp)).
// The slug is part of the material so a leaked URL is scoped to one key and
// expires like upload tokens. Must match the images-cdn worker's verifier.
func OgSyncSignature(secret, slug string, exp int64) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte("ogsync:" + slug + ":" + strconv.FormatInt(exp, 10)))
	return hex.EncodeToString(mac.Sum(nil))
}

func (s *Syncer) syncURL(slug string) (string, error) {
	if s.base == "" || s.secret == "" {
		return "", fmt.Errorf("cfkv is not configured")
	}
	exp := time.Now().Add(syncTTL).Unix()
	return fmt.Sprintf("%s/og/%s?exp=%d&sig=%s", s.base, url.PathEscape(slug), exp,
		OgSyncSignature(s.secret, slug, exp)), nil
}

// SyncProduct refreshes the KV entry for one product slug from the live
// catalog. A live, available product is upserted; anything else (archived,
// unavailable, hard-deleted) removes the entry so the site card falls back.
func (s *Syncer) SyncProduct(ctx context.Context, q *sqlc.Queries, slug string) {
	if !s.Enabled() || slug == "" {
		return
	}

	product, err := q.GetProductBySlug(ctx, slug)
	switch {
	case isNoRows(err):
		if err := s.deleteKey(ctx, slug); err != nil {
			log.Printf("cfkv: delete %q: %v", slug, err)
			return
		}
		log.Printf("cfkv: removed %q (no live product)", slug)
		return
	case err != nil:
		// A database error must not evict a good entry; bail instead.
		log.Printf("cfkv: sync %q: load product: %v", slug, err)
		return
	}
	if !product.IsAvailable {
		if err := s.deleteKey(ctx, slug); err != nil {
			log.Printf("cfkv: delete %q: %v", slug, err)
			return
		}
		log.Printf("cfkv: removed %q (unavailable)", slug)
		return
	}

	variants, err := q.ListCatalogVariants(ctx, []int64{product.ID})
	if err != nil {
		log.Printf("cfkv: sync %q: load variants: %v", slug, err)
		return
	}

	entry := Entry{
		Name:          product.Name,
		Description:   product.Description.String,
		Image:         s.bestImage(ctx, product.ImageUrl.String),
		MinPricePaise: minPricePaise(variants),
		UpdatedAt:     time.Now().Unix(),
	}
	body, err := json.Marshal(entry)
	if err != nil {
		log.Printf("cfkv: sync %q: %v", slug, err)
		return
	}

	syncURL, err := s.syncURL(slug)
	if err != nil {
		return
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, syncURL, bytes.NewReader(body))
	if err != nil {
		log.Printf("cfkv: sync %q: %v", slug, err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.client.Do(req)
	if err != nil {
		log.Printf("cfkv: sync %q: %v", slug, err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		log.Printf("cfkv: sync %q: worker returned %s", slug, resp.Status)
		_, _ = io.CopyN(io.Discard, resp.Body, 4096)
		return
	}
	log.Printf("cfkv: synced %q (%d bytes)", slug, len(body))
}

func (s *Syncer) deleteKey(ctx context.Context, slug string) error {
	syncURL, err := s.syncURL(slug)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, syncURL, nil)
	if err != nil {
		return err
	}
	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		_, _ = io.CopyN(io.Discard, resp.Body, 4096)
		return fmt.Errorf("worker returned %s", resp.Status)
	}
	return nil
}

// ogImageURL derives the link-preview variant URL from an images-cdn image
// URL: products/<stem>.<ext> → products/<stem>.og.jpg. The images-cdn
// worker mints both objects under one stem, so the variant address needs no
// storage. Returns "" for URLs outside that shape.
func ogImageURL(base, imageURL string) string {
	if base == "" || imageURL == "" {
		return ""
	}
	parsed, err := url.Parse(imageURL)
	if err != nil {
		return ""
	}
	baseParsed, err := url.Parse(base)
	if err != nil {
		return ""
	}
	if !strings.EqualFold(parsed.Host, baseParsed.Host) {
		return ""
	}
	rest, ok := strings.CutPrefix(parsed.Path, "/products/")
	if !ok {
		return ""
	}
	stem, _, found := strings.Cut(rest, ".")
	if !found || stem == "" || strings.Contains(stem, "/") {
		return ""
	}
	return base + "/products/" + stem + ".og.jpg"
}

// bestImage prefers the ~90 KB og variant (WhatsApp silently drops preview
// images over ~300 KB) but falls back to the original when the variant
// isn't there — e.g. products whose image predates variant uploads.
func (s *Syncer) bestImage(ctx context.Context, imageURL string) string {
	og := ogImageURL(s.base, imageURL)
	if og == "" {
		return imageURL
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodHead, og, nil)
	if err != nil {
		return imageURL
	}
	resp, err := s.client.Do(req)
	if err != nil {
		return imageURL
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusOK {
		return og
	}
	return imageURL
}

func minPricePaise(variants []sqlc.ProductVariant) int64 {
	min := int64(0)
	for i, v := range variants {
		if i == 0 || v.PricePaise < min {
			min = v.PricePaise
		}
	}
	return min
}
