#!/usr/bin/env bash
set -euo pipefail
cd /opt/truethrills
exec 9>/run/lock/truethrills-maintenance.lock
flock -n 9 || { echo 'Maintenance is already running.' >&2; exit 1; }
[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo 'Save local code changes before updating.' >&2; exit 1; }
previous=$(git rev-parse HEAD)
git fetch origin claude/read-link-content-h18psv
git merge-base --is-ancestor HEAD origin/claude/read-link-content-h18psv || { echo 'Branches diverged; manual merge required.' >&2; exit 1; }
if curl -fsS --max-time 5 http://127.0.0.1:3000/api/live?status=1 | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>process.exit(JSON.parse(s).live?0:1))'; then echo 'Finish the live before updating.' >&2; exit 1; fi
trap 'systemctl stop truethrills; echo "Update failed; service remains stopped. Restore the verified backup and previous commit: $previous" >&2' ERR
systemctl stop truethrills
umask 077
node --env-file=.env scripts/backup-data.mjs /var/backups/truethrills
git merge --ff-only origin/claude/read-link-content-h18psv
npm ci --include=dev
npm run build
node --env-file=.env node_modules/drizzle-kit/bin.cjs migrate
systemctl start truethrills
curl --fail --silent --show-error --retry 8 --retry-connrefused --retry-delay 2 http://127.0.0.1:3000/api/health
trap - ERR
echo "Updated successfully. Previous commit: $previous"
