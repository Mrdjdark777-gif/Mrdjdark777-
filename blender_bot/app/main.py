import logging

from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    InlineQueryHandler,
    MessageHandler,
    filters,
)

from bot.handlers.admin import (
    admin_command,
    debug_command,
    health_command,
    quick_add_command,
    reindex_command,
    search_command,
    sources_command,
    stats_command,
    unanswered_command,
    version_command,
)
from bot.handlers.broadcast import broadcast_command
from bot.handlers.diagnostics import diag_option_callback
from bot.handlers.education import (
    exam_command,
    learn_command,
    next_command,
    progress_command,
    quiz_answer_callback,
    test_command,
    weaknesses_command,
)
from bot.handlers.hotkeys import hotkeys_back_callback, hotkeys_callback, hotkeys_command
from bot.handlers.inline import inline_query
from bot.handlers.news import news_command
from bot.handlers.qa import answer_question, qa_confirm_callback, qa_decline_callback
from bot.handlers.resources import (
    resources_back_callback,
    resources_callback,
    resources_command,
)
from bot.handlers.start import help_command, start_command
from config import BOT_TOKEN

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
    application.add_handler(CommandHandler("broadcast", broadcast_command))
    application.add_handler(CommandHandler("learn", learn_command))
    application.add_handler(CommandHandler("test", test_command))
    application.add_handler(CommandHandler("exam", exam_command))
    application.add_handler(CommandHandler("progress", progress_command))
    application.add_handler(CommandHandler("weaknesses", weaknesses_command))
    application.add_handler(CommandHandler("next", next_command))

    # Admin Commands + Debug Mode (разделы 32-33 ТЗ) — доступны только
    # OWNER_ID, проверка внутри каждого хендлера (bot/handlers/admin.py).
    application.add_handler(CommandHandler("admin", admin_command))
    application.add_handler(CommandHandler("health", health_command))
    application.add_handler(CommandHandler("stats", stats_command))
    application.add_handler(CommandHandler("sources", sources_command))
    application.add_handler(CommandHandler("version", version_command))
    application.add_handler(CommandHandler("search", search_command))
    application.add_handler(CommandHandler("debug", debug_command))
    application.add_handler(CommandHandler("unanswered", unanswered_command))
    application.add_handler(CommandHandler("quick_add", quick_add_command))
    application.add_handler(CommandHandler("reindex", reindex_command))

    application.add_handler(CallbackQueryHandler(hotkeys_callback, pattern=r"^hotkeys:\d+$"))
    application.add_handler(CallbackQueryHandler(hotkeys_back_callback, pattern=r"^hotkeys_back$"))
    application.add_handler(CallbackQueryHandler(resources_callback, pattern=r"^resources:\d+$"))
    application.add_handler(CallbackQueryHandler(resources_back_callback, pattern=r"^resources_back$"))
    application.add_handler(CallbackQueryHandler(qa_confirm_callback, pattern=r"^qa_yes$"))
    application.add_handler(CallbackQueryHandler(qa_decline_callback, pattern=r"^qa_no$"))
    application.add_handler(CallbackQueryHandler(diag_option_callback, pattern=r"^diag:\d+$"))
    application.add_handler(CallbackQueryHandler(quiz_answer_callback, pattern=r"^edu:\d+$"))

    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, answer_question))
    application.add_handler(InlineQueryHandler(inline_query))

    logger.info("Бот запущен")
    application.run_polling(allowed_updates=["message", "callback_query", "inline_query"])


if __name__ == "__main__":
    main()
