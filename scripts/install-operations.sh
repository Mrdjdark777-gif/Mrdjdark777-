#!/usr/bin/env bash
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo 'Run with sudo.' >&2; exit 1; }
cd /opt/truethrills
command -v ffmpeg >/dev/null || { echo 'Install ffmpeg first: sudo apt-get install ffmpeg' >&2; exit 1; }
command -v ffprobe >/dev/null

# Постоянно работающие процессы не должны быть root. Приложение принимает
# запросы из интернета, воркер запускает ffmpeg над присланными кусками звука;
# ошибка в любом из них не должна давать доступ ко всей машине. Отдельный
# системный пользователь без оболочки владеет только тем, что ему нужно:
# данными и каталогом бэкапов.
#
# Обслуживание остаётся отдельно и остаётся от root: truethrills-backup.service
# останавливает и запускает сервисы, а это systemctl.
id -u truethrills >/dev/null 2>&1 || useradd --system --home-dir /opt/truethrills --shell /usr/sbin/nologin truethrills
install -d -m 700 -o truethrills -g truethrills /var/backups/truethrills
# Каталоги данных и сборки пишет сам сервис; код и node_modules ему достаточно
# читать, но после `npm ci` от root они принадлежат root, а .next сервис
# переписывает. Проще и надёжнее отдать ему весь каталог приложения.
chown -R truethrills:truethrills /opt/truethrills
chmod 600 /opt/truethrills/.env 2>/dev/null || true
# Иначе git от root ругается на «dubious ownership» при следующем обновлении.
git config --global --add safe.directory /opt/truethrills 2>/dev/null || true
cat > /etc/systemd/system/truethrills-live.service <<'UNIT'
[Unit]
Description=True Thrills live delivery and recording
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
User=truethrills
Group=truethrills
WorkingDirectory=/opt/truethrills
RuntimeDirectory=truethrills-live
ExecStart=/usr/bin/flock -n /run/truethrills-live/worker.lock /usr/bin/env node --env-file=.env scripts/live-worker.mjs
Restart=on-failure
RestartSec=5
TimeoutStopSec=140
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
[Install]
WantedBy=multi-user.target
UNIT
# Остаётся от root осознанно: снимает копию с остановленными сервисами, то есть
# вызывает systemctl. Это административная операция, а не рабочий процесс.
cat > /etc/systemd/system/truethrills-backup.service <<'UNIT'
[Unit]
Description=True Thrills verified backup
[Service]
Type=oneshot
WorkingDirectory=/opt/truethrills
ExecStart=/bin/bash /opt/truethrills/scripts/backup-service.sh
UNIT
cat > /etc/systemd/system/truethrills-backup.timer <<'UNIT'
[Unit]
Description=Daily True Thrills backup
[Timer]
OnCalendar=*-*-* 04:00:00
Persistent=true
[Install]
WantedBy=timers.target
UNIT
cat > /etc/systemd/system/truethrills-monitor.service <<'UNIT'
[Unit]
Description=True Thrills health checks
[Service]
Type=oneshot
User=truethrills
Group=truethrills
WorkingDirectory=/opt/truethrills
ExecStart=/usr/bin/env node --env-file=.env scripts/monitor.mjs
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
UNIT
cat > /etc/systemd/system/truethrills-monitor.timer <<'UNIT'
[Unit]
Description=True Thrills health checks every five minutes
[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now truethrills-live.service truethrills-backup.timer truethrills-monitor.timer
