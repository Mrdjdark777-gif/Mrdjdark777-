"""Knowledge registry (раздел 5-6 ТЗ): валидация, сохранение и загрузка chunks.

Регистрирует данные, но пока не подключён к search/ — тот продолжает читать
data/*.json напрямую до Phase 7 (search engine). Это ожидаемо: Phase 3 по
разделу 40 ТЗ идёт до Phase 7, знания собираются заранее, движок под них
переписывается позже.
"""

from __future__ import annotations

import json
from pathlib import Path

from knowledge.schema import NULLABLE_REQUIRED_FIELDS, REQUIRED_FIELDS, KnowledgeChunk


class ChunkValidationError(ValueError):
    pass


def validate_chunk(chunk: KnowledgeChunk) -> None:
    data = chunk.to_dict()
    missing = [
        field
        for field in REQUIRED_FIELDS
        if field not in NULLABLE_REQUIRED_FIELDS and data.get(field) in (None, "")
    ]
    if missing:
        raise ChunkValidationError(
            f"chunk {chunk.id!r}: отсутствуют обязательные поля {missing} (раздел 6 ТЗ)"
        )


class ChunkRegistry:
    """Набор knowledge chunks одного источника/bucket'а (например, dima_notes)."""

    def __init__(self) -> None:
        self.chunks: list[KnowledgeChunk] = []

    def add(self, chunk: KnowledgeChunk) -> KnowledgeChunk:
        validate_chunk(chunk)
        self.chunks.append(chunk)
        return chunk

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump([c.to_dict() for c in self.chunks], f, ensure_ascii=False, indent=1)

    @classmethod
    def load(cls, path: Path) -> "ChunkRegistry":
        registry = cls()
        if not path.exists():
            return registry
        with open(path, encoding="utf-8") as f:
            raw = json.load(f)
        for item in raw:
            registry.chunks.append(KnowledgeChunk(**item))
        return registry

    def duplicate_content_hashes(self) -> dict[str, list[str]]:
        """Группирует id чанков по content_hash.

        Не полноценный Duplicate Detection (раздел 29 ТЗ — отдельная будущая
        фаза), а черновая проверка на дословные дубли внутри одного bucket'а,
        доступная уже сейчас раз content_hash всё равно обязателен.
        """
        by_hash: dict[str, list[str]] = {}
        for c in self.chunks:
            by_hash.setdefault(c.content_hash, []).append(c.id)
        return {h: ids for h, ids in by_hash.items() if len(ids) > 1}
