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

# Копия уезжает с сервера и ложится на чужой диск. Внутри неё .env, приватные
# ключи push-подписок и персональные данные подписчиков, поэтому за пределами
# сервера она обязана быть зашифрована. Пароль приходит в BACKUP_PASSPHRASE
# через стандартный ввод вызывающего и нигде не сохраняется.
#
# Формат намеренно простой: openssl AES-256-CBC с PBKDF2. Его умеет открыть
# и сам openssl, и PowerShell средствами .NET — чтобы для восстановления не
# требовалось ставить ничего сверх того, что уже есть в Windows.
name=backup.tar.gz
if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
 name=backup.tar.gz.enc
 printf '%s' "$BACKUP_PASSPHRASE" | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -md sha256 -salt \
  -in "$folder/backup.tar.gz" -out "$folder/$name" -pass stdin
 rm -f -- "$folder/backup.tar.gz"
fi
digest=$(sha256sum "$folder/$name" | cut -d ' ' -f 1)
chown "$SUDO_USER" "$folder" "$folder/$name"
chmod 700 "$folder"; chmod 600 "$folder/$name"
printf '{"path":"%s/%s","sha256":"%s","snapshot":"%s","encrypted":%s}\n' \
 "$folder" "$name" "$digest" "$backup" "$([ -n "${BACKUP_PASSPHRASE:-}" ] && echo true || echo false)"
