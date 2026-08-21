"""Индексирует data/manual_index.json (официальный Blender Manual) в
knowledge/official/manual/5.1/ через knowledge.registry (Phase 4, разделы
4 и 6 ТЗ).

Не запускает сборку сам. Если data/manual_index.json нет — сначала нужно
запустить scripts/build_manual_index.py (клонирует blender-manual, парсит
.rst, переводит на русский; нужен интернет и git, на некоторых песочницах
недоступно — см. DEPLOYMENT.md, п.10).

Каждая страница Manual становится одним chunk'ом уровня S-tier (authority=100,
раздел 3 ТЗ). content — переведённый summary страницы (первый абзац, не
полный текст) — это честно зафиксировано в section_path через суффикс
":summary", а не выдаётся за полную страницу.

Запуск:
    python scripts/ingest_manual_to_registry.py
"""

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import MANUAL_INDEX_PATH  # noqa: E402
from knowledge.registry import ChunkRegistry  # noqa: E402
from knowledge.schema import AUTHORITY_TIERS, KnowledgeChunk  # noqa: E402

# Держать в синхроне с scripts/build_manual_index.py:MANUAL_VERSION_LABEL —
# дублирование ради того, чтобы это оставалось независимым разовым скриптом
# без импорта scripts/ как пакета.
MANUAL_VERSION_LABEL = "5.1"
MANUAL_LICENSE = "CC-BY-SA"

OUTPUT_PATH = (
    Path(__file__).resolve().parent.parent
    / "knowledge" / "official" / "manual" / MANUAL_VERSION_LABEL / "manual.json"
)

_ID_SAFE_RE = re.compile(r"[^a-zA-Z0-9_.-]+")


def _topic_subtopic(section_path: str | None) -> tuple[str, str | None]:
    if not section_path:
        return "general", None
    parts = [p for p in section_path.split("/") if p]
    topic = parts[0] if parts else "general"
    subtopic = parts[1] if len(parts) > 1 else None
    return topic, subtopic


def _make_id(section_path: str | None, url: str, idx: int) -> str:
    basis = section_path or url
    slug = _ID_SAFE_RE.sub("_", basis).strip("_") or f"page{idx:05d}"
    return f"blender_manual:{MANUAL_VERSION_LABEL}:{slug}"


def build_registry(entries: list[dict]) -> tuple[ChunkRegistry, int]:
    """Строит ChunkRegistry из сырых записей manual_index.json.

    Отдельно от main(), чтобы логику можно было протестировать на
    маленькой выборке без реального data/manual_index.json (тот появляется
    только после build_manual_index.py, требующего интернет и ~15-30 минут).
    """
    registry = ChunkRegistry()
    skipped = 0

    for idx, entry in enumerate(entries):
        summary = entry.get("summary")
        if not summary:
            skipped += 1
            continue

        section_path = entry.get("section_path")
        topic, subtopic = _topic_subtopic(section_path)
        version = entry.get("version") or MANUAL_VERSION_LABEL

        chunk = KnowledgeChunk(
            id=_make_id(section_path, entry["url"], idx),
            source="blender_manual",
            source_type="official_manual",
            authority=AUTHORITY_TIERS["S"],
            version=version,
            language="ru",
            topic=topic,
            subtopic=subtopic,
            date=None,  # .rst-файлы не содержат даты публикации/ревизии
            url=entry["url"],
            original_title=entry.get("title_en") or entry["title"],
            translated_title=entry["title"],
            content=summary,
            license=MANUAL_LICENSE,
            author=None,  # коллективный официальный документ, не персональный автор
            parent_document=None,
            section_path=f"{section_path}:summary" if section_path else "summary",
        )
        registry.add(chunk)

    return registry, skipped


def main(input_path: Path = MANUAL_INDEX_PATH, output_path: Path = OUTPUT_PATH) -> None:
    if not input_path.exists():
        print(
            f"{input_path} не найден. Сначала запусти "
            "scripts/build_manual_index.py (нужен интернет и git — см. DEPLOYMENT.md, п.10)."
        )
        sys.exit(1)

    with open(input_path, encoding="utf-8") as f:
        entries = json.load(f)

    registry, skipped = build_registry(entries)

    registry.save(output_path)
    print(f"Проиндексировано {len(registry.chunks)} чанков -> {output_path}")
    if skipped:
        print(f"Пропущено {skipped} записей без summary")

    dupes = registry.duplicate_content_hashes()
    if dupes:
        print(f"Внимание: {len(dupes)} групп дублей по content_hash")


if __name__ == "__main__":
    main()
