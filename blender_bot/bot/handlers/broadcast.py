import asyncio

from telegram import Update
from telegram.error import BadRequest, Forbidden
from telegram.ext import ContextTypes

from config import BROADCAST_DELAY_SECONDS, OWNER_ID, SUBSCRIBERS_PATH
from profile.subscribers import get_subscribers, remove_subscriber

USAGE_TEXT = "Использование: /broadcast текст сообщения"
NOT_OWNER_TEXT = "Эта команда доступна только владельцу бота."
NO_OWNER_CONFIGURED_TEXT = (
    "OWNER_ID не задан в .env — рассылка отключена. "
    "Узнай свой Telegram ID у @userinfobot и добавь его в .env."
)
NO_SUBSCRIBERS_TEXT = "Пока нет ни одного подписчика — никто не запускал /start."


async def broadcast_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not OWNER_ID:
        await update.message.reply_text(NO_OWNER_CONFIGURED_TEXT)
        return

    if update.effective_user.id != OWNER_ID:
        await update.message.reply_text(NOT_OWNER_TEXT)
        return

    text = update.message.text.partition(" ")[2].strip()
    if not text:
        await update.message.reply_text(USAGE_TEXT)
        return

    chat_ids = get_subscribers(SUBSCRIBERS_PATH)
    if not chat_ids:
        await update.message.reply_text(NO_SUBSCRIBERS_TEXT)
        return

    status = await update.message.reply_text(
        f"Начинаю рассылку для {len(chat_ids)} пользователей..."
    )

    sent = 0
    failed = 0
    for chat_id in chat_ids:
        try:
            await context.bot.send_message(chat_id=chat_id, text=text)
            sent += 1
        except (Forbidden, BadRequest):
            remove_subscriber(SUBSCRIBERS_PATH, chat_id)
            failed += 1
        except Exception:
            failed += 1
        await asyncio.sleep(BROADCAST_DELAY_SECONDS)

    await status.edit_text(f"Рассылка завершена: доставлено {sent}, не доставлено {failed}.")
