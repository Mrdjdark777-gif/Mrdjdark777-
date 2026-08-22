"""Тесты на "расскажи подробнее"/"дай источники" (после Phase 15,
PROJECT_PLAN.md) — ограниченная, однослотовая память последнего уверенно
отвеченного вопроса в bot/handlers/qa.py, и то, что обычный ответ больше
не содержит источник."""

import asyncio
import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import bot.handlers.qa as qa_module
from knowledge.schema import KnowledgeChunk


def _test_chunk(**overrides) -> KnowledgeChunk:
    defaults = dict(
        id="test:0001", source="blender_manual", source_type="official_manual",
        authority=100, version="5.1", language="ru", topic="modeling",
        subtopic="intro", date=None, url=None, section_path="modeling/tools/loop:intro",
        original_title="Loop Cut", translated_title="Петлевой вырез",
        content="Инструмент разбивает цикл граней.",
    )
    defaults.update(overrides)
    return KnowledgeChunk(**defaults)


def _update(text: str, user_id: int = 500000001) -> MagicMock:
    u = MagicMock()
    u.message.text = text
    u.message.reply_text = AsyncMock()
    u.effective_user.id = user_id
    return u


def _context(data: dict | None = None) -> MagicMock:
    c = MagicMock()
    c.user_data = data if data is not None else {}
    return c


def _run(coro):
    return asyncio.run(coro)


class IsMoreInfoRequestTests(unittest.TestCase):
    def test_short_phrases_recognized(self):
        for text in (
            "подробнее", "ещё", "еще", "дай источники", "покажи источники",
            "дай ссылки", "где почитать", "продолжи", "полный ответ",
        ):
            with self.subTest(text=text):
                self.assertTrue(qa_module._is_more_info_request(text))

    def test_long_question_with_marker_word_is_not_intercepted(self):
        # "подробнее" внутри полноценного вопроса с темой — это НОВЫЙ
        # вопрос, а не просьба продолжить предыдущий (VAGUE_FOLLOWUP_TEXT
        # сам приводит этот пример как образец правильного вопроса).
        self.assertFalse(
            qa_module._is_more_info_request("расскажи подробнее про модификатор Boolean")
        )

    def test_real_question_about_light_source_is_not_intercepted(self):
        # "источник" сам по себе НЕ маркер — иначе реальный вопрос про
        # источник света в Blender ошибочно перехватывался бы.
        self.assertFalse(qa_module._is_more_info_request("Что такое источник света?"))

    def test_ordinary_question_not_recognized(self):
        self.assertFalse(qa_module._is_more_info_request("как сделать риг"))


class FormatChunkAnswerReferenceTests(unittest.TestCase):
    """Hardening ТЗ, живой баг (Loop Cut): _format_chunk_answer теперь
    принимает необязательный reference_chunk и приписывает его содержимое
    к ответу — иначе горячая клавиша, найденная SearchEngine.
    find_reference_sibling, никогда не попадала бы в текст, который видит
    пользователь."""

    def test_no_reference_chunk_unchanged(self):
        chunk = _test_chunk(content="Просто текст.")
        text = qa_module._format_chunk_answer(chunk)
        self.assertEqual(text, "Просто текст.")

    def test_reference_chunk_appended(self):
        chunk = _test_chunk(content="Инструмент разбивает цикл граней.")
        reference = _test_chunk(
            id="test:0001_reference0", subtopic="reference",
            content="Режим: Режим редактирования · Ярлык: Ctrl-R",
        )
        text = qa_module._format_chunk_answer(chunk, reference)
        self.assertIn("Инструмент разбивает цикл граней.", text)
        self.assertIn("Ctrl-R", text)

    def test_reference_chunk_content_is_escaped(self):
        chunk = _test_chunk()
        reference = _test_chunk(id="test:ref", subtopic="reference", content="<script>")
        text = qa_module._format_chunk_answer(chunk, reference)
        self.assertNotIn("<script>", text)
        self.assertIn("&lt;script&gt;", text)


class MoreInfoFlowTests(unittest.TestCase):
    def test_confident_answer_has_no_source_citation(self):
        update = _update("Что такое модификаторы?")
        context = _context()
        _run(qa_module.answer_question(update, context))
        text = update.message.reply_text.call_args[0][0]
        self.assertNotIn("Источник", text)
        self.assertNotIn("docs.blender.org", text)

    def test_confident_answer_stores_last_question(self):
        update = _update("Что такое модификаторы?")
        context = _context()
        _run(qa_module.answer_question(update, context))
        self.assertEqual(context.user_data.get("last_question"), "Что такое модификаторы?")

    def test_more_info_followup_without_prior_question_asks_to_rephrase(self):
        update = _update("подробнее")
        context = _context()
        _run(qa_module.answer_question(update, context))
        update.message.reply_text.assert_called_once_with(qa_module.NOTHING_TO_EXPAND_TEXT)

    def test_more_info_followup_after_confident_answer_lists_sources(self):
        first_update = _update("Что такое модификаторы?")
        context = _context()
        _run(qa_module.answer_question(first_update, context))
        self.assertIn("last_question", context.user_data)

        second_update = _update("подробнее")
        _run(qa_module.answer_question(second_update, context))
        text = second_update.message.reply_text.call_args[0][0]
        self.assertIn("Источники:", text)

    def test_more_info_after_soft_match_confirmation_uses_confirmed_question(self):
        question = "Что такое Шейпкеи (формы-ключи)?"
        update = _update(question)
        context = _context()
        _run(qa_module.answer_question(update, context))
        if "pending_question" not in context.user_data:
            raise unittest.SkipTest("этот вопрос не дал soft_match в текущей базе")

        callback_update = MagicMock()
        callback_update.callback_query.answer = AsyncMock()
        callback_update.callback_query.edit_message_text = AsyncMock()
        _run(qa_module.qa_confirm_callback(callback_update, context))

        self.assertEqual(context.user_data.get("last_question"), question)

        followup_update = _update("дай источники")
        _run(qa_module.answer_question(followup_update, context))
        text = followup_update.message.reply_text.call_args[0][0]
        self.assertIn("Источники:", text)


if __name__ == "__main__":
    unittest.main()
