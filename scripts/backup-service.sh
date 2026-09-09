#!/usr/bin/env bash
# Run as root on the VPS; no deletion/retention until an off-server copy exists.
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
