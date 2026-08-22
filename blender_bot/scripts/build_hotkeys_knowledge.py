"""ТЗ v3, живая обратная связь (после раздела 2.2): data/hotkeys.json
доступен только через search/hotkey_lookup.py::HotkeyLookup — а тот
ОДНОНАПРАВЛЕННЫЙ (название клавиши → что делает), не умеет отвечать на
"какая клавиша делает X" по тексту описания. Реальный вопрос "Какой
хоткей дублирует объект в Blender?" (Shift+D РЕАЛЬНО есть в hotkeys.json,
категория "Базовые манипуляции") провалился в generic soft_match вместо
правильного ответа — HotkeyLookup.find() тут вообще не участвует (ищет
по буквам клавиш в запросе, не по смыслу), а SearchEngine ничего не
знает про содержимое hotkeys.json (см. PROJECT_PLAN.md, живая
обратная связь).

Этот скрипт превращает КАЖДУЮ строку "Клавиша — Описание" из
data/hotkeys.json в отдельный KnowledgeChunk (raздел 6 ТЗ) и сохраняет в
knowledge/system/hotkeys/hotkeys_chunks.json — обычный источник для
SearchEngine (добавляется в config.KNOWLEDGE_CHUNK_PATHS), наравне с
personal notes и официальным Manual. search/hotkey_lookup.py НЕ
заменяется и НЕ удаляется — это отдельный, более быстрый прямой путь
для запросов вида "что делает Ctrl+Z" (пользователь уже знает
комбинацию), а этот новый источник закрывает противоположный сценарий
("какая клавиша делает X", пользователь знает действие, не комбинацию).

Категории с префиксом "Manual — " (раздел 2.2,
scripts/generate_hotkeys_from_manual.py) получают
source_type="official_manual"/authority=100 (S-tier, тот же официальный
источник, что и остальной Manual). Остальные (изначально
hand-curated пользователем) — "ai_generated_unverified"/needs_review=False:
не хуже personal notes по доверию (тот же source_type, что и
knowledge/personal/dima_notes — раздел 5 ТЗ), но написаны и
провалидированы человеком, а не сгенерированы ассистентом при
заполнении базы, поэтому needs_review не ставится (в отличие от
dima_notes, где ручная проверка ещё не пройдена, см. knowledge/README.md).

Запуск (быстрый, без сети — данные уже есть в data/hotkeys.json):
    python scripts/build_hotkeys_knowledge.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import HOTKEYS_PATH, KNOWLEDGE_DIR  # noqa: E402
from knowledge.registry import ChunkRegistry  # noqa: E402
from knowledge.schema import AUTHORITY_TIERS, KnowledgeChunk  # noqa: E402

OUTPUT_PATH = KNOWLEDGE_DIR / "system" / "hotkeys" / "hotkeys_chunks.json"

_SLUG_RE = re.compile(r"[^a-zA-Zа-яА-ЯёЁ0-9]+")


def _slug(text: str) -> str:
    return _SLUG_RE.sub("_", text).strip("_").lower() or "x"


def build_registry() -> ChunkRegistry:
    with open(HOTKEYS_PATH, encoding="utf-8") as f:
        data: dict[str, list[str]] = json.load(f)

    registry = ChunkRegistry()
    for category, lines in data.items():
        is_manual_sourced = category.startswith("Manual — ")
        category_slug = _slug(category)
        for i, line in enumerate(lines):
            if " — " not in line:
                continue
            key_part, desc_part = line.split(" — ", 1)
            key_part = key_part.strip()
            desc_part = desc_part.strip()
            if not key_part or not desc_part:
                continue

            # Заголовок ДОЛЖЕН содержать слова самого действия ("дублировать
            # объект"), а не только комбинацию клавиш ("Shift+D") — chunk.
            # title весит вдвое больше content в BM25-индексе
            # (SearchEngine._chunk_tokens: tokenize(title)*2 + ...), так что
            # заголовок без слов действия оставляет chunk без реального
            # шанса против десятков других Manual-страниц, тоже упоминающих
            # "дублировать"/"объект" мимоходом — найдено проверкой реального
            # вопроса "Какой хоткей дублирует объект в Blender?" перед
            # принятием подхода, не предположено заранее (PROJECT_PLAN.md).
            action_title = desc_part if len(desc_part) <= 80 else desc_part[:80].rsplit(" ", 1)[0] + "..."
            title = f"{key_part} — {action_title}"

            chunk = KnowledgeChunk(
                id=f"hotkeys:{category_slug}:{i}",
                source="hotkeys",
                source_type="official_manual" if is_manual_sourced else "ai_generated_unverified",
                authority=AUTHORITY_TIERS["S"] if is_manual_sourced else None,
                version=None,
                language="ru",
                topic="interface",
                subtopic=category,
                date=None,
                url=None,
                original_title=title,
                translated_title=title,
                content=line,
                needs_review=False,
            )
            registry.add(chunk)

    return registry


def main() -> None:
    registry = build_registry()
    registry.save(OUTPUT_PATH)
    print(f"Сохранено {len(registry.chunks)} chunks в {OUTPUT_PATH}")
    dupes = registry.duplicate_content_hashes()
    if dupes:
        print(f"Внимание: {len(dupes)} групп дублей по content_hash")


if __name__ == "__main__":
    main()
