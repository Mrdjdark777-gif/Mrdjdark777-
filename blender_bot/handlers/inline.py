import uuid

from telegram import InlineQueryResultArticle, InputTextMessageContent, Update
from telegram.ext import ContextTypes

from handlers.qa import hotkey_lookup, knowledge_base

MAX_RESULTS = 10
NO_QUERY_PLACEHOLDER = "Напиши вопрос про Blender или название горячей клавиши"


def _kb_result(match: dict) -> InlineQueryResultArticle:
    return InlineQueryResultArticle(
        id=str(uuid.uuid4()),
        title=match["question"],
        description=match["answer"][:100],
        input_message_content=InputTextMessageContent(match["answer"]),
    )


def _hotkey_result(desc: str, category: str) -> InlineQueryResultArticle:
    key = desc.split(" — ", 1)[0]
    return InlineQueryResultArticle(
        id=str(uuid.uuid4()),
        title=f"Клавиша: {key}",
        description=desc,
        input_message_content=InputTextMessageContent(f"{desc}\n(раздел: {category})"),
    )


def _not_found_result(query: str) -> InlineQueryResultArticle:
    return InlineQueryResultArticle(
        id=str(uuid.uuid4()),
        title="Ничего не нашёл",
        description="Попробуй сформулировать вопрос иначе",
        input_message_content=InputTextMessageContent(
            f"Не нашёл ответ на «{query}» в базе знаний Blender-бота. "
            f"Официальная документация: https://docs.blender.org/manual/ru/latest/"
        ),
    )


async def inline_query(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.inline_query.query.strip()

    if not query:
        await update.inline_query.answer(
            [],
            switch_pm_text=NO_QUERY_PLACEHOLDER,
            switch_pm_parameter="start",
            cache_time=10,
        )
        return

    results = []

    kb_match = knowledge_base.search(query)
    if kb_match:
        results.append(_kb_result(kb_match))

    hotkey_matches = hotkey_lookup.find(query)
    for desc, category in hotkey_matches:
        if len(results) >= MAX_RESULTS:
            break
        results.append(_hotkey_result(desc, category))

    if not results:
        results.append(_not_found_result(query))

    await update.inline_query.answer(results, cache_time=10)
