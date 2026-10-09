#!/usr/bin/env bash
# Старый адрес. Настоящий файл — server/export-backup.sh (раскладка папок 9 октября 2026).
# Этот переходник оставлен, чтобы прежние команды, таймеры и копии программ
# на компьютере владельца продолжали работать. Править — только server/export-backup.sh.
exec bash "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/../server/export-backup.sh" "$@"
