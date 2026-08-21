import json

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ContextTypes

from config import RESOURCES_PATH

with open(RESOURCES_PATH, encoding="utf-8") as f:
    RESOURCES = json.load(f)

CATEGORIES = list(RESOURCES.keys())


def _categories_keyboard() -> InlineKeyboardMarkup:
    buttons = [
        [InlineKeyboardButton(name, callback_data=f"resources:{i}")]
        for i, name in enumerate(CATEGORIES)
    ]
    return InlineKeyboardMarkup(buttons)


async def resources_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "Выбери категорию ресурсов:", reply_markup=_categories_keyboard()
    )


async def resources_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()

    index = int(query.data.split(":", 1)[1])
    category = CATEGORIES[index]
    items = RESOURCES[category]

    lines = [f"*{category}*", ""]
    for item in items:
        lines.append(f"[{item['name']}]({item['url']}) — {item['note']}")
    text = "\n".join(lines)

    back_button = InlineKeyboardMarkup(
        [[InlineKeyboardButton("« Назад к категориям", callback_data="resources_back")]]
    )

    await query.edit_message_text(
        text,
        parse_mode="Markdown",
        reply_markup=back_button,
        disable_web_page_preview=True,
    )


async def resources_back_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    await query.edit_message_text(
        "Выбери категорию ресурсов:", reply_markup=_categories_keyboard()
    )
