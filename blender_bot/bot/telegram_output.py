"""BB-001/BB-002 (hardening ТЗ, P0): безопасная отправка Telegram-сообщений.

Раньше почти весь Telegram-слой отправлял текст через
`parse_mode="Markdown"`, включая ДИНАМИЧЕСКИЙ контент — сырой
`chunk.content` (knowledge/, потенциально любой технический текст с
`_`, `*`, backtick — "Ctrl+D", "`code`", "__init__.py"), заголовки RSS
(bot/news_fetcher.py), title/note из data/resources.json, question.text
из education/. Telegram Markdown-парсер трактует "_"/"*"/"`" как
разметку буквально везде в тексте, а не только там, где их поставило
приложение — один "__init__.py" в ответе бота превращает остаток
сообщения в незакрытый italic-блок и валит `reply_text` с
`BadRequest: Can't parse entities`. Раздел ТЗ v3/v2 никогда явно не
специфицировал экранирование, потому что весь текст изначально был
статическим — перестало быть верным с ростом knowledge/ (раздел 2.1,
8952 chunks Manual) и RSS-новостей.

Здесь — единственная точка входа для отправки текста пользователю:
экранирование ЛЮБОГО динамического значения через `escape()`/
`escape_attr()`, HTML вместо Markdown (Telegram HTML — belt="`<b>`,
`<i>`, `<a href>`, `<code>`" — предсказуемее, чем Markdown V1, где
экранирование спецсимволов внутри уже отформатированного текста плохо
определено), и разбиение длинных сообщений на части ПО БЕЗОПАСНЫМ
границам (не разрывая HTML-тег/entity — раздел 5 ТЗ hardening).

bold()/italic()/link()/code() — единственный способ добавить разметку;
они САМИ экранируют переданный текст, поэтому вызывающий код не должен
(и не может） случайно передать неэкранированное значение внутрь тега.
"""

from __future__ import annotations

import html
import logging

from telegram import InlineKeyboardMarkup, Message
from telegram.constants import ParseMode
from telegram.error import BadRequest

logger = logging.getLogger(__name__)

# Telegram ограничивает текстовое сообщение 4096 символами. Запас в ~300
# символов — не попытка впритык балансировать на границе (раздел 5 ТЗ:
# "не работай прямо у границы"), а буфер на то, что html.escape() внутри
# уже собранного текста иногда РАСШИРЯЕТ строку (один "&" -> "&amp;",
# +4 символа) уже ПОСЛЕ escape() отдельных полей, если форматирующий код
# сам вставляет литеральные "&"/"<"/">" в разметку (например, "A & B" в
# исходном knowledge-тексте) — 3500 оставляет достаточно места, чтобы
# случайное локальное расширение не столкнуло реальную длину сообщения
# обратно за лимит Telegram уже ПОСЛЕ разбиения.
SAFE_MESSAGE_LENGTH = 3500


def escape(value: object) -> str:
    """Экранирует текстовый узел (НЕ атрибут) для Telegram HTML."""
    return html.escape(str(value), quote=False)


def escape_attr(value: object) -> str:
    """Экранирует значение HTML-атрибута (например, href="...") —
    кавычки тоже должны быть экранированы, иначе URL с кавычкой внутри
    (маловероятно, но возможно в RSS/resources.json) разорвал бы сам
    атрибут."""
    return html.escape(str(value), quote=True)


def bold(text: object) -> str:
    return f"<b>{escape(text)}</b>"


def italic(text: object) -> str:
    return f"<i>{escape(text)}</i>"


def code(text: object) -> str:
    return f"<code>{escape(text)}</code>"


def link(text: object, url: object) -> str:
    return f'<a href="{escape_attr(url)}">{escape(text)}</a>'


def _avoid_mid_tag_or_entity(text: str, cut: int) -> int:
    """Не режет посреди незакрытого `<тега>` или `&entity;` — иначе часть
    сообщения теряет закрывающую `>`/`;`, и Telegram либо не распарсит
    HTML вообще, либо покажет сырые символы разметки пользователю."""
    if cut <= 0:
        return cut
    prefix = text[:cut]

    last_open = prefix.rfind("<")
    last_close = prefix.rfind(">")
    if last_open > last_close:
        return last_open if last_open > 0 else cut

    last_amp = prefix.rfind("&")
    last_semi = prefix.rfind(";")
    # Entity вроде "&quot;"/"&#39;" — не длиннее ~10 символов; более
    # дальний "&" почти наверняка обычный текстовый амперсанд (уже
    # экранированный в "&amp;" где угодно ниже по тексту, так что сам
    # "&amp;" тоже подпадает под этот же случай корректно).
    if last_amp > last_semi and (cut - last_amp) < 12:
        return last_amp if last_amp > 0 else cut

    return cut


def _find_split_point(text: str, limit: int) -> int:
    """Ищет индекс среза <= limit, предпочитая границы абзаца/строки/
    слова (раздел 5 ТЗ: приоритет \\n\\n -> \\n -> пробел -> hard cut),
    затем сдвигает найденную точку назад, если она попадает внутрь
    тега/entity. Никогда не возвращает 0 (иначе split зависнет в цикле)."""
    window = text[:limit]

    for separator in ("\n\n", "\n", " "):
        idx = window.rfind(separator)
        if idx > 0:
            cut = _avoid_mid_tag_or_entity(text, idx + len(separator))
            if cut > 0:
                return cut

    cut = _avoid_mid_tag_or_entity(text, limit)
    return cut if cut > 0 else limit


def split_message(text: str, limit: int = SAFE_MESSAGE_LENGTH) -> list[str]:
    """Бьёт текст на части <= limit, не теряя и не переставляя символы,
    без пустых частей. Каждая часть — валидный самостоятельный HTML-
    фрагмент (тег/entity никогда не разрезаются пополам), при условии,
    что переданный text уже собран из ЗАКРЫТЫХ, не вложенных друг в
    друга поперёк границ тегов (bold()/italic()/link()/code() выше это
    гарантируют — каждый вызов производит один самозамкнутый фрагмент)."""
    if not text:
        return []
    if len(text) <= limit:
        return [text]

    parts: list[str] = []
    remaining = text
    while len(remaining) > limit:
        cut = _find_split_point(remaining, limit)
        parts.append(remaining[:cut])
        remaining = remaining[cut:]
    if remaining:
        parts.append(remaining)
    return parts


async def send_message_safe(
    message: Message,
    text: str,
    reply_markup: InlineKeyboardMarkup | None = None,
    disable_web_page_preview: bool = False,
) -> Message | None:
    """`message.reply_text(...)` с HTML parse_mode + безопасным
    разбиением. `reply_markup` ставится только на ПОСЛЕДНЮЮ часть — то,
    к чему пользователь реально должен привязать нажатие кнопки.
    Возвращает последнее отправленное сообщение (или None, если text
    пустой) — вызывающему коду это обычно не нужно, но не мешает."""
    parts = split_message(text)
    if not parts:
        return None

    sent: Message | None = None
    for i, part in enumerate(parts):
        is_last = i == len(parts) - 1
        try:
            sent = await message.reply_text(
                part,
                parse_mode=ParseMode.HTML,
                reply_markup=reply_markup if is_last else None,
                disable_web_page_preview=disable_web_page_preview,
            )
        except BadRequest:
            # Раздел 20 ТЗ (security sanity check) + честность раздела 41
            # CLAUDE.md: если ДАЖЕ экранированный HTML не проходит
            # (неожиданный edge case), пользователь не должен получить
            # тишину/traceback — лучше сухое сообщение об ошибке форматирования,
            # чем упавший handler.
            logger.exception("send_message_safe: Telegram отклонил HTML-часть")
            sent = await message.reply_text(
                "Не получилось отформатировать ответ — попробуй переформулировать вопрос.",
            )
    return sent


async def edit_message_safe(
    query,
    text: str,
    reply_markup: InlineKeyboardMarkup | None = None,
    disable_web_page_preview: bool = False,
) -> None:
    """`query.edit_message_text(...)` с HTML parse_mode + безопасным
    разбиением. Одно callback-сообщение физически нельзя "превратить" в
    несколько — если text не влезает в один SAFE_MESSAGE_LENGTH, первая
    часть РЕДАКТИРУЕТ существующее сообщение, а "довесок" уходит
    отдельными новыми сообщениями через `query.message.reply_text`
    (то же значение chat'а, что и у редактируемого сообщения)."""
    parts = split_message(text)
    if not parts:
        return

    try:
        await query.edit_message_text(
            parts[0],
            parse_mode=ParseMode.HTML,
            reply_markup=reply_markup if len(parts) == 1 else None,
            disable_web_page_preview=disable_web_page_preview,
        )
    except BadRequest:
        logger.exception("edit_message_safe: Telegram отклонил HTML-часть")
        await query.edit_message_text(
            "Не получилось отформатировать ответ — попробуй переформулировать вопрос."
        )
        return

    for i, part in enumerate(parts[1:]):
        is_last = i == len(parts) - 2
        await query.message.reply_text(
            part,
            parse_mode=ParseMode.HTML,
            reply_markup=reply_markup if is_last else None,
            disable_web_page_preview=disable_web_page_preview,
        )


async def edit_text_safe(
    message: Message,
    text: str,
    disable_web_page_preview: bool = False,
) -> None:
    """Как `edit_message_safe`, но для готового `Message`-объекта, а не
    `CallbackQuery` — например, статус-сообщение вида "Загружаю..."
    (bot/handlers/news.py), которое бот сам отправил и теперь редактирует
    через `Message.edit_text(...)` (другой метод, чем у CallbackQuery, но
    та же идея: первая часть РЕДАКТИРУЕТ сообщение на месте, довесок
    уходит новыми сообщениями через `message.reply_text`)."""
    parts = split_message(text)
    if not parts:
        return

    try:
        await message.edit_text(
            parts[0],
            parse_mode=ParseMode.HTML,
            disable_web_page_preview=disable_web_page_preview,
        )
    except BadRequest:
        logger.exception("edit_text_safe: Telegram отклонил HTML-часть")
        await message.edit_text(
            "Не получилось отформатировать ответ — попробуй переформулировать вопрос."
        )
        return

    for part in parts[1:]:
        await message.reply_text(
            part,
            parse_mode=ParseMode.HTML,
            disable_web_page_preview=disable_web_page_preview,
        )
