#!/bin/bash
# One-shot privileged bootstrap for the DEV box (ssh dev-server, Fedora 44).
# Run ONCE as root; idempotent. Afterwards `./deploy-dev.sh` needs no sudo:
#
#   ssh dev-server 'sudo bash -s' < server/scripts/dev-box-bootstrap.sh
#
# Installs Docker Engine (docker-ce repo, moby-engine fallback) so the box
# matches prod, adds $SUDO_USER to the docker group (passwordless docker),
# and opens 8080/tcp in firewalld so the dev API is reachable on the LAN.

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "!! Run as root: ssh dev-server 'sudo bash -s' < $0" >&2
  exit 1
fi
USER_NAME="${SUDO_USER:-rudra}"

echo "==> Installing Docker Engine..."
if dnf -y install dnf-plugins-core \
   && dnf config-manager addrepo --from-repofile=https://download.docker.com/linux/fedora/docker-ce.repo \
   && dnf -y install docker-ce docker-ce-cli containerd.io docker-compose-plugin; then
  echo "    docker-ce installed"
else
  echo "    docker-ce repo unavailable; falling back to Fedora's moby-engine"
  dnf -y install moby-engine docker-compose
  # docker-compose (v2 binary) as a CLI plugin so `docker compose` works.
  install -d -o "$USER_NAME" -g "$USER_NAME" "/home/$USER_NAME/.docker/cli-plugins"
  ln -sf /usr/bin/docker-compose "/home/$USER_NAME/.docker/cli-plugins/docker-compose"
  chown -h "$USER_NAME:$USER_NAME" "/home/$USER_NAME/.docker/cli-plugins/docker-compose"
fi

echo "==> Enabling + starting docker..."
systemctl enable --now docker

echo "==> Adding $USER_NAME to the docker group..."
usermod -aG docker "$USER_NAME"

echo "==> Opening 8080/tcp in firewalld (LAN access to the dev API)..."
firewall-cmd --add-port=8080/tcp --permanent >/dev/null
firewall-cmd --reload >/dev/null

echo "==> Adding dev-api.lohitcode.com to the root cloudflared ingress..."
# Idempotent: the rootless podman deploy also runs its own connector
# container for this hostname; both route to localhost:8080, so whichever
# connector serves the request is fine.
if ! grep -q "dev-api.lohitcode.com" /etc/cloudflared/config.yml; then
  sed -i 's|^  - service: http_status:404|  - hostname: dev-api.lohitcode.com\n    service: http://localhost:8080\n  - service: http_status:404|' \
    /etc/cloudflared/config.yml
  systemctl restart cloudflared
fi

echo "==> Done. Log out and back in on the dev box (new group), then from"
echo "    the repo: cd server && ./deploy-dev.sh"
docker --version
