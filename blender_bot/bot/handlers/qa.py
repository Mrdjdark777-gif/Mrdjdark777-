import re

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ContextTypes

from config import (
    HOTKEYS_PATH,
    KNOWLEDGE_CHUNK_PATHS,
    TERMINOLOGY_PATH,
    UNANSWERED_LOG_PATH,
)
from bot.handlers.diagnostics import clear_session, try_start_diagnostic
from knowledge.schema import KnowledgeChunk
from search.qa_service import QAService

# Единственный экземпляр на процесс — TF-IDF индекс и данные грузятся один
# раз при старте, а не при каждом сообщении; bot/handlers/inline.py
# переиспользует его же.
qa_service = QAService(HOTKEYS_PATH, UNANSWERED_LOG_PATH, KNOWLEDGE_CHUNK_PATHS, TERMINOLOGY_PATH)

FALLBACK_TEXT = (
    "Не нашел точного ответа на этот вопрос в своей базе знаний.\n\n"
    "Попробуй переформулировать вопрос покороче (например: «как сделать риг» "
    "или «разница cycles eevee»), либо посмотри:\n"
    "• /hotkeys — горячие клавиши\n"
    "• /resources — сайты с моделями, текстурами и обучением\n"
    "• Официальная документация: https://docs.blender.org/manual/ru/latest/"
)

VAGUE_FOLLOWUP_TEXT = (
    "Похоже, это уточнение к предыдущему сообщению, а не отдельный вопрос.\n\n"
    "Я не запоминаю историю переписки и разбираю каждое сообщение отдельно, "
    "поэтому не понимаю, к чему относится «подробнее» или «почему».\n\n"
    "Напиши вопрос целиком, с темой — например: «расскажи подробнее про "
    "модификатор Boolean»."
)

_WORD_RE = re.compile(r"[a-zа-яё0-9]+", re.IGNORECASE)
_FOLLOWUP_MARKERS = {
    "подробнее", "почему", "зачем", "поясни", "объясни", "расскажи",
    "понятнее", "детальнее", "ещё", "еще",
}


def _is_vague_followup(question: str) -> bool:
    words = _WORD_RE.findall(question.lower())
    if not words:
        return False
    if len(words) <= 2:
        return True
    return len(words) <= 4 and any(w in _FOLLOWUP_MARKERS for w in words)


def _format_hotkey_matches(matches: list[tuple[str, str]]) -> str:
    lines = ["Нашел в списке горячих клавиш:", ""]
    for desc, category in matches:
        lines.append(f"• {desc}\n  _(раздел: {category})_")
    return "\n".join(lines)


def _source_label(chunk: KnowledgeChunk) -> str:
    if chunk.source_type == "official_manual":
        return "официальный Blender Manual"
    if chunk.source_type == "ai_generated_unverified":
        return "личная база бота, не проверено"
    return chunk.source


def _format_citation(chunk: KnowledgeChunk) -> str | None:
    """Источник, раздел, версия и URL — раздел 15 ТЗ."""
    if chunk.source_type == "official_manual":
        version_note = f" ({chunk.version})" if chunk.version else " (версия не определена)"
        parts = [f"_Источник: официальный Blender Manual{version_note}_"]
        if chunk.url:
            parts.append(chunk.url)
        return "\n".join(parts)
    if chunk.source_type == "ai_generated_unverified":
        return (
            "_Из личной базы бота, не сверено с официальной документацией — "
            "если что-то не сходится, доверяй официальному Manual._"
        )
    if chunk.url:
        return f"_Источник: {chunk.source}_\n{chunk.url}"
    return None


def _format_chunk_answer(
    chunk: KnowledgeChunk,
    confidence: str = "MEDIUM",
    competing_chunk: KnowledgeChunk | None = None,
) -> str:
    """Раздел 15 ТЗ (citations) + раздел 14 (LOW нельзя выдавать за
    уверенное утверждение — явная оговорка) + раздел 17 (Conflict Engine —
    не молчать про второй найденный источник другого типа)."""
    lines = [chunk.content]

    citation = _format_citation(chunk)
    if citation:
        lines.append(f"\n{citation}")

    # ai_generated_unverified уже честно оговорен в _format_citation —
    # не дублировать ту же мысль второй раз другими словами.
    if confidence == "LOW" and chunk.source_type != "ai_generated_unverified":
        lines.append("\n_Уверенность в этом ответе невысокая._")

    if competing_chunk:
        lines.append(
            f"\n_Также нашлась информация из другого источника "
            f"({_source_label(competing_chunk)}) — показан более приоритетный вариант._"
        )

    return "\n".join(lines)


async def answer_question(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    question = update.message.text

    # Свободный текст всегда означает новый вопрос, а не ответ на кнопку
    # диагностики — если пользователь был в середине decision-tree диалога
    # (bot/handlers/diagnostics.py) и написал что-то текстом вместо клика
    # по кнопке, эта сессия считается брошенной.
    clear_session(context)

    # Проверяем расплывчатость ДО поиска: короткое слово вроде «подробнее»
    # может случайно совпасть с чем-то в корпусе, и тогда бот уверенно
    # ответит не по теме.
    if _is_vague_followup(question):
        await update.message.reply_text(VAGUE_FOLLOWUP_TEXT)
        return

    # Diagnostic Engine (раздел 12 ТЗ) — для TROUBLESHOOTING/ERROR вопросов,
    # похожих на известный сценарий, запускаем decision-tree диалог вместо
    # того, чтобы сразу вываливать один ответ.
    intent = qa_service.intent_engine.classify(question)
    if await try_start_diagnostic(question, intent.question_types, update, context):
        return

    result = qa_service.answer(question)

    if result.kind == "chunk_confident":
        await update.message.reply_text(
            _format_chunk_answer(result.chunk, result.confidence, result.competing_chunk),
            parse_mode="Markdown",
        )
        return

    if result.kind == "hotkeys":
        await update.message.reply_text(
            _format_hotkey_matches(result.hotkey_matches), parse_mode="Markdown"
        )
        return

    if result.kind == "soft_match":
        context.user_data["pending_question"] = question
        context.user_data["pending_score"] = result.score
        context.user_data["pending_chunk_id"] = result.chunk.id
        keyboard = InlineKeyboardMarkup(
            [
                [
                    InlineKeyboardButton("Да, это оно", callback_data="qa_yes"),
                    InlineKeyboardButton("Нет", callback_data="qa_no"),
                ]
            ]
        )
        await update.message.reply_text(
            f"Возможно, ты имел в виду:\n«{result.chunk.translated_title}»?",
            reply_markup=keyboard,
        )
        return

    await update.message.reply_text(FALLBACK_TEXT)


async def qa_confirm_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    context.user_data.pop("pending_question", None)
    context.user_data.pop("pending_score", None)
    chunk_id = context.user_data.pop("pending_chunk_id", None)

    chunk = qa_service.get_chunk(chunk_id) if chunk_id else None
    if chunk:
        # soft_match по построению ниже HIGH_CONFIDENCE_THRESHOLD (Phase 7) —
        # confidence="LOW" здесь всегда честна, пересчитывать не нужно.
        await query.edit_message_text(
            _format_chunk_answer(chunk, confidence="LOW"), parse_mode="Markdown"
        )
    else:
        await query.edit_message_text(FALLBACK_TEXT)


async def qa_decline_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()

    question = context.user_data.pop("pending_question", None)
    score = context.user_data.pop("pending_score", 0.0)
    context.user_data.pop("pending_chunk_id", None)
    if question:
        qa_service.log_unanswered(question, score)

    await query.edit_message_text(FALLBACK_TEXT)
