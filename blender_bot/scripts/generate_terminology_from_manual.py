"""ТЗ v3, раздел 1.1: "Расширить словарь двуязычной терминологии
(knowledge/system/terminology)". Ручное добавление терминов по одному,
как раньше в этом проекте, не масштабируется на 1741 intro-страницу
Manual — этот скрипт генерирует термины программно из уже распарсенных
и переведённых данных `knowledge/official/manual/5.1/manual.json`
(scripts/parse_manual.py), а не заново скачивает/переводит.

Каждая intro-страница Manual (subtopic="intro", раздел 2.1 — заголовок +
вступительные абзацы) — кандидат в термин: original_title/translated_title
уже есть, topic уже сопоставлен разделу пути rst-файла.

Фильтры (оба нужны — без них риск ложных срабатываний, найденный при
проверке реальных данных):
  - Только УНИКАЛЬНЫЕ заголовки (встречаются на РОВНО одной странице).
    "Introduction" встречается 89 раз, "Toolbar" — 8, "Brush Settings" —
    7 и т.д. — такие заголовки не идентифицируют никакую конкретную
    функцию Blender, регистрировать их термином значило бы взять
    случайную из N одноимённых страниц.
  - Заголовок из ≥2 слов ИЛИ короткая ЗАГЛАВНАЯ аббревиатура (FBX, STL,
    UV, PBR, HDRI). Однословные обычные заголовки вроде "Face", "Skin",
    "Mask", "Draw", "Fill", "Grab", "View" — Google Translate переводит
    их вне технического контекста Blender ("Draw"->"Ничья" — "ничья" в
    игре, не "рисование"; "Skin"->"Кожа" — анатомическая кожа, не
    Skin-модификатор) и как алиасы они рискуют ложно совпасть с
    повседневной лексикой в несвязанных вопросах — тот же класс бага,
    что уже был найден и исправлен для "режим отображения"/Display Mode
    (PROJECT_PLAN.md, между этапами ТЗ v3).

topic (первый сегмент пути .rst-файла) не совпадает со словарём
TERMINOLOGY_CATEGORIES (раздел 9 ТЗ, фиксированный список) — часть
сопоставлена напрямую, часть добавлена в TERMINOLOGY_CATEGORIES как
законно недостающие категории (interface/scene_layout/files), часть
намеренно пропущена (contribute/advanced/troubleshooting/getting_started/
glossary/index — это страницы ПРО документацию/проект, а не термины
функций Blender, раздел 9 явно про терминологию функций).

Существующие вручную подобранные термины (knowledge/system/terminology/
terms.json, 39 штук) НЕ перезаписываются — скрипт загружает их и
добавляет новые поверх, пропуская названия, уже зарегистрированные под
любым существующим алиасом (TerminologyRegistry.find()).

Запуск:
    python scripts/generate_terminology_from_manual.py
"""

from __future__ import annotations

import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import KNOWLEDGE_CHUNK_PATHS, TERMINOLOGY_PATH  # noqa: E402
from knowledge.registry import ChunkRegistry  # noqa: E402
from knowledge.terminology import Term, TerminologyRegistry  # noqa: E402

MANUAL_JSON_PATH = next(p for p in KNOWLEDGE_CHUNK_PATHS if "manual" in p.parts)

# Прямое сопоставление topic (первый сегмент rst-пути) -> раздел 9 ТЗ
# TERMINOLOGY_CATEGORIES. None — сознательно пропускаем (страницы про
# документацию/проект, не про функции Blender).
_TOPIC_TO_CATEGORY = {
    "modeling": "modeling",
    "render": "rendering",
    "compositing": "compositing",
    "sculpt_paint": "sculpting",
    "animation": "animation",
    "physics": "physics",
    "grease_pencil": "grease_pencil",
    "video_editing": "vse",
    "movie_clip": "motion_tracking",
    "addons": "addons",
    "editors": "interface",  # редакторы — часть интерфейса, грубое приближение
    "scene_layout": "scene_layout",
    "interface": "interface",
    "files": "files",
    "contribute": None,
    "advanced": None,
    "troubleshooting": None,
    "getting_started": None,
    "glossary": None,
    "index": None,
}

_ACRONYM_RE = re.compile(r"^[A-Z][A-Z0-9]{1,5}$")


def _is_acceptable_title(title: str) -> bool:
    if " " in title.strip():
        return True
    return bool(_ACRONYM_RE.match(title.strip()))


def build_new_terms(registry: TerminologyRegistry) -> list[Term]:
    chunks = ChunkRegistry.load(MANUAL_JSON_PATH).chunks
    intro_chunks = [c for c in chunks if c.subtopic == "intro"]

    title_counts = Counter(c.original_title.strip() for c in intro_chunks)

    new_terms: list[Term] = []
    skipped_duplicate = 0
    skipped_generic = 0
    skipped_uncategorized = 0
    skipped_already_registered = 0

    for chunk in intro_chunks:
        title_en = chunk.original_title.strip()
        title_ru = chunk.translated_title.strip()
        if not title_en or not title_ru:
            continue
        if title_counts[title_en] > 1:
            skipped_duplicate += 1
            continue
        if not _is_acceptable_title(title_en):
            skipped_generic += 1
            continue

        category = _TOPIC_TO_CATEGORY.get(chunk.topic)
        if category is None:
            skipped_uncategorized += 1
            continue

        if registry.find(title_en) or registry.find(title_ru):
            skipped_already_registered += 1
            continue

        term = Term(
            canonical_name=title_en,
            russian_name=title_ru,
            category=category,
        )
        new_terms.append(term)
        # find() ищет только по уже добавленным терминам — регистрируем
        # сразу, иначе две intro-страницы с разными topic, но случайно
        # одинаковым по нормализации названием, обе попали бы в список.
        registry.add(term)

    print(f"Кандидатов (intro-страниц): {len(intro_chunks)}")
    print(f"Новых терминов: {len(new_terms)}")
    print(f"Пропущено (дублирующийся заголовок на разных страницах): {skipped_duplicate}")
    print(f"Пропущено (слишком общий однословный заголовок): {skipped_generic}")
    print(f"Пропущено (topic без сопоставленной категории): {skipped_uncategorized}")
    print(f"Пропущено (уже зарегистрировано под этим или другим именем): {skipped_already_registered}")
    return new_terms


def main() -> None:
    registry = TerminologyRegistry.load(TERMINOLOGY_PATH)
    before = len(registry.terms)
    build_new_terms(registry)
    registry.save(TERMINOLOGY_PATH)
    print(f"Сохранено в {TERMINOLOGY_PATH}: {before} -> {len(registry.terms)} терминов")


if __name__ == "__main__":
    main()
