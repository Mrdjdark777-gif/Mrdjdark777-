import re

from telegram import Update
from telegram.ext import ContextTypes

from config import HOTKEYS_PATH, KNOWLEDGE_BASE_PATH
from utils.hotkey_lookup import HotkeyLookup
from utils.search import KnowledgeBase

knowledge_base = KnowledgeBase(KNOWLEDGE_BASE_PATH)
hotkey_lookup = HotkeyLookup(HOTKEYS_PATH)

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


async def answer_question(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    question = update.message.text

    kb_match = knowledge_base.search(question)
    if kb_match:
        await update.message.reply_text(kb_match["answer"])
        return

    hotkey_matches = hotkey_lookup.find(question)
    if hotkey_matches:
        await update.message.reply_text(
            _format_hotkey_matches(hotkey_matches), parse_mode="Markdown"
        )
        return

    if _is_vague_followup(question):
        await update.message.reply_text(VAGUE_FOLLOWUP_TEXT)
        return

    await update.message.reply_text(FALLBACK_TEXT)
