#!/usr/bin/env bash
# Постоянная точка входа обновления сервера. Настоящий скрипт —
# server/update-safe.sh (раскладка папок 9 октября 2026). Править — только его.
#
# Этот адрес не переезжает никогда: программа обновления на компьютере
# владельца (TrueThrills-Server.ps1, любая её копия, в том числе старая из
# архива) копирует отсюда update-safe.sh, backup-data.mjs и verify-backup.mjs
# в .update-staging и запускает оттуда.
#
# Что здесь происходит: свежие копии трёх файлов из server/ кладутся в
# отдельную папку .update-run.XXXXXX в корне сервиса и запускаются оттуда.
# Не из server/ напрямую — обновление само переписывает дерево через
# git merge, а исполняемый файл не должен меняться у себя под ногами. Папка
# лежит на том же уровне, что .update-staging: копии находят ../lib и
# node_modules сервиса. После удачного обновления server/update-safe.sh
# убирает её сам.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo 'Run with sudo.' >&2; exit 1; }
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
app=$(cd -- "$here/.." && pwd)
[ -f "$app/server/update-safe.sh" ] || { echo "Не найден $app/server/update-safe.sh" >&2; exit 1; }
run=$(mktemp -d "$app/.update-run.XXXXXX")
chmod 755 "$run"
cp "$app/server/update-safe.sh" "$app/server/backup-data.mjs" "$app/server/verify-backup.mjs" "$run/"
exec bash "$run/update-safe.sh" "$@"
