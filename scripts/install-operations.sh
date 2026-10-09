#!/usr/bin/env bash
# Старый адрес. Настоящий файл — server/install-operations.sh (раскладка папок 9 октября 2026).
# Этот переходник оставлен, чтобы прежние команды, таймеры и копии программ
# на компьютере владельца продолжали работать. Править — только server/install-operations.sh.
exec bash "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/../server/install-operations.sh" "$@"
