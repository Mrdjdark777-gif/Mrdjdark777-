"""Регрессия по обратной связи пользователя: "/learn" без темы спрашивает
"какую тему изучаем?", а ответ пользователя с названием темы перехватывался
_is_vague_followup в bot/handlers/qa.py вместо того, чтобы продолжить
диалог обучения (bot/handlers/education.py:try_continue_learn)."""

import asyncio
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import LESSONS_PATH
from profile.user_profile import UserProfileStore


def _update(text: str, user_id: int = 900000002) -> MagicMock:
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


class LearnContinuationThroughQaTests(unittest.TestCase):
    def setUp(self):
        if not LESSONS_PATH.exists():
            self.skipTest(f"{LESSONS_PATH} не найден")
        import bot.handlers.education as edu_module
        import bot.handlers.qa as qa_module

        self.edu = edu_module
        self.qa = qa_module

        self._tmp = tempfile.TemporaryDirectory()
        self._test_store = UserProfileStore(Path(self._tmp.name) / "test.db")
        self._original_store = edu_module.profile_store
        edu_module.profile_store = self._test_store

    def tearDown(self):
        self.edu.profile_store = self._original_store
        self._test_store.close()
        self._tmp.cleanup()

    def test_bare_topic_name_after_learn_prompt_starts_lesson_not_vague_followup(self):
        context = _context()
        prompt_update = _update("/learn")
        _run(self.edu.learn_command(prompt_update, context))
        self.assertTrue(context.user_data.get("edu_awaiting_topic"))

        reply_update = _update("Mirror")
        _run(self.qa.answer_question(reply_update, context))
        text = reply_update.message.reply_text.call_args[0][0]

        self.assertNotEqual(text, self.qa.VAGUE_FOLLOWUP_TEXT)
        self.assertIn("Mirror", text)
        self.assertEqual(context.user_data.get("edu_current_topic"), "Mirror Modifier")

    def test_full_russian_topic_name_also_resolves(self):
        context = _context()
        _run(self.edu.learn_command(_update("/learn"), context))

        reply_update = _update("Модификатор Mirror")
        _run(self.qa.answer_question(reply_update, context))
        text = reply_update.message.reply_text.call_args[0][0]

        self.assertNotEqual(text, self.qa.VAGUE_FOLLOWUP_TEXT)
        self.assertEqual(context.user_data.get("edu_current_topic"), "Mirror Modifier")

    def test_without_pending_learn_prompt_short_message_still_vague_followup(self):
        # Не должно ломать существующее поведение вне контекста /learn.
        context = _context()
        update = _update("почему")
        _run(self.qa.answer_question(update, context))
        text = update.message.reply_text.call_args[0][0]
        self.assertEqual(text, self.qa.VAGUE_FOLLOWUP_TEXT)


if __name__ == "__main__":
    unittest.main()
