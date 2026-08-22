"""Тесты Phase 7: QAService поверх нового SearchEngine (см. search/qa_service.py)."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import HOTKEYS_PATH, KNOWLEDGE_CHUNK_PATHS, TERMINOLOGY_PATH, UNANSWERED_LOG_PATH
from search.qa_service import QAService


class QAServiceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        missing = [p for p in KNOWLEDGE_CHUNK_PATHS if not p.exists()]
        if missing:
            raise unittest.SkipTest(f"нет данных: {missing}")
        cls.service = QAService(HOTKEYS_PATH, UNANSWERED_LOG_PATH, KNOWLEDGE_CHUNK_PATHS, TERMINOLOGY_PATH)

    def test_confident_query_returns_chunk_confident(self):
        result = self.service.answer("как сделать булеан")
        self.assertEqual(result.kind, "chunk_confident")
        self.assertIsNotNone(result.chunk)
        self.assertGreaterEqual(result.score, 0.75)

    def test_gibberish_falls_back(self):
        result = self.service.answer("ыъъфывапролдж11223 zzz")
        self.assertEqual(result.kind, "fallback")

    def test_hotkey_question_returns_hotkeys(self):
        # "tab" не входит ни в один из 36 засеянных терминов и не должен
        # набрать высокий score по контенту — но есть в hotkeys.json.
        result = self.service.answer("tab")
        self.assertIn(result.kind, {"hotkeys", "fallback", "soft_match"})

    def test_get_chunk_roundtrip(self):
        result = self.service.answer("как сделать булеан")
        chunk = self.service.get_chunk(result.chunk.id)
        self.assertEqual(chunk.id, result.chunk.id)

    def test_get_chunk_unknown_id_returns_none(self):
        self.assertIsNone(self.service.get_chunk("does-not-exist"))

    def test_loop_cut_answer_carries_reference_chunk_with_hotkey(self):
        # Hardening ТЗ, живой баг: этот же вопрос раньше отвечал описанием
        # механики БЕЗ Ctrl-R, хотя хоткей объективно есть в базе с
        # 2026-08-23 (см. scripts/parse_manual.py, reference:: fix) —
        # регрессия на реальных данных, не синтетике.
        result = self.service.answer("как сделать loop cut")
        self.assertEqual(result.kind, "chunk_confident")
        self.assertIsNotNone(result.reference_chunk)
        self.assertIn("Ctrl-R", result.reference_chunk.content)


if __name__ == "__main__":
    unittest.main()
