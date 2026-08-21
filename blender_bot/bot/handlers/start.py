from telegram import Update
from telegram.ext import ContextTypes

from config import SUBSCRIBERS_PATH
from profile.subscribers import add_subscriber

WELCOME_TEXT = (
    "Привет! Я бот-помощник по Blender.\n\n"
    "Что я умею:\n"
    "• Отвечать на вопросы про Blender — просто напиши вопрос текстом\n"
    "• Для проблем и ошибок могу задать пару уточняющих вопросов, чтобы "
    "точнее найти причину\n"
    "• /learn <тема> — теория и пример по теме (например: /learn Mirror Modifier)\n"
    "• /test — проверочные вопросы по последней изученной теме\n"
    "• /exam — вопросы вперемешку по всем темам\n"
    "• /next — следующий вопрос теста или подсказка, что изучить дальше\n"
    "• /progress, /weaknesses — прогресс и слабые места за эту сессию\n"
    "• /hotkeys — горячие клавиши по категориям\n"
    "• /resources — сайты с 3D-моделями, текстурами, HDRI и обучением\n"
    "• /news — свежие новости из мира CG\n"
    "• /help — это сообщение\n\n"
    "Например, спроси: «как сделать булеан» или «в чем разница cycles и eevee»."
)


async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    add_subscriber(SUBSCRIBERS_PATH, update.effective_chat.id)
    await update.message.reply_text(WELCOME_TEXT)


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(WELCOME_TEXT)
