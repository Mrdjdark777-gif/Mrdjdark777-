import time

from telegram import Update
from telegram.ext import ContextTypes

from bot.news_fetcher import get_latest_news
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

    lines = ["*Свежие новости из мира CG:*", ""]
    for item in items[:10]:
        date_str = ""
        if item["published"]:
            date_str = f" ({time.strftime('%d.%m.%Y', item['published'])})"
        lines.append(f"• [{item['title']}]({item['link']}) — _{item['source']}_{date_str}")

    await status_message.edit_text(
        "\n".join(lines), parse_mode="Markdown", disable_web_page_preview=True
    )
