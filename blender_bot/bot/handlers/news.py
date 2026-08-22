import time

from telegram import Update
from telegram.ext import ContextTypes

from bot.news_fetcher import get_latest_news
from bot.telegram_output import bold, edit_text_safe, escape, italic, link
from config import NEWS_FEEDS_PATH


async def news_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    status_message = await update.message.reply_text("Загружаю свежие новости...")

    try:
        items = await get_latest_news(NEWS_FEEDS_PATH)
    except Exception:
        await status_message.edit_text(
            "Не получилось загрузить новости, попробуй позже."
        )
        return

    if not items:
        await status_message.edit_text("Пока нет новостей, попробуй позже.")
        return

    # BB-001 (hardening ТЗ): title/source/link — RSS-контент внешних
    # фидов (bot/news_fetcher.py), полностью вне контроля приложения —
    # экранируется как любой другой динамический текст. title/source идут
    # текстовыми узлами через link()/italic() (сами экранируют), сам link
    # дополнительно экранируется как HTML-атрибут внутри link().
    lines = [bold("Свежие новости из мира CG:"), ""]
    for item in items[:10]:
        date_str = ""
        if item["published"]:
            date_str = f" ({time.strftime('%d.%m.%Y', item['published'])})"
        lines.append(
            f"• {link(item['title'], item['link'])} — {italic(item['source'])}{escape(date_str)}"
        )

    await edit_text_safe(status_message, "\n".join(lines), disable_web_page_preview=True)
