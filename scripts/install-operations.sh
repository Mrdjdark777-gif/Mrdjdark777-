#!/usr/bin/env bash
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo 'Run with sudo.' >&2; exit 1; }
cd /opt/truethrills
install -d -m 700 /var/backups/truethrills
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
WorkingDirectory=/opt/truethrills
ExecStart=/usr/bin/env node --env-file=.env scripts/monitor.mjs
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
systemctl enable --now truethrills-backup.timer truethrills-monitor.timer
