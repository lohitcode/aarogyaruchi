#!/bin/bash
set -e

# Branch-aware deploy entry point.
#
#   current branch = main (or detached HEAD at origin/main) → production
#                                                    (ssh server, Tencent)
#   any other branch (or detached HEAD elsewhere)       → dev box
#                                                    (ssh dev-server)
#
# The dev target delegates to deploy-dev.sh (local profile only, no Caddy,
# fixed OTP + test seed accounts). Explicit overrides:
#
#   ./deploy.sh --target=dev    force dev (e.g. deploy-machinery test from main)
#   ./deploy.sh --target=prod   force prod; from a non-main branch this
#                               requires typing "prod" at a prompt.
#
# AR_DEPLOY_DRY_RUN=1 prints the routing decision and exits (no work done).

TARGET=""
for arg in "$@"; do
  case "$arg" in
    --target=prod) TARGET="prod" ;;
    --target=dev)  TARGET="dev" ;;
    *) echo "!! Unknown argument: $arg (expected --target=prod or --target=dev)" >&2; exit 1 ;;
  esac
done

cd "$(dirname "$0")"

BRANCH=$(git branch --show-current 2>/dev/null || true)
if [ -z "$BRANCH" ]; then
  # Detached HEAD: sanitized-worktree prod deploys run detached at
  # origin/main — treat exactly-origin/main as main, anything else as
  # non-main.
  if [ "$(git rev-parse HEAD 2>/dev/null || echo none1)" = "$(git rev-parse origin/main 2>/dev/null || echo none2)" ]; then
    BRANCH="main"
  else
    BRANCH="(detached HEAD)"
  fi
fi

if [ -z "$TARGET" ]; then
  if [ "$BRANCH" = "main" ]; then TARGET="prod"; else TARGET="dev"; fi
fi

echo "==> Deploy routing: branch '$BRANCH' → $TARGET"

if [ "${AR_DEPLOY_DRY_RUN:-}" = "1" ]; then
  echo "==> DRY-RUN: stopping before any work."
  exit 0
fi

if [ "$TARGET" = "prod" ] && [ "$BRANCH" != "main" ]; then
  echo "!! Production deploys should come from main; you are on '$BRANCH'."
  printf '   Type "prod" to override, anything else aborts: '
  read -r ANSWER </dev/tty
  if [ "$ANSWER" != "prod" ]; then echo "Aborted." >&2; exit 1; fi
fi

if [ "$TARGET" = "dev" ]; then
  exec ./deploy-dev.sh
fi

# --------------------------- production ---------------------------
# Deploy to the production host (Tencent Cloud, x86_64, reached via the
# `server` ssh alias). Nothing is built on the server — EVER: the binary is
# cross-compiled locally with the native Go toolchain, packaged into the
# final runtime image, and only that image is shipped. The server-side
# Docker surface is strictly load / up / stop / rm / tag.
#
# Zero downtime: the API runs as two blue-green slots behind Caddy's
# health-checked reverse_proxy. Each deploy starts the idle slot, waits for
# /health, reloads Caddy (a no-op unless the Caddyfile changed), then
# drains the old slot with a 30s graceful window.
SERVER="server"
IMAGE_NAME="aarogya-server"

echo "==> Cross-compiling linux/amd64 binary (native toolchain, no emulation)..."
mkdir -p tmp
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-w -s" -o tmp/server-linux-amd64 ./cmd/server

echo "==> Packaging final runtime image..."
docker build --platform linux/amd64 -f Dockerfile.prebuilt -t $IMAGE_NAME .

echo "==> Saving image..."
docker save $IMAGE_NAME | gzip > /tmp/aarogya-server.tar.gz

echo "==> Copying files to server..."
ssh $SERVER "sudo mkdir -p /app/secrets && sudo chown -R ubuntu:ubuntu /app"
scp /tmp/aarogya-server.tar.gz $SERVER:/tmp/
scp docker-compose.yml Caddyfile $SERVER:/app/
# sops-encrypted env (ciphertext — the box's age key is the only reader).
# /app/.env is hydrated from it on every deploy; plaintext never ships.
scp secrets/prod.env $SERVER:/app/secrets/prod.env

echo "==> Deploying on server (blue-green, zero downtime)..."
ssh $SERVER << 'EOF'
  set -e
  cd /app
  COMPOSE="sudo docker compose --profile local --profile proxy --profile green"

  # Hydrate /app/.env from the sops-encrypted env, validating shape before
  # the swap. This replaces the old first-deploy seeding entirely: secrets
  # rotate by editing server/secrets/prod.env (sops) and re-deploying.
  command -v sops >/dev/null || { echo "!! sops not installed on this box"; exit 1; }
  echo "==> Hydrating /app/.env (sops)..."
  sops -d --output /app/.env.new /app/secrets/prod.env 2>/dev/null
  chmod 600 /app/.env.new
  grep -q '^ENV=production$' /app/.env.new || { echo "!! secrets/prod.env: ENV=production missing — refusing to deploy"; rm -f /app/.env.new; exit 1; }
  for key in POSTGRES_PASSWORD VALKEY_PASSWORD DATABASE_URL PARTNER_TOKEN_SECRET; do
    grep -q "^$key=." /app/.env.new || { echo "!! secrets/prod.env: $key missing — refusing to deploy"; rm -f /app/.env.new; exit 1; }
  done
  mv /app/.env.new /app/.env

  # Keep the image that is currently running for one-command rollback:
  #   ssh server 'cd /app && sudo docker tag aarogya-server:previous aarogya-server:latest'
  #   …then re-run ./deploy.sh (old code lands on the idle slot).
  sudo docker tag aarogya-server:latest aarogya-server:previous 2>/dev/null || true

  sudo docker load < /tmp/aarogya-server.tar.gz
  rm -f /tmp/aarogya-server.tar.gz

  # Keep the live database user in sync with the rotated secret (the
  # container env only takes effect at initdb; existing volumes need ALTER).
  # Socket auth via compose exec needs no password. Skipped harmlessly on a
  # pristine box — initdb picks the env password up instead.
  PW=$(grep '^POSTGRES_PASSWORD=' /app/.env | cut -d= -f2-)
  $COMPOSE up -d postgres </dev/null >/dev/null
  $COMPOSE exec -T postgres psql -U aarogya -d aarogyaruchi -c "ALTER USER aarogya WITH PASSWORD '$PW';" </dev/null >/dev/null 2>&1 \
    || echo "    (postgres not reachable for ALTER — initdb path will use the env password)"

  # Infra reconcile: a no-op when nothing changed; the API slots are never
  # touched here. Valkey gets its requirepass the first time these flags
  # ship (AOF replays; sessions survive). NOTE: the old slot keeps serving
  # without the valkey password until the cutover below — a one-time
  # degraded window measured in seconds during this secrets transition.
  $COMPOSE up -d postgres valkey caddy adminer redis-commander </dev/null
  for i in $(seq 1 30); do
    $COMPOSE exec -T postgres pg_isready -U aarogya -d aarogyaruchi </dev/null >/dev/null 2>&1 && break
    sleep 1
  done

  # Migrations run as a controlled pre-step while the old slot keeps
  # serving — keep them backward-compatible (expand/contract). The one-shot
  # exits after applying pending versions.
  # </dev/null: compose exec/run forward their stdin to the container,
  # which would otherwise swallow the rest of this heredoc.
  echo "==> Running migrations (pre-switch)..."
  $COMPOSE run --rm -T --no-deps server-blue ./server -migrate-only </dev/null

  slot_health() {
    sudo docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' aarogya-server-$1 2>/dev/null || echo missing
  }

  ACTIVE=""; INACTIVE=""
  if [ "$(slot_health blue)" = "healthy" ]; then ACTIVE=blue; INACTIVE=green
  elif [ "$(slot_health green)" = "healthy" ]; then ACTIVE=green; INACTIVE=blue
  else
    # First deploy of the slot layout: the pre-split single container
    # ("aarogya-server") may still be serving — bootstrap blue alongside
    # it, then retire it after the Caddy reload below.
    ACTIVE=legacy; INACTIVE=blue
  fi
  echo "==> Active: $ACTIVE → deploying to slot: $INACTIVE"

  $COMPOSE up -d server-$INACTIVE </dev/null
  echo -n "==> Waiting for server-$INACTIVE to become healthy"
  for i in $(seq 1 60); do
    [ "$(slot_health $INACTIVE)" = "healthy" ] && break
    echo -n "."
    sleep 1
  done
  if [ "$(slot_health $INACTIVE)" != "healthy" ]; then
    echo ""
    echo "!! server-$INACTIVE never became healthy — aborting; the active slot was never touched."
    echo "   Logs: ssh server 'cd /app && sudo docker compose --profile local --profile proxy --profile green logs --tail 50 server-$INACTIVE'"
    $COMPOSE rm -f server-$INACTIVE >/dev/null 2>&1 || true
    exit 1
  fi
  echo " healthy."

  # Shift Caddy to the new upstream set. Graceful (no dropped connections);
  # a no-op when the Caddyfile is unchanged. Caddy's health checks route
  # around the slot that is about to stop.
  $COMPOSE exec -T caddy caddy reload --config /etc/caddy/Caddyfile </dev/null

  if [ "$ACTIVE" = "legacy" ]; then
    # Retire the pre-split container. Both it and blue answer to the
    # "server" DNS alias, so traffic had already shifted when blue came up
    # healthy and the reload picked the explicit slot upstreams.
    sudo docker stop -t 30 aarogya-server >/dev/null 2>&1 || true
    sudo docker rm -f aarogya-server >/dev/null 2>&1 || true
  else
    # Drain the old slot: SIGTERM lets Go finish in-flight requests (30s
    # window); WS clients reconnect to the new slot on their own backoff.
    $COMPOSE stop --timeout 30 server-$ACTIVE
    $COMPOSE rm -f server-$ACTIVE >/dev/null
  fi

  echo "==> Deployment complete! Active slot: $INACTIVE"
  $COMPOSE ps
EOF

# Local cleanup
rm -f /tmp/aarogya-server.tar.gz

echo "==> Done. Verify with: curl -s https://api.aarogyaruchi.com/health"
