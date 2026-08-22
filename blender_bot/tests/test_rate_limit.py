"""Тесты на bot/rate_limit.py — Phase G (раздел 15 / hardening ТЗ):
простой in-memory rate limiter против флуда."""

import asyncio
import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import bot.rate_limit as rate_limit  # noqa: E402
from telegram.ext import ApplicationHandlerStop  # noqa: E402


def _run(coro):
    return asyncio.run(coro)


def _update(user_id: int, inline: bool = False) -> MagicMock:
    u = MagicMock()
    u.effective_user.id = user_id
    u.effective_message.reply_text = AsyncMock()
    u.inline_query = MagicMock() if inline else None
    return u


class LowLevelLimiterTests(unittest.TestCase):
    def setUp(self):
        rate_limit._history = {}
        rate_limit._last_warned = {}

    def test_allows_up_to_max_requests(self):
        now = 1000.0
        for _ in range(rate_limit.MAX_REQUESTS):
            self.assertFalse(rate_limit._is_rate_limited(1, now))

    def test_blocks_after_max_requests_within_window(self):
        now = 1000.0
        for _ in range(rate_limit.MAX_REQUESTS):
            rate_limit._is_rate_limited(1, now)
        self.assertTrue(rate_limit._is_rate_limited(1, now))

    def test_old_requests_expire_out_of_window(self):
        now = 1000.0
        for _ in range(rate_limit.MAX_REQUESTS):
            rate_limit._is_rate_limited(1, now)
        later = now + rate_limit.WINDOW_SECONDS + 0.1
        self.assertFalse(rate_limit._is_rate_limited(1, later))

    def test_different_users_do_not_share_a_budget(self):
        now = 1000.0
        for _ in range(rate_limit.MAX_REQUESTS):
            rate_limit._is_rate_limited(1, now)
        self.assertFalse(rate_limit._is_rate_limited(2, now))

    def test_warn_only_once_per_cooldown(self):
        now = 1000.0
        self.assertTrue(rate_limit._should_warn(1, now))
        self.assertFalse(rate_limit._should_warn(1, now + 0.1))
        self.assertTrue(rate_limit._should_warn(1, now + rate_limit.WARN_COOLDOWN_SECONDS))


class RateLimitGateTests(unittest.TestCase):
    def setUp(self):
        rate_limit._history = {}
        rate_limit._last_warned = {}
        self._original_owner = rate_limit.OWNER_ID

    def tearDown(self):
        rate_limit.OWNER_ID = self._original_owner

    def test_under_limit_does_not_raise(self):
        update = _update(1)
        _run(rate_limit.rate_limit_gate(update, MagicMock()))
        update.effective_message.reply_text.assert_not_called()

    def test_over_limit_raises_and_warns_once(self):
        update = _update(1)
        for _ in range(rate_limit.MAX_REQUESTS):
            _run(rate_limit.rate_limit_gate(update, MagicMock()))
        update.effective_message.reply_text.assert_not_called()

        with self.assertRaises(ApplicationHandlerStop):
            _run(rate_limit.rate_limit_gate(update, MagicMock()))
        update.effective_message.reply_text.assert_called_once_with(rate_limit.COOLDOWN_MESSAGE)

        # Второе блокированное сообщение сразу следом не должно прислать
        # ещё одно предупреждение (иначе флуд получает флуд в ответ).
        with self.assertRaises(ApplicationHandlerStop):
            _run(rate_limit.rate_limit_gate(update, MagicMock()))
        update.effective_message.reply_text.assert_called_once()

    def test_owner_is_exempt(self):
        rate_limit.OWNER_ID = 42
        update = _update(42)
        for _ in range(rate_limit.MAX_REQUESTS * 3):
            _run(rate_limit.rate_limit_gate(update, MagicMock()))
        update.effective_message.reply_text.assert_not_called()

    def test_inline_query_updates_are_not_rate_limited(self):
        update = _update(1, inline=True)
        for _ in range(rate_limit.MAX_REQUESTS * 3):
            _run(rate_limit.rate_limit_gate(update, MagicMock()))
        # ни разу не должно бросить ApplicationHandlerStop
        update.effective_message.reply_text.assert_not_called()


if __name__ == "__main__":
    unittest.main()
