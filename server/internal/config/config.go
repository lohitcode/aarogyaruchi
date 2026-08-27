package config

import (
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	Env             string
	Port            string
	DatabaseURL     string
	CacheURL        string
	CachePassword   string
	MSG91AuthKey    string
	MSG91TemplateID string
	ZAI             struct {
		APIKey  string
		Model   string
		BaseURL string
	}
	// ChatAllowedOrigins restricts browser CORS access to /chat/stream.
	ChatAllowedOrigins []string

	// AllowedOrigins restricts browser CORS access to the /v1 API
	// (customer site, admin panel, and approved dev origins).
	AllowedOrigins []string
	// OTPFixedEnabled pins every OTP to 123456 (staging/pre-launch mode).
	// Never enabled silently in production: must be set explicitly.
	OTPFixedEnabled bool
	// SeedAdminPhones / SeedPartnerPhones are pre-provisioned privileged
	// accounts upserted at boot from private server environment variables.
	SeedAdminPhones   []string
	SeedPartnerPhones []string
	// PartnerTokenSecret signs the delivery-partner access tokens (HS256).
	PartnerTokenSecret string
	// SessionCookieSameSiteNone emits the web session cookie with
	// SameSite=None; Secure. Needed only when the site is served from a
	// different registrable domain than the API (e.g. the dev website on
	// *.workers.dev talking to dev-api.lohitcode.com) — browsers refuse
	// cross-site Lax cookies. LAN/local origins keep the Lax default.
	SessionCookieSameSiteNone bool
	// SessionTTL is the idle window per device session: a session key that
	// sees no activity for this long evaporates in Valkey, logging that
	// device out. Activity slides the window forward.
	SessionTTL time.Duration
	// BusinessTimezone is the timezone all batch math runs in.
	BusinessTimezone string
	// R2UploadSecret is shared with the images-cdn worker (wrangler
	// secret UPLOAD_SECRET) to authorize product image uploads.
	R2UploadSecret string
	// ImagesCDNBase is the public base URL of the images-cdn worker.
	ImagesCDNBase string
	// VAPID keys for web push (chat fallback notifications).
	VAPID struct {
		PublicKey  string
		PrivateKey string
		Subject    string
	}
}

func (c *Config) IsDev() bool {
	return c.Env == "development"
}

func (c *Config) IsProd() bool {
	return c.Env == "production"
}

func Load() (*Config, error) {
	// Load .env file if it exists (ignored in production)
	_ = godotenv.Load()

	cfg := &Config{
		Env:             getEnv("ENV", "development"),
		Port:            getEnv("PORT", "8080"),
		DatabaseURL:     getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/aarogya_ruchi?sslmode=disable"),
		CacheURL:        getEnv("CACHE_URL", "localhost:6379"),
		CachePassword:   getEnv("CACHE_PASSWORD", ""),
		MSG91AuthKey:    getEnv("MSG91_AUTH_KEY", ""),
		MSG91TemplateID: getEnv("MSG91_TEMPLATE_ID", ""),
	}
	cfg.ZAI.APIKey = getEnv("ZAI_API_KEY", "")
	// glm-4.7-flashx no longer exists in Z.AI's catalog; glm-4.7 is the
	// closest available model of that generation (verified 2026-08-19).
	cfg.ZAI.Model = getEnv("ZAI_MODEL", "glm-4.7")
	// General OpenAI-compatible endpoint (not the coding-plan one).
	cfg.ZAI.BaseURL = getEnv("ZAI_BASE_URL", "https://api.z.ai/api/paas/v4")
	cfg.ChatAllowedOrigins = getEnvList("CHAT_ALLOWED_ORIGINS", []string{
		"https://aarogyaruchi.com",
		"http://localhost:3000",
		"http://localhost:8787",
	})
	cfg.AllowedOrigins = getEnvList("ALLOWED_ORIGINS", []string{
		"https://aarogyaruchi.com",
		"https://www.aarogyaruchi.com",
		"https://admin.aarogyaruchi.com",
		"http://localhost:3000",
	})
	// Fail closed: fixed OTP must be opted into explicitly (dev env files
	// set it to true); a missing flag must never enable it anywhere.
	cfg.OTPFixedEnabled = getEnvBool("OTP_FIXED_ENABLED", false)
	cfg.SeedAdminPhones = getEnvList("SEED_ADMIN_PHONES", nil)
	cfg.SeedPartnerPhones = getEnvList("SEED_PARTNER_PHONES", nil)
	cfg.PartnerTokenSecret = getEnv("PARTNER_TOKEN_SECRET", "")
	cfg.SessionCookieSameSiteNone = getEnvBool("SESSION_COOKIE_SAMESITE_NONE", false)
	cfg.SessionTTL = getEnvDuration("SESSION_TTL_HOURS", 168*time.Hour)
	if cfg.PartnerTokenSecret == "" {
		// Deterministic fallback keeps dev usable but is never acceptable in
		// production; fail loudly there instead of issuing forgeable tokens.
		if cfg.IsProd() {
			return nil, errMissing("PARTNER_TOKEN_SECRET")
		}
		cfg.PartnerTokenSecret = "insecure-dev-partner-secret"
	}
	cfg.BusinessTimezone = getEnv("BUSINESS_TIMEZONE", "Asia/Kolkata")
	cfg.VAPID.PublicKey = getEnv("VAPID_PUBLIC_KEY", "")
	cfg.VAPID.PrivateKey = getEnv("VAPID_PRIVATE_KEY", "")
	cfg.VAPID.Subject = getEnv("VAPID_SUBJECT", "mailto:hello@aarogyaruchi.com")
	cfg.R2UploadSecret = getEnv("R2_UPLOAD_SECRET", "")
	cfg.ImagesCDNBase = getEnv("IMAGES_CDN_BASE", "https://images-cdn.lohit.workers.dev")

	return cfg, nil
}

type configError string

func (e configError) Error() string { return "missing required config: " + string(e) }

func errMissing(key string) error { return configError(key) }

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

func getEnvBool(key string, fallback bool) bool {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback
	}
	v, err := strconv.ParseBool(raw)
	if err != nil {
		return fallback
	}
	return v
}

// getEnvDuration reads an env var as hours (whole or fractional) into a
// duration, falling back when unset or unparseable.
func getEnvDuration(key string, fallback time.Duration) time.Duration {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback
	}
	v, err := strconv.ParseFloat(raw, 64)
	if err != nil || v <= 0 {
		return fallback
	}
	return time.Duration(v * float64(time.Hour))
}

func getEnvList(key string, fallback []string) []string {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback
	}
	parts := strings.Split(raw, ",")
	values := make([]string, 0, len(parts))
	for _, part := range parts {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			values = append(values, trimmed)
		}
	}
	if len(values) == 0 {
		return fallback
	}
	return values
}
