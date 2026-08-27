# Aarogya Ruchi

## Project Overview
Go REST API + WebSocket application serving ~2,000 users.

## Tech Stack
- **Language:** Go
- **API:** REST + WebSocket
- **Database ORM:** sqlc (type-safe SQL)
- **Cache:** Valkey (Redis-compatible fork)
- **Database:** PostgreSQL
- **Containerization:** Docker + Docker Compose

## Architecture

### Local Development
```bash
cp .env.local .env     # Copy local config
docker-compose up -d   # Starts PostgreSQL + Valkey locally
go run cmd/server/main.go
```

### Production (Tencent Cloud, `ssh server`)

```
 Browser ─ aarogyaruchi.com ──┐   admin.aarogyaruchi.com ──┐
                              ▼                           ▼
┌─────────────────────────── Cloudflare ────────────────────────────┐
│  aarogyaruchi-user Worker (site, TanStack SSR; /admin/* 307s to   │
│    the ops app)                                                   │
│  aarogyaruchi-admin Worker (ops console, admin.aarogyaruchi.com)  │
│  images-cdn Worker ──▶ R2 bucket (product images, HMAC uploads)   │
└────────┬────────────────────────────────────────────┬─────────────┘
         │ REST + WS (api.aarogyaruchi.com)           │ upload URLs
┌────────▼─────────── Tencent VPS · (redacted) ─────▼─────────────┐
│  Ubuntu 24.04 · docker compose (local + proxy) · deploy dir /app   │
│                                                                    │
│  Caddy :80/443 ─ api.aarogyaruchi.com  ──▶ API blue/green :8080     │
│      │          db.aarogyaruchi.com    ──▶ Adminer      (basic     │
│      │          cache.aarogyaruchi.com ──▶ redis-cmdr    auth)     │
│  Go API ──▶ PostgreSQL 16 + Valkey 8 (host ports loopback-only)    │
└────────────────────────────────────────────────────────────────────┘
```

### Dev / regression (home lab, `ssh dev-server`) — any non-main branch

```
 Browser ─ dev.aarogyaruchi.com ──┐  (+ workers.dev alias)
                                 ▼
┌─────────────────────────── Cloudflare ────────────────────────────┐
│  aarogyaruchi-user-dev Worker (VITE_API_BASE_URL = dev-api…)       │
│  aarogyaruchi-admin-dev Worker (dev-admin.aarogyaruchi.com)        │
│  dev-api / dev-db / dev-cache .aarogyaruchi.com (proxied CNAMEs)   │
└───────────────────────────────┬───────────────────────────────────┘
                                │ dedicated Tunnel bb8db68b
┌───────────────────────────────▼── dev box · Fedora 44 ────────────┐
│  ssh dev-server (192.168.0.8 on LAN) · rootless podman ~/aarogya… │
│                                                                    │
│  cloudflared connector ─▶ dev-api      → server:8080               │
│                        └─▶ dev-db / dev-cache → caddy basic-auth   │
│                                              ├─▶ Adminer           │
│                                              └─▶ redis-commander   │
│  server:8080 ──▶ PostgreSQL + Valkey    (LAN API: 192.168.0.8:8080)│
│  separate root tunnel 37baf058 serves only ssh.lohitcode.com       │
└────────────────────────────────────────────────────────────────────┘
```

### Deploy flow (branch-aware)

```
 ./deploy.sh ──▶ branch = main ──▶ Tencent (prod)
            └─▶ any other branch ──▶ dev box (auto, sudo-less)
 frontend: clients/apps/{user,admin} ─▶ bun run deploy (prod) · deploy:dev (dev)
         (admin = admin.aarogyaruchi.com · dev-admin.aarogyaruchi.com)
```

### Blue-green deploys + session-store rules (read before touching infra)

**Post-mortem 2026-08-25:** commit 95f39c4 added `--appendonly yes` to the
valkey container. Valkey/Redis load AOF-first: booting with AOF enabled
against a volume that only held `dump.rdb` starts EMPTY and silently
ignores the RDB — every `session:*` key was wiped and ALL users were
logged out by that one deploy. Sessions are valkey-only (`session:<hex>`
keys, no signing secret), so "everyone logged out" always means the valkey
keys vanished server-side.

Hard rules:
- **Never switch valkey persistence flags by cold-booting a new command
  line.** Apply such changes at runtime with `CONFIG SET appendonly yes`
  (which converts the live dataset into an AOF base), or explicitly accept
  a full session wipe.
- **Valkey runs `--maxmemory-policy noeviction` + `--appendfsync always`**
  (durability over latency — deliberate tradeoff). Every key this app
  writes carries a TTL, so nothing needs LRU reaping; a full store must
  fail loudly at login, never silently evict live user sessions.
- **`docker compose down` is banned on prod.** Deploys reconcile infra
  with `up -d <services>` and cut over API slots blue-green style;
  valkey/postgres are only recreated when their compose config actually
  changes (AOF replays — sessions survive).

Blue-green runbook (deploy.sh does this automatically):
- The API runs as `server-blue` / `server-green` slots (compose anchor
  `x-server-slot`; both carry the network alias `server` for callers that
  predate the split). Neither slot publishes host ports — production
  traffic flows only through Caddy; dev/local stacks add :8080 via their
  own docker-compose.override.yml. Caddy proxies to BOTH with active
  `/health` checks (2s interval, 30s fail_duration) — its config is static
  across deploys; traffic simply follows container health.
- Each deploy: tag the running image `:previous` (rollback = retag +
  re-run) → migrations pre-step while the old slot still serves (keep
  migrations expand/contract backward-compatible) → start the idle slot →
  wait healthy (on failure: abort, prod untouched) → `caddy reload`
  (graceful, no-op when unchanged) → `stop -t 30` the old slot (Go drains
  in-flight HTTP; WS clients reconnect on their own backoff and refetch).
- Known caveats: WS pushes can be missed for a few seconds during the
  two-slot overlap (the hub is per-instance; proper fix later = valkey
  pub/sub fanout); SSE chat streams are cut at cutover and re-issued by
  clients.
- **Nothing is ever built on the server** — local cross-compile + local
  image build; the VPS Docker surface is strictly load/up/stop/rm/tag.
- A valkey blip answers **503** `session store unavailable`, not 401 —
  `session.ErrSessionUnavailable` vs `ErrSessionNotFound` in
  `internal/session`. Never conflate the two again.

## Deployment Infrastructure

### Server Details
| Item | Value |
|------|-------|
| Provider | Tencent Cloud (moved from Hetzner) |
| Arch | x86_64 (2 vCPU, 2 GB RAM, 40 GB disk) |
| Public IP | (redacted) |
| OS | Ubuntu 24.04 (docker via sudo; ubuntu user) |
| HTTPS | Caddy (auto TLS) — api/db/cache .aarogyaruchi.com |

### SSH Access
```bash
ssh server   # alias → ubuntu@(redacted)
```

### Deploy (branch-aware)
```bash
cd server && ./deploy.sh
```
`deploy.sh` routes by the current branch of whatever checkout it runs from:

- **`main`** (or a detached HEAD exactly at `origin/main`) → **production**
  (Tencent box, `ssh server`).
- **any other branch / detached HEAD** → **dev box** (`ssh dev-server`,
  delegates to `deploy-dev.sh`).

Overrides: `--target=dev` forces dev; `--target=prod` from a non-main
branch requires typing `prod` at a prompt (no tty = refused). Use
`AR_DEPLOY_DRY_RUN=1 ./deploy.sh` to print the routing decision only.
Nothing is built on the server: the binary is cross-compiled locally,
packaged into the final runtime image, and only that image is shipped
(with `docker-compose.yml` + `Caddyfile` for prod). `/app/.env` is seeded
on first deploy from local `server/.env` (Z.AI key piped over stdin;
never printed or committed). NOTE: this replaces the old flow of shipping
unmerged branch work to prod — merge to main first, or use the typed
override for hotfixes.

### Dev / regression environment (`dev-server`)
Separate home-lab box (NOT prod): `ssh dev-server` (Cloudflare tunnel;
`dev-server-local` = 192.168.0.8 on the LAN). Full stack for regression
testing — same compose file, migrations pre-step, prebuilt-image deploy as
prod, but arch is auto-detected, there is no Caddy/Adminer (only the
`local` profile), and the API serves plain HTTP on `<box-ip>:8080`.

```bash
cd server && ./deploy.sh                 # any non-main branch lands here
cd server && ./deploy-dev.sh             # same, explicit
cd server && ./deploy-dev.sh --reset-db  # wipe dev DB + cache volumes
```

- Deploy dir `~/aarogya-dev`; dev `.env` seeds fixed OTP `123456`, admin
  `+919000000001`, partner `+919000000002`; Z.AI/R2/VAPID secrets are
  piped from local `server/.env` on first deploy.
- Engine auto-detected: docker when usable (post-bootstrap), else rootless
  podman — no sudo needed. Rootless containers survive ssh logout on this
  box but NOT reboot: after a reboot re-run `./deploy-dev.sh` (or
  `ssh dev-server 'cd aarogya-dev && podman start postgres valkey server tunnel'`).
- Public URLs (prod parity, all 3 services): API
  `https://dev-api.aarogyaruchi.com`, Adminer
  `https://dev-db.aarogyaruchi.com`, redis-commander
  `https://dev-cache.aarogyaruchi.com` — dedicated Cloudflare tunnel
  `bb8db68b…`, connector runs as a container beside the stack;
  `dev-api.lohitcode.com` is a working alias. The UIs sit behind a
  basic-auth caddy container (Caddyfile.dev, same user/password as the
  prod db/cache UIs) — never route them straight through the tunnel.
  Site: `https://dev.aarogyaruchi.com` + workers.dev alias
  (`cd clients/apps/user && bun run deploy:dev`). Site and API now share
  the aarogyaruchi.com registrable domain (same-site), but the dev box
  keeps `SESSION_COOKIE_SAMESITE_NONE=true` so the workers.dev site alias
  keeps working too. NOTE: the `dev-api.aarogyaruchi.com` CNAME had to be
  added manually in the Cloudflare dashboard (aarogyaruchi.com zone):
  `dev-api` → `bb8db68b-9ab7-46cd-90a3-eeecd8f31acd.cfargotunnel.com`,
  proxied — or import `server/scripts/dev-dns-import.txt` (BIND zone
  file with all three records) via dashboard DNS → Import; the local
  cloudflared cert only manages lohitcode.com DNS.
- Dev image uploads share the prod R2 bucket via images-cdn — test
  images only. Never run the proxy profile / prod Caddyfile on this box.

### Public hostnames (Caddy)
- `api.aarogyaruchi.com` → Go API (REST + WS)
- `db.aarogyaruchi.com` → Adminer (Postgres UI, basic auth user `lohit`)
- `cache.aarogyaruchi.com` → redis-commander (Valkey UI, same basic auth)
- Postgres/Valkey host ports are loopback-bound only.

## Z.AI Chatbot API

The public `POST /chat/stream` SSE endpoint is powered by Z.AI's
OpenAI-compatible HTTP API. Docs index: https://docs.z.ai/llms.txt

| Item | Value |
|------|-------|
| Endpoint | `ZAI_BASE_URL` — this account's key is a **GLM Coding Plan** subscription, so it must use `https://api.z.ai/api/coding/paas/v4/chat/completions` (pay-as-you-go keys would use `https://api.z.ai/api/paas/v4`) |
| Auth | `Authorization: Bearer $ZAI_API_KEY` (key format `id.secret`) |
| Model | `ZAI_MODEL`, default `glm-4.7` (`glm-4.7-flashx` no longer exists in the catalog) |
| Env vars | `ZAI_API_KEY`, `ZAI_MODEL`, `ZAI_BASE_URL` (server `.env` / `/app/.env` on the box) |

Integration notes:
- All prompt copy lives in `server/internal/chatbot/prompts/*.md`
  (`system.md` + `knowledge.md`), embedded via `go:embed` — edit the
  Markdown, never the Go code.
- Available models can be listed with `GET /api/paas/v4/models` (works even
  with zero balance — useful to verify the key without spending credit).
- `{"error":{"code":"1113", ...Insufficient balance...}` means the Z.AI
  account is out of credit — the chatbot then serves a clean
  `provider_error`; nothing is wrong with the deployment.
- Requests must not include client-supplied system prompts; the Go handler
  rejects the `system` role and builds the server-owned prompt itself.
- The public chat payload is `{locale, messages:[{role, content}]}`; the
  server also accepts `text` as an alias for `content` for older cached
  frontend bundles.
- The coding-plan limiter does not return 429 — it silently HOLDS excess
  requests (no response headers, ever). `ZaiClient.postStream` cancels any
  attempt whose headers take >10s (`headerWait`) and retries once; isolated
  requests after idle periods hit this constantly, so don't remove that
  retry.

## Database Strategy
Postgres currently runs on the same Tencent box (docker-compose `local`
profile, volume `pg_data`). Move to managed PostgreSQL (Supabase/Neon) for
automatic backups before real production data lands.

## Resource Usage Estimates
- Go app: ~50-100MB RAM
- Valkey: ~50-200MB RAM
- Remaining: ~3.5GB for OS and overhead

## Deployment Checklist
- [ ] Connect to server: `ssh root@(redacted)`
- [ ] Verify Docker: `docker --version`
- [ ] Create docker-compose.yml for Go + Valkey
- [ ] Set up reverse proxy (Caddy) for HTTPS
- [ ] Point domain to (redacted)
- [ ] Set up Supabase/Neon for PostgreSQL
- [ ] Configure environment variables
- [ ] Run sqlc generate for type-safe queries

## Alternative Providers Considered
| Provider | Price | Notes |
|----------|-------|-------|
| Oracle Cloud | Free | 4 ARM CPU, 24GB RAM - best free tier |
| Contabo | ~$5/month | 4 vCPU, 8GB - oversold, less reliable |
| Fly.io | Free tier | Easy deploys, limited resources |
| AWS EC2 | ~$15-30/month | Overkill for this use case |
| DigitalOcean | ~$6/month | Reliable but pricier |

## Notes
- Go compiles natively for both ARM64 and x86 - either works
- For India users, Singapore location would have better latency (~50-80ms) but costs more ($6.99/month)
- Backups on Hetzner add 20% (~$0.70/month) - optional but recommended

# shadcn/ui (clients monorepo)

The frontend UI is built on **shadcn/ui** (style `base-maia`, Base UI
primitives, Tailwind v4) managed by the shadcn CLI at the monorepo root:

- `clients/packages/ui` (`@aarogyaruchi/ui`) holds the full component
  registry (`src/components/*`), `lib/utils`, and the shared preset theme
  (`src/styles/globals.css`). Apps consume it via subpath imports
  (`@aarogyaruchi/ui/components/button`) — there is no barrel export.
- `components.json` lives in `packages/ui` **and** in each app
  (`apps/user`, `apps/admin`); all three share the same style/baseColor.
- Base UI replaces Radix: composition uses the `render` prop
  (`<SheetTrigger render={<Button>…</Button>} />`), not `asChild`.

**Hard rule:** everything under `packages/ui/src/components/` is
CLI-owned registry code. **Never hand-edit a registry component's styles
or internals.** Customize at the call site with `className`/props/composition
(or a local wrapper component); refresh or add components with
`bunx --bun shadcn@latest add <name> -c clients/packages/ui`. Theme tokens
(colors/radius/fonts) live only in `packages/ui/src/styles/globals.css`.
Scaffold experiments (init/new styles) go in `/tmp`, never in the repo.

# Ultracite Code Standards

This project uses **Ultracite**, a zero-config preset that enforces strict code quality standards through automated formatting and linting.

## Quick Reference

- **Format code**: `bun x ultracite fix`
- **Check for issues**: `bun x ultracite check`
- **Diagnose setup**: `bun x ultracite doctor`

Biome (the underlying engine) provides robust linting and formatting. Most issues are automatically fixable.

---

## Core Principles

Write code that is **accessible, performant, type-safe, and maintainable**. Focus on clarity and explicit intent over brevity.

### Type Safety & Explicitness

- Use explicit types for function parameters and return values when they enhance clarity
- Prefer `unknown` over `any` when the type is genuinely unknown
- Use const assertions (`as const`) for immutable values and literal types
- Leverage TypeScript's type narrowing instead of type assertions
- Use meaningful variable names instead of magic numbers - extract constants with descriptive names

### Modern JavaScript/TypeScript

- Use arrow functions for callbacks and short functions
- Prefer `for...of` loops over `.forEach()` and indexed `for` loops
- Use optional chaining (`?.`) and nullish coalescing (`??`) for safer property access
- Prefer template literals over string concatenation
- Use destructuring for object and array assignments
- Use `const` by default, `let` only when reassignment is needed, never `var`

### Async & Promises

- Always `await` promises in async functions - don't forget to use the return value
- Use `async/await` syntax instead of promise chains for better readability
- Handle errors appropriately in async code with try-catch blocks
- Don't use async functions as Promise executors

### React & JSX

- Use function components over class components
- Call hooks at the top level only, never conditionally
- Specify all dependencies in hook dependency arrays correctly
- Use the `key` prop for elements in iterables (prefer unique IDs over array indices)
- Nest children between opening and closing tags instead of passing as props
- Don't define components inside other components
- Use semantic HTML and ARIA attributes for accessibility:
  - Provide meaningful alt text for images
  - Use proper heading hierarchy
  - Add labels for form inputs
  - Include keyboard event handlers alongside mouse events
  - Use semantic elements (`<button>`, `<nav>`, etc.) instead of divs with roles

### Error Handling & Debugging

- Remove `console.log`, `debugger`, and `alert` statements from production code
- Throw `Error` objects with descriptive messages, not strings or other values
- Use `try-catch` blocks meaningfully - don't catch errors just to rethrow them
- Prefer early returns over nested conditionals for error cases

### Code Organization

- Keep functions focused and under reasonable cognitive complexity limits
- Extract complex conditions into well-named boolean variables
- Use early returns to reduce nesting
- Prefer simple conditionals over nested ternary operators
- Group related code together and separate concerns

### Security

- Add `rel="noopener"` when using `target="_blank"` on links
- Avoid `dangerouslySetInnerHTML` unless absolutely necessary
- Don't use `eval()` or assign directly to `document.cookie`
- Validate and sanitize user input

### Performance

- Avoid spread syntax in accumulators within loops
- Use top-level regex literals instead of creating them in loops
- Prefer specific imports over namespace imports
- Avoid barrel files (index files that re-export everything)
- Use proper image components (e.g., Next.js `<Image>`) over `<img>` tags

### Framework-Specific Guidance

**Next.js:**
- Use Next.js `<Image>` component for images
- Use `next/head` or App Router metadata API for head elements
- Use Server Components for async data fetching instead of async Client Components

**React 19+:**
- Use ref as a prop instead of `React.forwardRef`

**Solid/Svelte/Vue/Qwik:**
- Use `class` and `for` attributes (not `className` or `htmlFor`)

---

## Testing

- Write assertions inside `it()` or `test()` blocks
- Avoid done callbacks in async tests - use async/await instead
- Don't use `.only` or `.skip` in committed code
- Keep test suites reasonably flat - avoid excessive `describe` nesting

## When Biome Can't Help

Biome's linter will catch most issues automatically. Focus your attention on:

1. **Business logic correctness** - Biome can't validate your algorithms
2. **Meaningful naming** - Use descriptive names for functions, variables, and types
3. **Architecture decisions** - Component structure, data flow, and API design
4. **Edge cases** - Handle boundary conditions and error states
5. **User experience** - Accessibility, performance, and usability considerations
6. **Documentation** - Add comments for complex logic, but prefer self-documenting code

---

Most formatting and common issues are automatically fixed by Biome. Run `bun x ultracite fix` before committing to ensure compliance.
