package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"aarogyaruchi/internal/cache"
	"aarogyaruchi/internal/chatbot"
	"aarogyaruchi/internal/config"
	"aarogyaruchi/internal/db"
	"aarogyaruchi/internal/db/sqlc"
	"aarogyaruchi/internal/handler"
	"aarogyaruchi/internal/middleware"
	"aarogyaruchi/internal/otp"
	"aarogyaruchi/internal/router"
	"aarogyaruchi/internal/session"
	"aarogyaruchi/internal/token"
	"aarogyaruchi/internal/webpush"
	"aarogyaruchi/internal/websocket"
)

func main() {
	migrateOnly := flag.Bool("migrate-only", false, "run database migrations and exit (deployment pre-step)")
	flag.Parse()

	// Load config
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	ctx := context.Background()

	// Connect to database
	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}
	defer pool.Close()
	log.Println("connected to database")

	// Run database migrations
	if err := db.RunMigrations(cfg.DatabaseURL); err != nil {
		log.Fatalf("failed to run migrations: %v", err)
	}
	if *migrateOnly {
		log.Println("migrations complete (--migrate-only)")
		return
	}

	// Connect to cache
	c, err := cache.Connect(ctx, cfg.CacheURL, cfg.CachePassword)
	if err != nil {
		log.Fatalf("failed to connect to cache: %v", err)
	}
	defer c.Close()
	log.Println("connected to cache")

	// Create session store
	sessions := session.NewStore(c, cfg.SessionTTL)
	log.Println("session store initialized")

	// Create OTP service. Fixed OTP (123456) is enabled explicitly through
	// OTP_FIXED_ENABLED; the code is never logged or returned in responses.
	otpService := otp.New(c, cfg.MSG91AuthKey, cfg.MSG91TemplateID, cfg.OTPFixedEnabled)
	if cfg.OTPFixedEnabled {
		log.Println("OTP service: fixed OTP mode enabled (OTP_FIXED_ENABLED)")
	}

	// Partner token manager
	tokens := token.NewManager(cfg.PartnerTokenSecret)

	// Web push (chat fallback notifications)
	pushSender := webpush.NewSender(cfg.VAPID.PublicKey, cfg.VAPID.PrivateKey, cfg.VAPID.Subject)
	if !pushSender.Enabled() {
		log.Println("webpush: VAPID keys not set, push notifications disabled")
	}

	// Create WebSocket hub
	hub := websocket.NewHub()
	go hub.Run()
	defer hub.Stop()
	log.Println("websocket hub started")

	// Create auth middleware (queries: RequirePartner re-checks that the
	// partner account is still active on every request)
	auth := middleware.NewAuth(sessions, tokens, sqlc.New(pool))

	// Create chatbot service (Z.AI GLM streaming + Valkey rate limits)
	zaiClient := chatbot.NewZaiClient(cfg.ZAI.BaseURL, cfg.ZAI.APIKey, cfg.ZAI.Model, 60*time.Second)
	chatLimiter := chatbot.NewValkeyRateLimiter(c)
	chatService := chatbot.NewService(zaiClient, chatLimiter)
	if cfg.ZAI.APIKey == "" {
		log.Println("chatbot: ZAI_API_KEY not set, /chat/stream will return provider errors")
	}

	// Create handler and router
	h := handler.New(pool, c, otpService, tokens, sessions, hub, cfg, chatService, pushSender)

	// Seed privileged accounts from private env config (idempotent).
	h.SeedPrivilegedAccounts(ctx)

	// Periodic GPS-history pruning keeps the samples table bounded on the
	// 2 GB box.
	go func() {
		ticker := time.NewTicker(6 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			pruneCtx, cancel := context.WithTimeout(context.Background(), time.Minute)
			if err := h.PruneLocationHistory(pruneCtx); err != nil {
				log.Printf("location prune: %v", err)
			}
			cancel()
		}
	}()

	r := router.New(h, auth, cfg.AllowedOrigins, cfg.MetricsEnabled)

	// Create server
	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: r,
		// No global WriteTimeout: it would cut off /chat/stream SSE replies
		// mid-flight. Individual handlers bound their own deadlines.
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 0,
		IdleTimeout:  60 * time.Second,
	}

	// Start server in goroutine
	go func() {
		log.Printf("server starting on port %s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("shutting down server...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("server forced to shutdown: %v", err)
	}

	log.Println("server stopped")
}
