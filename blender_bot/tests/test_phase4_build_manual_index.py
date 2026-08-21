"""Регрессионный тест на баг Phase 4: RST field list (":align: right :alt: ...")
под директивами вроде ".. figure::" утекал в summary как обычный текст,
испортив 978 из 1748 страниц при первой сборке (см. PROJECT_PLAN.md Phase 4).
"""

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

_MODULE_PATH = Path(__file__).resolve().parent.parent / "scripts" / "build_manual_index.py"
_spec = importlib.util.spec_from_file_location("build_manual_index", _MODULE_PATH)
build_manual_index = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(build_manual_index)


def _parse(rst_text: str) -> dict | None:
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "page.rst"
        path.write_text(rst_text, encoding="utf-8")
        return build_manual_index.parse_rst_file(path)


class ParseRstFileFieldListTests(unittest.TestCase):
    def test_figure_options_only_yield_empty_summary(self):
        rst = (
            "Combine Color Node\n"
            "===================\n"
            "\n"
            ".. figure:: /images/node.png\n"
            "   :align: right\n"
            "   :alt: Combine Color node.\n"
        )
        parsed = _parse(rst)
        # либо None (парсер отбраковывает совсем пустой summary), либо summary=""
        self.assertTrue(parsed is None or parsed["summary"] == "")

    def test_real_paragraph_survives_after_figure_options(self):
        rst = (
            "Extrude\n"
            "=======\n"
            "\n"
            ".. figure:: /images/extrude.png\n"
            "   :align: right\n"
            "   :alt: Extrude tool illustration.\n"
            "\n"
            "The Extrude tool duplicates the selected geometry and moves it along "
            "the surface normal to build new connected geometry, which is one of "
            "the most fundamental modeling operations in Blender and is used "
            "constantly when building up complex meshes from simple primitives.\n"
        )
        parsed = _parse(rst)
        self.assertIsNotNone(parsed)
        self.assertNotIn(":align:", parsed["summary"])
        self.assertNotIn(":alt:", parsed["summary"])
        self.assertIn("Extrude tool duplicates", parsed["summary"])

    def test_plain_paragraph_without_directive_unaffected(self):
        rst = (
            "Mirror Modifier\n"
            "===============\n"
            "\n"
            "Mirrors the mesh across a chosen axis relative to the object origin, "
            "which is useful for symmetric modeling of characters and objects.\n"
        )
        parsed = _parse(rst)
        self.assertIsNotNone(parsed)
        self.assertIn("Mirrors the mesh", parsed["summary"])


if __name__ == "__main__":
    unittest.main()
