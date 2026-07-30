import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"

BOT_TOKEN = os.getenv("BOT_TOKEN")

KNOWLEDGE_BASE_PATH = DATA_DIR / "knowledge_base.json"
HOTKEYS_PATH = DATA_DIR / "hotkeys.json"
RESOURCES_PATH = DATA_DIR / "resources.json"
NEWS_FEEDS_PATH = DATA_DIR / "news_feeds.json"
UNANSWERED_LOG_PATH = DATA_DIR / "unanswered_log.jsonl"

NEWS_CACHE_MINUTES = 15
NEWS_ITEMS_PER_FEED = 4
