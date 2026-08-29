# Dev box: self-hosted monitoring + the 39-hour outage it exposed

**Write-up — 2026-08-29.** The dev box runs its own Grafana + Prometheus +
Loki stack (all local, rootless podman), while prod keeps using Grafana
Cloud. Plus the reboot-survival fix for the outage nobody noticed.

| | |
|---|---|
| Trigger | Recon found `dev-api.aarogyaruchi.com` serving **530 for ~39 hours** — the box had rebooted, every container was down, and nothing restarts rootless containers after boot (no linger, no units, no crontab) |
| Split | **Prod → Grafana Cloud** (its 2 GB VPS can't afford the stack; free tier sized at ~3–4k/10k series). **Dev → self-hosted** (24 GB RAM / 210 GB disk, idle — the stack costs ~1.5 GB) |
| Status | Live: 5 Prometheus targets up, 11 Loki streams, 6 dashboards, 7 alert rules |

---

## 1. Why the split

The free Grafana Cloud tier caps at **10k active series per org**. Cloning
the prod pipeline onto dev would have burned 2.5–3.5k of the shared cap
for a box that's mostly off. Self-hosting on dev instead:

- **Zero series cost** against prod's cap — complete isolation.
- **No retention anxiety**: 90 days of metrics + 30 days of logs fit in
  well under 2 GB of the 210 GB disk.
- **No credentials**: the stack is localhost-only; nothing egresses, no
  cloud tokens on the dev box, `config-dev.alloy` has no `sys.env` at all.
- **15s scrapes** are fine (self-hosted → no DPM billing, the rule that
  forced 60s on cloud).

The 2 GB prod box stays cloud-backed so telemetry survives a VPS meltdown;
dev inverts it because the box is big and the data is disposable.

## 2. The outage root cause

Rootless podman containers with `--restart=always` restart on **crash**,
not on **boot** — the user-level restart engine only runs once you log in,
and this box has no auto-login. The box reboots (or updates and reboots),
the stack stays down until a human notices. Nobody did for 39 hours.

Fix, applied on every `deploy-dev.sh` run (idempotent):

```
loginctl enable-linger              # user manager runs before login
systemctl --user enable podman-restart.service   # restarts --restart=always at boot
systemctl --user enable --now podman.socket      # API socket alloy needs
```

## 3. Architecture

```
 Dev box (rootless podman, network aarogya-dev)
┌─────────────────────────────────────────────────────┐
│ node-exporter :9100 (procfs-only — see §4)          │
│ postgres-exporter :9187   redis-exporter :9121      │
│ server :8080/metrics (METRICS_ENABLED=true)         │
│      │ 15s scrape          │ podman.sock log tail   │
│      ▼                      ▼                        │
│   alloy ── remote_write ──▶ prometheus (90d)        │
│        └─ loki write ─────▶ loki (30d)              │
│                              grafana :3000 (LAN)    │
└─────────────────────────────────────────────────────┘
 cloudflared tunnel: dev-api.aarogyaruchi.com/metrics → 404
```

- Grafana is **LAN-only** (192.168.0.8:3000) — deliberately not on the
  tunnel. Datasources are provisioned with the **same UIDs as Grafana
  Cloud** (`grafanacloud-prom` / `grafanacloud-logs`), so the same
  dashboard JSONs import unchanged into both.
- Files: `monitoring/config-dev.alloy`, `prometheus-dev.yml`,
  `loki-dev.yml`, `grafana-datasources-dev.yml` — shipped by
  `deploy-dev.sh`; all containers hand-run in the podman path.
- Admin password lives in sops `dev.env` (`GRAFANA_ADMIN_PASSWORD`);
  `METRICS_ENABLED=true` turns on the dev API's `/metrics`.

## 4. Podman-specific gotchas (vs the prod docker compose)

1. **Rootless can't bind `/`** — the canonical node-exporter
   `/:/host:ro,rslave` mount is impossible without root. `/proc` alone
   still yields host cpu/mem/load; collectors needing `/sys` just report
   `node_scrape_collector_success=0`.
2. **v1.12 node-exporter has no `--collector.disable-default-collectors`**
   flag (it crash-loops with "unknown long flag"). Run bare with
   `--path.procfs=/host/proc`.
3. **Loki has no `wget`** — it's a distroless image; probe it with a
   `curlimages/curl` sidecar on the network, not `podman exec`.
4. **Log tailing works through podman.sock** — alloy's `discovery.docker`
   + `loki.source.docker` speak the docker-compatible API fine against
   `/run/user/<uid>/podman/podman.sock` (socket-activated via
   `podman.socket`). Dev container names are bare (`server`, `postgres` —
   no `aarogya-` compose prefix), so the dev copy of the logs dashboard
   uses adjusted label matchers.
5. **SELinux**: every host-file bind mount needs `--security-opt
   label=disable` (same `:Z` race reasoning as the tunnel container).

## 5. Public-surface guard

`METRICS_ENABLED=true` exposes `/metrics` on the dev API, and the tunnel
ingresses **all** `dev-api` paths to `server:8080` — so `deploy-dev.sh`
now writes a `path: ^/metrics` → 404 rule ahead of the API rule (mirrors
prod's Caddy `handle /metrics` block). Verified: public 404, in-network 200.

## 6. Behavior matrix

| State | Result |
|---|---|
| `make`-style local run on a laptop | no monitoring (podman path is dev-only) |
| Prod deploy (`deploy.sh`, main) | Grafana Cloud pipeline, untouched |
| Dev deploy (`deploy-dev.sh`) | 13 containers: 7 app + 6 monitoring |
| Dev box reboot | linger + podman-restart bring all 13 back automatically |
| Dev box dead | dev-api 530 publicly; self-hosted Grafana is down with it (optional future: free Synthetic Monitoring checks from the prod cloud account) |

## 7. Accessing the dev Grafana

On the LAN: `http://192.168.0.8:3000` (admin / `GRAFANA_ADMIN_PASSWORD`
in sops `dev.env`). Over the internet: `ssh -L` to the box — note sshd
may refuse to connect onward to port 3000 under SELinux ("channel open
failed"); if so, curl the APIs from on-box instead, or add 3000 to
`semanage port -a -t http_port_t -p tcp 3000`.
