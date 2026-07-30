import logging

from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    InlineQueryHandler,
    MessageHandler,
    filters,
)

from config import BOT_TOKEN
from handlers.hotkeys import hotkeys_back_callback, hotkeys_callback, hotkeys_command
from handlers.inline import inline_query
from handlers.news import news_command
from handlers.qa import answer_question, qa_confirm_callback, qa_decline_callback
from handlers.resources import (
    resources_back_callback,
    resources_callback,
    resources_command,
)
from handlers.start import help_command, start_command

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s", level=logging.INFO
)
logger = logging.getLogger(__name__)


def main() -> None:
    if not BOT_TOKEN:
        raise RuntimeError(
            "BOT_TOKEN не задан. Создай файл .env на основе .env.example и укажи токен."
        )

    application = Application.builder().token(BOT_TOKEN).build()

    application.add_handler(CommandHandler("start", start_command))
    application.add_handler(CommandHandler("help", help_command))
    application.add_handler(CommandHandler("hotkeys", hotkeys_command))
    application.add_handler(CommandHandler("resources", resources_command))
    application.add_handler(CommandHandler("news", news_command))

    application.add_handler(CallbackQueryHandler(hotkeys_callback, pattern=r"^hotkeys:\d+$"))
    application.add_handler(CallbackQueryHandler(hotkeys_back_callback, pattern=r"^hotkeys_back$"))
    application.add_handler(CallbackQueryHandler(resources_callback, pattern=r"^resources:\d+$"))
    application.add_handler(CallbackQueryHandler(resources_back_callback, pattern=r"^resources_back$"))
    application.add_handler(CallbackQueryHandler(qa_confirm_callback, pattern=r"^qa_yes:\d+$"))
    application.add_handler(CallbackQueryHandler(qa_decline_callback, pattern=r"^qa_no$"))

    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, answer_question))
    application.add_handler(InlineQueryHandler(inline_query))

    logger.info("Бот запущен")
    application.run_polling(allowed_updates=["message", "callback_query", "inline_query"])


if __name__ == "__main__":
    main()
