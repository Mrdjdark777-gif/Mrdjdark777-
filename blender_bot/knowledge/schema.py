"""Схема knowledge chunk и приоритет источников (разделы 3 и 6 ТЗ)."""

from __future__ import annotations

import hashlib
from dataclasses import asdict, dataclass

# Раздел 3 ТЗ — Приоритет источников. "CUSTOM" (личные заметки, Приложение A)
# намеренно не входит сюда: у него нет числового веса, назначенного ТЗ —
# это должно быть решено в Phase 10 (Source ranking), а не угадано здесь.
AUTHORITY_TIERS: dict[str, int] = {
    "S": 100,  # официальный Blender Manual, Python API, Release Notes, Developer Docs
    "A": 80,   # Blender Stack Exchange, Stack Overflow RU, официальные developer-материалы
    "B": 60,   # качественные community tutorials и форумы
    "C": 30,   # обычные пользовательские материалы
    "D": 10,   # непроверенные статьи, SEO-контент, материалы без автора/версии
}

# Обязательные и желательные поля из раздела 6 ТЗ.
REQUIRED_FIELDS = (
    "id", "source", "source_type", "authority", "version", "language",
    "topic", "subtopic", "date", "url", "original_title", "translated_title",
    "content",
)
OPTIONAL_FIELDS = (
    "license", "author", "content_hash", "ingested_at", "last_updated",
    "parent_document", "section_path",
)

# Эти обязательные поля разрешено оставлять None, если факт реально неизвестен
# (раздел 7 ТЗ: «если версия неизвестна — не утверждать, что ответ относится
# к конкретной версии»). Остальные обязательные поля должны быть заполнены.
NULLABLE_REQUIRED_FIELDS = {"version", "date", "url", "authority", "subtopic"}


def compute_content_hash(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


@dataclass
class KnowledgeChunk:
    """Один knowledge chunk с полной metadata-схемой раздела 6 ТЗ."""

    # обязательные поля
    id: str
    source: str
    source_type: str
    authority: int | None
    version: str | None
    language: str
    topic: str
    subtopic: str | None
    date: str | None
    url: str | None
    original_title: str
    translated_title: str
    content: str

    # желательные поля
    license: str | None = None
    author: str | None = None
    content_hash: str | None = None
    ingested_at: str | None = None
    last_updated: str | None = None
    parent_document: str | None = None
    section_path: str | None = None

    # Не из раздела 6 ТЗ — проектное дополнение поверх обязательной схемы.
    # Отмечает chunk'и, чья классификация (например, source_type) — рабочее
    # предположение, а не проверенный факт, и требует ручной проверки
    # человеком, а не подтверждена автоматически.
    needs_review: bool = False

    def __post_init__(self) -> None:
        if not self.content_hash:
            self.content_hash = compute_content_hash(self.content)

    def to_dict(self) -> dict:
        return asdict(self)
