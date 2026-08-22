"""Тесты живой обратной связи: scripts/build_hotkeys_knowledge.py и
scripts/generate_terminology_from_hotkeys.py.

Реальный вопрос "Какой хоткей дублирует объект в Blender?" не находил
ответа: data/hotkeys.json был доступен только через однонаправленный
search/hotkey_lookup.py (клавиша -> описание), а personal/hotkeys-
контент без зарегистрированного термина систематически проигрывал
official Manual chunk'ам с мимоходным упоминанием тех же слов — только
за счёт authority (1.0 против 0.3). См. PROJECT_PLAN.md."""

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from knowledge.registry import ChunkRegistry, validate_chunk  # noqa: E402
from knowledge.schema import AUTHORITY_TIERS  # noqa: E402
from knowledge.terminology import TerminologyRegistry  # noqa: E402


def _load_module(name: str, filename: str):
    module_path = Path(__file__).resolve().parent.parent / "scripts" / filename
    spec = importlib.util.spec_from_file_location(name, module_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


bhk = _load_module("build_hotkeys_knowledge", "build_hotkeys_knowledge.py")
gth = _load_module("generate_terminology_from_hotkeys", "generate_terminology_from_hotkeys.py")


class BuildHotkeysKnowledgeTests(unittest.TestCase):
    """build_registry() читает config.HOTKEYS_PATH напрямую — подменяем
    его на временный файл, не трогая реальный data/hotkeys.json."""

    def _build_with_data(self, data: dict) -> ChunkRegistry:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "hotkeys.json"
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False)
            with patch.object(bhk, "HOTKEYS_PATH", path):
                return bhk.build_registry()

    def test_one_chunk_per_line(self):
        data = {"Общее": ["Ctrl+S — сохранить файл.", "Ctrl+Z — отменить действие."]}
        registry = self._build_with_data(data)
        self.assertEqual(len(registry.chunks), 2)

    def test_every_chunk_is_valid(self):
        data = {"Общее": ["Ctrl+S — сохранить файл."]}
        registry = self._build_with_data(data)
        for chunk in registry.chunks:
            validate_chunk(chunk)

    def test_title_includes_action_words_not_just_key(self):
        # Раньше заголовок был "Горячая клавиша: Ctrl+S" — без слов
        # действия BM25 (title весит вдвое больше content) не давал chunk'у
        # шанса против десятков страниц, мимоходом упоминающих то же слово.
        data = {"Общее": ["Ctrl+S — сохранить файл."]}
        registry = self._build_with_data(data)
        self.assertIn("сохранить", registry.chunks[0].translated_title.lower())

    def test_manual_sourced_category_gets_official_authority(self):
        data = {"Manual — Общее": ["Ctrl+S — сохранить файл."]}
        registry = self._build_with_data(data)
        chunk = registry.chunks[0]
        self.assertEqual(chunk.source_type, "official_manual")
        self.assertEqual(chunk.authority, AUTHORITY_TIERS["S"])

    def test_hand_curated_category_gets_unverified_type(self):
        data = {"Базовые манипуляции": ["Ctrl+S — сохранить файл."]}
        registry = self._build_with_data(data)
        chunk = registry.chunks[0]
        self.assertEqual(chunk.source_type, "ai_generated_unverified")
        self.assertIsNone(chunk.authority)
        self.assertFalse(chunk.needs_review)

    def test_line_without_dash_is_skipped_not_crash(self):
        data = {"Общее": ["Строка без тире вообще"]}
        registry = self._build_with_data(data)
        self.assertEqual(len(registry.chunks), 0)


class GenerateTerminologyFromHotkeysTests(unittest.TestCase):
    def _run_with_data(self, data: dict, existing_terms: list | None = None):
        with tempfile.TemporaryDirectory() as tmp:
            hotkeys_path = Path(tmp) / "hotkeys.json"
            terms_path = Path(tmp) / "terms.json"
            with open(hotkeys_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False)
            if existing_terms is not None:
                with open(terms_path, "w", encoding="utf-8") as f:
                    json.dump(existing_terms, f, ensure_ascii=False)
            with patch.object(gth, "HOTKEYS_PATH", hotkeys_path), patch.object(
                gth, "TERMINOLOGY_PATH", terms_path
            ):
                gth.main()
            return TerminologyRegistry.load(terms_path)

    def test_extracts_term_from_parenthetical_english_name(self):
        data = {"Общее": ["Shift+D — дублировать объект (Duplicate); копия двигается за курсором."]}
        registry = self._run_with_data(data)
        term = registry.find("Duplicate")
        self.assertIsNotNone(term)
        self.assertEqual(term.russian_name, "дублировать объект")

    def test_conjugated_alias_matches_natural_question_form(self):
        # Регрессия на реальный найденный баг: "Что делает X?" использует
        # спрягаемый глагол ("дублирует"), описание хоткея - инфинитив
        # ("дублировать") - без этого алиаса термин не находился вообще.
        data = {"Общее": ["Shift+D — дублировать объект (Duplicate); копия двигается за курсором."]}
        registry = self._run_with_data(data)
        term = registry.find("дублирует")
        self.assertIsNotNone(term)
        self.assertEqual(term.canonical_name, "Duplicate")

    def test_line_without_english_parens_is_skipped(self):
        data = {"Общее": ["G — переместить объект."]}
        registry = self._run_with_data(data)
        self.assertIsNone(registry.find("переместить"))

    def test_rerun_does_not_duplicate_term_but_adds_missing_alias(self):
        existing = [
            {
                "canonical_name": "Duplicate", "russian_name": "дублировать объект",
                "category": "interface", "aliases": [], "english_aliases": [],
                "ui_label": None, "related_terms": [], "common_mistakes": [],
            }
        ]
        data = {"Общее": ["Shift+D — дублировать объект (Duplicate); копия двигается за курсором."]}
        registry = self._run_with_data(data, existing_terms=existing)
        self.assertEqual(len(registry.terms), 1)  # не задвоилось
        self.assertIsNotNone(registry.find("дублирует"))  # алиас всё равно добавлен


if __name__ == "__main__":
    unittest.main()
