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


# Тело heredoc'а в `git commit -m "$(cat <<'EOF' ... EOF)"` - это ТЕКСТ
# сообщения, а не исполняемая команда. Живой ложноположительный случай
# (2026-08-23): коммит, ОПИСЫВАЮЩИЙ починку этого самого хука, содержал в
# теле сообщения слова "rm -rf" и "knowledge/" - guard заблокировал
# собственный коммит про себя же.
#
# Вырезаем тело heredoc'а ТОЛЬКО у `git commit`: в общем случае heredoc
# может скармливаться интерпретатору (`bash <<EOF ... EOF`), и тогда его
# содержимое реально исполняется - вырезать его вслепую значило бы
# открыть очевидный обход защиты. У `git commit` heredoc всегда данные.
# Сама команда (всё вне тела heredoc'а) проверяется как обычно, поэтому
# `git commit -m "..." && rm -rf knowledge/` по-прежнему ловится.
_GIT_COMMIT_RE = re.compile(r"\bgit\s+commit\b", re.IGNORECASE)
_HEREDOC_BODY_RE = re.compile(
    r"<<-?\s*(['\"]?)(\w+)\1.*?^\s*\2\s*$",
    re.DOTALL | re.MULTILINE,
)


def _strip_message_bodies(command: str) -> str:
    if not _GIT_COMMIT_RE.search(command):
        return command
    return _HEREDOC_BODY_RE.sub("<<STRIPPED_MESSAGE_BODY", command)


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
        # Читаем БАЙТЫ и декодируем UTF-8 явно - см. подробный комментарий
        # в fast_check.py::main(). Здесь эта ошибка не проявлялась только
        # потому, что regex ниже сверяет ASCII-текст команды: путь
        # "D:\Мои документы\..." внутри команды приезжал битым
        # ("D:\РњРѕРё РґРѕРєСѓРјРµРЅС‚С‹\..."), и деструктивная команда,
        # нацеленная на кириллический путь, могла НЕ совпасть с
        # _PROTECTED_TARGET_RE, то есть тихо пройти мимо защиты.
        # "utf-8-sig" заодно съедает BOM (PowerShell добавляет его при
        # пайпинге в stdin - найдено на прошлом smoke test).
        raw = sys.stdin.buffer.read().decode("utf-8-sig")
        payload = json.loads(raw)
    except Exception:
        return 0

    command = payload.get("tool_input", {}).get("command", "")
    if not command:
        return 0

    command = _strip_message_bodies(command)
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
