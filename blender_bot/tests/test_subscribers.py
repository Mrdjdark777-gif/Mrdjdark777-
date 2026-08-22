"""Тесты на profile/subscribers.py — BB-005 (hardening ТЗ): atomic write
и честная обработка повреждённого файла вместо падения /start."""

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from profile.subscribers import add_subscriber, get_subscribers, remove_subscriber


class SubscribersBasicTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self._path = Path(self._tmp.name) / "subscribers.json"

    def tearDown(self):
        self._tmp.cleanup()

    def test_add_then_get(self):
        add_subscriber(self._path, 111)
        add_subscriber(self._path, 222)
        self.assertEqual(get_subscribers(self._path), [111, 222])

    def test_add_is_idempotent(self):
        add_subscriber(self._path, 111)
        add_subscriber(self._path, 111)
        self.assertEqual(get_subscribers(self._path), [111])

    def test_remove(self):
        add_subscriber(self._path, 111)
        add_subscriber(self._path, 222)
        remove_subscriber(self._path, 111)
        self.assertEqual(get_subscribers(self._path), [222])

    def test_remove_missing_is_noop(self):
        add_subscriber(self._path, 111)
        remove_subscriber(self._path, 999)
        self.assertEqual(get_subscribers(self._path), [111])

    def test_get_on_missing_file_is_empty(self):
        self.assertEqual(get_subscribers(self._path), [])

    def test_save_is_atomic_no_leftover_tmp_file(self):
        add_subscriber(self._path, 111)
        leftover = list(self._path.parent.glob(f".{self._path.name}.*.tmp"))
        self.assertEqual(leftover, [], "временный файл должен быть переименован в целевой, не оставаться рядом")

    def test_written_file_is_valid_json_list(self):
        add_subscriber(self._path, 111)
        with open(self._path, encoding="utf-8") as f:
            data = json.load(f)
        self.assertEqual(data, [111])


class SubscribersCorruptionTests(unittest.TestCase):
    """BB-005: повреждённый subscribers.json (например, обрезан SIGKILL'ом
    процесса посреди старой не-атомарной записи) не должен ронять /start —
    список подписчиков читается как пустой, а не бросает JSONDecodeError."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self._path = Path(self._tmp.name) / "subscribers.json"

    def tearDown(self):
        self._tmp.cleanup()

    def test_truncated_json_treated_as_empty(self):
        self._path.write_text("[111, 222", encoding="utf-8")
        self.assertEqual(get_subscribers(self._path), [])

    def test_add_after_corruption_recovers(self):
        self._path.write_text("not json at all", encoding="utf-8")
        add_subscriber(self._path, 333)
        # запись поверх повреждённого файла должна и удаться, и дать чистый JSON
        with open(self._path, encoding="utf-8") as f:
            data = json.load(f)
        self.assertEqual(data, [333])


if __name__ == "__main__":
    unittest.main()
