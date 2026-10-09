#!/usr/bin/env bash
# Старый адрес. Настоящий файл — server/enable-https.sh (раскладка папок 9 октября 2026).
# Этот переходник оставлен, чтобы прежние команды, таймеры и копии программ
# на компьютере владельца продолжали работать. Править — только server/enable-https.sh.
exec bash "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/../server/enable-https.sh" "$@"
