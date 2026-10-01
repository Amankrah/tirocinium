#!/usr/bin/env bash
# One-time bootstrap of the Tirocinium host (decision 0091).
#
# Idempotent: safe to re-run after a failure. It installs system packages,
# makes the service user and the directories it owns, fetches the pinned
# pdfium binary, and installs the unit files. It deliberately does NOT create
# the professor account: the one way to make an account is the product's own
# signup, which the allowlist narrows to a single address.
set -euo pipefail

APP_DIR=/opt/tirocinium/app
DATA_DIR=/var/lib/tirocinium/data
ETC_DIR=/etc/tirocinium
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ $EUID -ne 0 ]]; then
  echo "Run as root (sudo $0)" >&2
  exit 1
fi

echo "==> packages"
apt-get update -qq
apt-get install -y -qq \
  python3.12 python3.12-venv python3-pip \
  redis-server caddy git git-lfs curl unzip \
  build-essential pkg-config

echo "==> service user and directories"
id -u tirocinium >/dev/null 2>&1 || useradd --system --home /opt/tirocinium --shell /usr/sbin/nologin tirocinium
install -d -o tirocinium -g tirocinium -m 0750 /opt/tirocinium "$APP_DIR" "$DATA_DIR" "$DATA_DIR/courses"
install -d -o root -g tirocinium -m 0750 "$ETC_DIR"

if [[ ! -f "$ETC_DIR/tirocinium.env" ]]; then
  install -o root -g tirocinium -m 0640 "$HERE/tirocinium.env.example" "$ETC_DIR/tirocinium.env"
  echo "    wrote $ETC_DIR/tirocinium.env from the template; fill it in before starting"
fi

echo "==> pdfium"
# The version pin lives in one place and this is not it: provision-pdfium.sh
# is the same script setup.sh and CI use, so the host cannot drift to a
# different build from the one the tests ran against.
sudo -u tirocinium bash "$HERE/../provision-pdfium.sh" || true

echo "==> litestream"
if ! command -v litestream >/dev/null 2>&1; then
  LS_VERSION=0.3.13
  ARCH="$(dpkg --print-architecture)"
  curl -fsSL -o /tmp/litestream.deb \
    "https://github.com/benbjohnson/litestream/releases/download/v${LS_VERSION}/litestream-v${LS_VERSION}-linux-${ARCH}.deb"
  dpkg -i /tmp/litestream.deb
  rm -f /tmp/litestream.deb
fi
install -o root -g root -m 0644 "$HERE/litestream.yml" /etc/litestream.yml

echo "==> units"
install -o root -g root -m 0644 \
  "$HERE/tirocinium-api.service" \
  "$HERE/tirocinium-worker.service" \
  "$HERE/tirocinium-web.service" \
  /etc/systemd/system/
install -o root -g root -m 0644 "$HERE/Caddyfile" /etc/caddy/Caddyfile
systemctl daemon-reload

echo "==> redis"
systemctl enable --now redis-server

cat <<'NEXT'

Provisioned. What is left, in order:

  1. Fill /etc/tirocinium/tirocinium.env (JWT secret, model keys, buckets).
     openssl rand -hex 32   generates the JWT secret.
  2. Deploy the application into /opt/tirocinium/app (see the runbook).
  3. Restore the course data (see the runbook).
  4. systemctl enable --now litestream tirocinium-api tirocinium-worker \
       tirocinium-web caddy
  5. Sign up once, at https://tirocinium.sasellab.com/sign-up, as the one
     address on the allowlist. Nobody else can.

NEXT
