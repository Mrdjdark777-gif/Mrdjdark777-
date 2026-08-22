import asyncio
import json
import logging
import time
import urllib.request
from pathlib import Path

import feedparser
from deep_translator import GoogleTranslator

from config import NEWS_CACHE_MINUTES, NEWS_ITEMS_PER_FEED

logger = logging.getLogger(__name__)

# BB-007 (hardening ТЗ): раньше все фиды обходились feedparser.parse(url)
# внутри ОДНОГО общего asyncio.to_thread(_fetch_sync, feeds) — один
# зависший/недоступный RSS-сервер блокировал бы /news для ВСЕХ
# пользователей на неопределённое время. Простое "обернуть в
# asyncio.wait_for" НЕ решает это до конца: asyncio.wait_for умеет отменить
# ещё НЕ начавшийся вызов, но уже ЗАПУЩЕННЫЙ поток (внутри
# asyncio.to_thread/run_in_executor) отменить нельзя — если сам сетевой
# вызов внутри потока не уважает таймаут, отмена на уровне asyncio
# фактически откладывается до естественного завершения потока (проверено
# эмпирически: обёрнутый в wait_for() блокирующий вызов без собственного
# таймаута всё равно ждёт его ПОЛНОСТЬЮ). Поэтому реальный таймаут задаётся
# на уровне сокета через urllib.request.urlopen(..., timeout=...) —
# единственное место, где его можно по-настоящему гарантировать; каждый
# фид при этом ещё получает свою asyncio-задачу и свою изоляцию ошибок, так
# что сломанный источник не портит остальные.
FEED_TIMEOUT_SECONDS = 10
_USER_AGENT = "Mozilla/5.0 (compatible; BlenderHelperBot/1.0; +https://t.me/Blenderhelpbot)"

_cache: dict = {"items": None, "fetched_at": 0}
_translator = GoogleTranslator(source="auto", target="ru")

# BB-006: без лока несколько параллельных /news при устаревшем кэше
# независимо запускали ПОЛНЫЙ повторный обход всех фидов + перевод
# каждого заголовка — один asyncio.Lock с двойной проверкой (once acquired,
# re-check whether another coroutine already refreshed the cache while we
# waited) гарантирует, что реальный сетевой поход происходит один раз, а
# не N раз для N одновременных пользователей.
_refresh_lock = asyncio.Lock()


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


def _fetch_one_feed_sync(feed: dict) -> list[dict]:
    req = urllib.request.Request(feed["url"], headers={"User-Agent": _USER_AGENT})
    with urllib.request.urlopen(req, timeout=FEED_TIMEOUT_SECONDS) as response:
        raw = response.read()
    parsed = feedparser.parse(raw)
    items = []
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
    return items


async def _fetch_one_feed(feed: dict) -> list[dict]:
    # wait_for здесь — доп. подстраховка (например, на случай, если
    # перевод заголовка внутри _translate_title завис — у deep_translator
    # своего таймаута нет), а не основная защита: она в urlopen(timeout=)
    # внутри _fetch_one_feed_sync выше, см. комментарий у FEED_TIMEOUT_SECONDS.
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(_fetch_one_feed_sync, feed), timeout=FEED_TIMEOUT_SECONDS
        )
    except Exception:
        logger.exception("news_fetcher: фид %r не получен (таймаут или ошибка)", feed.get("name"))
        return []


async def _fetch_all(feeds: list[dict]) -> list[dict]:
    results = await asyncio.gather(*(_fetch_one_feed(f) for f in feeds))
    items = [item for feed_items in results for item in feed_items]
    items.sort(key=lambda x: x["published"] or time.gmtime(0), reverse=True)
    return items


def _is_stale(now: float) -> bool:
    return now - _cache["fetched_at"] > NEWS_CACHE_MINUTES * 60


async def get_latest_news(feeds_path: Path, force_refresh: bool = False) -> list[dict]:
    now = time.time()
    if _cache["items"] is not None and not _is_stale(now) and not force_refresh:
        return _cache["items"]

    async with _refresh_lock:
        # Двойная проверка: пока мы ждали лок, другой конкурентный вызов
        # мог уже обновить кэш — тогда повторный сетевой поход не нужен.
        now = time.time()
        if _cache["items"] is not None and not _is_stale(now) and not force_refresh:
            return _cache["items"]

        try:
            feeds = _load_feeds(feeds_path)
            items = await _fetch_all(feeds)
        except Exception:
            # BB-007: если старый кэш вообще есть — лучше показать чуть
            # устаревшие новости, чем ничего. Если кэша нет вообще (самый
            # первый запрос после старта бота) — честно пробрасываем,
            # bot/handlers/news.py уже ловит исключение и показывает
            # понятное сообщение вместо traceback.
            if _cache["items"] is not None:
                logger.exception("news_fetcher: обновление не удалось, отдаю старый кэш")
                return _cache["items"]
            raise

        _cache["items"] = items
        _cache["fetched_at"] = now
    return _cache["items"]
