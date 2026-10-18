# AarogyaRuchi

**Fresh, never-packaged healthy food — ordered overnight, prepared in the morning, delivered by locality-clustered delivery runs.**

This is the full production platform behind a real healthy-food business in Bachupally, Hyderabad: a Go API with a realtime WebSocket layer, a customer storefront and an ops console served from Cloudflare's edge, and an Expo app that delivery partners actually run their routes on.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Go](https://img.shields.io/badge/Go-1.25-00ADD8?logo=go&logoColor=white)](server/go.mod)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](server/docker-compose.yml)
[![Valkey](https://img.shields.io/badge/Valkey-8-6C3FC5)](server/docker-compose.yml)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](clients/workers)

| | |
|---|---|
| **Live storefront** | https://aarogyaruchi.com |
| **Ops console** | https://admin.aarogyaruchi.com |
| **API** | https://api.aarogyaruchi.com/health |
| **Docs / runbook** | [AGENTS.md](AGENTS.md) · [docs/](docs) |

---

## Table of contents

- [Why this repo is worth reading](#why-this-repo-is-worth-reading)
- [The product](#the-product)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [API](#api)
- [Testing](#testing)
- [Deployment](#deployment)
- [Security](#security)
- [License](#license)

---

## Why this repo is worth reading

Most side projects stop at a CRUD demo. This one runs a business, and the interesting engineering is in the operational details:

- **Batch-based ordering.** Orders don't go straight to a kitchen queue. They close into a daily `order_batches` row with a cutoff policy and a delivery date, which then drives a preparation summary, print-ready labels, and the delivery runs for that date.
- **Locality-clustered delivery runs.** Service areas are stored as polygon perimeters (plain JSONB — deliberately no PostGIS, so managed Postgres stays an option) and validated in Go. A run's stops are ordered and position-unique, and a *partial* unique index prevents an order from joining two live runs at once.
- **Three genuinely different auth models.** Valkey-backed cookie sessions for both web apps, short-lived OTP tokens for login, and stateless JWT access tokens plus opaque, hashed, rotating refresh tokens for the mobile app.
- **Edge-first frontend.** The storefront and ops console are TanStack Start apps running SSR on Cloudflare Workers. Product images upload directly to R2 via HMAC-signed short-lived URLs minted by the Go API — image bytes never transit the VPS. Link previews are served from Cloudflare KV at the edge; the Go API keeps that KV namespace fresh through the same worker.
- **Realtime with a versioned envelope.** One WebSocket carries role-scoped events (`{type, id, ts, version}`); clients detect version gaps and refetch instead of trying to reconcile.
- **Built to survive a 2 GB box.** Blue-green API cutover behind Caddy with active health checks, memory caps per container, AOF `appendfsync always` durability for sessions, and a metrics surface that is fail-closed and never publicly routed.
- **Cash is a first-class domain.** Delivery partners collect cash, submit handovers, and admins confirm them with a recorded discrepancy — the whole reconciliation is audited in the database.
- **No secrets in the repo.** Environment files are SOPS/age-encrypted and committed as ciphertext; deploys hydrate them on the target box.

## The product

| | |
|---|---|
| Catalog | Ragi Jawa, Ragi Malt (sweet/salted), Mixed & Green Gram Sprouts, Sprout Salad, Orange/Watermelon/Mosambi juice — each sold in multiple sizes as separate SKUs |
| Ordering | Order before the day's cutoff, delivered the next morning in a 06:00–10:00 window |
| Delivery | Locality-based runs; cash on delivery only |
| Service area | Bachupally, Nizampet, Kompally, Kukatpally, Miyapur, Jeedimetla, Suraram, Bowrampet |

The catalog in the schema baseline seeds these products so a fresh install has a working storefront immediately.

## Architecture

```
                       ┌──────────────── Cloudflare edge ────────────────┐
  aarogyaruchi.com ────┤ user worker    · TanStack Start SSR            │
 admin.aarogyaruchi ───┤ admin worker   · ops console                   │
                       │ images-cdn     · R2 uploads + OG KV writes     │
                       └───────┬──────────────────┬──────────────────────┘
              REST + WebSocket │                  │ HMAC upload URLs
                               ▼                  ▼
                 ┌──────────────────────────────────────────────┐
   `ssh <box>`   │ VPS · Ubuntu · docker compose                │
                 │                                              │
                 │  Caddy :443 ─▶ API slot (blue) ─┐            │
                 │             └▶ API slot (green) ─┴▶ Go API   │
                 │                    ├── PostgreSQL 16         │
                 │                    └── Valkey 8              │
                 │                                              │
                 │  Adminer / redis-commander (basic auth)      │
                 └──────────────────────────────────────────────┘
```

- Both API slots carry the same network alias; Caddy health-checks them every 2s and routes to whichever is healthy, so a cutover is just "start the idle slot, wait for health, stop the old one".
- Postgres and Valkey host ports are loopback-bound. Humans reach them through Adminer / redis-commander behind basic auth, never by connecting to the database directly.
- Telemetry is outbound-only to Grafana Cloud (prod, opt-in via a compose profile); the API's `/metrics` is gated by `METRICS_ENABLED` and 404s on the public Caddy route.

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Go 1.25, `chi` v5, `pgx` v5 |
| Data access | sqlc (type-safe SQL, no ORM), golang-migrate |
| Database | PostgreSQL 16 |
| Cache / sessions / rate limits | Valkey 8 (`valkey-go`) |
| Realtime | `coder/websocket`, one versioned event envelope |
| Auth | Valkey cookie sessions, OTP login, partner JWTs + rotating refresh tokens |
| Push | Web Push (VAPID) via `webpush-go` |
| AI assistant | Z.AI GLM, streamed over SSE (`/chat/stream`) |
| Storefront + ops console | React 19, TanStack Start/Router/Query, Tailwind v4, Vite 7, Cloudflare Workers (Wrangler 4) |
| Design system | shadcn/ui (Base UI primitives) in a shared workspace package |
| Mobile | Expo / React Native, Expo Router, NativeWind |
| Tooling | Bun 1.3, Turborepo, Biome via Ultracite, Vitest |
| Infra | Docker Compose, Caddy (auto TLS), SOPS + age, Prometheus + Grafana |

## Repository layout

```
aarogyaruchi/
├── server/                        Go API + WebSocket
│   ├── cmd/server/                entrypoint (`-migrate-only` for deploy pre-steps)
│   ├── internal/
│   │   ├── router/                the whole chi route table in one file
│   │   ├── handler/               handlers grouped by role/domain
│   │   ├── middleware/            session + JWT auth, client IP
│   │   ├── db/migrations/         single 000001_init schema baseline
│   │   ├── db/queries/            sqlc query sources (generated code in db/sqlc)
│   │   ├── batch/                 order-batch cutoffs and delivery dates
│   │   ├── deliverydate/          business-timezone date math
│   │   ├── geo/                   locality perimeter parsing/validation
│   │   ├── orderstate/            the order status machine
│   │   ├── labels/                print-ready HTML labels + QR
│   │   ├── chatbot/               Z.AI client; prompts live in prompts/*.md
│   │   ├── cfkv/                  OG link-preview sync through the CDN worker
│   │   ├── otp/ session/ token/ ratelimit/ webpush/ validator/
│   │   └── websocket/             hub with role-scoped fan-out
│   ├── docker-compose.yml         postgres, valkey, blue/green slots, caddy, exporters
│   └── Makefile
├── clients/                       Bun + Turborepo workspace
│   ├── apps/user/                 customer storefront (TanStack Start → Workers)
│   ├── apps/admin/                ops console
│   ├── apps/mobile/               delivery-partner app (Expo)
│   ├── packages/ui/               shared shadcn/ui component library
│   └── workers/images-cdn/        R2 uploads, image variants, OG KV writes
├── docs/                          engineering write-ups (features + an incident post-mortem)
└── AGENTS.md                      the full operator runbook
```

## Getting started

**Prerequisites:** Go 1.25+, Docker with Compose v2, and Bun 1.3+ for the frontends.

### 1. Backend

```bash
cd server
cp .env.example .env
```

Edit `.env`. For a local stack you need at minimum:

```env
POSTGRES_PASSWORD=pick-something-local
VALKEY_PASSWORD=pick-something-local        # also used as the cache password
DATABASE_URL=postgres://aarogya:pick-something-local@localhost:5432/aarogya_ruchi?sslmode=disable
CACHE_URL=localhost:6379
OTP_FIXED_ENABLED=true                      # pins OTPs to 123456
SEED_ADMIN_PHONES=+919999999999             # privileged accounts are provisioned at boot
SEED_PARTNER_PHONES=+919999999998
PARTNER_TOKEN_SECRET=any-long-random-string
```

Then:

```bash
docker compose --profile local up -d postgres valkey
go run ./cmd/server
```

Migrations run automatically at boot; the API listens on `http://localhost:8080`. Compose refuses to start without `POSTGRES_PASSWORD`/`VALKEY_PASSWORD`, so a typo fails loudly rather than silently booting a passwordless database.

`make dev` swaps `go run` for `air` (hot reload).

### 2. Storefront and ops console

```bash
cd clients
bun install

bun run dev                      # customer storefront → http://localhost:3000
cd apps/admin && bun run dev     # ops console        → http://localhost:3001
```

Both apps read `VITE_API_BASE_URL`, defaulting to `http://localhost:8080` in dev.

### 3. Delivery-partner app

```bash
cd clients/apps/mobile
bun install
bun start        # then `bun run android` / `bun run ios`, or scan with Expo Go
```

### Logging in locally

With `OTP_FIXED_ENABLED=true` every OTP is `123456`; the code is never logged or returned in API responses. Log in with any seeded phone number (`SEED_ADMIN_PHONES` for the ops console, `SEED_PARTNER_PHONES` for the mobile app). A fresh database has no products beyond the seeded catalog, so add or edit products through the ops console.

## Configuration

Everything is environment-driven, and `server/.env.example` documents every variable with comments. The groups that matter:

| Group | Variables |
|---|---|
| Core | `ENV`, `PORT`, `DATABASE_URL`, `CACHE_URL`, `CACHE_PASSWORD` / `VALKEY_PASSWORD` |
| Auth & sessions | `PARTNER_TOKEN_SECRET`, `SESSION_TTL_HOURS`, `ALLOWED_ORIGINS`, `SESSION_COOKIE_SAMESITE_NONE` |
| OTP | `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`, `OTP_FIXED_ENABLED`, `SEED_ADMIN_PHONES`, `SEED_PARTNER_PHONES` |
| Business rules | `BUSINESS_TIMEZONE` |
| Assistant | `ZAI_API_KEY`, `ZAI_MODEL`, `ZAI_BASE_URL`, `CHAT_ALLOWED_ORIGINS` |
| Images & previews | `R2_UPLOAD_SECRET`, `IMAGES_CDN_BASE` |
| Observability | `METRICS_ENABLED`, `GRAFANA_CLOUD_*` |

`PARTNER_TOKEN_SECRET` is required in production — the server refuses to boot without it. `METRICS_ENABLED` and `OTP_FIXED_ENABLED` both fail closed.

## API

All application routes live under `/v1`; `server/internal/router/router.go` is the single source of truth.

| Scope | Routes |
|---|---|
| Health | `GET /health`, `GET /health/detailed`, `GET /metrics` (gated, internal) |
| Public | `GET /v1/products`, `GET /v1/localities`, `GET /v1/localities/resolve`, `GET /v1/push/public-key` |
| Assistant | `POST /chat/stream` (SSE, origin-restricted) |
| Customer | `POST /v1/auth/customer/{send,verify}-otp`, `/v1/customers/me` + addresses, `POST /v1/orders/quote`, `/v1/orders`, `/v1/chat/me*` |
| Admin | `/v1/auth/admin/*`, `/v1/admin/{dashboard,batches,orders,delivery-runs,cash,users,chat,products,localities,delivery-partners,admins,settings,uploads}` |
| Partner | `POST /v1/auth/partner/{send,verify}-otp`, `POST /v1/auth/partner/refresh`, `/v1/partner/{runs,stops,packages/scan,location/batch}` |
| Realtime | `GET /v1/ws` (cookie or `?token=`) |

The assistant has its own contract: prompts live in `server/internal/chatbot/prompts/*.md` (embedded at build time), and client-supplied `system` messages are rejected — the server owns the prompt.

## Testing

```bash
cd server
go test ./...                # unit + handler tests

# Integration tests need live Postgres + Valkey:
make up
AR_TEST_DATABASE_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)" \
AR_TEST_CACHE_URL="localhost:6379" \
go test ./internal/handler -run Integration -v

cd ../clients
bun run test                 # Vitest across the workspace
```

`make test-integration` wraps the integration command above.

## Deployment

`server/deploy.sh` routes by branch: `main` (or a detached HEAD at `origin/main`) deploys production, any other branch deploys the home-lab dev box. A deploy cross-compiles locally, ships a prebuilt image, and then:

1. tags the running image `:previous` (rollback is a retag),
2. runs migrations as a pre-switch step (`server -migrate-only`) while the old slot still serves,
3. starts the idle slot and waits for `/health`,
4. reloads Caddy — a no-op when its config is unchanged,
5. stops the old slot, letting Go drain in-flight HTTP.

Nothing is ever built on the server. Secrets are hydrated on the box by decrypting the SOPS file that lives in this repo as ciphertext.

> **Squashed migrations:** databases created by the previous 000001–000007 chain record version 7, and golang-migrate errors when a recorded version has no file. Before shipping the current baseline to such an environment, reset its bookkeeping to the baseline version — the exact commands and ordering caveats are in the header of [`000001_init.up.sql`](server/internal/db/migrations/000001_init.up.sql). Fresh databases need nothing.

## Security

- **No plaintext secrets.** `server/secrets/{prod,dev}.env` are SOPS/age-encrypted and committed as ciphertext; each decrypts only on its target box. `.env.example` files hold placeholders.
- **Sessions live in Valkey**, not in signed cookies, so logout and admin-side revocation are immediate. A cache outage surfaces as `503 session store unavailable` — deliberately distinct from `401`.
- **Uploads are signed.** The API mints short-lived HMAC URLs; the CDN worker verifies the signature before writing to R2, so the API never proxies image bytes and the bucket is never public-write.
- **Partner refresh tokens are opaque**, stored hashed, rotated on use, and revoked on logout. Access tokens are short-lived.
- **Deliberate durability trade-off.** Valkey runs `noeviction` + `appendfsync always`: every key the app writes carries a TTL, so nothing needs LRU reaping, and a full store must fail loudly at login rather than silently evict live sessions.
- **Fail-closed switches.** `METRICS_ENABLED` (default off) and `OTP_FIXED_ENABLED` (default off) must be enabled explicitly; the fixed OTP is never logged or returned.

## License

MIT — see [LICENSE](LICENSE).

Copyright (c) 2026 Pinninti Hari Krishna.

Every credential this project needs is supplied through environment variables. Nothing secret is committed: `server/secrets/*.env` are SOPS/age-encrypted (see [`.sops.yaml`](.sops.yaml)), and the `*.env.example` files document the shape of each variable.
