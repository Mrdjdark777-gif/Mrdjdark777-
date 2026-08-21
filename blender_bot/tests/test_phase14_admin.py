"""Тесты Phase 14 (Admin Commands + Debug Mode, разделы 32-33 ТЗ)."""

import asyncio
import sys
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


class OwnerGateTests(unittest.TestCase):
    """Раздел 32 ТЗ: "Все административные команды доступны только OWNER_ID"."""

    def setUp(self):
        self._original_owner = admin_module.OWNER_ID

    def tearDown(self):
        admin_module.OWNER_ID = self._original_owner

    def test_no_owner_configured_blocks_command(self):
        admin_module.OWNER_ID = 0
        update = _update("/admin", user_id=12345)
        _run(admin_module.admin_command(update, _context()))
        update.message.reply_text.assert_called_once_with(admin_module.NO_OWNER_CONFIGURED_TEXT)

    def test_non_owner_is_rejected(self):
        admin_module.OWNER_ID = 999
        update = _update("/admin", user_id=1)
        _run(admin_module.admin_command(update, _context()))
        update.message.reply_text.assert_called_once_with(admin_module.NOT_OWNER_TEXT)

    def test_owner_gets_help_text(self):
        admin_module.OWNER_ID = 1
        update = _update("/admin", user_id=1)
        _run(admin_module.admin_command(update, _context()))
        update.message.reply_text.assert_called_once_with(admin_module.ADMIN_HELP_TEXT)


class AdminCommandContentTests(unittest.TestCase):
    """Каждая команда прогоняется через реальные singleton'ы бота (не моки) —
    та же логика, что в tests/quality: если объекты не прогружены, ошибка
    всплывёт по-настоящему, а не спрячется за подменённым фейком."""

    def setUp(self):
        self._original_owner = admin_module.OWNER_ID
        admin_module.OWNER_ID = 1

    def tearDown(self):
        admin_module.OWNER_ID = self._original_owner

    def test_health_reports_ok_with_loaded_index(self):
        update = _update("/health", user_id=1)
        _run(admin_module.health_command(update, _context()))
        text = update.message.reply_text.call_args[0][0]
        self.assertTrue(text.startswith("OK"))
        self.assertIn("Chunks в индексе", text)

    def test_stats_lists_source_types_and_users(self):
        update = _update("/stats", user_id=1)
        _run(admin_module.stats_command(update, _context()))
        text = update.message.reply_text.call_args[0][0]
        self.assertIn("Всего knowledge chunks", text)
        self.assertIn("Профилей пользователей", text)

    def test_sources_lists_configured_paths(self):
        update = _update("/sources", user_id=1)
        _run(admin_module.sources_command(update, _context()))
        text = update.message.reply_text.call_args[0][0]
        self.assertIn("dima_notes", text)

    def test_version_lists_known_blender_versions(self):
        update = _update("/version", user_id=1)
        _run(admin_module.version_command(update, _context()))
        text = update.message.reply_text.call_args[0][0]
        self.assertIn("5.1", text)

    def test_search_without_query_shows_usage(self):
        update = _update("/search", user_id=1)
        _run(admin_module.search_command(update, _context()))
        update.message.reply_text.assert_called_once_with("Использование: /search запрос")

    def test_search_with_query_returns_scored_results(self):
        update = _update("/search Mirror Modifier", user_id=1)
        _run(admin_module.search_command(update, _context()))
        text = update.message.reply_text.call_args[0][0]
        self.assertIn("lexical=", text)

    def test_debug_without_question_shows_usage(self):
        update = _update("/debug", user_id=1)
        _run(admin_module.debug_command(update, _context()))
        update.message.reply_text.assert_called_once_with("Использование: /debug вопрос")

    def test_debug_reports_full_pipeline_trace(self):
        update = _update("/debug что такое Mirror Modifier", user_id=1)
        _run(admin_module.debug_command(update, _context()))
        text = update.message.reply_text.call_args[0][0]
        self.assertIn("question_types:", text)
        self.assertIn("QAResult.kind:", text)
        self.assertIn("top raw search results:", text)


class ReindexTests(unittest.TestCase):
    """/reindex должен реально заменить объекты в bot.handlers.qa/
    diagnostics/education, а не просто отчитаться, ничего не сделав."""

    def setUp(self):
        self._original_owner = admin_module.OWNER_ID
        admin_module.OWNER_ID = 1
        self._original_qa_service = qa_module.qa_service
        self._original_diagnostic_registry = diagnostics_module.diagnostic_registry
        self._original_lesson_registry = education_module.lesson_registry

    def tearDown(self):
        admin_module.OWNER_ID = self._original_owner
        qa_module.qa_service = self._original_qa_service
        diagnostics_module.diagnostic_registry = self._original_diagnostic_registry
        education_module.lesson_registry = self._original_lesson_registry

    def test_reindex_replaces_singletons_with_new_instances(self):
        update = _update("/reindex", user_id=1)
        _run(admin_module.reindex_command(update, _context()))

        self.assertIsNot(qa_module.qa_service, self._original_qa_service)
        self.assertIsNot(diagnostics_module.diagnostic_registry, self._original_diagnostic_registry)
        self.assertIsNot(education_module.lesson_registry, self._original_lesson_registry)

        text = update.message.reply_text.call_args[0][0]
        self.assertIn("Реиндексация завершена", text)


if __name__ == "__main__":
    unittest.main()
