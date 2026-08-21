"""Тесты Phase 11 (Education Engine, разделы 18, 22 ТЗ)."""

import asyncio
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import LESSONS_PATH
from education.registry import LessonRegistry
from education.schema import Lesson, LessonValidationError, QuizQuestion, validate_lesson


def _simple_lesson(**overrides) -> Lesson:
    defaults = dict(
        topic_id="Test Topic", title="Тестовая тема",
        theory="Теория.", example="Пример.", exercise="Упражнение.",
        quiz=[
            QuizQuestion(
                question_id="q1", question_type="multiple_choice",
                text="Вопрос?", options=["A", "B", "C"], correct_index=1,
                explanation="Потому что так.",
            ),
        ],
    )
    defaults.update(overrides)
    return Lesson(**defaults)


class SchemaValidationTests(unittest.TestCase):
    def test_valid_lesson_passes(self):
        validate_lesson(_simple_lesson())

    def test_missing_theory_raises(self):
        with self.assertRaises(LessonValidationError):
            validate_lesson(_simple_lesson(theory=""))

    def test_empty_quiz_raises(self):
        with self.assertRaises(LessonValidationError):
            validate_lesson(_simple_lesson(quiz=[]))

    def test_bad_question_type_raises(self):
        q = QuizQuestion(question_id="q1", question_type="scenario", text="?", options=["A", "B"], correct_index=0, explanation="x")
        with self.assertRaises(LessonValidationError):
            validate_lesson(_simple_lesson(quiz=[q]))

    def test_correct_index_out_of_range_raises(self):
        q = QuizQuestion(question_id="q1", question_type="true_false", text="?", options=["Да", "Нет"], correct_index=5, explanation="x")
        with self.assertRaises(LessonValidationError):
            validate_lesson(_simple_lesson(quiz=[q]))

    def test_missing_explanation_raises(self):
        q = QuizQuestion(question_id="q1", question_type="true_false", text="?", options=["Да", "Нет"], correct_index=0, explanation="")
        with self.assertRaises(LessonValidationError):
            validate_lesson(_simple_lesson(quiz=[q]))


class RegistryTests(unittest.TestCase):
    def setUp(self):
        self.registry = LessonRegistry()
        self.registry.add(_simple_lesson())

    def test_get_by_topic_id(self):
        self.assertIsNotNone(self.registry.get("Test Topic"))
        self.assertIsNone(self.registry.get("Nope"))

    def test_find_by_title(self):
        self.assertIsNotNone(self.registry.find_by_title("Тестовая тема"))
        self.assertIsNone(self.registry.find_by_title("совсем другое"))

    def test_all_questions(self):
        pairs = self.registry.all_questions()
        self.assertEqual(len(pairs), 1)
        lesson, question = pairs[0]
        self.assertEqual(lesson.topic_id, "Test Topic")
        self.assertEqual(question.question_id, "q1")

    def test_save_load_roundtrip(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "lessons.json"
            self.registry.save(path)
            loaded = LessonRegistry.load(path)
            self.assertEqual(len(loaded.lessons), 1)
            self.assertEqual(loaded.get("Test Topic").title, "Тестовая тема")

    def test_load_missing_file_returns_empty_registry(self):
        registry = LessonRegistry.load(Path("does/not/exist.json"))
        self.assertEqual(registry.lessons, [])


class RealSeededDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not LESSONS_PATH.exists():
            raise unittest.SkipTest(f"{LESSONS_PATH} не найден — запусти scripts/seed_education.py")
        cls.registry = LessonRegistry.load(LESSONS_PATH)

    def test_has_at_least_three_lessons(self):
        self.assertGreaterEqual(len(self.registry.lessons), 3)

    def test_every_lesson_is_valid(self):
        for lesson in self.registry.lessons:
            validate_lesson(lesson)

    def test_every_lesson_has_at_least_two_questions(self):
        for lesson in self.registry.lessons:
            self.assertGreaterEqual(len(lesson.quiz), 2, lesson.topic_id)


class TelegramLayerTests(unittest.TestCase):
    """Полный проход /learn -> /test -> ответ -> /next -> /progress ->
    /weaknesses через моки Update/Context, как в Phase 9 — здесь тоже
    многошаговое состояние, где баг в самом хендлере реально ломает сессию."""

    def setUp(self):
        if not LESSONS_PATH.exists():
            self.skipTest(f"{LESSONS_PATH} не найден")
        from bot.handlers import education as edu_module
        self.edu = edu_module

    def _run(self, coro):
        return asyncio.run(coro)

    def _update(self):
        u = MagicMock()
        u.message.reply_text = AsyncMock()
        return u

    def _context(self, args=None):
        c = MagicMock()
        c.user_data = {}
        c.args = args or []
        return c

    def test_learn_by_english_canonical_name_resolves_via_terminology(self):
        update = self._update()
        context = self._context(args=["Mirror", "Modifier"])
        self._run(self.edu.learn_command(update, context))
        text = update.message.reply_text.call_args.args[0]
        self.assertIn("Mirror", text)
        self.assertEqual(context.user_data.get("edu_current_topic"), "Mirror Modifier")

    def test_learn_without_args_lists_topics(self):
        update = self._update()
        context = self._context(args=[])
        self._run(self.edu.learn_command(update, context))
        text = update.message.reply_text.call_args.args[0]
        self.assertIn("Доступные темы", text)

    def test_test_without_active_topic_prompts_to_learn_first(self):
        update = self._update()
        context = self._context()
        self._run(self.edu.test_command(update, context))
        text = update.message.reply_text.call_args.args[0]
        self.assertIn("Сначала выбери тему", text)

    def test_full_quiz_flow_updates_progress_and_weaknesses(self):
        learn_update = self._update()
        context = self._context(args=["Mirror", "Modifier"])
        self._run(self.edu.learn_command(learn_update, context))

        test_update = self._update()
        self._run(self.edu.test_command(test_update, context))
        self.assertIn("edu_quiz", context.user_data)
        self.assertEqual(context.user_data["edu_quiz_index"], 0)

        lesson = self.edu.lesson_registry.get("Mirror Modifier")
        first_question = lesson.quiz[0]
        wrong_index = next(i for i in range(len(first_question.options)) if i != first_question.correct_index)

        cb = MagicMock()
        cb.callback_query.answer = AsyncMock()
        cb.callback_query.edit_message_text = AsyncMock()
        cb.callback_query.data = f"edu:{wrong_index}"
        self._run(self.edu.quiz_answer_callback(cb, context))

        result_text = cb.callback_query.edit_message_text.call_args.args[0]
        self.assertIn("Неверно", result_text)
        self.assertIn(first_question.explanation, result_text)

        self.assertEqual(context.user_data["edu_session_log"], [{"topic_id": "Mirror Modifier", "correct": False}])
        self.assertEqual(context.user_data["edu_weak_topics"], {"Mirror Modifier": 1})

        progress_update = self._update()
        self._run(self.edu.progress_command(progress_update, context))
        progress_text = progress_update.message.reply_text.call_args.args[0]
        self.assertIn("Отвечено вопросов: 1", progress_text)
        self.assertIn("Правильно: 0/1", progress_text)

        weak_update = self._update()
        self._run(self.edu.weaknesses_command(weak_update, context))
        weak_text = weak_update.message.reply_text.call_args.args[0]
        self.assertIn("Mirror Modifier", weak_text)

    def test_next_without_quiz_suggests_weakest_topic(self):
        context = self._context()
        context.user_data["edu_weak_topics"] = {"N-gon": 3, "Boolean Modifier": 1}
        update = self._update()
        self._run(self.edu.next_command(update, context))
        text = update.message.reply_text.call_args.args[0]
        self.assertIn("N-gon", text)  # больше всего ошибок -> предложен первым

    def test_answering_without_active_quiz_does_not_crash(self):
        context = self._context()
        cb = MagicMock()
        cb.callback_query.answer = AsyncMock()
        cb.callback_query.edit_message_text = AsyncMock()
        cb.callback_query.data = "edu:0"
        self._run(self.edu.quiz_answer_callback(cb, context))
        cb.callback_query.edit_message_text.assert_called_once_with(self.edu.NO_ACTIVE_QUIZ_TEXT)


if __name__ == "__main__":
    unittest.main()
