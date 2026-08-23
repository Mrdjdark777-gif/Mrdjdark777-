"""PostToolUse hook (matcher: Edit|Write в settings.json - срабатывает на
ЛЮБОЙ Edit/Write, фильтрация по *.py сделана здесь, а не через settings.json
`if`-поле: живой smoke test 2026-08-23 показал, что matcher-only PreToolUse
hook (guard_destructive) реально срабатывает через harness, а PostToolUse с
"if": "Edit(**/*.py)" - нет, при этом причина не установлена (не воспроизвели
через claude --debug в рамках сессии). Раз matcher без `if` уже доказанно
работает - фильтрация по расширению перенесена в сам скрипт (см. ниже), а не
в непроверенный `if`-механизм. См. CLAUDE_CODE_SETUP_REPORT.md.

Level A ("быстрая проверка после существенных изменений Python") из
CLAUDE_CODE_SETUP_REPORT.md: синтаксис/compile check + best-effort прогон
одного подходящего по имени тестового файла, если он есть. Намеренно НЕ
запускает python -m unittest discover целиком и НЕ трогает quality-suite
(tests/quality/, ~4-5 минут на 540 кейсах + перегрузка BM25-индекса) -
это Level B, отдельный тяжёлый шлюз (skill validate-release), не то, что
должно висеть на каждом Edit/Write.

Получает описание вызова инструмента через stdin (JSON, поле
tool_input.file_path). Exit 2 + сообщение в stderr показывает Claude
причину сразу после правки, без ожидания следующего ручного прогона тестов.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

# CLAUDE_PROJECT_DIR - корень git-репозитория (сессия Claude Code
# запускается из родительской папки, см. CLAUDE_CODE_SETUP_REPORT.md,
# раздел про перенос .claude/ в корень), а весь код бота (venv/, tests/)
# лежит на уровень ниже, в blender_bot/ - отсюда суффикс.
PROJECT_DIR = Path(os.environ.get("CLAUDE_PROJECT_DIR", ".")).resolve() / "blender_bot"
_VENV_PYTHON = PROJECT_DIR / "venv" / "Scripts" / "python.exe"
PYTHON = str(_VENV_PYTHON) if _VENV_PYTHON.exists() else sys.executable


def _find_matching_test(stem: str) -> Path | None:
    tests_dir = PROJECT_DIR / "tests"
    if not tests_dir.exists():
        return None
    for pattern in (f"test_{stem}.py", f"test_*{stem}*.py"):
        matches = sorted(tests_dir.glob(pattern))
        if matches:
            return matches[0]
    return None


def _report(msg: str) -> None:
    """Пишем в stderr БАЙТАМИ в UTF-8, не print(..., file=sys.stderr).

    Зеркало проблемы с чтением stdin (см. main() ниже): Claude Code читает
    stderr хука как UTF-8, а Python на Windows кодирует текстовый sys.stderr
    в системной cp1251 - русский текст доезжал до Claude как "??????????"
    (подтверждено живым прогоном 2026-08-23: хук СРАБОТАЛ и показал
    SyntaxError, но весь русский в сообщении был нечитаем).

    errors="replace" на подстраховке: вывод py_compile/unittest может
    содержать байты, не кодируемые в UTF-8 - лучше показать сообщение с
    парой битых символов, чем уронить сам хук исключением при кодировании.
    """
    sys.stderr.buffer.write(msg.encode("utf-8", errors="replace"))
    sys.stderr.buffer.flush()


def main() -> int:
    try:
        # ЧИТАЕМ БАЙТЫ И ДЕКОДИРУЕМ UTF-8 ЯВНО, не sys.stdin.read().
        # Claude Code присылает payload в UTF-8, а Python на Windows
        # декодирует текстовый sys.stdin в системной кодировке (здесь
        # cp1251) - путь "D:\Мои документы\TG BOT\..." превращался в
        # "D:\РњРѕРё РґРѕРєСѓРјРµРЅС‚С‹\TG BOT\...", такого файла на диске
        # нет, и проверка `path.exists()` ниже молча возвращала 0. Внешне
        # это выглядело как "хук вообще не срабатывает" (найдено 2026-08-23
        # логированием сырого stdin в файл, а не догадкой; PreToolUse
        # guard_destructive той же проблемы не имел, потому что сверяет
        # только ASCII-текст команды и не резолвит пути на диске).
        # "utf-8-sig" заодно съедает BOM, если он есть - отдельный
        # .lstrip("\ufeff") больше не нужен.
        raw = sys.stdin.buffer.read().decode("utf-8-sig")
        payload = json.loads(raw)
    except Exception:
        return 0

    file_path = payload.get("tool_input", {}).get("file_path", "")
    if not file_path.endswith(".py"):
        return 0

    path = Path(file_path)
    if not path.is_absolute():
        path = PROJECT_DIR / path
    if not path.exists() or "venv" in path.parts:
        return 0

    compile_result = subprocess.run(
        [PYTHON, "-m", "py_compile", str(path)],
        capture_output=True, text=True, cwd=str(PROJECT_DIR),
    )
    if compile_result.returncode != 0:
        _report(f"Синтаксическая ошибка в {path.name}:\n{compile_result.stderr}")
        return 2

    stem = path.stem
    if stem.startswith("test_") or stem == "__init__":
        return 0

    test_file = _find_matching_test(stem)
    if test_file is None:
        return 0

    module = f"tests.{test_file.stem}"
    try:
        test_result = subprocess.run(
            [PYTHON, "-m", "unittest", module],
            capture_output=True, text=True, cwd=str(PROJECT_DIR), timeout=90,
        )
    except subprocess.TimeoutExpired:
        return 0

    if test_result.returncode != 0:
        tail = "\n".join((test_result.stdout + test_result.stderr).splitlines()[-40:])
        _report(
            f"{module} падает после этого изменения (быстрая проверка, не полный "
            f"regression gate):\n{tail}"
        )
        return 2

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        # Хук не должен ронять саму сессию из-за собственной ошибки.
        _report(f"fast_check hook error (не блокирует): {exc}")
        sys.exit(0)
