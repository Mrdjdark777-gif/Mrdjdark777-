"""Мигрирует data/knowledge_base.json в knowledge/personal/dima_notes/ с
полной metadata-схемой раздела 6 ТЗ (Phase 3, knowledge registry).

Разовый скрипт. НЕ удаляет и не меняет data/knowledge_base.json — тот
остаётся живым источником для search/ (KnowledgeBase) до Phase 7, когда
search engine переедет на чтение knowledge/. Идемпотентен: повторный запуск
просто перезаписывает knowledge/personal/dima_notes/dima_notes.json тем же
содержимым (id детерминированы по индексу, content_hash — по содержимому).

Провенанс (уточнено у пользователя в Phase 3, см. PROJECT_PLAN.md): часть
или весь data/knowledge_base.json сгенерирован ассистентом при заполнении
базы, а не является личными заметками пользователя в смысле раздела 5 ТЗ.
Это НЕ доверенный Custom tier (Приложение A) — это непроверенный
сгенерированный контент, который ещё не сверялся с официальным Blender
Manual. Все записи помечены source_type="ai_generated_unverified" и
needs_review=true — задача на будущее: сверить с официальным Manual
(естественно ложится на Phase 4) и либо подтвердить, либо исправить/удалить
неточности.

Запуск:
    python scripts/migrate_knowledge_base_to_registry.py
"""

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import KNOWLEDGE_BASE_PATH  # noqa: E402
from knowledge.registry import ChunkRegistry  # noqa: E402
from knowledge.schema import KnowledgeChunk  # noqa: E402

OUTPUT_PATH = (
    Path(__file__).resolve().parent.parent
    / "knowledge" / "personal" / "dima_notes" / "dima_notes.json"
)


def main() -> None:
    with open(KNOWLEDGE_BASE_PATH, encoding="utf-8") as f:
        entries = json.load(f)

    now = time.strftime("%Y-%m-%dT%H:%M:%S")
    registry = ChunkRegistry()

    for idx, entry in enumerate(entries):
        chunk = KnowledgeChunk(
            id=f"personal_notes:{idx:04d}",
            source="personal_notes",
            source_type="ai_generated_unverified",
            authority=None,  # не Custom tier — не проверено, не участвует в ранжировании
            version=None,  # версия Blender не зафиксирована в исходных данных
            language="ru",
            topic="general",  # точная категоризация — Phase 6 (Terminology)
            subtopic=None,
            date=None,
            url=None,
            original_title=entry["question"],
            translated_title=entry["question"],
            content=entry["answer"],
            author=None,  # конкретное авторство (dima/ассистент/смешанное) не установлено
            ingested_at=now,
            last_updated=now,
            needs_review=True,
        )
        registry.add(chunk)

    registry.save(OUTPUT_PATH)
    print(f"Мигрировано {len(registry.chunks)} чанков -> {OUTPUT_PATH}")

    dupes = registry.duplicate_content_hashes()
    if dupes:
        print(f"Внимание: {len(dupes)} групп дублей по content_hash: {dupes}")


if __name__ == "__main__":
    main()
