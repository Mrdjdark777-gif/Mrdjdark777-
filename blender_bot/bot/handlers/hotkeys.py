import json

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ContextTypes

from config import HOTKEYS_PATH

with open(HOTKEYS_PATH, encoding="utf-8") as f:
    HOTKEYS = json.load(f)

CATEGORIES = list(HOTKEYS.keys())


def _categories_keyboard() -> InlineKeyboardMarkup:
    buttons = [
        [InlineKeyboardButton(name, callback_data=f"hotkeys:{i}")]
        for i, name in enumerate(CATEGORIES)
    ]
    return InlineKeyboardMarkup(buttons)


async def hotkeys_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "Выбери категорию горячих клавиш:", reply_markup=_categories_keyboard()
    )


async def hotkeys_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()

    index = int(query.data.split(":", 1)[1])
    category = CATEGORIES[index]
    keys = HOTKEYS[category]

    text = f"*{category}*\n\n" + "\n".join(f"• {k}" for k in keys)

    back_button = InlineKeyboardMarkup(
        [[InlineKeyboardButton("« Назад к категориям", callback_data="hotkeys_back")]]
    )

    await query.edit_message_text(
        text, parse_mode="Markdown", reply_markup=back_button
    )


async def hotkeys_back_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    await query.edit_message_text(
        "Выбери категорию горячих клавиш:", reply_markup=_categories_keyboard()
    )
