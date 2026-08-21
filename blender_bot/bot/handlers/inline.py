import uuid

from telegram import InlineQueryResultArticle, InputTextMessageContent, Update
from telegram.ext import ContextTypes

from bot.handlers.qa import qa_service
from search.engine import ScoredChunk
from search.qa_service import SOFT_MATCH_THRESHOLD

MAX_RESULTS = 10
NO_QUERY_PLACEHOLDER = "Напиши вопрос про Blender или название горячей клавиши"


def _chunk_result(scored: ScoredChunk) -> InlineQueryResultArticle:
    chunk = scored.chunk
    content = chunk.content
    if chunk.source_type == "official_manual" and chunk.url:
        message = f"{chunk.translated_title}\n{content}\n\n{chunk.url}"
    else:
        message = f"{chunk.translated_title}\n{content}"
    return InlineQueryResultArticle(
        id=str(uuid.uuid4()),
        title=chunk.translated_title,
        description=content[:100],
        input_message_content=InputTextMessageContent(message),
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

    hotkey_matches = qa_service.hotkey_lookup.find(query)
    for desc, category in hotkey_matches:
        if len(results) >= MAX_RESULTS:
            break
        results.append(_hotkey_result(desc, category))

    if len(results) < MAX_RESULTS:
        scored_chunks = qa_service.engine.search(query, top_n=MAX_RESULTS - len(results))
        for scored in scored_chunks:
            if scored.score < SOFT_MATCH_THRESHOLD:
                continue
            results.append(_chunk_result(scored))

    if not results:
        results.append(_not_found_result(query))

    await update.inline_query.answer(results, cache_time=10)
