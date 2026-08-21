import re

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ContextTypes

from config import HOTKEYS_PATH, KNOWLEDGE_BASE_PATH, MANUAL_INDEX_PATH, UNANSWERED_LOG_PATH
from search.qa_service import QAService

# Единственный экземпляр на процесс — данные грузятся один раз, а не при
# каждом сообщении; bot/handlers/inline.py переиспользует его же.
qa_service = QAService(KNOWLEDGE_BASE_PATH, HOTKEYS_PATH, MANUAL_INDEX_PATH, UNANSWERED_LOG_PATH)

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


def _format_manual_match(entry: dict) -> str:
    return (
        f"В своей базе знаний точного ответа не нашёл, но, возможно, поможет "
        f"официальная документация Blender:\n\n"
        f"*{entry['title']}*\n{entry['summary']}\n\n{entry['url']}"
    )


async def answer_question(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    question = update.message.text

    # Проверяем расплывчатость ДО поиска по базе: короткое слово вроде
    # «подробнее» может случайно совпасть с текстом какого-то вопроса
    # в базе, и тогда бот уверенно ответит не по теме.
    if _is_vague_followup(question):
        await update.message.reply_text(VAGUE_FOLLOWUP_TEXT)
        return

    result = qa_service.answer(question)

    if result.kind == "kb_exact":
        await update.message.reply_text(result.entry["answer"])
        return

    if result.kind == "hotkeys":
        await update.message.reply_text(
            _format_hotkey_matches(result.hotkey_matches), parse_mode="Markdown"
        )
        return

    if result.kind == "soft_match":
        context.user_data["pending_question"] = question
        context.user_data["pending_score"] = result.score
        keyboard = InlineKeyboardMarkup(
            [
                [
                    InlineKeyboardButton(
                        "Да, это оно", callback_data=f"qa_yes:{result.entry['_idx']}"
                    ),
                    InlineKeyboardButton("Нет", callback_data="qa_no"),
                ]
            ]
        )
        await update.message.reply_text(
            f"Возможно, ты имел в виду:\n«{result.entry['question']}»?",
            reply_markup=keyboard,
        )
        return

    if result.kind == "manual":
        await update.message.reply_text(
            _format_manual_match(result.entry), parse_mode="Markdown"
        )
        return

    await update.message.reply_text(FALLBACK_TEXT)


async def qa_confirm_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    context.user_data.pop("pending_question", None)
    context.user_data.pop("pending_score", None)

    idx = int(query.data.split(":", 1)[1])
    entry = qa_service.get_kb_entry(idx)
    if entry:
        await query.edit_message_text(entry["answer"])
    else:
        await query.edit_message_text(FALLBACK_TEXT)


async def qa_decline_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()

    question = context.user_data.pop("pending_question", None)
    score = context.user_data.pop("pending_score", 0.0)
    if question:
        qa_service.log_unanswered(question, score)

    manual_match = qa_service.manual_fallback(question) if question else None
    if manual_match:
        await query.edit_message_text(
            _format_manual_match(manual_match), parse_mode="Markdown"
        )
        return

    await query.edit_message_text(FALLBACK_TEXT)
