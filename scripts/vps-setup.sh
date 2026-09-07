#!/usr/bin/env bash
# One-shot provisioning script for a fresh Ubuntu VPS (tested on Oracle Cloud
# Ampere Always Free). Installs Node.js, nginx, clones this repo, builds it,
# and runs it as a systemd service behind an nginx reverse proxy on port 80.
#
# Usage (as root, e.g. via sudo):
#   curl -fsSL https://raw.githubusercontent.com/Mrdjdark777-gif/Mrdjdark777-/claude/read-link-content-h18psv/scripts/vps-setup.sh | sudo bash
#
# Safe to re-run: it pulls the latest code and restarts the service without
# touching an existing .env or database.
set -euo pipefail

REPO_URL="https://github.com/Mrdjdark777-gif/Mrdjdark777-.git"
BRANCH="claude/read-link-content-h18psv"
APP_DIR="/opt/truethrills"
NODE_MAJOR=22

if [ "$(id -u)" -ne 0 ]; then
  echo "Запусти через sudo: sudo bash vps-setup.sh" >&2
  exit 1
fi

echo "== 1/7: системные пакеты =="
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg git nginx build-essential python3 ufw openssl

echo "== 2/7: Node.js ${NODE_MAJOR}.x =="
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed 's/^v//;s/\..*//')" -lt "$NODE_MAJOR" ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi

echo "== 3/7: код приложения =="
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch origin "$BRANCH"
  git -C "$APP_DIR" checkout "$BRANCH"
  if [ -n "$(git -C "$APP_DIR" status --porcelain --untracked-files=no)" ]; then
    echo "Есть локальные изменения в коде. Сохрани их перед обновлением." >&2
    exit 1
  fi
  git -C "$APP_DIR" merge --ff-only "origin/$BRANCH"
else
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
mkdir -p "$APP_DIR/data"

echo "== 4/7: .env =="
if [ ! -f "$APP_DIR/.env" ]; then
  GEN_SESSION_SECRET=$(openssl rand -base64 32)
  GEN_ADMIN_PASSWORD=$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9' | cut -c1-16)
  cat > "$APP_DIR/.env" <<EOF
ADMIN_PASSWORD=${GEN_ADMIN_PASSWORD}
SESSION_SECRET=${GEN_SESSION_SECRET}
DATABASE_PATH=${APP_DIR}/data/truethrills.db
STORAGE_DIR=${APP_DIR}/data/storage
PORT=3000
NODE_ENV=production
EOF
  chmod 600 "$APP_DIR/.env"
  GENERATED_NEW_ENV=1
else
  echo ".env уже существует — не меняю."
  GENERATED_NEW_ENV=0
fi

# Export everything except NODE_ENV: with NODE_ENV=production set, `npm ci`
# skips devDependencies (drizzle-kit, typescript, tailwindcss...), which
# breaks the migrate/build steps below. NODE_ENV=production is still applied
# correctly at runtime via the systemd unit's EnvironmentFile.
set -a
# shellcheck disable=SC1090
source <(grep -v '^NODE_ENV=' "$APP_DIR/.env")
set +a

echo "== 5/7: сборка =="
cd "$APP_DIR"
npm ci --include=dev
npm run db:migrate
npm run build

echo "== 6/7: systemd-сервис =="
cat > /etc/systemd/system/truethrills.service <<EOF
[Unit]
Description=True Thrills
After=network.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
ExecStart=$(command -v node) ${APP_DIR}/node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable truethrills
systemctl restart truethrills

echo "== 7/7: nginx + firewall =="
# Preserve an existing domain/TLS configuration, especially Certbot changes.
if [ ! -s /etc/nginx/sites-available/truethrills ]; then
cat > /etc/nginx/sites-available/truethrills <<'NGINX'
server {
    listen 80;
    server_name _;

    client_max_body_size 90M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX
else
  echo 'Существующая конфигурация nginx сохранена (включая HTTPS).'
fi
ln -sf /etc/nginx/sites-available/truethrills /etc/nginx/sites-enabled/truethrills
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

ufw allow OpenSSH || true
ufw allow 80/tcp || true
ufw allow 443/tcp || true
ufw --force enable || true

# Oracle's Ubuntu images ship extra iptables rules on top of ufw.
iptables -C INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || iptables -I INPUT -p tcp --dport 80 -j ACCEPT
iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || iptables -I INPUT -p tcp --dport 443 -j ACCEPT
netfilter-persistent save >/dev/null 2>&1 || true

echo "=================================================="
echo "Готово. Открой свой HTTPS-домен. Для первичной настройки без домена доступен HTTP по IP."
if [ "${GENERATED_NEW_ENV:-0}" = "1" ]; then
  echo "Пароль автора (сохрани, показывается один раз): ${ADMIN_PASSWORD}"
fi
echo "Не забудь также открыть порты 80 и 443 в Oracle Console:"
echo "Networking -> Virtual Cloud Networks -> твоя VCN -> Security Lists -> Default Security List -> Add Ingress Rules"
echo "=================================================="
