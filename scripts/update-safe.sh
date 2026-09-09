#!/usr/bin/env bash
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo 'Run with sudo.' >&2; exit 1; }
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
cd /opt/truethrills
branch=${1:-claude/read-link-content-h18psv}
expected=${2:-}
[[ "$branch" =~ ^[A-Za-z0-9._/-]+$ ]] && [[ "$branch" != -* ]] || exit 2
[[ -z "$expected" || "$expected" =~ ^[a-f0-9]{40}$ ]] || exit 2
exec 9>/run/lock/truethrills-maintenance.lock
flock -n 9 || { echo 'Maintenance is already running.' >&2; exit 1; }
[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo 'Save local code changes before updating.' >&2; exit 1; }
previous=$(git rev-parse HEAD)
git fetch origin "$branch"
target=$(git rev-parse FETCH_HEAD)
[ -z "$expected" ] || [ "$target" = "$expected" ] || { echo 'Branch moved. Review the newer changes before updating.' >&2; exit 1; }
git merge-base --is-ancestor HEAD "$target" || { echo 'Branches diverged; preserve local changes and merge manually.' >&2; exit 1; }
[ -f .env ] || { echo 'Existing server .env is required.' >&2; exit 1; }
node --env-file=.env - <<'JS'
const Database=require('better-sqlite3');const db=new Database(process.env.DATABASE_PATH||'data/truethrills.db',{readonly:true,fileMustExist:true});
if(db.prepare('SELECT id FROM broadcasts WHERE active=1 AND heartbeat>?').get(Date.now()-90000))throw new Error('Finish the live and its upload before updating.');db.close();
JS
command -v ffmpeg >/dev/null || { apt-get update; apt-get install -y ffmpeg; }
was_active=0; worker_active=0; mutated=0
systemctl is-active --quiet truethrills && was_active=1
systemctl is-active --quiet truethrills-live && worker_active=1
on_error(){
 if [ "$mutated" = 0 ]; then
  if [ "$worker_active" = 1 ]; then systemctl start truethrills-live; fi
  if [ "$was_active" = 1 ]; then systemctl start truethrills; fi
 else
  systemctl stop truethrills truethrills-live 2>/dev/null || true
  echo "Update failed. Services stopped. Restore backup with matching code: $previous" >&2
 fi
}
trap on_error ERR
systemctl stop truethrills
if [ "$worker_active" = 1 ]; then systemctl stop truethrills-live; fi
umask 077
node --env-file=.env "$script_dir/backup-data.mjs" /var/backups/truethrills
mutated=1
git merge --ff-only "$target"
npm ci --include=dev
npm run build
node --env-file=.env node_modules/drizzle-kit/bin.cjs migrate
# Change only this known non-secret option, preserving every other setting.
node - <<'JS'
const fs=require('node:fs');let text=fs.readFileSync('.env','utf8');text=/^LIVE_ENABLED=.*$/m.test(text)?text.replace(/^LIVE_ENABLED=.*$/m,'LIVE_ENABLED=true'):text+'\nLIVE_ENABLED=true\n';fs.writeFileSync('.env',text,{mode:0o600});
JS
bash scripts/install-operations.sh
systemctl start truethrills
curl --fail --silent --show-error --retry 12 --retry-all-errors --retry-delay 2 --max-time 10 http://127.0.0.1:3000/api/health
trap - ERR
echo "Updated successfully to $target. Previous commit: $previous"
