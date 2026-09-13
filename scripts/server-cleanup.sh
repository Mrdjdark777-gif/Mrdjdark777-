#!/usr/bin/env bash
# Уборка на VPS. По умолчанию только показывает, что займёт место и что можно
# убрать; ничего не удаляет, пока не передан --apply.
#
#   sudo bash /opt/truethrills/scripts/server-cleanup.sh          # отчёт
#   sudo bash /opt/truethrills/scripts/server-cleanup.sh --apply  # уборка
#
# Что делает с --apply: удаляет остатки прерванных обновлений и тестов,
# каталоги эфиров, чьи выпуски уже лежат в хранилище (prune-live.mjs), кэш npm,
# журналы systemd старше 30 дней, осиротевшие пакеты apt и резервные копии
# старше последних пяти (prune-backups.mjs). Пять последних остаются всегда, и
# ротация рассчитывает на то, что копия есть ещё и вне сервера — забирай её
# через scripts/export-backup.sh.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo 'Run with sudo.' >&2; exit 1; }
cd /opt/truethrills
apply=0; [ "${1:-}" = "--apply" ] && apply=1
exec 9>/run/lock/truethrills-maintenance.lock
flock -n 9 || { echo 'Maintenance is already running.' >&2; exit 1; }
[ -f .env ] || { echo 'Existing server .env is required.' >&2; exit 1; }

say(){ printf '\n== %s\n' "$*"; }
size(){ [ -e "$1" ] && du -sh "$1" 2>/dev/null | cut -f1 || echo '0'; }

say 'Диск'
df -h / | tail -1
say 'Что сколько занимает'
for d in data/storage data/live /var/backups/truethrills .next .sites-runtime/npm-cache node_modules; do printf '%8s  %s\n' "$(size "$d")" "$d"; done
ls -1t /var/backups/truethrills 2>/dev/null | head -3 | sed 's/^/   свежие копии: /' || true

say 'Резервные копии сверх последних пяти'
if [ "$apply" = 1 ]; then node scripts/prune-backups.mjs --keep 5 --delete; else node scripts/prune-backups.mjs --keep 5; fi

say 'Остатки обновлений и тестов'
stale=$(ls -d .update-staging .test-tmp-* .test-live-* 2>/dev/null || true)
if [ -z "$stale" ]; then echo 'нет'; else echo "$stale"; [ "$apply" = 1 ] && rm -rf $stale && echo 'удалено'; fi

say 'Каталоги завершённых эфиров'
if [ "$apply" = 1 ]; then node --env-file=.env scripts/prune-live.mjs --delete; else node --env-file=.env scripts/prune-live.mjs; fi

say 'Кэш npm'
echo "$(size .sites-runtime/npm-cache)"
[ "$apply" = 1 ] && rm -rf .sites-runtime/npm-cache && echo 'очищен'

say 'Журналы systemd'
journalctl --disk-usage 2>/dev/null || true
[ "$apply" = 1 ] && journalctl --vacuum-time=30d >/dev/null 2>&1 && echo 'оставлены последние 30 дней'

say 'Пакеты apt'
# grep без совпадений возвращает 1, а с pipefail это уронило бы весь отчёт.
if [ "$apply" = 1 ]; then apt-get -y autoremove >/dev/null 2>&1 && apt-get clean && echo 'осиротевшие пакеты удалены, кэш очищен'; else { apt-get -s autoremove 2>/dev/null | grep -cE '^(Remv|Удал)' || true; } | sed 's/$/ пакетов можно удалить/'; fi

say 'Состояние данных'
node --env-file=.env scripts/data-status.mjs
[ "$apply" = 1 ] || printf '\nЭто был отчёт. Запусти с --apply, чтобы убрать перечисленное.\n'
