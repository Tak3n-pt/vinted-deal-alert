#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/vinted-deal-alert}"
APP_USER="${APP_USER:-vintedbot}"
SERVICE_NAME="${SERVICE_NAME:-vinted-dashboard}"
PORT="${PORT:-3000}"

if ! command -v sudo >/dev/null 2>&1; then
  echo "sudo is required on the target VM" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1 || ! node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 22 ? 0 : 1)"; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

sudo useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER" 2>/dev/null || true
sudo mkdir -p "$APP_DIR/data"
sudo chown -R "$APP_USER:$APP_USER" "$APP_DIR"

if [ ! -f "$APP_DIR/.env" ]; then
  sudo tee "$APP_DIR/.env" >/dev/null <<EOF
PROVIDER_TYPE=apify
APIFY_ACTOR_ID=epicscrapers~vinted-search-scraper
APIFY_TOKEN=
DISCORD_WEBHOOK_URL=
POLL_INTERVAL_SECONDS=900
PROVIDER_TIMEOUT_SECONDS=20
MAX_PRODUCTS_PER_SCAN=100
HEARTBEAT_EVERY_SCANS=4
DATABASE_PATH=$APP_DIR/data/deals.sqlite
RUN_ON_START=false
DRY_RUN=true
DASHBOARD_PORT=$PORT
DASHBOARD_ADMIN_PASSWORD=change-this-password
DASHBOARD_COOKIE_SECURE=false
EOF
  sudo chown "$APP_USER:$APP_USER" "$APP_DIR/.env"
  sudo chmod 600 "$APP_DIR/.env"
fi

sudo tee "/etc/systemd/system/$SERVICE_NAME.service" >/dev/null <<EOF
[Unit]
Description=Vinted Deal Alert Dashboard
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
ExecStart=$(command -v node) $APP_DIR/dist/src/dashboardServer.js
Restart=always
RestartSec=10
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"
sudo systemctl --no-pager --full status "$SERVICE_NAME"
