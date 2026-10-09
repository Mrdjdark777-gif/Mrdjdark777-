#!/usr/bin/env bash
# Старый адрес. Настоящий файл — server/server-cleanup.sh (раскладка папок 9 октября 2026).
# Этот переходник оставлен, чтобы прежние команды, таймеры и копии программ
# на компьютере владельца продолжали работать. Править — только server/server-cleanup.sh.
exec bash "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/../server/server-cleanup.sh" "$@"
