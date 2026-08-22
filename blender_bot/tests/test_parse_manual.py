"""Тесты ТЗ v3, раздел 2.1: docutils-парсер scripts/parse_manual.py.

Работает на синтетической RST-странице (см. SAMPLE_RST) — без сети, без
реального клона blender-manual (тот занимает от часа на полном корпусе,
см. докстринг parse_manual.py). Синтетика воспроизводит именно те
структурные особенности реального Manual, которые ломали наивный подход
(интро без обёртки в section, неизвестные Sphinx-роли/директивы,
вложенные definition_list) — они были найдены и исправлены по итогам
реального прогона на blender-manual (bevel.rst), см. PROJECT_PLAN.md.
"""

import importlib.util
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from knowledge.schema import AUTHORITY_TIERS  # noqa: E402

_MODULE_PATH = Path(__file__).resolve().parent.parent / "scripts" / "parse_manual.py"
_spec = importlib.util.spec_from_file_location("parse_manual", _MODULE_PATH)
pm = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pm)

SAMPLE_RST = """
.. index:: Bevel

######
Bevel Modifier
######

.. figure:: /images/bevel.png

   The Bevel modifier.

The Bevel modifier bevels the edges of the mesh it is applied to.
It is a non-destructive alternative to the :doc:`Bevel Operation
</modeling/meshes/editing/bevel>` in Edit Mode.

.. note::

   The Miter Shape slider stays active when miters are enabled.

.. warning::

   Applying this modifier is destructive.

Options
=======

Affect
   :Vertices:
      Only the areas near vertices are beveled.
   :Edges:
      Bevel the edges, creating intersections at vertices.

Width Type
   Defines how Width will be interpreted.

:bl-icon:`arrow_leftright` Invert
   Inverts the influence of the selected vertex group.
"""


class ParseRstFileTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        tmp = Path(pm.__file__).resolve().parent.parent / "tests" / "_tmp_bevel_fixture.rst"
        tmp.write_text(SAMPLE_RST, encoding="utf-8")
        cls._tmp_path = tmp
        cls.result = pm.parse_rst_file(tmp)

    @classmethod
    def tearDownClass(cls):
        cls._tmp_path.unlink(missing_ok=True)

    def test_title_extracted(self):
        self.assertEqual(self.result["title"], "Bevel Modifier")

    def test_intro_paragraph_found_without_section_wrapper(self):
        # Регрессия: первая версия парсера спускалась внутрь первого
        # top-level section в поисках intro и всегда получала пустую
        # строку, потому что intro в реальном Manual — прямые дети
        # doctree, а не содержимое section.
        self.assertIn("bevels the edges", self.result["intro"])
        self.assertIn("non-destructive alternative", self.result["intro"])

    def test_unknown_role_does_not_leak_into_intro(self):
        self.assertNotIn("Unknown interpreted", self.result["intro"])
        self.assertNotIn(":doc:", self.result["intro"])

    def test_note_and_warning_separated(self):
        self.assertEqual(len(self.result["notes"]), 1)
        self.assertIn("Miter Shape", self.result["notes"][0])
        self.assertEqual(len(self.result["warnings"]), 1)
        self.assertIn("destructive", self.result["warnings"][0])

    def test_options_definition_list_extracted(self):
        joined = " ".join(self.result["options"])
        self.assertIn("Affect", joined)
        self.assertIn("Width Type", joined)

    def test_unknown_icon_role_does_not_leak_into_options(self):
        joined = " ".join(self.result["options"])
        self.assertNotIn("bl-icon", joined)
        self.assertNotIn("Unknown interpreted", joined)
        self.assertIn("Invert", joined)


class CategoryAndUrlTests(unittest.TestCase):
    def test_category_from_section_path(self):
        self.assertEqual(pm.category_from_section_path("modeling/modifiers/generate/bevel"), "modeling")
        self.assertEqual(pm.category_from_section_path(""), "general")

    def test_build_url(self):
        root = Path("/manual")
        rst = Path("/manual/modeling/modifiers/generate/bevel.rst")
        url = pm.build_url(rst, root)
        self.assertEqual(url, pm.DOCS_BASE_URL + "modeling/modifiers/generate/bevel.html")


class BuildRegistryTests(unittest.TestCase):
    def setUp(self):
        entries = [
            {
                "section_path": "modeling/modifiers/generate/bevel", "url": "https://example/bevel.html",
                "category": "modeling", "kind": "intro", "title": "Модификатор Bevel",
                "content": "Скашивает рёбра меша.", "title_en": "Bevel Modifier", "content_en": "Bevels mesh edges.",
            },
            {
                "section_path": "modeling/modifiers/generate/bevel", "url": "https://example/bevel.html",
                "category": "modeling", "kind": "note", "title": "Модификатор Bevel — примечание",
                "content": "Слайдер остаётся активным.", "title_en": "x", "content_en": "y", "seq": 0,
            },
        ]
        self.registry = pm.build_registry(entries)

    def test_two_chunks_built(self):
        self.assertEqual(len(self.registry.chunks), 2)

    def test_ids_unique_and_kind_suffixed(self):
        ids = [c.id for c in self.registry.chunks]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertTrue(any(i.endswith("bevel") for i in ids))
        self.assertTrue(any("note0" in i for i in ids))

    def test_authority_s_tier_official_manual(self):
        for chunk in self.registry.chunks:
            self.assertEqual(chunk.authority, AUTHORITY_TIERS["S"])
            self.assertEqual(chunk.source, "blender_manual")
            self.assertEqual(chunk.source_type, "official_manual")

    def test_subtopic_is_kind(self):
        kinds = {c.subtopic for c in self.registry.chunks}
        self.assertEqual(kinds, {"intro", "note"})

    def test_original_title_preserved(self):
        intro = next(c for c in self.registry.chunks if c.subtopic == "intro")
        self.assertEqual(intro.original_title, "Bevel Modifier")
        self.assertEqual(intro.translated_title, "Модификатор Bevel")


class _FakeGoogleTranslatorThatTranslatesEnglishWords:
    """Имитирует реальную находку: GoogleTranslator переводит английские
    слова ВНУТРИ маркера-разделителя, если он состоит из обычных слов
    (было "SPLIT" -> "РАЗДЕЛЕНИЕ"). Голые символы (|||) не трогает —
    так и было замечено на реальном сервисе, см. TRANSLATE_DELIMITER."""

    def __init__(self, source=None, target=None):
        pass

    def translate(self, text: str) -> str:
        translated = text.replace("SPLIT", "РАЗДЕЛЕНИЕ")
        # грубая имитация перевода остального текста, чтобы отличать
        # переведённый результат от непереведённого в тестах ниже
        return translated.replace("Hello", "Привет")


class _FakeGoogleTranslatorThatSurvivesPipes:
    def __init__(self, source=None, target=None):
        pass

    def translate(self, text: str) -> str:
        return text.replace("Hello", "Привет").replace("world", "мир")


class TranslateEntriesRegressionTests(unittest.TestCase):
    """Регрессия на реальный найденный баг: старый маркер "\\n|||SPLIT|||\\n"
    никогда не совпадал после перевода (Google переводил само слово
    SPLIT), из-за чего translate_entries тихо, без единой ошибки,
    оставляла ВСЕ записи на английском — целый прогон на ~9000 записей
    впустую. Смотри комментарий у TRANSLATE_DELIMITER в parse_manual.py."""

    def test_word_based_delimiter_would_have_failed_silently(self):
        # Демонстрирует сам механизм поломки на старом маркере — не
        # используется в текущем коде, только документирует находку.
        old_marker = "|||SPLIT|||"
        combined = f"Hello{chr(10)}|||SPLIT|||{chr(10)}world"
        fake = _FakeGoogleTranslatorThatTranslatesEnglishWords()
        translated = fake.translate(combined)
        self.assertNotIn(old_marker, translated)  # воспроизводит баг

    def test_current_symbol_only_delimiter_survives_translation(self):
        marker = pm.TRANSLATE_DELIMITER.strip()
        self.assertNotIn(" ", marker)
        # маркер не должен содержать латинских букв — иначе Google может
        # решить, что это переводимое слово (см. регрессия выше)
        self.assertFalse(any(ch.isalpha() for ch in marker))

    def test_translate_entries_applies_translation_with_fake_translator(self):
        entries = [{"title": "Hello", "content": "world"}]
        with patch.object(pm, "GoogleTranslator", _FakeGoogleTranslatorThatSurvivesPipes):
            pm.translate_entries(entries)
        self.assertEqual(entries[0]["title_en"], "Hello")
        self.assertEqual(entries[0]["content_en"], "world")
        self.assertEqual(entries[0]["title"], "Привет")
        self.assertEqual(entries[0]["content"], "мир")

    def test_translate_entries_raises_fast_if_smoke_test_entirely_fails(self):
        # Раньше это молча тянулось часами на полном корпусе, не бросая
        # ни одного исключения — теперь падает сразу на первых записях.
        entries = [{"title": f"T{i}", "content": f"C{i}"} for i in range(25)]

        class _AlwaysBrokenTranslator:
            def __init__(self, source=None, target=None):
                pass

            def translate(self, text: str) -> str:
                # Имитирует реальную находку: перевод "срабатывает", но
                # сам маркер-разделитель не переживает его и пропадает
                # из результата — split() никогда не совпадает.
                return text.replace(pm.TRANSLATE_DELIMITER.strip(), "")

        with patch.object(pm, "GoogleTranslator", _AlwaysBrokenTranslator):
            with self.assertRaises(RuntimeError):
                pm.translate_entries(entries)


if __name__ == "__main__":
    unittest.main()
