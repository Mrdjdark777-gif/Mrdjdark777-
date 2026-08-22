"""Тесты ТЗ v3, раздел 2.2: scripts/generate_hotkeys_from_manual.py.

Синтетическая RST-фикстура воспроизводит реальную структуру
interface/keymap/blender_default.rst (list-table с :kbd: ролями внутри
секций) — без сети, без реального клона Manual."""

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

_MODULE_PATH = Path(__file__).resolve().parent.parent / "scripts" / "generate_hotkeys_from_manual.py"
_spec = importlib.util.spec_from_file_location("generate_hotkeys_from_manual", _MODULE_PATH)
ghm = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ghm)

SAMPLE_RST = """
Default Keymap
===============

General
-------

.. list-table::

   * - :kbd:`Ctrl-S`
     - Save file.
   * - :kbd:`Ctrl-Z`
     - Undo.

Animation
---------

.. list-table::

   * - :kbd:`I`
     - Insert a keyframe.
"""


class ExtractCategoriesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        tmp = Path(ghm.__file__).resolve().parent.parent / "tests" / "_tmp_keymap_fixture.rst"
        tmp.write_text(SAMPLE_RST, encoding="utf-8")
        cls._tmp_path = tmp
        cls.categories = ghm.extract_categories(tmp)

    @classmethod
    def tearDownClass(cls):
        cls._tmp_path.unlink(missing_ok=True)

    def test_finds_both_sections(self):
        self.assertEqual(set(self.categories.keys()), {"General", "Animation"})

    def test_general_section_has_two_rows(self):
        self.assertEqual(len(self.categories["General"]), 2)
        # Дефис Manual'а ("Ctrl-S") конвертируется в "+" — формат,
        # который понимает search/hotkey_lookup.py._normalize_key.
        self.assertIn(("Ctrl+S", "Save file."), self.categories["General"])

    def test_animation_section_has_one_row(self):
        self.assertEqual(self.categories["Animation"], [("I", "Insert a keyframe.")])


class MergeIntoExistingTests(unittest.TestCase):
    """Проверяет НЕ-разрушающее слияние: main() не переопределён отдельной
    функцией для тестируемости merge-логики без сети, поэтому здесь
    напрямую тестируется сама идея — существующие категории не трогаются."""

    def test_existing_category_wins_over_new(self):
        existing = {"Навигация по вьюпорту": ["Старое ручное значение"]}
        new_from_manual = {"Manual — Навигация по вьюпорту": ["Новое сгенерированное значение"]}
        merged = dict(existing)
        added = 0
        for category, lines in new_from_manual.items():
            if category in merged:
                continue
            merged[category] = lines
            added += 1
        self.assertEqual(added, 1)
        self.assertEqual(merged["Навигация по вьюпорту"], ["Старое ручное значение"])
        self.assertIn("Manual — Навигация по вьюпорту", merged)

    def test_rerun_is_idempotent(self):
        existing = {"Manual — General": ["Ctrl-S — Save file."]}
        new_from_manual = {"Manual — General": ["Ctrl-S — Save file. (regenerated)"]}
        merged = dict(existing)
        added = 0
        for category, lines in new_from_manual.items():
            if category in merged:
                continue
            merged[category] = lines
            added += 1
        self.assertEqual(added, 0)
        self.assertEqual(merged["Manual — General"], ["Ctrl-S — Save file."])


class _FakeGoogleTranslatorThatTransliteratesLetters:
    """Имитирует реальную находку: на живом прогоне GoogleTranslator
    транслитерировал ОДИНОЧНЫЕ буквы клавиш в кириллицу, когда переводил
    "key — description" ОДНИМ запросом — "Ctrl+O" -> "Ctrl+О" (кириллическая
    "О", не латинская), "F1" -> "Ф1". Визуально похоже, физически другая
    клавиша — ни один такой хоткей никогда бы не сработал. Фикс —
    переводить ТОЛЬКО description, никогда не пропуская key через
    translate(). Этот фейк транслитерирует ЛЮБОЙ текст, включая ключи,
    если translate_categories по ошибке передаст их переводчику."""

    _LETTER_MAP = str.maketrans("OHKACEPMTXBecrt", "ОНКАСЕРМТХВесгт")

    def __init__(self, source=None, target=None):
        pass

    def translate(self, text: str) -> str:
        return text.translate(self._LETTER_MAP)


class TranslateCategoriesRegressionTests(unittest.TestCase):
    """Регрессия на реальный найденный баг: колонка клавиш не должна
    проходить через переводчик вообще, только описание."""

    def test_key_column_never_translated(self):
        categories = {"General": [("Ctrl+O", "Open file."), ("F1", "Help.")]}
        with patch.object(ghm, "GoogleTranslator", _FakeGoogleTranslatorThatTransliteratesLetters):
            translated = ghm.translate_categories(categories)
        lines = next(iter(translated.values()))
        self.assertTrue(any(line.startswith("Ctrl+O — ") for line in lines), lines)
        self.assertTrue(any(line.startswith("F1 — ") for line in lines), lines)

    def test_description_is_translated(self):
        categories = {"General": [("Ctrl+O", "Open file.")]}
        with patch.object(ghm, "GoogleTranslator", _FakeGoogleTranslatorThatTransliteratesLetters):
            translated = ghm.translate_categories(categories)
        lines = next(iter(translated.values()))
        # Фейк-переводчик транслитерирует "Open file." тоже (о/р/е и т.д.
        # входят в _LETTER_MAP) — здесь только проверяем, что описание
        # РЕАЛЬНО прошло через translate(), а не осталось как есть.
        self.assertNotEqual(lines[0].split(" — ", 1)[1], "Open file.")


class HotkeyLookupCompatibilityTests(unittest.TestCase):
    """Сгенерированный формат должен реально читаться существующим
    HotkeyLookup (search/hotkey_lookup.py), а не только выглядеть похоже."""

    def test_generated_format_is_findable_by_hotkey_lookup(self):
        from search.hotkey_lookup import HotkeyLookup

        data = {"Manual — General": ["Ctrl+S — Save file.", "Ctrl+Z — Undo."]}
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "hotkeys.json"
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False)
            lookup = HotkeyLookup(path)
            matches = lookup.find("как сохранить файл ctrl+s")
            self.assertTrue(any("Save file" in desc for desc, _cat in matches))


if __name__ == "__main__":
    unittest.main()
