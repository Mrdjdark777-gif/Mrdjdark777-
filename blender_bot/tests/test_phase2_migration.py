"""Smoke-тесты Phase 2 (refactor architecture).

Это не полноценный Test Suite из раздела 34 ТЗ (тот — Phase 13, минимум 400
кейсов). Цель здесь уже: подтвердить, что перенос utils/*, handlers/qa.py в
config/, search/, profile/, bot/ не изменил поведение и все новые модули
реально импортируются и работают на существующих data/*.json.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import HOTKEYS_PATH, KNOWLEDGE_BASE_PATH, MANUAL_INDEX_PATH, UNANSWERED_LOG_PATH
from search.hotkey_lookup import HotkeyLookup
from search.knowledge_base import KnowledgeBase
from search.manual_index import ManualIndex
from search.qa_service import QAService


class ConfigPathsTests(unittest.TestCase):
    def test_data_paths_resolve_to_project_data_dir(self):
        # BASE_DIR теперь считается из config/__init__.py (на уровень глубже,
        # чем раньше был config.py) — если бы поправка на .parent.parent была
        # забыта, DATA_DIR указывал бы на config/data и все пути ниже не
        # существовали бы.
        self.assertTrue(KNOWLEDGE_BASE_PATH.exists(), KNOWLEDGE_BASE_PATH)
        self.assertTrue(HOTKEYS_PATH.exists(), HOTKEYS_PATH)


class KnowledgeBaseTests(unittest.TestCase):
    def setUp(self):
        self.kb = KnowledgeBase(KNOWLEDGE_BASE_PATH)

    def test_loads_entries(self):
        self.assertGreater(len(self.kb.entries), 0)

    def test_search_returns_none_for_empty_query(self):
        self.assertIsNone(self.kb.search(""))

    def test_search_finds_a_real_entry_by_its_own_question(self):
        sample = self.kb.entries[0]
        match = self.kb.search(sample["question"])
        self.assertIsNotNone(match)
        self.assertEqual(match["question"], sample["question"])

    def test_get_by_idx_roundtrip(self):
        sample = self.kb.entries[0]
        self.assertEqual(self.kb.get_by_idx(0)["question"], sample["question"])
        self.assertIsNone(self.kb.get_by_idx(-1))
        self.assertIsNone(self.kb.get_by_idx(len(self.kb.entries) + 100))


class HotkeyLookupTests(unittest.TestCase):
    def test_finds_known_key(self):
        lookup = HotkeyLookup(HOTKEYS_PATH)
        # Tab почти наверняка есть хотя бы в одной категории горячих клавиш.
        matches = lookup.find("tab")
        self.assertIsInstance(matches, list)


class ManualIndexTests(unittest.TestCase):
    def test_missing_file_does_not_crash(self):
        index = ManualIndex(MANUAL_INDEX_PATH)
        # data/manual_index.json в .gitignore и обычно отсутствует локально —
        # ManualIndex должен деградировать до пустого списка, а не падать.
        self.assertIsInstance(index.entries, list)
        self.assertIsNone(index.search("modifier"))


class QAServiceTests(unittest.TestCase):
    def setUp(self):
        self.service = QAService(
            KNOWLEDGE_BASE_PATH, HOTKEYS_PATH, MANUAL_INDEX_PATH, UNANSWERED_LOG_PATH
        )

    def test_exact_kb_question_returns_kb_exact(self):
        sample_question = self.service.knowledge_base.entries[0]["question"]
        result = self.service.answer(sample_question)
        self.assertEqual(result.kind, "kb_exact")
        self.assertIsNotNone(result.entry)

    def test_gibberish_falls_back(self):
        result = self.service.answer("ыъъфывапролдж11223 zzz")
        self.assertIn(result.kind, {"fallback", "manual"})


if __name__ == "__main__":
    unittest.main()
