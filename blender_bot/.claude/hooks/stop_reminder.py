"""Stop hook - лёгкое, НЕ блокирующее напоминание (раздел 3 CLAUDE_CODE_SETUP_REPORT.md).

Stop срабатывает на КАЖДУЮ реплику Claude (не только "конец программной
задачи"), поэтому Level B (полный python -m unittest discover + quality
suite, ~4-5 минут) сюда сознательно НЕ повешен - иначе любой обычный
ответ, включая простые вопросы без единой правки кода, ждал бы столько
же, сколько полный regression gate. Level B - skill validate-release,
вызываемый явно перед тем, как считать существенную работу завершённой.

Этот хук просто проверяет git status на неисправленные .py изменения и
печатает одну строку-напоминание в stdout (не блокирует, не запускает
тесты сам). Если станет надоедать - можно смело удалить запись Stop из
.claude/settings.json, ничего другого это не затронет.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

PROJECT_DIR = Path(os.environ.get("CLAUDE_PROJECT_DIR", ".")).resolve()
GIT_ROOT = PROJECT_DIR.parent  # см. CLAUDE.md: git root на уровень выше blender_bot/


def main() -> int:
    if not (GIT_ROOT / ".git").exists():
        return 0
    try:
        result = subprocess.run(
            ["git", "status", "--short"],
            capture_output=True, text=True, cwd=str(GIT_ROOT), timeout=10,
        )
    except Exception:
        return 0
    if result.returncode != 0:
        return 0

    changed_py = [
        line for line in result.stdout.splitlines()
        if line.strip().endswith(".py") and "blender_bot/" in line
    ]
    if changed_py:
        print(
            f"[validate-release] {len(changed_py)} изменённых .py файлов ещё не "
            f"закоммичены - перед тем как считать задачу завершённой, стоит "
            f"прогнать skill validate-release."
        )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        sys.exit(0)
