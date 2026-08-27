# AarogyaRuchi Server

Go REST API + WebSocket backend.

## Tech Stack

| Component | Technology |
|-----------|------------|
| Language | Go 1.23 |
| Router | chi v5 |
| Database | PostgreSQL (pgx v5) |
| ORM | sqlc (type-safe SQL) |
| Cache | Valkey (valkey-go) |
| WebSocket | coder/websocket |
| Hot Reload | air |

## Quick Start

```bash
# Start PostgreSQL + Valkey + Go with hot reload
make dev

# Or step by step:
make up       # Start containers
make run      # Run without hot reload
make down     # Stop containers
```

## API Endpoints

### Auth (Public)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/send-otp` | Send OTP, get temp token |
| POST | `/auth/verify-otp` | Verify token + OTP, get user type |

### Public
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/products` | List available products |
| GET | `/localities` | List serviceable areas |
| GET | `/gyms` | List approved gyms |
| POST | `/users/register` | Register new user |
| POST | `/gyms/register` | Gym registration (pending approval) |

### User (Auth: `Bearer {phone}`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/users/me` | Get profile |
| PUT | `/users/me/address` | Update address |
| POST | `/orders` | Create order |
| GET | `/orders` | List my orders |
| POST | `/orders/{id}/pay` | Create payment order |
| POST | `/orders/{id}/verify-payment` | Verify payment |

### Gym (Auth: `Bearer {phone}`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/gyms/dashboard` | Dashboard (commission stats) |
| GET | `/gyms/orders` | Orders at this gym |
| POST | `/gyms/orders/{id}/verify-pickup` | Verify pickup code |

### Delivery Partner (Auth: `Bearer {phone}`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/delivery/orders` | Today's assigned orders |
| POST | `/delivery/orders/{id}/delivered` | Mark as delivered |

### Admin (Auth: `Bearer {phone}`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/gyms/pending` | Pending gym approvals |
| POST | `/admin/gyms/{id}/approve` | Approve gym |
| POST | `/admin/gyms/{id}/reject` | Reject gym |
| GET | `/admin/orders` | Orders by date |
| PUT | `/admin/orders/{id}/status` | Update order status |
| POST | `/admin/orders/{id}/assign` | Assign delivery partner |
| GET | `/admin/delivery-partners` | List delivery partners |
| POST | `/admin/delivery-partners` | Create delivery partner |

### Super Admin (Auth: `Bearer {phone}`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/admin/products` | Create product |
| PUT | `/admin/products/{id}` | Update product |
| POST | `/admin/localities` | Create locality |

### Webhooks
| Method | Path | Description |
|--------|------|-------------|
| POST | `/webhooks/payment` | Payment provider webhook |

### WebSocket
| Path | Description |
|------|-------------|
| `/ws` | Real-time updates |

## Environment Variables

```env
ENV=development
PORT=8080
DATABASE_URL=postgres://postgres:postgres@localhost:5432/aarogya_ruchi?sslmode=disable
CACHE_URL=localhost:6379

# OTP (MSG91)
MSG91_AUTH_KEY=
MSG91_TEMPLATE_ID=

# Payment (choose one)
PAYMENT_PROVIDER=razorpay
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
# Or Cashfree
CASHFREE_APP_ID=
CASHFREE_SECRET_KEY=
CASHFREE_ENV=sandbox
```

## Project Structure

```
server/
├── cmd/server/main.go
├── internal/
│   ├── config/         # Environment config
│   ├── db/             # Database (sqlc)
│   ├── cache/          # Valkey client
│   ├── otp/            # OTP service
│   ├── payment/        # Payment (Razorpay/Cashfree)
│   ├── middleware/     # Auth middleware
│   ├── handler/        # HTTP handlers
│   ├── router/         # Routes
│   └── validator/      # Runtime validation
├── docker-compose.yml
├── Dockerfile
└── Makefile
```

## Dev Mode

- OTP: Use `123456` (hardcoded)
- Auth: Pass phone in `Authorization: Bearer {phone}` header
- Payment: Placeholder responses (no real charges)

## Dev / Regression Environment (`dev-server`)

A full stack for regression testing runs on the home-lab box reached via
the `dev-server` ssh alias (Cloudflare tunnel; `dev-server-local` on the
LAN). It mirrors prod (same compose file, migrations pre-step, prebuilt
image shipped over ssh) with dev differences:

- Deploy dir `~/aarogya-dev`; only the `local` profile runs — no
  Caddy/Adminer/redis-commander. LAN API: `http://<box-ip>:8080`.
- CPU arch auto-detected (amd64/arm64); binary cross-compiled locally.
- Container engine auto-detected: docker (post-bootstrap) or rootless
  podman (no sudo; survives logout, NOT reboot — re-deploy or
  `podman start postgres valkey server tunnel` after reboot).
- Public URLs (all 3 services, prod parity): API
  `https://dev-api.aarogyaruchi.com`, Adminer `https://dev-db.aarogyaruchi.com`,
  redis-commander `https://dev-cache.aarogyaruchi.com` — dedicated tunnel
  bb8db68b, container connector; `dev-api.lohitcode.com` alias. UIs are
  gated by a basic-auth caddy container (Caddyfile.dev — same user/pass
  as prod's db/cache UIs). Site: `https://dev.aarogyaruchi.com` (+workers.dev),
  `clients/apps/user && bun run deploy:dev`.
- aarogyaruchi.com DNS for the three dev hostnames: import
  `scripts/dev-dns-import.txt` (BIND zone file) via dashboard DNS →
  Import, or add the CNAMEs by hand → `<tunnel-id>.cfargotunnel.com`
  proxied (the local cloudflared cert only manages lohitcode.com). Dev
  `.env` keeps `SESSION_COOKIE_SAMESITE_NONE=true` so the workers.dev
  site alias works.
- Fixed OTP `123456` (explicit in the seeded .env). Seeded accounts:
  admin `+919000000001`, delivery partner `+919000000002`.
- `ZAI_API_KEY` / `R2_UPLOAD_SECRET` / VAPID keys are piped from the
  local `server/.env` on first deploy. Note: image uploads go through
  the same images-cdn worker → the shared R2 bucket; upload obvious
  test images only. Dev chatbot requests share the coding-plan key's
  rate limits with prod.

```bash
./deploy.sh                 # from any non-main branch → deploys here
./deploy-dev.sh             # same thing, explicit
./deploy-dev.sh --reset-db  # wipe dev Postgres/Valkey volumes, fresh DB
ssh dev-server 'cd aarogya-dev && sudo docker compose --profile local logs -f server'
ssh dev-server 'cd aarogya-dev && sudo docker compose --profile local exec postgres psql -U aarogya -d aarogya_ruchi'
```

## v1 Platform Deployment Notes

- Migrations run as a **pre-switch step** during `./deploy.sh` (one-shot
  `server -migrate-only` container) before the new API takes traffic.
- Required production env (see `.env.example`): `PARTNER_TOKEN_SECRET`
  (server refuses to boot without it), `ALLOWED_ORIGINS`, and the seeded
  `SEED_ADMIN_PHONES` / `SEED_PARTNER_PHONES` values.
- `OTP_FIXED_ENABLED=true` pins OTPs to 123456 — staging only.
- Backups: install `scripts/backup.sh` via cron (instructions inside the
  script); it dumps Postgres nightly, keeps 7 days locally, and can rsync
  off-box via `BACKUP_TARGET`. Verify a restore once after first real data.
- Container memory caps: API 512m, Postgres 768m (192MB shared_buffers),
  Valkey 256m (192mb maxmemory, LRU, AOF) — sized for the 2 GB VPS.
