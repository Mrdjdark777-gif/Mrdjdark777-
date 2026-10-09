#!/usr/bin/env bash
# Старый адрес. Настоящий файл — server/vps-setup.sh (раскладка папок 9 октября 2026).
# Этот переходник оставлен, чтобы прежние команды, таймеры и копии программ
# на компьютере владельца продолжали работать. Править — только server/vps-setup.sh.
src="${BASH_SOURCE[0]:-}"
if [ -z "$src" ] || [ ! -f "$src" ]; then
 echo 'Скрипт переехал: server/vps-setup.sh. Запуск с GitHub:' >&2
 echo '  curl -fsSL https://raw.githubusercontent.com/Mrdjdark777-gif/Mrdjdark777-/design/six-screens/server/vps-setup.sh | sudo bash' >&2
 exit 1
fi
exec bash "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/../server/vps-setup.sh" "$@"
