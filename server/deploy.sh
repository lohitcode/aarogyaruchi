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
ssh $SERVER "sudo mkdir -p /app && sudo chown ubuntu:ubuntu /app"
scp /tmp/aarogya-server.tar.gz $SERVER:/tmp/
scp docker-compose.yml Caddyfile $SERVER:/app/

# First deploy only: seed /app/.env. The Z.AI key is piped over stdin from
# the local .env so it never appears in command lines, output, or the repo.
if ! ssh $SERVER 'test -f /app/.env'; then
  if ! grep -q '^ZAI_API_KEY=.' .env 2>/dev/null; then
    echo "!! Server has no /app/.env and the local .env has no ZAI_API_KEY." >&2
    echo "   Add the key to server/.env and re-run." >&2
    exit 1
  fi
  echo "==> Seeding /app/.env (first deploy)..."
  PG_USER=$(grep 'POSTGRES_USER:' docker-compose.yml | awk '{print $2}')
  PG_PASS=$(grep 'POSTGRES_PASSWORD:' docker-compose.yml | awk '{print $2}')
  PG_DB=$(grep 'POSTGRES_DB:' docker-compose.yml | awk '{print $2}')
  ssh $SERVER "cat > /app/.env" <<EOF
ENV=production
PORT=8080
DATABASE_URL=postgres://${PG_USER}:${PG_PASS}@postgres:5432/${PG_DB}?sslmode=disable
CACHE_URL=valkey:6379
MSG91_AUTH_KEY=
MSG91_TEMPLATE_ID=
ZAI_MODEL=glm-4.7
ZAI_BASE_URL=https://api.z.ai/api/paas/v4
CHAT_ALLOWED_ORIGINS=https://aarogyaruchi.com
ALLOWED_ORIGINS=https://aarogyaruchi.com,https://www.aarogyaruchi.com,https://admin.aarogyaruchi.com
OTP_FIXED_ENABLED=false
SEED_ADMIN_PHONES=
SEED_PARTNER_PHONES=
PARTNER_TOKEN_SECRET=
BUSINESS_TIMEZONE=Asia/Kolkata
R2_UPLOAD_SECRET=
IMAGES_CDN_BASE=https://images-cdn.lohit.workers.dev
EOF
  grep '^ZAI_API_KEY=.' .env | ssh $SERVER 'cat >> /app/.env && chmod 600 /app/.env'
fi

echo "==> Deploying on server (blue-green, zero downtime)..."
ssh $SERVER << 'EOF'
  set -e
  cd /app
  COMPOSE="sudo docker compose --profile local --profile proxy --profile green"

  # Keep the image that is currently running for one-command rollback:
  #   ssh server 'cd /app && sudo docker tag aarogya-server:previous aarogya-server:latest'
  #   …then re-run ./deploy.sh (old code lands on the idle slot).
  sudo docker tag aarogya-server:latest aarogya-server:previous 2>/dev/null || true

  sudo docker load < /tmp/aarogya-server.tar.gz
  rm -f /tmp/aarogya-server.tar.gz

  # Infra reconcile: a no-op when nothing changed; the API slots are never
  # touched here. (Valkey is recreated only when its flags change — a
  # one-time event; its AOF replays and every session survives.)
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
