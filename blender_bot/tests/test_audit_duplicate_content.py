"""Тесты на scripts/audit_duplicate_content.py — BB-003 (hardening ТЗ):
отчёт по дублям content_hash, ничего не удаляет."""

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from knowledge.registry import ChunkRegistry  # noqa: E402
from knowledge.schema import KnowledgeChunk  # noqa: E402

_MODULE_PATH = Path(__file__).resolve().parent.parent / "scripts" / "audit_duplicate_content.py"
_spec = importlib.util.spec_from_file_location("audit_duplicate_content", _MODULE_PATH)
audit = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(audit)


def _chunk(**overrides) -> KnowledgeChunk:
    defaults = dict(
        id="test:0001", source="test", source_type="official_manual",
        authority=100, version="5.1", language="ru", topic="modifiers",
        subtopic="options", date=None, url="https://example.invalid/x",
        original_title="Title", translated_title="Заголовок",
        content="Одинаковый текст.",
    )
    defaults.update(overrides)
    return KnowledgeChunk(**defaults)


class GroupByContentHashTests(unittest.TestCase):
    def test_finds_duplicate_group(self):
        chunks = [
            _chunk(id="a", content="одинаковый текст"),
            _chunk(id="b", content="одинаковый текст"),
            _chunk(id="c", content="другой текст"),
        ]
        groups = audit.group_by_content_hash(chunks)
        self.assertEqual(len(groups), 1)
        group = next(iter(groups.values()))
        self.assertEqual({c.id for c in group}, {"a", "b"})

    def test_no_duplicates_returns_empty(self):
        chunks = [_chunk(id="a", content="раз"), _chunk(id="b", content="два")]
        self.assertEqual(audit.group_by_content_hash(chunks), {})

    def test_group_of_three(self):
        chunks = [_chunk(id=f"c{i}", content="то же самое") for i in range(3)]
        groups = audit.group_by_content_hash(chunks)
        self.assertEqual(len(groups), 1)
        self.assertEqual(len(next(iter(groups.values()))), 3)


class BuildReportTests(unittest.TestCase):
    def test_report_mentions_all_ids_and_counts(self):
        chunks = [
            _chunk(id="a", content="одинаковый текст"),
            _chunk(id="b", content="одинаковый текст"),
            _chunk(id="c", content="уникальный"),
        ]
        groups = audit.group_by_content_hash(chunks)
        report = audit.build_report(chunks, groups)
        self.assertIn("Всего chunks в базе: 3", report)
        self.assertIn("Групп дублей", report)
        self.assertIn("`a`", report)
        self.assertIn("`b`", report)
        self.assertNotIn("`c`", report)  # уникальный chunk не в отчёте о дублях

    def test_report_on_no_duplicates_says_zero_groups(self):
        chunks = [_chunk(id="a", content="раз"), _chunk(id="b", content="два")]
        report = audit.build_report(chunks, {})
        self.assertIn("Групп дублей (2+ chunk'а с одинаковым content_hash): 0", report)


class LoadAllChunksTests(unittest.TestCase):
    def test_merges_multiple_registries(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            r1 = ChunkRegistry()
            r1.add(_chunk(id="a"))
            p1 = tmp_path / "r1.json"
            r1.save(p1)

            r2 = ChunkRegistry()
            r2.add(_chunk(id="b"))
            p2 = tmp_path / "r2.json"
            r2.save(p2)

            chunks = audit.load_all_chunks([p1, p2])
            self.assertEqual({c.id for c in chunks}, {"a", "b"})

    def test_does_not_modify_source_files(self):
        # Явная проверка "ничего не удаляет" — размер файла на диске не
        # меняется просто от запуска аудита.
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "r.json"
            r = ChunkRegistry()
            r.add(_chunk(id="a"))
            r.save(path)
            before = path.read_text(encoding="utf-8")

            chunks = audit.load_all_chunks([path])
            audit.group_by_content_hash(chunks)

            after = path.read_text(encoding="utf-8")
            self.assertEqual(before, after)


if __name__ == "__main__":
    unittest.main()
