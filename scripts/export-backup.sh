#!/usr/bin/env bash
set -euo pipefail
[ "$(id -u)" -eq 0 ] && [ -n "${SUDO_USER:-}" ] || { echo 'Run with sudo from your SSH account.' >&2; exit 1; }
cd /opt/truethrills
node --env-file=.env - <<'JS'
const Database=require('better-sqlite3');const db=new Database(process.env.DATABASE_PATH||'data/truethrills.db',{readonly:true,fileMustExist:true});if(db.prepare('SELECT id FROM broadcasts WHERE active=1 AND heartbeat>?').get(Date.now()-90000))throw new Error('Finish the live before exporting a new backup.');db.close();
JS
bash scripts/backup-service.sh >&2
backup=$(node --input-type=module - <<'JS'
import {readdirSync,existsSync} from 'node:fs';const base='/var/backups/truethrills';const names=readdirSync(base).filter(n=>n.startsWith('TrueThrills-')&&existsSync(base+'/'+n+'/VERIFIED.json')).sort();if(!names.length)throw new Error('No verified backup');console.log(names.at(-1));
JS
)
folder=$(mktemp -d /var/tmp/TrueThrills-export-XXXXXXXX)
trap 'rm -rf -- "$folder"' ERR
tar -czf "$folder/backup.tar.gz" -C /var/backups/truethrills "$backup"
digest=$(sha256sum "$folder/backup.tar.gz" | cut -d ' ' -f 1)
chown "$SUDO_USER" "$folder" "$folder/backup.tar.gz"
chmod 700 "$folder"; chmod 600 "$folder/backup.tar.gz"
printf '{"path":"%s/backup.tar.gz","sha256":"%s","snapshot":"%s"}\n' "$folder" "$digest" "$backup"
