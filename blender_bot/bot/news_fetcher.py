import asyncio
import json
import time
from pathlib import Path

import feedparser
from deep_translator import GoogleTranslator

from config import NEWS_CACHE_MINUTES, NEWS_ITEMS_PER_FEED

_cache: dict = {"items": None, "fetched_at": 0}
_translator = GoogleTranslator(source="auto", target="ru")


def _load_feeds(path: Path) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _translate_title(title: str) -> str:
    if not title:
        return title
    try:
        translated = _translator.translate(title)
        return translated or title
    except Exception:
        return title


def _fetch_sync(feeds: list[dict]) -> list[dict]:
    items = []
    for feed in feeds:
        parsed = feedparser.parse(feed["url"])
        for entry in parsed.entries[:NEWS_ITEMS_PER_FEED]:
            title = entry.get("title", "Без названия")
            items.append(
                {
                    "source": feed["name"],
                    "title": _translate_title(title),
                    "link": entry.get("link", ""),
                    "published": entry.get("published_parsed"),
                }
            )
    items.sort(key=lambda x: x["published"] or time.gmtime(0), reverse=True)
    return items


async def get_latest_news(feeds_path: Path, force_refresh: bool = False) -> list[dict]:
    now = time.time()
    is_stale = now - _cache["fetched_at"] > NEWS_CACHE_MINUTES * 60
    if _cache["items"] is None or is_stale or force_refresh:
        feeds = _load_feeds(feeds_path)
        items = await asyncio.to_thread(_fetch_sync, feeds)
        _cache["items"] = items
        _cache["fetched_at"] = now
    return _cache["items"]
