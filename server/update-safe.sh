#!/usr/bin/env bash
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo 'Run with sudo.' >&2; exit 1; }
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
cd /opt/truethrills
# Каталогом владеет системный пользователь сервиса, а git здесь работает от
# root: без этого он откажется («dubious ownership») и обновление встанет.
git config --global --add safe.directory /opt/truethrills 2>/dev/null || true
branch=${1:-truethrills-app}
expected=${2:-}
[[ "$branch" =~ ^[A-Za-z0-9._/-]+$ ]] && [[ "$branch" != -* ]] || exit 2
[[ -z "$expected" || "$expected" =~ ^[a-f0-9]{40}$ ]] || exit 2
exec 9>/run/lock/truethrills-maintenance.lock
flock -n 9 || { echo 'Maintenance is already running.' >&2; exit 1; }
[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo 'Save local code changes before updating.' >&2; exit 1; }
previous=$(git rev-parse HEAD)
# git пишет ход скачивания («From https://github.com/…», «* branch … ->
# FETCH_HEAD») в поток ошибок, хотя это не ошибка. На компьютере владельца
# PowerShell показывает каждую такую строку красным блоком NativeCommandError,
# и при каждом обновлении он видел «красное» и спрашивал, что сломалось.
# Обновление при этом шло дальше. Отправляем этот вывод в обычный поток:
# настоящий сбой git всё равно остановит скрипт по коду выхода (set -e).
git fetch origin "$branch" 2>&1
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
# Из вывода установки убираются только строки «npm warn deprecated» — это
# объявления о чужих пакетах внутри наших зависимостей: @esbuild-kit приходит
# с drizzle-kit, prebuild-install с better-sqlite3. Сделать с ними ничего
# нельзя, не подняв драйвер базы на две старшие версии, а владелец видит их
# красной стеной при каждом обновлении и каждый раз спрашивает, что сломалось.
#
# Фильтр нарочно узкий: отбрасывается ровно это начало строки. Любое другое
# предупреждение npm и любая ошибка проходят как есть, и код возврата не
# теряется — иначе неудачная установка стала бы незаметной.
npm ci --include=dev --no-audit --no-fund 2> >(grep -v '^npm warn deprecated ' >&2)
# Сборка с нуля. Next иногда оставляет в .next прежние куски стилей и отдаёт
# их после обновления: код новый, а на экране всё по-старому. Ловится это
# только глазами и стоит дороже, чем лишняя минута сборки.
rm -rf .next
npm run build
# Что именно выложено — видно из журнала обновления, а не по догадке.
echo "Выложен коммит: $(git rev-parse --short HEAD) ($branch)"
node --env-file=.env node_modules/drizzle-kit/bin.cjs migrate
# Change only this known non-secret option, preserving every other setting.
node - <<'JS'
const fs=require('node:fs');let text=fs.readFileSync('.env','utf8');text=/^LIVE_ENABLED=.*$/m.test(text)?text.replace(/^LIVE_ENABLED=.*$/m,'LIVE_ENABLED=true'):text+'\nLIVE_ENABLED=true\n';fs.writeFileSync('.env',text,{mode:0o600});
JS
bash scripts/install-operations.sh
systemctl start truethrills
# Служба поднимается не мгновенно, и первая попытка законно не достаёт до
# порта: curl печатал «Failed to connect to 127.0.0.1 port 3000», потом
# повторял и получал ответ. Строка пугала владельца на каждом обновлении,
# хотя означала только «ещё секунду». Теперь сообщения попыток придерживаются
# и показываются, только если не ответила ни одна.
health=$(curl --fail --silent --retry 12 --retry-all-errors --retry-delay 2 --max-time 10 http://127.0.0.1:3000/api/health 2>/tmp/truethrills-health.err) || {
 echo 'Служба не ответила на проверку здоровья:' >&2; cat /tmp/truethrills-health.err >&2; rm -f /tmp/truethrills-health.err; exit 1; }
rm -f /tmp/truethrills-health.err
echo "$health"
# Служба обязана отдавать ровно тот код, который сейчас выложен. Иначе сборка
# отстала от кода, а на экране остаётся прежнее приложение — именно так трижды
# и получалось «обновил, ничего не изменилось».
want=$(git rev-parse --short HEAD)
case "$health" in
 *"\"build\":\"$want\""*) echo "Сборка совпадает с кодом: $want" ;;
 *) echo "Служба отдаёт не ту сборку: ждали $want, ответ: $health" >&2; exit 1 ;;
esac
trap - ERR
echo "Updated successfully to $target. Previous commit: $previous"
