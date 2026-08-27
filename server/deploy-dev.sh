#!/bin/bash
set -e

# Deploy to the DEV host — the home-lab box behind the `dev-server` ssh
# alias (Cloudflare tunnel). Normally you don't call this directly:
# ../deploy.sh routes here automatically for any non-main branch (and
# accepts --target=dev to force it from main).
#
# Mirrors deploy.sh (local cross-compile, ship only the final image) with
# dev differences:
#
#   - CPU arch auto-detected from the box (amd64 or arm64).
#   - Container engine auto-detected: docker if usable (post-bootstrap),
#     else rootless podman (no sudo needed; containers survive ssh logout
#     on this box, but after a REBOOT re-run this script — or `podman start
#     postgres valkey server tunnel` — since rootless restart policies do
#     not fire pre-login).
#   - Deploy dir is ~/aarogya-dev (no root-owned /app).
#   - ONLY the API stack runs: NO Caddy/Adminer/redis-commander — the prod
#     Caddyfile would request TLS certs for hostnames that point at the
#     Tencent box. The API answers on <box-ip>:8080 and publicly at
#     https://dev-api.lohitcode.com via a rootless cloudflared connector
#     container on the same tunnel (idempotent with the root connector's
#     ingress rule added by dev-box-bootstrap.sh; both route to :8080).
#   - First deploy seeds a dev .env: fixed OTP 123456, test seed accounts,
#     SameSite=None session cookies (the dev website lives on
#     *.workers.dev — a different registrable domain than the API), and
#     CORS for the dev website origin. Secrets are piped from the local
#     server/.env.
#
# Usage:
#   ./deploy-dev.sh             normal deploy (migrations run pre-switch)
#   ./deploy-dev.sh --reset-db  also wipe the dev Postgres/Valkey volumes
#                               (fresh DB; all dev data is disposable)

SERVER="dev-server"
DIR="aarogya-dev"
IMAGE_NAME="docker.io/library/aarogya-server"
PROFILE="--profile local"
DEV_API_HOST="dev-api.aarogyaruchi.com"
DEV_API_ALIAS="dev-api.lohitcode.com"   # working alias until/unless the
                                        # aarogyaruchi.com CNAME exists
DEV_SITE_ORIGIN="https://dev.aarogyaruchi.com"
DEV_ADMIN_ORIGIN="https://dev-admin.aarogyaruchi.com"
# Dedicated tunnel for the public dev API. NOT the box tunnel: with
# locally-managed tunnels the edge load-balances across ALL connectors of
# a tunnel regardless of per-connector ingress, so sharing the ssh tunnel
# lands dev-api requests on the root connector's 404 catch-all.
TUNNEL_ID="bb8db68b-9ab7-46cd-90a3-eeecd8f31acd"

cd "$(dirname "$0")"   # server/ — go build, .env, tmp/ resolve from here

echo "==> Probing dev box (arch, engine, deploy dir)..."
ARCH=$(ssh $SERVER 'uname -m')
case "$ARCH" in
  x86_64)  GOARCH=amd64 ;;
  aarch64) GOARCH=arm64 ;;
  *) echo "!! Unsupported arch on dev box: $ARCH" >&2; exit 1 ;;
esac
ENGINE=$(ssh $SERVER 'docker ps >/dev/null 2>&1 && echo docker || { podman info >/dev/null 2>&1 && echo podman || echo none; }')
if [ "$ENGINE" = "none" ]; then
  echo "!! No docker or podman usable on the dev box." >&2
  exit 1
fi
echo "    arch=$ARCH  engine=$ENGINE"
ssh $SERVER "mkdir -p $DIR"

echo "==> Cross-compiling linux/$GOARCH binary (native toolchain, no emulation)..."
mkdir -p tmp
CGO_ENABLED=0 GOOS=linux GOARCH=$GOARCH go build -ldflags="-w -s" -o tmp/server-linux-$GOARCH ./cmd/server

echo "==> Packaging final runtime image..."
docker build --platform linux/$GOARCH --build-arg BIN=tmp/server-linux-$GOARCH \
  -f Dockerfile.prebuilt -t aarogya-server .

echo "==> Saving image..."
docker save aarogya-server | gzip > /tmp/aarogya-server.tar.gz

echo "==> Copying files to dev box..."
scp -q /tmp/aarogya-server.tar.gz $SERVER:/tmp/
scp -q docker-compose.yml Caddyfile.dev $SERVER:$DIR/

if [ "$1" = "--reset-db" ]; then
  echo "==> --reset-db: wiping dev database and cache volumes..."
  if [ "$ENGINE" = "docker" ]; then
    ssh $SERVER "cd $DIR && docker compose $PROFILE down -v </dev/null" || true
  else
    ssh $SERVER "podman rm -f server tunnel postgres valkey >/dev/null 2>&1; podman volume rm aarogya-dev-pg-data aarogya-dev-valkey-data >/dev/null 2>&1; true"
  fi
fi

# Hydrate the dev .env from the sops-encrypted env on every deploy. The
# box's own age key is the only reader; rotating = edit
# server/secrets/dev.env (sops), commit, re-run. Replaces the old
# first-deploy seeding — no plaintext secret ever ships over the wire.
ssh $SERVER "mkdir -p $DIR/secrets"
scp -q secrets/dev.env $SERVER:$DIR/secrets/dev.env
ssh $SERVER << 'HYD'
  set -e
  cd ~/aarogya-dev
  export PATH="$HOME/.local/bin:$PATH"
  command -v sops >/dev/null || { echo "!! sops not installed on the dev box"; exit 1; }
  sops -d --output .env.new secrets/dev.env 2>/dev/null
  chmod 600 .env.new
  grep -q '^ENV=development$' .env.new || { echo "!! secrets/dev.env: ENV=development missing"; rm -f .env.new; exit 1; }
  for key in POSTGRES_PASSWORD VALKEY_PASSWORD DATABASE_URL PARTNER_TOKEN_SECRET; do
    grep -q "^$key=." .env.new || { echo "!! secrets/dev.env: $key missing"; rm -f .env.new; exit 1; }
  done
  mv .env.new .env
  echo "==> dev .env hydrated (sops)"
HYD

echo "==> Preparing dev-api tunnel connector config..."
# The dedicated tunnel's credentials live on the deploy machine; ship a
# copy alongside the ingress config (dev API only, 404 catch-all).
scp -q ~/.cloudflared/$TUNNEL_ID.json $SERVER:$DIR/tunnel-creds.json
ssh $SERVER << EOF
  set -e
  chmod 600 $DIR/tunnel-creds.json
  cat > $DIR/tunnel.yml <<YML
tunnel: $TUNNEL_ID
credentials-file: /etc/cloudflared/creds.json
ingress:
  - hostname: $DEV_API_HOST
    service: http://server:8080
  - hostname: $DEV_API_ALIAS
    service: http://server:8080
  - hostname: dev-db.aarogyaruchi.com
    service: http://caddy:80
  - hostname: dev-cache.aarogyaruchi.com
    service: http://caddy:80
  - service: http_status:404
YML
EOF

echo "==> Deploying on dev box (engine: $ENGINE)..."
if [ "$ENGINE" = "docker" ]; then
  ssh $SERVER << EOF
    set -e
    cd $DIR
    docker load < /tmp/aarogya-server.tar.gz
    rm -f /tmp/aarogya-server.tar.gz

    # Dev keeps a host port on the blue slot (LAN + health verify); prod
    # slots publish nothing. Written every deploy — idempotent.
    cat > docker-compose.override.yml <<'OVR'
services:
  server-blue:
    ports: !override
      - "8080:8080"
OVR

    # Retire the pre-split single API container if present: it publishes
    # host :8080, which the blue slot above wants. No-op after the first
    # slot-layout deploy.
    docker stop -t 30 aarogya-server >/dev/null 2>&1 || true
    docker rm -f aarogya-server >/dev/null 2>&1 || true

    # Migrations run as a controlled pre-step (same as prod). -T: docker
    # compose would otherwise swallow the rest of this heredoc's stdin.
    echo "==> Running migrations (pre-switch)..."
    docker compose $PROFILE up -d postgres valkey </dev/null
    for i in \$(seq 1 30); do
      docker compose exec -T postgres pg_isready -U aarogya -d aarogyaruchi </dev/null >/dev/null 2>&1 && break
      sleep 1
    done
    # Keep the live DB user in sync with the hydrated secret (env applies
    # only at initdb; the dev volume persists across recreates).
    PGPW=\$(grep '^POSTGRES_PASSWORD=' .env | cut -d= -f2-)
    docker compose $PROFILE exec -T postgres psql -U aarogya -d postgres -c "ALTER USER aarogya WITH PASSWORD '\$PGPW';" </dev/null >/dev/null
    docker compose run --rm -T --no-deps server-blue ./server -migrate-only </dev/null

    # --remove-orphans retires the pre-split "server" service container on
    # the first deploy of the slot layout. Dev pins a single slot (blue);
    # blue-green cutover is a prod-only concern.
    docker compose $PROFILE up -d --remove-orphans </dev/null
    echo "==> Deployment complete!"
    docker compose $PROFILE ps
EOF
else
  ssh $SERVER << EOF
    set -e
    cd $DIR
    podman load -i /tmp/aarogya-server.tar.gz >/dev/null
    rm -f /tmp/aarogya-server.tar.gz

    echo "==> Recreating containers (volumes persist)..."
    podman rm -f server tunnel caddy adminer redis-commander postgres valkey >/dev/null 2>&1 || true
    podman network create aarogya-dev >/dev/null 2>&1 || true
    podman volume create aarogya-dev-pg-data >/dev/null 2>&1 || true
    podman volume create aarogya-dev-valkey-data >/dev/null 2>&1 || true

    PGPW=\$(grep '^POSTGRES_PASSWORD=' .env | cut -d= -f2-)
    VKPW=\$(grep '^VALKEY_PASSWORD=' .env | cut -d= -f2-)
    podman run -d --name postgres --network aarogya-dev --restart=always \
      -v aarogya-dev-pg-data:/var/lib/postgresql/data \
      -e POSTGRES_USER=aarogya -e POSTGRES_PASSWORD=\$PGPW -e POSTGRES_DB=aarogya_ruchi \
      docker.io/library/postgres:16-alpine >/dev/null
    podman run -d --name valkey --network aarogya-dev --restart=always \
      -v aarogya-dev-valkey-data:/data \
      docker.io/valkey/valkey:8-alpine \
      valkey-server --maxmemory 192mb --maxmemory-policy noeviction --appendonly yes --appendfsync always --requirepass "\$VKPW" >/dev/null

    echo "==> Running migrations (pre-switch)..."
    for i in \$(seq 1 30); do
      podman exec postgres pg_isready -U aarogya -d aarogyaruchi >/dev/null 2>&1 && break
      sleep 1
    done
    # Existing volume: env password applies only at initdb, so sync the
    # live user with the hydrated secret.
    podman exec postgres psql -U aarogya -d postgres -c "ALTER USER aarogya WITH PASSWORD '\$PGPW';" >/dev/null
    podman run --rm --network aarogya-dev --env-file .env \
      $IMAGE_NAME:latest ./server -migrate-only

    podman run -d --name server --network aarogya-dev --restart=always \
      --env-file .env -p 8080:8080 $IMAGE_NAME:latest >/dev/null

    # DB/cache web UIs (prod parity), gated by the basic-auth caddy above —
    # never route these hostnames straight to adminer/redis-commander.
    podman run -d --name adminer --network aarogya-dev --restart=always \
      -e ADMINER_DEFAULT_SERVER=postgres docker.io/library/adminer:4 >/dev/null
    podman run -d --name redis-commander --network aarogya-dev --restart=always \
      -e REDIS_HOST=valkey -e REDIS_PORT=6379 -e REDIS_PASSWORD=\$VKPW \
      docker.io/rediscommander/redis-commander:latest >/dev/null
    podman run -d --name caddy --network aarogya-dev --restart=always \
      --security-opt label=disable \
      -v ./Caddyfile.dev:/etc/caddy/Caddyfile:ro \
      docker.io/library/caddy:2-alpine >/dev/null

    # Public dev API connector on the shared tunnel (ingress above).
    # label=disable: :Z relabeling races with container recreation on
    # redeploy (files keep the previous container's MCS categories and the
    # new one gets EACCES). Rootless userns + 0600 creds keep it safe.
    # --user 0:0: the cloudflared image's non-root uid maps to a foreign
    # host uid under rootless podman and cannot read the 0600 creds copy;
    # container-uid 0 maps to rudra.
    podman run -d --name tunnel --network aarogya-dev --restart=always \
      --user 0:0 --security-opt label=disable \
      -v ./tunnel.yml:/etc/cloudflared/config.yml:ro \
      -v ./tunnel-creds.json:/etc/cloudflared/creds.json:ro \
      docker.io/cloudflare/cloudflared:latest \
      tunnel --no-autoupdate run >/dev/null

    echo "==> Deployment complete!"
    podman ps --format "{{.Names}}  {{.Status}}"
EOF
fi

rm -f /tmp/aarogya-server.tar.gz

echo "==> Verifying health..."
ssh $SERVER "for i in \$(seq 1 20); do curl -sf localhost:8080/health >/dev/null 2>&1 && break; sleep 1; done; curl -s -o /dev/null -w 'local:  HTTP %{http_code}\n' localhost:8080/health"
# The alias always works; DEV_API_HOST needs its DNS CNAME to exist
# (aarogyaruchi.com zone — manual dashboard record, see README).
wait_public() {
  for i in $(seq 1 12); do
    CODE=$(curl -s -o /dev/null -m 8 -w "%{http_code}" https://$1/health 2>/dev/null)
    [ "$CODE" = "200" ] && return 0
    sleep 2
  done
  return 1
}
if wait_public $DEV_API_HOST; then
  echo "public: HTTP 200 (https://$DEV_API_HOST)"
elif wait_public $DEV_API_ALIAS; then
  echo "public: HTTP 200 via alias only (https://$DEV_API_ALIAS)"
  echo "    note: $DEV_API_HOST DNS CNAME missing — add it to Cloudflare:"
  echo "    $DEV_API_HOST CNAME $TUNNEL_ID.cfargotunnel.com (proxied)"
else
  echo "!! Public dev API not healthy on either hostname." >&2
  exit 1
fi
echo "==> Done. Dev site: $DEV_SITE_ORIGIN (admin login +919000000001, OTP 123456)."
