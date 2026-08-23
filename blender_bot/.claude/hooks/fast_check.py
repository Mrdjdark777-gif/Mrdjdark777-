"""PostToolUse hook (matcher: Edit|Write, scoped to *.py in settings.json).

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

PROJECT_DIR = Path(os.environ.get("CLAUDE_PROJECT_DIR", ".")).resolve()
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


def main() -> int:
    try:
        # PowerShell добавляет BOM при пайпинге строки в stdin внешнего
        # процесса - json.load() не терпит ведущий BOM и падает молча
        # без этого .lstrip() (найдено на реальном smoke test, не в
        # теории - см. CLAUDE_CODE_SETUP_REPORT.md, раздел Verification).
        raw = sys.stdin.read()
        payload = json.loads(raw.lstrip("﻿"))
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
        print(f"Синтаксическая ошибка в {path.name}:\n{compile_result.stderr}", file=sys.stderr)
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
        print(
            f"{module} падает после этого изменения (быстрая проверка, не полный "
            f"regression gate):\n{tail}",
            file=sys.stderr,
        )
        return 2

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        # Хук не должен ронять саму сессию из-за собственной ошибки.
        print(f"fast_check hook error (не блокирует): {exc}", file=sys.stderr)
        sys.exit(0)
