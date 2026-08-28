# Grafana Cloud monitoring for the prod VPS

**Design write-up — 2026-08-29.** Instance health, Postgres, Valkey, API
latency, and container logs for the Tencent VPS, shipped to the Grafana
Cloud **free** tier. Everything is outbound-only: no new inbound ports, no
Caddy changes, and deploys stay zero-downtime.

| | |
|---|---|
| Free tier fit | ~3–4k active series vs 10k cap · ~1–10 GB logs/mo vs 50 GB · 3 users · **14-day retention** · cannot be billed (hard 403 cap) |
| Deploys | monitoring activates automatically once `GRAFANA_CLOUD_API_KEY` lands in sops `prod.env` |
| Rollback | `ssh server 'cd /app && sudo docker compose --profile monitoring stop alloy node-exporter postgres-exporter redis-exporter'` |

---

## 1. Why Cloud free instead of self-hosted

Self-hosted Prometheus + Grafana + Loki on the 2 GB box costs 400–800 MB
RAM — ~25% of the machine — for monitoring the machine itself. The Cloud
free tier stores telemetry off-host (survives a VPS meltdown), includes
alerting, and hard-caps instead of billing: exceeding 10k active series
drops new samples with 403 `too-many-series`, never invoices.

Two rules keep the series count safe:

1. **Scrape at 60s.** Billable usage is DPM-normalized
   (`billable = max(series, DPM)`); a 30s interval doubles it.
2. **Label by route pattern, never raw path.** The Go middleware labels
   `chi.RoutePattern()` — `/v1/orders/{id}` — so order IDs cannot explode
   cardinality. Log streams carry only `container_name`.

Measured locally (2026-08-29): postgres ~1.2k · node ~0.8–1.5k (host
dependent) · valkey ~360 · Go API RED+runtime ~0.7–1k → **~3–4k total**,
2.5–3× headroom.

## 2. Architecture

```
 Tencent VPS (2 GB, docker compose)                Grafana Cloud (free)
┌────────────────────────────────────────┐        ┌─────────────────────┐
│ node-exporter      :9100 ─┐             │        │                     │
│ postgres-exporter  :9187 ─┤ scrape 60s  │  push  │ Prometheus (metrics)│
│ redis-exporter     :9121 ─┤            ├────────▶│ Loki       (logs)   │
│ server-blue/green :8080/metrics        │  TLS   │ dashboards+alerting │
│ docker json-file logs ──▶ alloy        │        └─────────────────────┘
│ (grafana/alloy, mem limit 320m)        │
└────────────────────────────────────────┘
```

- `redis_exporter` officially supports Valkey 7/8/9 (verified live:
  `redis_up 1`, `valkey_version="8.1.9"`).
- `postgres-exporter` reuses the `aarogya` role on purpose: deploy.sh's
  per-deploy `ALTER USER` rotation keeps its DSN valid, and compose
  recreates it when `.env` changes.
- Both API slots are scraped explicitly (`instance=blue`/`green`): the
  idle slot reads `up == 0` until the next deploy flips them — free
  deploy telemetry.
- `/v1/ws` (hours-long connections) and `/chat/stream` (SSE) are exempt
  from latency recording; they would only observe at disconnect and
  distort the histograms.

## 3. Go side: `METRICS_ENABLED`

`/metrics` (unversioned, pre-CORS) is **fail-closed**: 404 unless
`METRICS_ENABLED=true`. It is network-internal anyway — slots publish no
host ports and Caddy routes nothing to it — the flag is defense-in-depth.
The middleware wraps with chi's `NewWrapResponseWriter` so the
`Flusher` (SSE) and `Hijacker` (WS) interfaces pass through unbroken.

## 4. Activation is a one-key switch

deploy.sh appends the four monitoring services to the infra reconcile
**only when** `/app/.env` contains `GRAFANA_CLOUD_API_KEY=.`. Before
that, every deploy prints `Monitoring profile: skipped` and ships the
API exactly as before. After the sops edit adds the five
`GRAFANA_CLOUD_*` keys (+ `METRICS_ENABLED=true`), the next deploy pulls
the images and starts everything — no deploy.sh change needed.

## 5. Gotchas found while building (the real lessons)

1. **Compose interpolation is file-wide, profiles be damned.**
   `${VAR:?}` guards on alloy's env fired even for `--profile local`
   runs — which would have broken local dev, the dev box (deploy-dev
   ships this same compose file), and every prod deploy before the creds
   existed. Fix: soft `${VAR:-}` defaults + the deploy.sh grep as the
   single activation gate.
2. **Never touch caddy's compose config casually.** Adding the log-rotation
   anchor to caddy would recreate the container on the next deploy — a
   brief real outage, the thing the blue-green design exists to avoid.
   adminer/redis-commander got the anchor; caddy did not (its Caddyfile
   logs no access lines anyway).
3. **`--profile monitoring` must not live in the shared `$COMPOSE` var.**
   `exec`/`run`/`stop` would interpolate (and historically, guard-fail
   on) monitoring services mid-deploy. A separate `COMPOSE_MON` is used
   only on the reconcile line.
4. **`rslave` on `/` is Linux-only** — Docker Desktop refuses it. The
   canonical node-exporter recipe stays (prod is Linux); local Mac
   smoke-tests drop the flag.

## 6. Behavior matrix

| Environment / state | monitoring containers | `/metrics` on API |
|---|---|---|
| Local dev (`make up`) | never (profile not enabled) | 404 (flag unset) |
| Dev box (`deploy-dev.sh`) | never (profile not enabled) | 404 |
| Prod, creds not yet in sops | never (deploy.sh grep skips) | 404 |
| Prod, creds present | started + reconciled every deploy | 200, scraped 60s |
| Prod, cloud outage | exporters keep running; alloy retries pushes | 200 (scrapes fail upstream) |
| Rollback | one `stop` command (see table above) | 404 after flag removed |

## 7. Post-deploy checklist (once creds land)

1. `ssh server 'sudo docker compose --profile monitoring ps'` — four
   containers up; `docker logs aarogya-alloy` clean of auth errors.
2. Grafana Cloud Explore: `up` across jobs `node`, `postgres`, `valkey`,
   `goapi`; Usage dashboard ~3–4k series @ 1 DPM.
3. Loki query `{container_name=~".+"}` returns API/pg/valkey logs.
4. Import dashboards: **1860** (node), **11835** (redis/valkey), a
   postgres exporter dashboard, plus a small custom API RED panel
   (`histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) by (route)`).
5. Alerts (free tier includes them): disk >85% · mem >90% ·
   `pg_up == 0` · `redis_up == 0` · both goapi slots `up == 0` ·
   `rate(http_requests_total{status=~"5.."}[5m]) > 0` · a missing-series
   alert to catch Alloy itself dying.

Known limits to remember: **14-day retention** (fine for triage, not
month-over-month trends — Pro is $19/mo if that ever matters), 3 active
users, and Alloy's RSS deserves a glance during its first week (320m
container limit contains any leak).
