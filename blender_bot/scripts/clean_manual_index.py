"""Разовая чистка уже собранного data/manual_index.json от утечек RST field
list ("`:align: right :alt: ...`") в summary — баг парсера, найденный в
Phase 4 (52 группы дублей по content_hash при первой попытке ingest).

Корневая причина исправлена в parse_rst_file() (scripts/build_manual_index.py,
FIELD_LIST_RE), но пересобирать индекс заново — это ~20 минут (клонирование +
перевод ~1700 страниц). Вместо этого чистит уже переведённые данные на
месте: если summary_en (английский оригинал ДО перевода) целиком состоит из
таких field list-фрагментов — значит реального текста там и не было,
summary/summary_en обнуляются, и ingest_manual_to_registry.py сам отбросит
такую запись (у него уже есть проверка «нет summary — пропустить»).

Запуск:
    python scripts/clean_manual_index.py
"""

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import MANUAL_INDEX_PATH  # noqa: E402

# Тест на "весь текст — это RST field list и ничего больше", например:
# ":align: right :alt: Node." Проверяется на английском summary_en, т.к.
# имена полей (align/alt/...) не переводятся и остаются надёжным маркером.
FIELD_LIST_ONLY_RE = re.compile(r"^(:[\w-]+:\s*[^:]*\s*)+$")


def main() -> None:
    if not MANUAL_INDEX_PATH.exists():
        print(f"{MANUAL_INDEX_PATH} не найден.")
        sys.exit(1)

    with open(MANUAL_INDEX_PATH, encoding="utf-8") as f:
        entries = json.load(f)

    cleaned = 0
    for entry in entries:
        summary_en = (entry.get("summary_en") or "").strip()
        if summary_en and FIELD_LIST_ONLY_RE.fullmatch(summary_en):
            entry["summary"] = ""
            entry["summary_en"] = ""
            cleaned += 1

    with open(MANUAL_INDEX_PATH, "w", encoding="utf-8") as f:
        json.dump(entries, f, ensure_ascii=False, indent=1)

    print(f"Очищено {cleaned} записей из {len(entries)} (summary был целиком RST field list-мусором)")


if __name__ == "__main__":
    main()
