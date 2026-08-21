"""Тесты Phase 7 (Search engine, раздел 10 ТЗ): SearchEngine на синтетике и
на реальных knowledge/ данных.
"""

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import KNOWLEDGE_CHUNK_PATHS, TERMINOLOGY_PATH
from knowledge.registry import ChunkRegistry
from knowledge.schema import KnowledgeChunk
from knowledge.terminology import Term, TerminologyRegistry
from search.engine import SearchEngine, extract_version_hint


def _chunk(**overrides) -> KnowledgeChunk:
    defaults = dict(
        id="test:0001", source="test", source_type="official_manual",
        authority=100, version="5.1", language="ru", topic="modifiers",
        subtopic=None, date=None, url="https://example.invalid/x",
        original_title="Mirror Modifier", translated_title="Модификатор Зеркало",
        content="Отражает меш по выбранной оси относительно точки Origin.",
    )
    defaults.update(overrides)
    return KnowledgeChunk(**defaults)


class SyntheticEngineTests(unittest.TestCase):
    """Небольшой контролируемый корпус — проверяем сами правила движка, а не
    качество реальных данных (для этого отдельный класс ниже)."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        tmp_path = Path(self.tmp.name)

        chunks_registry = ChunkRegistry()
        chunks_registry.add(_chunk(
            id="official:mirror", source_type="official_manual", authority=100,
            version="5.1", topic="modifiers",
            original_title="Mirror Modifier", translated_title="Модификатор Зеркало",
            content="Официальное описание модификатора Mirror: отражает меш по оси.",
        ))
        chunks_registry.add(_chunk(
            id="personal:mirror", source_type="ai_generated_unverified", authority=None,
            version=None, topic="general",
            original_title="Mirror", translated_title="Как использовать Mirror?",
            content="Личная заметка про модификатор Mirror и типичные ошибки.",
        ))
        chunks_registry.add(_chunk(
            id="official:unrelated", source_type="official_manual", authority=100,
            version="5.1", topic="rendering",
            original_title="Cycles", translated_title="Введение в Cycles",
            content="Path-tracing движок рендеринга с глобальным освещением.",
        ))
        chunk_path = tmp_path / "chunks.json"
        chunks_registry.save(chunk_path)

        term_registry = TerminologyRegistry()
        term_registry.add(Term(
            canonical_name="Mirror Modifier", russian_name="Модификатор Зеркало",
            category="modifiers", aliases=["зеркало"], english_aliases=["mirror"],
        ))
        term_path = tmp_path / "terms.json"
        term_registry.save(term_path)

        self.engine = SearchEngine([chunk_path], term_path)

    def tearDown(self):
        self.tmp.cleanup()

    def test_relevant_query_outranks_unrelated_chunk(self):
        results = self.engine.search("модификатор зеркало")
        ids = [r.chunk.id for r in results]
        self.assertIn("official:mirror", ids[:2])
        self.assertNotIn("official:unrelated", ids)

    def test_official_outranks_personal_when_both_match_equally_well(self):
        results = self.engine.search("mirror")
        by_id = {r.chunk.id: r for r in results}
        self.assertIn("official:mirror", by_id)
        self.assertIn("personal:mirror", by_id)
        self.assertGreater(by_id["official:mirror"].score, by_id["personal:mirror"].score)

    def test_nonsense_query_scores_near_zero(self):
        results = self.engine.search("совершенно бессмысленный набор слов зюзюка")
        self.assertTrue(all(r.score < 0.2 for r in results))

    def test_gibberish_below_relevant_match(self):
        relevant = self.engine.search("зеркало")[0].score
        gibberish_results = self.engine.search("зюзюка мяу абракадабра")
        gibberish_score = gibberish_results[0].score if gibberish_results else 0.0
        self.assertLess(gibberish_score, relevant)

    def test_alias_word_boundary_no_false_positive(self):
        # "риг" не должен ложно совпасть внутри "оригинал"
        term_registry = TerminologyRegistry.load(
            Path(self.tmp.name) / "terms.json"
        )
        term_registry.add(Term(
            canonical_name="Armature", russian_name="Арматура",
            category="rigging", aliases=["риг"],
        ))
        term_path = Path(self.tmp.name) / "terms2.json"
        term_registry.save(term_path)

        chunks_registry = ChunkRegistry()
        chunks_registry.add(_chunk(
            id="decoy:original", topic="rendering",
            original_title="Оригинальные настройки", translated_title="Оригинальные настройки",
            content="Здесь просто оригинал файла, без темы риггинга вообще.",
        ))
        chunk_path = Path(self.tmp.name) / "chunks2.json"
        chunks_registry.save(chunk_path)

        engine = SearchEngine([chunk_path], term_path)
        term = engine._find_term("риг")
        self.assertIsNotNone(term)
        bonus = engine._exact_term_bonus(term, engine.chunks[0])
        self.assertLess(bonus, 1.0)  # не должно ложно сработать на "оригинал"

    def test_version_conflict_demotes_score(self):
        neutral = self.engine.search("mirror", requested_version=None)
        same_version = self.engine.search("mirror", requested_version="5.1")
        conflicting = self.engine.search("mirror", requested_version="3.6")

        official_neutral = next(r for r in neutral if r.chunk.id == "official:mirror")
        official_same = next(r for r in same_version if r.chunk.id == "official:mirror")
        official_conflict = next(r for r in conflicting if r.chunk.id == "official:mirror")

        self.assertEqual(official_neutral.score, official_same.score)
        self.assertLess(official_conflict.score, official_same.score)

    def test_unknown_chunk_version_not_penalized(self):
        results = self.engine.search("mirror", requested_version="3.6")
        personal = next(r for r in results if r.chunk.id == "personal:mirror")
        self.assertEqual(personal.version_score, 1.0)

    def test_get_chunk_by_id(self):
        chunk = self.engine.get_chunk("official:mirror")
        self.assertIsNotNone(chunk)
        self.assertEqual(chunk.id, "official:mirror")
        self.assertIsNone(self.engine.get_chunk("does-not-exist"))

    def test_empty_query_returns_no_results(self):
        self.assertEqual(self.engine.search(""), [])


class ExtractVersionHintTests(unittest.TestCase):
    def test_finds_major_minor(self):
        self.assertEqual(extract_version_hint("в блендере 4.2 как сделать риг"), "4.2")

    def test_finds_major_minor_patch(self):
        self.assertEqual(extract_version_hint("версия 5.1.1"), "5.1.1")

    def test_no_version_returns_none(self):
        self.assertIsNone(extract_version_hint("как сделать булеан"))


class RealDataEngineTests(unittest.TestCase):
    """Регрессионные проверки на реальном корпусе (840 chunks на момент
    Phase 7) — фиксируют находки из ручной проверки в PROJECT_PLAN.md."""

    @classmethod
    def setUpClass(cls):
        missing = [p for p in KNOWLEDGE_CHUNK_PATHS if not p.exists()]
        if missing:
            raise unittest.SkipTest(f"нет данных: {missing}")
        cls.engine = SearchEngine(KNOWLEDGE_CHUNK_PATHS, TERMINOLOGY_PATH)

    def test_loads_full_corpus(self):
        self.assertGreater(len(self.engine.chunks), 800)

    def test_gibberish_scores_low(self):
        results = self.engine.search("непонятный набор слов зюзюка мяу")
        self.assertTrue(all(r.score < 0.3 for r in results))

    def test_boolean_query_finds_boolean_content(self):
        results = self.engine.search("как сделать булеан")
        self.assertTrue(results)
        self.assertEqual(results[0].matched_term, "Boolean Modifier")
        self.assertGreater(results[0].score, 0.5)

    def test_generic_word_alias_does_not_hijack_unrelated_query(self):
        # Регрессия: "материал" как отдельный алиас Principled BSDF раньше
        # давал ложный exact_term_bonus=1.0 на совершенно не по теме
        # страницах ("Введение" и т.п.) — раздел про это в PROJECT_PLAN.md.
        results = self.engine.search("материал не виден на объекте")
        self.assertTrue(results)
        for r in results[:3]:
            self.assertLess(r.score, 0.8, r.chunk.translated_title)

    def test_official_manual_present_in_top_results_for_common_query(self):
        results = self.engine.search("geometry nodes", top_n=10)
        self.assertTrue(any(r.chunk.source_type == "official_manual" for r in results))


if __name__ == "__main__":
    unittest.main()
