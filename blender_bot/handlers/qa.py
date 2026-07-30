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

    await update.message.reply_text(FALLBACK_TEXT)
