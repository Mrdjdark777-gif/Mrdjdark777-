#!/usr/bin/env bash
# Run as root on the VPS. Keeps the last five verified copies and deletes older
# ones, but only after a new copy has been written and verified. This retention
# assumes the owner also keeps a copy off the server (scripts/export-backup.sh);
# without one, the five copies here are the only ones that exist.
set -euo pipefail
cd /opt/truethrills
exec 9>/run/lock/truethrills-maintenance.lock
flock -n 9 || exit 0
if curl -fsS --max-time 5 http://127.0.0.1:3000/api/live?status=1 | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>process.exit(JSON.parse(s).live?0:1))'; then
 echo 'Live in progress: backup deferred.'
 exit 0
fi
worker_active=0
systemctl is-active --quiet truethrills-live && worker_active=1
was_active=0
systemctl is-active --quiet truethrills && was_active=1
trap 'if [ "$worker_active" = 1 ]; then systemctl start truethrills-live; fi; if [ "$was_active" = 1 ]; then systemctl start truethrills; fi' EXIT
systemctl stop truethrills
if [ "$worker_active" = 1 ]; then systemctl stop truethrills-live; fi
umask 077
node --env-file=.env scripts/backup-data.mjs /var/backups/truethrills
# Ротация идёт только после успешной свежей копии: если строка выше упала,
# скрипт остановится здесь и ничего не удалит.
node scripts/prune-backups.mjs --keep 5 --delete
# Копию снимает root, а проверяет её наличие мониторинг — он работает от
# пользователя сервиса. Без этого каталог снимка (0700 от root) для него
# закрыт, и он доложит о пропавших бэкапах, которых на самом деле нет.
chown -R truethrills:truethrills /var/backups/truethrills 2>/dev/null || true
