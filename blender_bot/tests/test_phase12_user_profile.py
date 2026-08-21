"""Тесты Phase 12 (User Profile, раздел 19 ТЗ)."""

import asyncio
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from profile.user_profile import UserProfile, UserProfileStore


class UserProfileStoreTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.store = UserProfileStore(Path(self._tmp.name) / "test.db")

    def tearDown(self):
        self.store.close()
        self._tmp.cleanup()

    def test_new_user_has_empty_profile(self):
        profile = self.store.get_profile(1)
        self.assertEqual(profile, UserProfile(user_id=1))

    def test_set_blender_version(self):
        self.store.set_blender_version(1, "4.2")
        self.assertEqual(self.store.get_profile(1).blender_version, "4.2")

    def test_set_blender_version_overwrites(self):
        self.store.set_blender_version(1, "4.2")
        self.store.set_blender_version(1, "5.1")
        self.assertEqual(self.store.get_profile(1).blender_version, "5.1")

    def test_set_learning_goal(self):
        self.store.set_learning_goal(1, "Научиться риггингу персонажей")
        self.assertEqual(self.store.get_profile(1).learning_goal, "Научиться риггингу персонажей")

    def test_touch_topic_appears_in_engaged_topics(self):
        self.store.touch_topic(1, "Mirror Modifier")
        self.assertIn("Mirror Modifier", self.store.engaged_topics(1))

    def test_touch_topic_is_idempotent(self):
        self.store.touch_topic(1, "Mirror Modifier")
        self.store.touch_topic(1, "Mirror Modifier")
        self.assertEqual(self.store.engaged_topics(1), ["Mirror Modifier"])

    def test_record_quiz_answer_appears_in_topics_and_results(self):
        self.store.record_quiz_answer(1, "N-gon", "q1", True)
        self.assertIn("N-gon", self.store.engaged_topics(1))
        profile = self.store.get_profile(1)
        self.assertEqual(len(profile.test_results), 1)
        self.assertTrue(profile.test_results[0]["correct"])

    def test_weak_topics_only_counts_wrong_answers(self):
        self.store.record_quiz_answer(1, "N-gon", "q1", True)
        self.store.record_quiz_answer(1, "N-gon", "q2", False)
        self.store.record_quiz_answer(1, "N-gon", "q1", False)
        self.assertEqual(self.store.weak_topics(1), {"N-gon": 2})

    def test_mistakes_derived_from_test_results(self):
        self.store.record_quiz_answer(1, "N-gon", "q1", True)
        self.store.record_quiz_answer(1, "N-gon", "q2", False)
        profile = self.store.get_profile(1)
        self.assertEqual(len(profile.mistakes), 1)
        self.assertEqual(profile.mistakes[0]["question_id"], "q2")

    def test_progress_summary(self):
        self.store.record_quiz_answer(1, "N-gon", "q1", True)
        self.store.record_quiz_answer(1, "N-gon", "q2", False)
        summary = self.store.progress_summary(1)
        self.assertEqual(summary["total"], 2)
        self.assertEqual(summary["correct"], 1)
        self.assertEqual(summary["topics"], ["N-gon"])

    def test_completed_topics_requires_every_question_correct_at_least_once(self):
        required = {"N-gon": {"q1", "q2"}}
        self.store.record_quiz_answer(1, "N-gon", "q1", True)
        self.assertEqual(self.store.completed_topics(1, required), [])
        self.store.record_quiz_answer(1, "N-gon", "q2", True)
        self.assertEqual(self.store.completed_topics(1, required), ["N-gon"])

    def test_completed_topics_counts_eventual_correct_answer_even_after_earlier_mistake(self):
        required = {"N-gon": {"q1"}}
        self.store.record_quiz_answer(1, "N-gon", "q1", False)
        self.store.record_quiz_answer(1, "N-gon", "q1", True)
        self.assertEqual(self.store.completed_topics(1, required), ["N-gon"])

    def test_record_question_caps_history_at_limit(self):
        from profile.user_profile import LAST_QUESTIONS_LIMIT

        for i in range(LAST_QUESTIONS_LIMIT + 10):
            self.store.record_question(1, f"question {i}")
        profile = self.store.get_profile(1)
        self.assertEqual(len(profile.last_questions), LAST_QUESTIONS_LIMIT)
        # самые старые должны быть вытеснены, самый новый остаётся первым
        self.assertEqual(profile.last_questions[0], f"question {LAST_QUESTIONS_LIMIT + 9}")

    def test_profiles_are_isolated_per_user(self):
        self.store.set_blender_version(1, "4.2")
        self.store.record_quiz_answer(1, "N-gon", "q1", False)
        self.store.record_quiz_answer(2, "N-gon", "q1", True)

        self.assertEqual(self.store.get_profile(1).blender_version, "4.2")
        self.assertIsNone(self.store.get_profile(2).blender_version)
        self.assertEqual(self.store.weak_topics(1), {"N-gon": 1})
        self.assertEqual(self.store.weak_topics(2), {})


class QAHandlerProfileIntegrationTests(unittest.TestCase):
    """bot/handlers/qa.py должен честно записывать в профиль только то, что
    пользователь реально сообщил (версия из текста вопроса), не выдумывать."""

    def setUp(self):
        from bot.handlers import education as edu_module
        from bot.handlers import qa as qa_module

        self.qa = qa_module
        self._tmp = tempfile.TemporaryDirectory()
        self._test_store = UserProfileStore(Path(self._tmp.name) / "qa_test.db")
        self._original_store = edu_module.profile_store
        edu_module.profile_store = self._test_store
        qa_module.profile_store = self._test_store

    def tearDown(self):
        from bot.handlers import education as edu_module
        from bot.handlers import qa as qa_module

        edu_module.profile_store = self._original_store
        qa_module.profile_store = self._original_store
        self._test_store.close()
        self._tmp.cleanup()

    def _run(self, coro):
        return asyncio.run(coro)

    def _update(self, text: str):
        u = MagicMock()
        u.message.text = text
        u.message.reply_text = AsyncMock()
        u.effective_user.id = 900000002
        return u

    def _context(self):
        c = MagicMock()
        c.user_data = {}
        return c

    def test_version_mentioned_in_question_is_captured(self):
        update = self._update("в блендере 4.2 как сделать риг")
        self._run(self.qa.answer_question(update, self._context()))
        profile = self._test_store.get_profile(900000002)
        self.assertEqual(profile.blender_version, "4.2")

    def test_question_without_version_does_not_set_one(self):
        update = self._update("как сделать булеан")
        self._run(self.qa.answer_question(update, self._context()))
        profile = self._test_store.get_profile(900000002)
        self.assertIsNone(profile.blender_version)

    def test_substantive_question_is_recorded_in_last_questions(self):
        update = self._update("как сделать булеан")
        self._run(self.qa.answer_question(update, self._context()))
        profile = self._test_store.get_profile(900000002)
        self.assertIn("как сделать булеан", profile.last_questions)


if __name__ == "__main__":
    unittest.main()
