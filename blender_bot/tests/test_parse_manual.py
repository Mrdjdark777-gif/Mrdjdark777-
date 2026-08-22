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


if __name__ == "__main__":
    unittest.main()
