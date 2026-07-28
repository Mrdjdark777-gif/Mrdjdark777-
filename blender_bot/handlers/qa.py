from telegram import Update
from telegram.ext import ContextTypes

from config import KNOWLEDGE_BASE_PATH
from utils.search import KnowledgeBase

knowledge_base = KnowledgeBase(KNOWLEDGE_BASE_PATH)

FALLBACK_TEXT = (
    "Не нашел точного ответа на этот вопрос в своей базе знаний.\n\n"
    "Попробуй переформулировать вопрос покороче (например: «как сделать риг» "
    "или «разница cycles eevee»), либо посмотри:\n"
    "• /hotkeys — горячие клавиши\n"
    "• /resources — сайты с моделями, текстурами и обучением\n"
    "• Официальная документация: https://docs.blender.org/manual/ru/latest/"
)


async def answer_question(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    question = update.message.text
    match = knowledge_base.search(question)

    if match:
        await update.message.reply_text(match["answer"])
    else:
        await update.message.reply_text(FALLBACK_TEXT)
