"""Тесты Phase 4 (официальный Blender Manual): логика ingest_manual_to_registry.py.

Работает на маленькой синтетической выборке — не требует реального
data/manual_index.json (тот появляется только после build_manual_index.py,
который клонирует blender-manual и переводит ~2000 страниц, занимает до
30 минут и требует интернет).
"""

import importlib.util
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from knowledge.registry import ChunkRegistry, validate_chunk
from knowledge.schema import AUTHORITY_TIERS

MANUAL_JSON_PATH = (
    Path(__file__).resolve().parent.parent
    / "knowledge" / "official" / "manual" / "5.1" / "manual.json"
)

_MODULE_PATH = Path(__file__).resolve().parent.parent / "scripts" / "ingest_manual_to_registry.py"
_spec = importlib.util.spec_from_file_location("ingest_manual_to_registry", _MODULE_PATH)
ingest = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ingest)


SAMPLE_ENTRIES = [
    {
        "title": "Экструдирование",
        "title_en": "Extrude",
        "summary": "Инструмент выдавливания геометрии.",
        "summary_en": "Tool for extruding geometry.",
        "url": "https://docs.blender.org/manual/en/latest/modeling/meshes/editing/extrude.html",
        "version": "5.1",
        "section_path": "modeling/meshes/editing/extrude",
    },
    {
        "title": "Модификатор Mirror",
        "title_en": "Mirror Modifier",
        "summary": "Отражает меш по выбранной оси.",
        "summary_en": "Mirrors the mesh across a chosen axis.",
        "url": "https://docs.blender.org/manual/en/latest/modeling/modifiers/generate/mirror.html",
        "version": "5.1",
        "section_path": "modeling/modifiers/generate/mirror",
    },
    {
        # запись без summary — должна быть пропущена, не сломать сборку
        "title": "Пустая страница",
        "title_en": "Empty Page",
        "summary": "",
        "url": "https://docs.blender.org/manual/en/latest/empty.html",
        "version": "5.1",
        "section_path": "empty",
    },
    {
        # запись в "старом" формате — без title_en/summary_en/version/section_path,
        # как если бы её собрал build_manual_index.py до фикса Phase 4
        "title": "Legacy Entry",
        "summary": "Some legacy summary without translation metadata.",
        "url": "https://docs.blender.org/manual/en/latest/legacy.html",
    },
]


class BuildRegistryTests(unittest.TestCase):
    def setUp(self):
        self.registry, self.skipped = ingest.build_registry(SAMPLE_ENTRIES)

    def test_skips_entries_without_summary(self):
        self.assertEqual(self.skipped, 1)
        self.assertEqual(len(self.registry.chunks), 3)

    def test_every_chunk_is_valid(self):
        for chunk in self.registry.chunks:
            validate_chunk(chunk)

    def test_authority_is_s_tier(self):
        for chunk in self.registry.chunks:
            self.assertEqual(chunk.authority, AUTHORITY_TIERS["S"])
            self.assertEqual(chunk.source_type, "official_manual")

    def test_preserves_original_english_title(self):
        extrude = next(c for c in self.registry.chunks if "extrude" in c.id)
        self.assertEqual(extrude.original_title, "Extrude")
        self.assertEqual(extrude.translated_title, "Экструдирование")

    def test_topic_subtopic_derived_from_section_path(self):
        mirror = next(c for c in self.registry.chunks if "mirror" in c.id)
        self.assertEqual(mirror.topic, "modeling")
        self.assertEqual(mirror.subtopic, "modifiers")

    def test_legacy_entry_falls_back_gracefully(self):
        legacy = next(c for c in self.registry.chunks if "legacy" in c.id)
        # нет title_en -> original_title падает обратно на title
        self.assertEqual(legacy.original_title, "Legacy Entry")
        # нет version -> берётся MANUAL_VERSION_LABEL по умолчанию
        self.assertEqual(legacy.version, ingest.MANUAL_VERSION_LABEL)
        # нет section_path -> topic="general", subtopic=None
        self.assertEqual(legacy.topic, "general")
        self.assertIsNone(legacy.subtopic)

    def test_ids_are_unique(self):
        ids = [c.id for c in self.registry.chunks]
        self.assertEqual(len(ids), len(set(ids)))

    def test_no_duplicate_content(self):
        self.assertEqual(self.registry.duplicate_content_hashes(), {})


class IndexedManualTests(unittest.TestCase):
    """Проверки на реальный knowledge/official/manual/5.1/manual.json.

    С ТЗ v3 этапа 5 файл собирается через scripts/parse_manual.py
    (docutils-парсер), а НЕ build_manual_index.py+ingest_manual_to_registry.py
    (которые тестировал этот файл изначально, см. PROJECT_PLAN.md Phase 4 —
    те скрипты устарели, но физически ещё не удалены). Пропускаются, если
    файла ещё нет — сборка занимает больше часа и требует интернет, не
    должна быть обязательным условием для остальных тестов.
    """

    @classmethod
    def setUpClass(cls):
        if not MANUAL_JSON_PATH.exists():
            raise unittest.SkipTest(f"{MANUAL_JSON_PATH} ещё не собран")
        cls.registry = ChunkRegistry.load(MANUAL_JSON_PATH)

    def test_has_a_substantial_number_of_chunks(self):
        # ТЗ v3 этап 5: умное чанкирование (intro/note/warning/options на
        # страницу) — 8952 chunks с полного прогона на 2389 rst-файлах,
        # не одно summary на страницу, как раньше (было <1748).
        self.assertGreater(len(self.registry.chunks), 5000)

    def test_every_chunk_is_valid(self):
        for chunk in self.registry.chunks:
            validate_chunk(chunk)

    def test_no_field_list_leakage_survives(self):
        for chunk in self.registry.chunks:
            self.assertNotIn(":align:", chunk.content)
            self.assertNotIn(":alt:", chunk.content)

    def test_all_s_tier_official_manual(self):
        for chunk in self.registry.chunks:
            self.assertEqual(chunk.authority, AUTHORITY_TIERS["S"])
            self.assertEqual(chunk.source, "blender_manual")
            self.assertEqual(chunk.source_type, "official_manual")
            self.assertEqual(chunk.version, "5.1")

    def test_original_english_titles_preserved(self):
        # хотя бы часть чанков должна иметь original_title, отличный от
        # translated_title — иначе фикс title_en/summary_en не сработал
        differing = [c for c in self.registry.chunks if c.original_title != c.translated_title]
        self.assertGreater(len(differing), len(self.registry.chunks) * 0.5)


if __name__ == "__main__":
    unittest.main()
