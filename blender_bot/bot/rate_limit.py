"""Раздел 15 ТЗ / hardening ТЗ (Phase G): простой in-memory rate limiter
против флуда/скриптованного спама — burst-защита на пользователя.

Не персистентный (не обязан переживать перезапуск бота — это защита от
одномоментного всплеска активности, а не история) и не требует
SQLite/Redis (раздел 21 hardening ТЗ: не мигрировать на новую БД без
доказанной необходимости) — обычный dict в памяти процесса достаточен.

OWNER_ID освобождён от лимита (владелец активно дёргает /debug, /search,
/quick_add во время отладки — это не спам). Inline-режим (update.inline_query)
тоже не считается: там частота запросов определяется тем, как быстро
пользователь печатает в поле ввода (каждое нажатие клавиши может
породить новый inline-запрос), а не намеренной отправкой много раз подряд
— считать это "флудом" значило бы ломать нормальное использование.
"""

from __future__ import annotations

import time

from telegram import Update
from telegram.ext import ApplicationHandlerStop, ContextTypes

from config import OWNER_ID

# Щедрые значения намеренно: цель — остановить скриптованный спам, а не
# ограничить обычную беседу (несколько вопросов подряд, быстрый клик по
# кнопкам диагностики/квиза — всё это укладывается в лимит).
MAX_REQUESTS = 10
WINDOW_SECONDS = 10.0
# Не чаще одного предупреждения за то же окно — иначе флуд-отправитель
# получает В ОТВЕТ ещё один флуд ("Слишком много сообщений" на каждое
# заблокированное сообщение), что усугубляет, а не решает проблему.
WARN_COOLDOWN_SECONDS = WINDOW_SECONDS

COOLDOWN_MESSAGE = "Слишком много сообщений подряд — подожди немного и попробуй снова."

_history: dict[int, list[float]] = {}
_last_warned: dict[int, float] = {}


def _is_rate_limited(user_id: int, now: float) -> bool:
    cutoff = now - WINDOW_SECONDS
    timestamps = [t for t in _history.get(user_id, []) if t >= cutoff]
    limited = len(timestamps) >= MAX_REQUESTS
    if not limited:
        timestamps.append(now)
    _history[user_id] = timestamps
    return limited


def _should_warn(user_id: int, now: float) -> bool:
    if now - _last_warned.get(user_id, 0.0) >= WARN_COOLDOWN_SECONDS:
        _last_warned[user_id] = now
        return True
    return False


async def rate_limit_gate(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Регистрируется в app/main.py как TypeHandler(Update, ...) в группе
    ДО обычных хендлеров — ApplicationHandlerStop останавливает обработку
    этого update'а всеми последующими группами разом."""
    if update.inline_query is not None:
        return
    user = update.effective_user
    if user is None or user.id == OWNER_ID:
        return

    now = time.monotonic()
    if _is_rate_limited(user.id, now):
        if _should_warn(user.id, now):
            message = update.effective_message
            if message is not None:
                await message.reply_text(COOLDOWN_MESSAGE)
        raise ApplicationHandlerStop
