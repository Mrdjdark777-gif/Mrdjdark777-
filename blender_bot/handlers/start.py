from telegram import Update
from telegram.ext import ContextTypes

WELCOME_TEXT = (
    "Привет! Я бот-помощник по Blender.\n\n"
    "Что я умею:\n"
    "• Отвечать на вопросы про Blender — просто напиши вопрос текстом\n"
    "• /hotkeys — горячие клавиши по категориям\n"
    "• /resources — сайты с 3D-моделями, текстурами, HDRI и обучением\n"
    "• /news — свежие новости из мира CG\n"
    "• /help — это сообщение\n\n"
    "Например, спроси: «как сделать булеан» или «в чем разница cycles и eevee»."
)


async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(WELCOME_TEXT)


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(WELCOME_TEXT)
