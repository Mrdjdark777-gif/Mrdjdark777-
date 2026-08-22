"""Тесты на /unanswered и /quick_add (ТЗ v3, раздел 3.2) —
bot/handlers/admin.py."""

import asyncio
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import bot.handlers.admin as admin_module
import bot.handlers.diagnostics as diagnostics_module
import bot.handlers.education as education_module
import bot.handlers.qa as qa_module


def _update(text: str, user_id: int = 1) -> MagicMock:
    u = MagicMock()
    u.message.text = text
    u.message.reply_text = AsyncMock()
    u.effective_user.id = user_id
    return u


def _context() -> MagicMock:
    c = MagicMock()
    c.user_data = {}
    return c


def _run(coro):
    return asyncio.run(coro)


class UnansweredCommandTests(unittest.TestCase):
    def setUp(self):
        self._original_owner = admin_module.OWNER_ID
        admin_module.OWNER_ID = 1
        self._tmp = tempfile.TemporaryDirectory()
        self._log_path = Path(self._tmp.name) / "unanswered.jsonl"
        self._original_log_path = admin_module.UNANSWERED_LOG_PATH
        admin_module.UNANSWERED_LOG_PATH = self._log_path

    def tearDown(self):
        admin_module.OWNER_ID = self._original_owner
        admin_module.UNANSWERED_LOG_PATH = self._original_log_path
        self._tmp.cleanup()

    def test_empty_log_says_so(self):
        update = _update("/unanswered", user_id=1)
        _run(admin_module.unanswered_command(update, _context()))
        text = update.message.reply_text.call_args[0][0]
        self.assertIn("пуст", text)

    def test_lists_recent_questions_newest_first(self):
        records = [
            {"question": "старый вопрос", "best_score": 0.1, "question_types": []},
            {"question": "новый вопрос", "best_score": 0.15, "question_types": ["WHAT_IS"]},
        ]
        with open(self._log_path, "w", encoding="utf-8") as f:
            for r in records:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")

        update = _update("/unanswered", user_id=1)
        _run(admin_module.unanswered_command(update, _context()))
        text = update.message.reply_text.call_args[0][0]
        self.assertIn("новый вопрос", text)
        self.assertIn("старый вопрос", text)
        self.assertLess(text.index("новый вопрос"), text.index("старый вопрос"))

    def test_ignores_malformed_lines(self):
        with open(self._log_path, "w", encoding="utf-8") as f:
            f.write("не json вообще\n")
            f.write(json.dumps({"question": "нормальный вопрос", "best_score": 0.1}, ensure_ascii=False) + "\n")

        update = _update("/unanswered", user_id=1)
        _run(admin_module.unanswered_command(update, _context()))
        text = update.message.reply_text.call_args[0][0]
        self.assertIn("нормальный вопрос", text)

    def test_non_owner_rejected(self):
        update = _update("/unanswered", user_id=999)
        _run(admin_module.unanswered_command(update, _context()))
        update.message.reply_text.assert_called_once_with(admin_module.NOT_OWNER_TEXT)


class QuickAddCommandTests(unittest.TestCase):
    """Пишет в изолированный временный файл, не в настоящую
    knowledge/personal/dima_notes/dima_notes.json — подменяет
    _PERSONAL_NOTES_PATH и KNOWLEDGE_CHUNK_PATHS (последний — тем же
    приёмом, что qa_service в ReindexTests: /quick_add обращается к имени
    в своём модуле на момент вызова, а не к копии из config)."""

    def setUp(self):
        self._original_owner = admin_module.OWNER_ID
        admin_module.OWNER_ID = 1

        self._tmp = tempfile.TemporaryDirectory()
        self._notes_path = Path(self._tmp.name) / "notes.json"
        self._notes_path.write_text("[]", encoding="utf-8")

        self._original_notes_path = admin_module._PERSONAL_NOTES_PATH
        self._original_chunk_paths = admin_module.KNOWLEDGE_CHUNK_PATHS
        admin_module._PERSONAL_NOTES_PATH = self._notes_path
        admin_module.KNOWLEDGE_CHUNK_PATHS = [self._notes_path]

        self._original_qa_service = qa_module.qa_service
        self._original_diagnostic_registry = diagnostics_module.diagnostic_registry
        self._original_lesson_registry = education_module.lesson_registry

    def tearDown(self):
        admin_module.OWNER_ID = self._original_owner
        admin_module._PERSONAL_NOTES_PATH = self._original_notes_path
        admin_module.KNOWLEDGE_CHUNK_PATHS = self._original_chunk_paths
        qa_module.qa_service = self._original_qa_service
        diagnostics_module.diagnostic_registry = self._original_diagnostic_registry
        education_module.lesson_registry = self._original_lesson_registry
        self._tmp.cleanup()

    def test_usage_shown_without_separator(self):
        update = _update("/quick_add просто текст без разделителя", user_id=1)
        _run(admin_module.quick_add_command(update, _context()))
        update.message.reply_text.assert_called_once_with(admin_module.QUICK_ADD_USAGE_TEXT)

    def test_usage_shown_on_empty_question_or_answer(self):
        update = _update("/quick_add   | пустой вопрос", user_id=1)
        _run(admin_module.quick_add_command(update, _context()))
        update.message.reply_text.assert_called_once_with(admin_module.QUICK_ADD_USAGE_TEXT)

    def test_adds_note_and_reindexes(self):
        update = _update("/quick_add Что такое тестовый вопрос? | Тестовый ответ.", user_id=1)
        _run(admin_module.quick_add_command(update, _context()))

        saved = json.loads(self._notes_path.read_text(encoding="utf-8"))
        self.assertEqual(len(saved), 1)
        self.assertEqual(saved[0]["original_title"], "Что такое тестовый вопрос?")
        self.assertEqual(saved[0]["content"], "Тестовый ответ.")
        self.assertEqual(saved[0]["source_type"], "ai_generated_unverified")
        self.assertTrue(saved[0]["needs_review"])

        # реиндексация реально подменила singleton, а не просто отчиталась
        self.assertIsNot(qa_module.qa_service, self._original_qa_service)
        self.assertEqual(len(qa_module.qa_service.engine.chunks), 1)

        text = update.message.reply_text.call_args[0][0]
        self.assertIn("Добавлено и переиндексировано", text)

    def test_non_owner_rejected(self):
        update = _update("/quick_add вопрос | ответ", user_id=999)
        _run(admin_module.quick_add_command(update, _context()))
        update.message.reply_text.assert_called_once_with(admin_module.NOT_OWNER_TEXT)
        self.assertEqual(json.loads(self._notes_path.read_text(encoding="utf-8")), [])

    def test_duplicate_question_updates_instead_of_appending(self):
        """BB-008 (hardening ТЗ): повторный /quick_add с тем же (с точностью
        до регистра/пробелов/пунктуации) вопросом обновляет существующую
        заметку, а не создаёт вторую."""
        update1 = _update("/quick_add Что такое Bevel? | Старый ответ.", user_id=1)
        _run(admin_module.quick_add_command(update1, _context()))

        update2 = _update("/quick_add что такое bevel | Новый, исправленный ответ.", user_id=1)
        _run(admin_module.quick_add_command(update2, _context()))

        saved = json.loads(self._notes_path.read_text(encoding="utf-8"))
        self.assertEqual(len(saved), 1, "дубль по нормализованному вопросу не должен создавать вторую запись")
        self.assertEqual(saved[0]["content"], "Новый, исправленный ответ.")
        self.assertEqual(saved[0]["id"], "personal_notes:0000")

        text = update2.message.reply_text.call_args[0][0]
        self.assertIn("Обновлено и переиндексировано", text)

    def test_different_question_appends_new_chunk(self):
        update1 = _update("/quick_add Что такое Bevel? | Ответ 1.", user_id=1)
        _run(admin_module.quick_add_command(update1, _context()))
        update2 = _update("/quick_add Что такое Boolean? | Ответ 2.", user_id=1)
        _run(admin_module.quick_add_command(update2, _context()))

        saved = json.loads(self._notes_path.read_text(encoding="utf-8"))
        self.assertEqual(len(saved), 2)
        self.assertEqual({c["id"] for c in saved}, {"personal_notes:0000", "personal_notes:0001"})

    def test_stable_id_survives_deletion_from_middle(self):
        """BB-008: раньше id = f"personal_notes:{len(registry.chunks):04d}"
        — после удаления chunk'а из середины файла (например, вручную на
        сервере) новый id мог совпасть с ещё существующим. Проверяем, что
        генератор теперь смотрит на максимальный занятый номер, а не на
        длину списка."""
        notes = [
            {
                "id": "personal_notes:0000", "source": "personal_notes",
                "source_type": "ai_generated_unverified", "authority": None,
                "version": None, "language": "ru", "topic": "general",
                "subtopic": None, "date": None, "url": None,
                "original_title": "Вопрос 0", "translated_title": "Вопрос 0",
                "content": "Ответ 0", "needs_review": True,
            },
            {
                "id": "personal_notes:0002", "source": "personal_notes",
                "source_type": "ai_generated_unverified", "authority": None,
                "version": None, "language": "ru", "topic": "general",
                "subtopic": None, "date": None, "url": None,
                "original_title": "Вопрос 2", "translated_title": "Вопрос 2",
                "content": "Ответ 2", "needs_review": True,
            },
        ]
        self._notes_path.write_text(json.dumps(notes, ensure_ascii=False), encoding="utf-8")

        update = _update("/quick_add Новый вопрос | Новый ответ.", user_id=1)
        _run(admin_module.quick_add_command(update, _context()))

        saved = json.loads(self._notes_path.read_text(encoding="utf-8"))
        ids = {c["id"] for c in saved}
        self.assertEqual(len(ids), 3, "не должно быть коллизии id")
        self.assertIn("personal_notes:0003", ids)


if __name__ == "__main__":
    unittest.main()
