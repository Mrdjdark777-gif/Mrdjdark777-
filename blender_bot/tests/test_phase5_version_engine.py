"""Тесты Phase 5 (Version engine, раздел 7 ТЗ)."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from knowledge.registry import ChunkRegistry
from knowledge.version import (
    ParsedVersion,
    compatible_with_request,
    detect_conflict,
    is_known_release,
    parse_version,
    same_release_family,
)

MANUAL_JSON_PATH = (
    Path(__file__).resolve().parent.parent
    / "knowledge" / "official" / "manual" / "5.1" / "manual.json"
)
DIMA_NOTES_PATH = (
    Path(__file__).resolve().parent.parent
    / "knowledge" / "personal" / "dima_notes" / "dima_notes.json"
)


class ParseVersionTests(unittest.TestCase):
    def test_none_and_empty_are_unknown(self):
        self.assertIsNone(parse_version(None))
        self.assertIsNone(parse_version(""))

    def test_major_minor(self):
        v = parse_version("5.1")
        self.assertEqual((v.major, v.minor, v.patch), (5, 1, None))
        self.assertEqual(v.release_family, "5.1")
        self.assertEqual(str(v), "5.1")

    def test_major_minor_patch(self):
        v = parse_version("5.1.2")
        self.assertEqual((v.major, v.minor, v.patch), (5, 1, 2))
        self.assertEqual(v.release_family, "5.1")
        self.assertEqual(str(v), "5.1.2")

    def test_garbage_is_unknown(self):
        for raw in ["latest", "v5.1", "5", "5.1.2.3", "blender5.1", " "]:
            self.assertIsNone(parse_version(raw), raw)


class IsKnownReleaseTests(unittest.TestCase):
    def test_known_release_from_tz_section_4(self):
        self.assertTrue(is_known_release(parse_version("5.1")))
        self.assertTrue(is_known_release(parse_version("3.6")))
        # патч известного релиза тоже считается известным (тот же release family)
        self.assertTrue(is_known_release(parse_version("5.1.2")))

    def test_unknown_future_or_typo_version(self):
        self.assertFalse(is_known_release(parse_version("9.9")))


class SameReleaseFamilyTests(unittest.TestCase):
    def test_patch_versions_are_same_family(self):
        self.assertTrue(same_release_family(parse_version("5.1"), parse_version("5.1.1")))
        self.assertTrue(same_release_family(parse_version("5.1.1"), parse_version("5.1.2")))

    def test_different_minor_is_different_family(self):
        self.assertFalse(same_release_family(parse_version("5.1"), parse_version("5.0")))

    def test_different_major_is_different_family(self):
        self.assertFalse(same_release_family(parse_version("5.1"), parse_version("4.2")))


class DetectConflictTests(unittest.TestCase):
    def test_same_family_no_conflict(self):
        self.assertIsNone(detect_conflict(parse_version("5.1"), parse_version("5.1.2")))

    def test_unknown_version_never_flagged_as_conflict(self):
        # раздел 7 ТЗ: нельзя утверждать конфликт, если одна из версий неизвестна
        self.assertIsNone(detect_conflict(None, parse_version("5.1")))
        self.assertIsNone(detect_conflict(parse_version("5.1"), None))
        self.assertIsNone(detect_conflict(None, None))

    def test_different_family_is_conflict_ordered_older_newer(self):
        conflict = detect_conflict(parse_version("5.1"), parse_version("4.2"))
        self.assertIsNotNone(conflict)
        self.assertEqual(str(conflict.older), "4.2")
        self.assertEqual(str(conflict.newer), "5.1")

    def test_conflict_order_independent_of_argument_order(self):
        a = detect_conflict(parse_version("3.6"), parse_version("5.1"))
        b = detect_conflict(parse_version("5.1"), parse_version("3.6"))
        self.assertEqual(str(a.older), str(b.older))
        self.assertEqual(str(a.newer), str(b.newer))


class CompatibleWithRequestTests(unittest.TestCase):
    def test_unknown_chunk_version_is_compatible(self):
        self.assertTrue(compatible_with_request(None, "5.1"))

    def test_unknown_requested_version_is_compatible(self):
        self.assertTrue(compatible_with_request("5.1", None))

    def test_both_unknown_is_compatible(self):
        self.assertTrue(compatible_with_request(None, None))

    def test_same_family_is_compatible(self):
        self.assertTrue(compatible_with_request("5.1.2", "5.1"))

    def test_different_family_is_not_compatible(self):
        self.assertFalse(compatible_with_request("4.2", "5.1"))


class RealDataVersionTests(unittest.TestCase):
    """Version engine честно работает и на реальных данных Phase 3/4, не только
    на синтетике — dima_notes без версии, Manual с явной 5.1."""

    def test_dima_notes_versions_are_honestly_unknown(self):
        registry = ChunkRegistry.load(DIMA_NOTES_PATH)
        self.assertTrue(registry.chunks)
        for chunk in registry.chunks:
            self.assertIsNone(parse_version(chunk.version))

    def test_manual_chunks_parse_as_known_5_1_release(self):
        if not MANUAL_JSON_PATH.exists():
            self.skipTest(f"{MANUAL_JSON_PATH} ещё не собран")
        registry = ChunkRegistry.load(MANUAL_JSON_PATH)
        self.assertTrue(registry.chunks)
        for chunk in registry.chunks:
            parsed = parse_version(chunk.version)
            self.assertIsNotNone(parsed, chunk.version)
            self.assertEqual(parsed.release_family, "5.1")
            self.assertTrue(is_known_release(parsed))

    def test_manual_and_personal_notes_do_not_falsely_conflict(self):
        # personal notes без версии не должны порождать "конфликт версий" с
        # Manual 5.1 — честный случай "недостаточно данных", не расхождение.
        if not MANUAL_JSON_PATH.exists():
            self.skipTest(f"{MANUAL_JSON_PATH} ещё не собран")
        manual_chunk = ChunkRegistry.load(MANUAL_JSON_PATH).chunks[0]
        notes_chunk = ChunkRegistry.load(DIMA_NOTES_PATH).chunks[0]
        conflict = detect_conflict(
            parse_version(manual_chunk.version), parse_version(notes_chunk.version)
        )
        self.assertIsNone(conflict)


if __name__ == "__main__":
    unittest.main()
