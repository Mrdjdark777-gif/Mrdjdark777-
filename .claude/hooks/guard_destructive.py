"""PreToolUse hook (matcher: Bash|PowerShell) - раздел 6 CLAUDE_CODE_SETUP_REPORT.md.

Дополняет permissions.deny/ask в .claude/settings.json (те ловят точные,
хорошо описываемые wildcard-паттерны вроде git push --force). Этот хук
ловит более широкий, комбинаторный случай: деструктивная команда УДАЛЕНИЯ
(rm/Remove-Item/rmdir с рекурсией и/или force, DROP/TRUNCATE) нацеленная
на защищённый путь (production DB, knowledge corpus, .env/SSH-ключ,
deploy-директория на сервере) - независимо от точного синтаксиса
(PowerShell/bash-стиль/через ssh remote command). Разбирать это как
отдельные permission-правила потребовало бы десятки почти дублирующих
wildcard-паттернов на каждую пару (глагол удаления x защищённый путь).

Явно НЕ трогает обычные безопасные команды (git add/commit/push без
--force, python/venv, обычные тесты, чтение файлов, npx и т.д.) - только
комбинация "деструктивный глагол" + "защищённый путь-маркер" в одной и
той же командной строке.
"""

from __future__ import annotations

import json
import re
import sys

_DESTRUCTIVE_VERB_RE = re.compile(
    r"rm\s+-[a-z]*r[a-z]*f|rm\s+-[a-z]*f[a-z]*r"                    # rm -rf / -fr и варианты
    r"|remove-item[^\n]*-recurse[^\n]*-force|remove-item[^\n]*-force[^\n]*-recurse"
    r"|rmdir\s+/s|del\s+/s"
    r"|drop\s+table|drop\s+database|truncate\s+table"
    r"|git\s+filter-branch|git\s+filter-repo",
    re.IGNORECASE,
)

_PROTECTED_TARGET_RE = re.compile(
    r"user_profile\.db|subscribers\.json"                            # локальные production-данные
    r"|knowledge[/\\]"                                                # knowledge corpus
    r"|mrdjdark777-[/\\]blender_bot"                                  # deploy-директория на сервере (см. reference_oracle_server_access)
    r"|blenderbot\.service|/etc/systemd"                              # systemd unit бота на сервере
    r"|\.env\b|\.key\b",                                              # секреты
    re.IGNORECASE,
)


def _deny(reason: str) -> None:
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }
    }))


def main() -> int:
    try:
        # См. fast_check.py: PowerShell добавляет BOM при пайпинге в
        # stdin, json.load() падает молча без .lstrip() (найдено на
        # реальном smoke test).
        raw = sys.stdin.read()
        payload = json.loads(raw.lstrip("﻿"))
    except Exception:
        return 0

    command = payload.get("tool_input", {}).get("command", "")
    if not command:
        return 0

    if _DESTRUCTIVE_VERB_RE.search(command) and _PROTECTED_TARGET_RE.search(command):
        _deny(
            "guard_destructive: команда сочетает деструктивное удаление "
            "(rm -rf/Remove-Item -Recurse -Force/DROP/TRUNCATE и т.п.) с защищённым "
            "путём (production DB, knowledge corpus, deploy-директория сервера, "
            "секреты). Нужно явное подтверждение пользователя, а не автоматический "
            "прогон - см. раздел 6 CLAUDE_CODE_SETUP_REPORT.md."
        )
        return 0

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print(f"guard_destructive hook error (не блокирует): {exc}", file=sys.stderr)
        sys.exit(0)
