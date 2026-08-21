"""Тесты Phase 10 (Source ranking, разделы 14 и 17 ТЗ): Confidence Engine
и Conflict Engine."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import KNOWLEDGE_CHUNK_PATHS, TERMINOLOGY_PATH
from knowledge.schema import KnowledgeChunk
from search.confidence import classify_confidence
from search.engine import ScoredChunk, SearchEngine
from search.qa_service import _find_competing_source


def _chunk(**overrides) -> KnowledgeChunk:
    defaults = dict(
        id="test:0001", source="test", source_type="official_manual",
        authority=100, version="5.1", language="ru", topic="modifiers",
        subtopic=None, date=None, url="https://example.invalid/x",
        original_title="Mirror Modifier", translated_title="Модификатор Зеркало",
        content="Отражает меш по выбранной оси.",
    )
    defaults.update(overrides)
    return KnowledgeChunk(**defaults)


def _scored(chunk: KnowledgeChunk, **overrides) -> ScoredChunk:
    defaults = dict(
        chunk=chunk, score=1.0, relevance=1.0, lexical_score=0.5,
        authority_score=1.0, exact_term_bonus=1.0, version_score=1.0,
        topic_score=1.0, matched_term="Mirror Modifier",
    )
    defaults.update(overrides)
    return ScoredChunk(**defaults)


class ClassifyConfidenceTests(unittest.TestCase):
    def test_none_is_unknown(self):
        self.assertEqual(classify_confidence(None), "UNKNOWN")

    def test_official_exact_term_is_high(self):
        chunk = _chunk(source_type="official_manual")
        scored = _scored(chunk, exact_term_bonus=1.0, version_score=1.0)
        self.assertEqual(classify_confidence(scored), "HIGH")

    def test_official_without_exact_term_is_medium(self):
        chunk = _chunk(source_type="official_manual")
        scored = _scored(chunk, exact_term_bonus=0.3, version_score=1.0)
        self.assertEqual(classify_confidence(scored), "MEDIUM")

    def test_version_conflict_forces_low_even_for_official(self):
        chunk = _chunk(source_type="official_manual")
        scored = _scored(chunk, exact_term_bonus=1.0, version_score=0.2)
        self.assertEqual(classify_confidence(scored), "LOW")

    def test_unverified_source_is_low(self):
        chunk = _chunk(source_type="ai_generated_unverified", authority=None)
        scored = _scored(chunk, exact_term_bonus=1.0, version_score=1.0)
        self.assertEqual(classify_confidence(scored), "LOW")

    def test_high_authority_community_source_is_medium(self):
        # A/B-tier — пока нет реальных данных (knowledge/community/* пусто),
        # но правило должно уже сейчас корректно работать на синтетике.
        chunk = _chunk(source_type="community_qa", authority=80)
        scored = _scored(chunk, exact_term_bonus=1.0, version_score=1.0)
        self.assertEqual(classify_confidence(scored), "MEDIUM")

    def test_low_authority_source_is_low(self):
        chunk = _chunk(source_type="community_qa", authority=10)
        scored = _scored(chunk, exact_term_bonus=1.0, version_score=1.0)
        self.assertEqual(classify_confidence(scored), "LOW")


class FindCompetingSourceTests(unittest.TestCase):
    def test_no_second_result_returns_none(self):
        self.assertIsNone(_find_competing_source([_scored(_chunk())]))

    def test_different_source_type_with_exact_term_is_competing(self):
        official = _scored(_chunk(id="a", source_type="official_manual"), exact_term_bonus=1.0)
        personal = _scored(
            _chunk(id="b", source_type="ai_generated_unverified", authority=None),
            exact_term_bonus=1.0,
        )
        competing = _find_competing_source([official, personal])
        self.assertEqual(competing.id, "b")

    def test_same_source_type_is_not_competing(self):
        a = _scored(_chunk(id="a", source_type="official_manual"), exact_term_bonus=1.0)
        b = _scored(_chunk(id="b", source_type="official_manual"), exact_term_bonus=1.0)
        self.assertIsNone(_find_competing_source([a, b]))

    def test_weak_runner_up_is_not_competing(self):
        # раздел 17 ТЗ: конкурирующий источник должен быть РЕАЛЬНО про ту же
        # тему (exact_term_bonus>=1.0), а не просто вторым в списке.
        official = _scored(_chunk(id="a", source_type="official_manual"), exact_term_bonus=1.0)
        weak = _scored(
            _chunk(id="b", source_type="ai_generated_unverified", authority=None),
            exact_term_bonus=0.3,
        )
        self.assertIsNone(_find_competing_source([official, weak]))


class RealDataConfidenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        missing = [p for p in KNOWLEDGE_CHUNK_PATHS if not p.exists()]
        if missing:
            raise unittest.SkipTest(f"нет данных: {missing}")
        cls.engine = SearchEngine(KNOWLEDGE_CHUNK_PATHS, TERMINOLOGY_PATH)

    def _search(self, query, requested_version=None):
        return self.engine.search(query, requested_version=requested_version, top_n=5)

    def test_confident_official_match_is_high(self):
        results = self._search("как сделать булеан")
        top = results[0]
        self.assertEqual(top.chunk.source_type, "official_manual")
        self.assertEqual(classify_confidence(top), "HIGH")

    def test_version_conflict_demotes_to_low(self):
        results = self._search("как создать риг", requested_version="3.6")
        official = next((r for r in results if r.chunk.source_type == "official_manual"), None)
        self.assertIsNotNone(official, "ожидался хотя бы один official-результат в топ-5")
        self.assertEqual(classify_confidence(official), "LOW")

    def test_boolean_query_finds_a_real_competing_source(self):
        # Именно тот случай, что был найден вручную при проверке Phase 10:
        # официальный Manual и личная заметка оба точно про Boolean Modifier.
        results = self._search("как сделать булеан")
        competing = _find_competing_source(results)
        self.assertIsNotNone(competing)
        self.assertEqual(competing.source_type, "ai_generated_unverified")


class FormattingIntegrationTests(unittest.TestCase):
    """Через bot/handlers/qa.py — проверяет, что confidence/conflict реально
    доходят до отформатированного текста, а не теряются по пути."""

    @classmethod
    def setUpClass(cls):
        missing = [p for p in KNOWLEDGE_CHUNK_PATHS if not p.exists()]
        if missing:
            raise unittest.SkipTest(f"нет данных: {missing}")
        from bot.handlers import qa as qa_module
        cls.qa_module = qa_module

    def test_high_confidence_official_answer_has_no_low_disclaimer(self):
        result = self.qa_module.qa_service.answer("как сделать булеан")
        text = self.qa_module._format_chunk_answer(result.chunk, result.confidence, result.competing_chunk)
        self.assertNotIn("невысокая", text)
        self.assertIn("Также нашлась информация", text)

    def test_low_confidence_unverified_answer_has_single_disclaimer_not_duplicated(self):
        chunk = KnowledgeChunk(
            id="x", source="test", source_type="ai_generated_unverified", authority=None,
            version=None, language="ru", topic="general", subtopic=None, date=None, url=None,
            original_title="X", translated_title="X", content="Текст ответа.",
        )
        text = self.qa_module._format_chunk_answer(chunk, "LOW", None)
        self.assertEqual(text.count("не сверено"), 1)
        self.assertNotIn("Уверенность в этом ответе невысокая", text)


if __name__ == "__main__":
    unittest.main()
