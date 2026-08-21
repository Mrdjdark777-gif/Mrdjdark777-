"""Тесты Phase 3 (Knowledge registry): схема, регистрация, миграция.

Не Test Suite из раздела 34 ТЗ (тот — Phase 13). Цель здесь: подтвердить, что
KnowledgeChunk/ChunkRegistry реально валидируют обязательные поля раздела 6
ТЗ, а миграция data/knowledge_base.json -> knowledge/personal/dima_notes/
не потеряла и не исказила записи.
"""

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import KNOWLEDGE_BASE_PATH
from knowledge.registry import ChunkRegistry, ChunkValidationError, validate_chunk
from knowledge.schema import KnowledgeChunk, compute_content_hash

DIMA_NOTES_PATH = (
    Path(__file__).resolve().parent.parent
    / "knowledge" / "personal" / "dima_notes" / "dima_notes.json"
)


def _make_chunk(**overrides) -> KnowledgeChunk:
    defaults = dict(
        id="test:0001",
        source="unit_test",
        source_type="personal_note",
        authority=None,
        version=None,
        language="ru",
        topic="general",
        subtopic=None,
        date=None,
        url=None,
        original_title="Заголовок",
        translated_title="Заголовок",
        content="Содержимое чанка.",
    )
    defaults.update(overrides)
    return KnowledgeChunk(**defaults)


class KnowledgeChunkTests(unittest.TestCase):
    def test_content_hash_is_auto_computed(self):
        chunk = _make_chunk()
        self.assertEqual(chunk.content_hash, compute_content_hash(chunk.content))

    def test_explicit_content_hash_is_kept(self):
        chunk = _make_chunk(content_hash="deadbeef")
        self.assertEqual(chunk.content_hash, "deadbeef")


class ValidateChunkTests(unittest.TestCase):
    def test_valid_chunk_passes(self):
        validate_chunk(_make_chunk())  # не должно бросить исключение

    def test_nullable_required_fields_are_allowed_none(self):
        # version/date/url/authority/subtopic могут быть None — раздел 7 ТЗ
        validate_chunk(_make_chunk(version=None, date=None, url=None, authority=None, subtopic=None))

    def test_missing_content_raises(self):
        with self.assertRaises(ChunkValidationError):
            validate_chunk(_make_chunk(content=""))

    def test_missing_topic_raises(self):
        with self.assertRaises(ChunkValidationError):
            validate_chunk(_make_chunk(topic=""))


class ChunkRegistrySaveLoadTests(unittest.TestCase):
    def test_roundtrip(self):
        registry = ChunkRegistry()
        registry.add(_make_chunk(id="a:0001"))
        registry.add(_make_chunk(id="a:0002", content="Другое содержимое."))

        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "sub" / "chunks.json"
            registry.save(path)
            self.assertTrue(path.exists())

            loaded = ChunkRegistry.load(path)
            self.assertEqual(len(loaded.chunks), 2)
            self.assertEqual({c.id for c in loaded.chunks}, {"a:0001", "a:0002"})

    def test_load_missing_file_returns_empty_registry(self):
        registry = ChunkRegistry.load(Path("does/not/exist.json"))
        self.assertEqual(registry.chunks, [])

    def test_duplicate_content_hashes_detected(self):
        registry = ChunkRegistry()
        registry.add(_make_chunk(id="a:0001", content="Одинаковый текст."))
        registry.add(_make_chunk(id="a:0002", content="Одинаковый текст."))
        registry.add(_make_chunk(id="a:0003", content="Другой текст."))

        dupes = registry.duplicate_content_hashes()
        self.assertEqual(len(dupes), 1)
        (ids,) = dupes.values()
        self.assertEqual(set(ids), {"a:0001", "a:0002"})


class MigratedDimaNotesTests(unittest.TestCase):
    def test_migration_output_exists(self):
        self.assertTrue(
            DIMA_NOTES_PATH.exists(),
            f"{DIMA_NOTES_PATH} не найден — запусти "
            "scripts/migrate_knowledge_base_to_registry.py",
        )

    def test_migrated_count_matches_source(self):
        with open(KNOWLEDGE_BASE_PATH, encoding="utf-8") as f:
            source_entries = json.load(f)
        registry = ChunkRegistry.load(DIMA_NOTES_PATH)
        self.assertEqual(len(registry.chunks), len(source_entries))

    def test_every_migrated_chunk_is_valid(self):
        registry = ChunkRegistry.load(DIMA_NOTES_PATH)
        for chunk in registry.chunks:
            validate_chunk(chunk)  # не должно бросить исключение ни для одного

    def test_migrated_chunks_flagged_for_review(self):
        # source_type="personal_note" для всех записей — рабочее
        # предположение (см. docstring migrate_knowledge_base_to_registry.py),
        # поэтому needs_review обязан быть True, а не молча забыт.
        registry = ChunkRegistry.load(DIMA_NOTES_PATH)
        self.assertTrue(registry.chunks)
        self.assertTrue(all(c.needs_review for c in registry.chunks))

    def test_no_duplicate_content_among_migrated_chunks(self):
        registry = ChunkRegistry.load(DIMA_NOTES_PATH)
        dupes = registry.duplicate_content_hashes()
        self.assertEqual(dupes, {})


if __name__ == "__main__":
    unittest.main()
