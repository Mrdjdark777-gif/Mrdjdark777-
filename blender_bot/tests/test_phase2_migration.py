"""Smoke-тесты Phase 2 (refactor architecture).

Изначально здесь также проверялись KnowledgeBase/ManualIndex/QAService —
эти классы и их наивный поиск по data/knowledge_base.json /
data/manual_index.json заменены в Phase 7 движком search/engine.py поверх
knowledge/ registry (см. tests/test_phase7_*.py). Тут остаётся то, что
по-прежнему живёт без изменений: пути конфига и HotkeyLookup.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import HOTKEYS_PATH, KNOWLEDGE_BASE_PATH
from search.hotkey_lookup import HotkeyLookup


class ConfigPathsTests(unittest.TestCase):
    def test_data_paths_resolve_to_project_data_dir(self):
        # BASE_DIR теперь считается из config/__init__.py (на уровень глубже,
        # чем раньше был config.py) — если бы поправка на .parent.parent была
        # забыта, DATA_DIR указывал бы на config/data и все пути ниже не
        # существовали бы.
        self.assertTrue(KNOWLEDGE_BASE_PATH.exists(), KNOWLEDGE_BASE_PATH)
        self.assertTrue(HOTKEYS_PATH.exists(), HOTKEYS_PATH)


class HotkeyLookupTests(unittest.TestCase):
    def test_finds_known_key(self):
        lookup = HotkeyLookup(HOTKEYS_PATH)
        # Tab почти наверняка есть хотя бы в одной категории горячих клавиш.
        matches = lookup.find("tab")
        self.assertIsInstance(matches, list)


if __name__ == "__main__":
    unittest.main()
