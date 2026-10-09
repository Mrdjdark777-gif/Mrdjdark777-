#!/usr/bin/env bash
# Run on the VPS after the domain's A record points to this server.
set -euo pipefail
if [ "$(id -u)" -ne 0 ]; then echo 'Запусти через sudo.' >&2; exit 1; fi
DOMAIN=${1:-}
if [[ ! "$DOMAIN" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$ ]] || [ "${#DOMAIN}" -gt 253 ] || [[ "$DOMAIN" =~ ^[0-9.]+$ ]]; then
  echo 'Использование: sudo bash scripts/enable-https.sh example.com (без https:// и пути)' >&2; exit 1
fi
CONF=/etc/nginx/sites-available/truethrills
if [ ! -s "$CONF" ]; then echo 'Сначала установи приложение через vps-setup.sh.' >&2; exit 1; fi
if ! getent ahosts "$DOMAIN" >/dev/null; then echo 'Домен ещё не определяется через DNS. Проверь A-запись.' >&2; exit 1; fi
apt-get update -y
apt-get install -y certbot python3-certbot-nginx
BACKUP="${CONF}.before-https-$(date +%Y%m%d-%H%M%S)"
cp -a "$CONF" "$BACKUP"
# Replace only the initial catch-all, not other virtual hosts or an existing certificate.
python3 - "$CONF" "$DOMAIN" <<'PY'
import pathlib,re,sys
p=pathlib.Path(sys.argv[1]);s=p.read_text();s=re.sub(r'(?m)^(\s*server_name\s+)_\s*;',lambda m:m[1]+sys.argv[2]+';',s);p.write_text(s)
PY
if ! nginx -t; then cp -a "$BACKUP" "$CONF"; echo 'Исходная конфигурация восстановлена.' >&2; exit 1; fi
systemctl reload nginx
# Certbot asks for contact details/terms interactively; do not invent or accept them for the owner.
certbot --nginx --redirect -d "$DOMAIN"
nginx -t
systemctl reload nginx
systemctl enable --now certbot.timer
python3 - "$DOMAIN" <<'PYENV'
import pathlib,re,sys
p=pathlib.Path('/opt/truethrills/.env')
if p.exists():
 s=p.read_text();s=re.sub(r'(?m)^PUBLIC_SITE_URL=.*\n?', '', s);p.write_text(s.rstrip()+'\nPUBLIC_SITE_URL=https://'+sys.argv[1]+'\n');p.chmod(0o600)
PYENV
systemctl restart truethrills
printf 'HTTPS настроен: https://%s/\nРезервная копия nginx: %s\n' "$DOMAIN" "$BACKUP"
echo 'Проверь вход и микрофон. Проверка продления: sudo certbot renew --dry-run'
