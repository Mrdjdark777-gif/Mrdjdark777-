"""BB-001/BB-002 (hardening ТЗ, P0): bot/telegram_output.py.

Раньше динамический knowledge-текст ("__init__.py", "2 * 3 = 6",
"`code`", "<Modifier>", "A & B") отправлялся через
parse_mode="Markdown" БЕЗ экранирования — Telegram трактовал "_"/"*"/"`"
как разметку буквально везде и валил reply_text с
BadRequest: Can't parse entities на реальном техническом тексте
Blender/Python. См. PROJECT_PLAN.md/IMPLEMENTATION_REPORT.md."""

import asyncio
import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bot.telegram_output import (  # noqa: E402
    SAFE_MESSAGE_LENGTH,
    bold,
    code,
    edit_message_safe,
    escape,
    escape_attr,
    italic,
    link,
    send_message_safe,
    split_message,
)


class EscapeTests(unittest.TestCase):
    """Раздел 4 hardening ТЗ: обязательные проблемные примеры дословно."""

    def test_dunder_init(self):
        self.assertEqual(escape("__init__.py"), "__init__.py")  # нет HTML-спецсимволов — не меняется

    def test_underscored_words(self):
        self.assertEqual(escape("a_b_c"), "a_b_c")

    def test_asterisk_expression(self):
        self.assertEqual(escape("2 * 3 = 6"), "2 * 3 = 6")

    def test_backtick_code(self):
        self.assertEqual(escape("`code`"), "`code`")  # backtick не спецсимвол HTML

    def test_angle_brackets_look_like_tag(self):
        self.assertEqual(escape("<Modifier>"), "&lt;Modifier&gt;")

    def test_ampersand(self):
        self.assertEqual(escape("A & B"), "A &amp; B")

    def test_all_three_html_specials_together(self):
        self.assertEqual(escape("<a> & <b>"), "&lt;a&gt; &amp; &lt;b&gt;")

    def test_escape_attr_also_escapes_quotes(self):
        self.assertIn("&quot;", escape_attr('say "hi"'))

    def test_non_string_input_coerced(self):
        self.assertEqual(escape(123), "123")


class TagHelperTests(unittest.TestCase):
    def test_bold_escapes_content(self):
        self.assertEqual(bold("<b>"), "<b>&lt;b&gt;</b>")

    def test_italic_escapes_content(self):
        self.assertEqual(italic("__init__.py"), "<i>__init__.py</i>")

    def test_code_escapes_content(self):
        self.assertEqual(code("A & B"), "<code>A &amp; B</code>")

    def test_link_escapes_both_text_and_url(self):
        result = link("A & B", 'https://x.invalid/?q="hi"')
        self.assertIn("&amp;", result)
        self.assertIn("&quot;", result)
        self.assertTrue(result.startswith('<a href="'))


class SplitMessageTests(unittest.TestCase):
    def test_short_text_single_part(self):
        self.assertEqual(split_message("hello"), ["hello"])

    def test_empty_text_no_parts(self):
        self.assertEqual(split_message(""), [])

    def test_exact_limit_single_part(self):
        text = "a" * SAFE_MESSAGE_LENGTH
        self.assertEqual(split_message(text), [text])

    def test_one_over_limit_splits(self):
        text = "a" * (SAFE_MESSAGE_LENGTH + 1)
        parts = split_message(text)
        self.assertEqual(len(parts), 2)
        self.assertTrue(all(len(p) <= SAFE_MESSAGE_LENGTH for p in parts))

    def test_no_content_loss_short(self):
        text = "Привет " * 5000  # заведомо больше лимита, кириллица
        parts = split_message(text)
        self.assertEqual("".join(parts), text)

    def test_no_empty_parts(self):
        text = "x" * 10000
        parts = split_message(text)
        self.assertTrue(all(p for p in parts))

    def test_every_part_within_limit_10k(self):
        text = "слово " * 3000  # существенно больше 10000 символов
        parts = split_message(text)
        self.assertTrue(all(len(p) <= SAFE_MESSAGE_LENGTH for p in parts))
        self.assertEqual("".join(parts), text)

    def test_prefers_paragraph_boundary(self):
        para1 = "A" * 3000
        para2 = "B" * 3000
        text = para1 + "\n\n" + para2
        parts = split_message(text, limit=3200)
        # Разделитель остаётся в конце первой части (без потери контента
        # при склейке — "".join(parts) == text — важнее, чем то, куда
        # именно отнесён сам "\n\n"), но сама граница реза — по абзацу,
        # не где-то в середине para1/para2.
        self.assertTrue(para1 in parts[0] and "B" not in parts[0])
        self.assertEqual("".join(parts), text)

    def test_single_paragraph_longer_than_limit_still_splits(self):
        text = "a" * 9000  # один "абзац" без переносов вообще
        parts = split_message(text, limit=3000)
        self.assertTrue(all(len(p) <= 3000 for p in parts))
        self.assertEqual("".join(parts), text)

    def test_does_not_split_inside_html_tag(self):
        # Заголовок из тега "<b>" аккуратно подведён к самой границе.
        text = "x" * (SAFE_MESSAGE_LENGTH - 2) + "<b>ok</b>"
        parts = split_message(text)
        for part in parts:
            self.assertEqual(part.count("<"), part.count(">"))

    def test_does_not_split_inside_entity(self):
        text = "x" * (SAFE_MESSAGE_LENGTH - 3) + "&amp;more text after"
        parts = split_message(text)
        self.assertNotIn("&am", parts[0][-5:])
        self.assertEqual("".join(parts), text)

    def test_lots_of_unicode_no_loss(self):
        text = "🎨🔧 Блендер — 3D редактор. " * 2000
        parts = split_message(text)
        self.assertEqual("".join(parts), text)
        self.assertTrue(all(len(p) <= SAFE_MESSAGE_LENGTH for p in parts))

    def test_100_chars_one_message(self):
        self.assertEqual(len(split_message("x" * 100)), 1)

    def test_3600_splits_when_limit_3500(self):
        parts = split_message("x" * 3600, limit=3500)
        self.assertGreater(len(parts), 1)

    def test_3800_splits_when_limit_3500(self):
        parts = split_message("x" * 3800, limit=3500)
        self.assertGreater(len(parts), 1)

    def test_4096_plus(self):
        parts = split_message("x" * 4200)
        self.assertTrue(all(len(p) <= SAFE_MESSAGE_LENGTH for p in parts))
        self.assertEqual(sum(len(p) for p in parts), 4200)


class SendMessageSafeTests(unittest.TestCase):
    def _run(self, coro):
        return asyncio.run(coro)

    def test_short_text_sends_once(self):
        message = MagicMock()
        message.reply_text = AsyncMock()
        self._run(send_message_safe(message, "hello"))
        message.reply_text.assert_awaited_once()

    def test_long_text_sends_multiple_parts(self):
        message = MagicMock()
        message.reply_text = AsyncMock()
        text = "слово " * 3000
        self._run(send_message_safe(message, text))
        self.assertGreater(message.reply_text.await_count, 1)

    def test_reply_markup_only_on_last_part(self):
        message = MagicMock()
        message.reply_text = AsyncMock()
        markup = object()
        text = "слово " * 3000
        self._run(send_message_safe(message, text, reply_markup=markup))
        calls = message.reply_text.await_args_list
        for c in calls[:-1]:
            self.assertIsNone(c.kwargs.get("reply_markup"))
        self.assertIs(calls[-1].kwargs.get("reply_markup"), markup)

    def test_empty_text_sends_nothing(self):
        message = MagicMock()
        message.reply_text = AsyncMock()
        self._run(send_message_safe(message, ""))
        message.reply_text.assert_not_awaited()

    def test_uses_html_parse_mode(self):
        message = MagicMock()
        message.reply_text = AsyncMock()
        self._run(send_message_safe(message, "hello"))
        self.assertEqual(message.reply_text.await_args.kwargs.get("parse_mode").value, "HTML")


class EditMessageSafeTests(unittest.TestCase):
    def _run(self, coro):
        return asyncio.run(coro)

    def test_short_text_edits_once_no_followup(self):
        query = MagicMock()
        query.edit_message_text = AsyncMock()
        query.message.reply_text = AsyncMock()
        self._run(edit_message_safe(query, "hello"))
        query.edit_message_text.assert_awaited_once()
        query.message.reply_text.assert_not_awaited()

    def test_long_text_edits_first_part_then_sends_rest(self):
        query = MagicMock()
        query.edit_message_text = AsyncMock()
        query.message.reply_text = AsyncMock()
        text = "слово " * 3000
        self._run(edit_message_safe(query, text))
        query.edit_message_text.assert_awaited_once()
        self.assertGreaterEqual(query.message.reply_text.await_count, 1)

    def test_empty_text_does_nothing(self):
        query = MagicMock()
        query.edit_message_text = AsyncMock()
        self._run(edit_message_safe(query, ""))
        query.edit_message_text.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
