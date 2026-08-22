import json

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ContextTypes

from bot.telegram_output import bold, edit_message_safe, escape
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

    # BB-001 (hardening ТЗ): category/keys — data/hotkeys.json, теперь
    # включает не только вручную написанные строки, но и official-контент
    # из Manual (раздел 2.2 ТЗ v3, scripts/generate_hotkeys_from_manual.py)
    # — экранируется как любой другой динамический текст.
    text = bold(category) + "\n\n" + "\n".join(f"• {escape(k)}" for k in keys)

    back_button = InlineKeyboardMarkup(
        [[InlineKeyboardButton("« Назад к категориям", callback_data="hotkeys_back")]]
    )

    await edit_message_safe(query, text, reply_markup=back_button)


async def hotkeys_back_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    await query.edit_message_text(
        "Выбери категорию горячих клавиш:", reply_markup=_categories_keyboard()
    )
