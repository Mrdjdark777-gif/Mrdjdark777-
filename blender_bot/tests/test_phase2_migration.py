"""Smoke-тесты Phase 2 (refactor architecture).

Изначально здесь также проверялись KnowledgeBase/ManualIndex/QAService —
эти классы и их наивный поиск по data/knowledge_base.json /
data/manual_index.json заменены в Phase 7 движком search/engine.py поверх
knowledge/ registry (см. tests/test_phase7_*.py). Тут остаётся то, что
по-прежнему живёт без изменений: пути конфига и HotkeyLookup.
"""

import json
import sys
import tempfile
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


class HotkeyLookupSyntheticTests(unittest.TestCase):
    """Тесты на синтетических данных — не зависят от реального
    data/hotkeys.json, проверяют саму логику разбора комбинаций."""

    @classmethod
    def setUpClass(cls):
        data = {"Общее": ["Alt+N — открыть меню Normals.", "Ctrl+Z — отменить действие."]}
        cls._tmp = tempfile.TemporaryDirectory()
        cls.path = Path(cls._tmp.name) / "hotkeys.json"
        with open(cls.path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        cls.lookup = HotkeyLookup(cls.path)

    @classmethod
    def tearDownClass(cls):
        cls._tmp.cleanup()

    def test_combo_without_spaces_around_plus(self):
        matches = self.lookup.find("что делает Alt+N")
        self.assertTrue(any("Normals" in desc for desc, _cat in matches))

    def test_combo_with_spaces_around_plus(self):
        # Регрессия: "Alt + N" (с пробелами вокруг +, как реально написал
        # пользователь на проде) токенизировался как ["alt", "+", "n"] —
        # одиночный "+" становился своим токеном, склейка соседних токенов
        # строила мусор ("alt++", "+n") вместо "alt+n", и find() тихо падал
        # обратно на голое совпадение по "n" (которого здесь и нет вовсе,
        # а на реальных данных вернул бы неверный, но правдоподобный
        # хоткей). Нашлось на живом вопросе "Что делает комбинация Alt + N",
        # см. PROJECT_PLAN.md.
        matches = self.lookup.find("что делает комбинация Alt + N")
        self.assertTrue(any("Normals" in desc for desc, _cat in matches), matches)

    def test_unknown_combo_returns_empty_not_wrong_partial_match(self):
        # Ctrl+X не зарегистрирован — не должен молча подставиться под
        # частичное совпадение по одной "x" (которой тоже нет), результат
        # должен быть честно пустым.
        matches = self.lookup.find("что делает Ctrl + X")
        self.assertEqual(matches, [])


if __name__ == "__main__":
    unittest.main()
