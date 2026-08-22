"""Тесты на bot/news_fetcher.py — BB-006 (cache stampede) и BB-007
(per-feed timeout + изоляция ошибок + stale-cache fallback), hardening ТЗ."""

import asyncio
import json
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import bot.news_fetcher as news_fetcher  # noqa: E402


def _run(coro):
    return asyncio.run(coro)


def _feeds_file(tmp_dir: Path, feeds: list[dict]) -> Path:
    path = tmp_dir / "feeds.json"
    path.write_text(json.dumps(feeds), encoding="utf-8")
    return path


class NewsFetcherTestCase(unittest.TestCase):
    def setUp(self):
        self._original_cache = news_fetcher._cache
        news_fetcher._cache = {"items": None, "fetched_at": 0}
        news_fetcher._refresh_lock = asyncio.Lock()
        self._tmp = tempfile.TemporaryDirectory()

    def tearDown(self):
        news_fetcher._cache = self._original_cache
        self._tmp.cleanup()


class ConcurrencyStampedeTests(NewsFetcherTestCase):
    """BB-006: несколько одновременных /news при устаревшем/пустом кэше
    должны запускать РЕАЛЬНЫЙ обход фидов только один раз, а не по разу
    на каждый параллельный вызов."""

    def test_concurrent_calls_with_empty_cache_fetch_once(self):
        feeds_path = _feeds_file(Path(self._tmp.name), [{"name": "A", "url": "http://a"}])
        call_count = 0
        result = [{"source": "A", "title": "t", "link": "l", "published": None}]

        async def fake_fetch_all(feeds):
            nonlocal call_count
            call_count += 1
            await asyncio.sleep(0.05)
            return result

        async def scenario():
            with patch.object(news_fetcher, "_fetch_all", fake_fetch_all):
                return await asyncio.gather(*[news_fetcher.get_latest_news(feeds_path) for _ in range(5)])

        results = _run(scenario())
        self.assertEqual(call_count, 1)
        for r in results:
            self.assertEqual(r, result)

    def test_fresh_cache_returned_without_calling_fetch(self):
        feeds_path = _feeds_file(Path(self._tmp.name), [{"name": "A", "url": "http://a"}])
        cached_items = [{"source": "cached", "title": "t", "link": "l", "published": None}]
        news_fetcher._cache = {"items": cached_items, "fetched_at": time.time()}
        called = False

        async def fake_fetch_all(feeds):
            nonlocal called
            called = True
            return []

        async def scenario():
            with patch.object(news_fetcher, "_fetch_all", fake_fetch_all):
                return await news_fetcher.get_latest_news(feeds_path)

        items = _run(scenario())
        self.assertFalse(called, "свежий кэш не должен вызывать реальный обход фидов вообще")
        self.assertEqual(items, cached_items)

    def test_force_refresh_bypasses_fresh_cache(self):
        feeds_path = _feeds_file(Path(self._tmp.name), [{"name": "A", "url": "http://a"}])
        news_fetcher._cache = {"items": [{"source": "cached"}], "fetched_at": time.time()}
        new_items = [{"source": "fresh"}]

        async def fake_fetch_all(feeds):
            return new_items

        async def scenario():
            with patch.object(news_fetcher, "_fetch_all", fake_fetch_all):
                return await news_fetcher.get_latest_news(feeds_path, force_refresh=True)

        self.assertEqual(_run(scenario()), new_items)


class PerFeedIsolationTests(NewsFetcherTestCase):
    """BB-007: один сломанный/зависший фид не должен портить результаты
    остальных и не должен блокировать /news дольше собственного таймаута."""

    def test_one_broken_feed_does_not_block_others(self):
        feeds_path = _feeds_file(Path(self._tmp.name), [
            {"name": "Broken", "url": "http://broken"},
            {"name": "Good", "url": "http://good"},
        ])

        def fake_fetch_one_sync(feed):
            if feed["name"] == "Broken":
                raise RuntimeError("boom")
            return [{"source": "Good", "title": "ok", "link": "l", "published": None}]

        async def scenario():
            with patch.object(news_fetcher, "_fetch_one_feed_sync", fake_fetch_one_sync):
                return await news_fetcher.get_latest_news(feeds_path)

        items = _run(scenario())
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["source"], "Good")

    def test_feed_that_times_out_does_not_block_or_break_fast_feed(self):
        # Имитирует то, что реально происходит при urlopen(timeout=...):
        # для зависшего источника вызов заканчивается исключением
        # (socket.timeout/TimeoutError), а не молча висит вечно.
        feeds_path = _feeds_file(Path(self._tmp.name), [
            {"name": "TimesOut", "url": "http://slow"},
            {"name": "Fast", "url": "http://fast"},
        ])

        def fake_fetch_one_sync(feed):
            if feed["name"] == "TimesOut":
                raise TimeoutError("simulated socket timeout")
            return [{"source": "Fast", "title": "ok", "link": "l", "published": None}]

        async def scenario():
            with patch.object(news_fetcher, "_fetch_one_feed_sync", fake_fetch_one_sync):
                return await news_fetcher.get_latest_news(feeds_path)

        items = _run(scenario())
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["source"], "Fast")


class FetchOneFeedSyncTests(unittest.TestCase):
    """BB-007: реальная защита от зависшего фида — socket-таймаут внутри
    urlopen(), а не (недостаточная сама по себе) отмена на уровне asyncio
    вокруг уже запущенного потока. Проверяем, что таймаут действительно
    передаётся в urlopen, а не просто существует в виде константы."""

    def test_urlopen_called_with_feed_timeout(self):
        rss = (
            b'<?xml version="1.0"?><rss version="2.0"><channel>'
            b"<item><title>T</title><link>http://x/1</link></item>"
            b"</channel></rss>"
        )
        fake_response = MagicMock()
        fake_response.read.return_value = rss
        fake_response.__enter__.return_value = fake_response
        fake_response.__exit__.return_value = False

        with patch("bot.news_fetcher.urllib.request.urlopen", return_value=fake_response) as mock_urlopen, \
             patch.object(news_fetcher, "_translate_title", side_effect=lambda t: t):
            items = news_fetcher._fetch_one_feed_sync({"name": "X", "url": "http://x"})

        self.assertEqual(mock_urlopen.call_args.kwargs.get("timeout"), news_fetcher.FEED_TIMEOUT_SECONDS)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["title"], "T")


class StaleCacheFallbackTests(NewsFetcherTestCase):
    """BB-007: если обновление не удалось, но старый кэш есть — лучше
    отдать чуть устаревшие новости, чем ничего."""

    def test_refresh_failure_returns_old_cache_if_present(self):
        feeds_path = _feeds_file(Path(self._tmp.name), [{"name": "A", "url": "http://a"}])
        old_items = [{"source": "old", "title": "t", "link": "l", "published": None}]
        news_fetcher._cache = {"items": old_items, "fetched_at": 0}  # заведомо устарел

        async def failing_fetch_all(feeds):
            raise RuntimeError("network down")

        async def scenario():
            with patch.object(news_fetcher, "_fetch_all", failing_fetch_all):
                return await news_fetcher.get_latest_news(feeds_path)

        self.assertEqual(_run(scenario()), old_items)

    def test_refresh_failure_with_no_cache_raises(self):
        feeds_path = _feeds_file(Path(self._tmp.name), [{"name": "A", "url": "http://a"}])

        async def failing_fetch_all(feeds):
            raise RuntimeError("network down")

        async def scenario():
            with patch.object(news_fetcher, "_fetch_all", failing_fetch_all):
                return await news_fetcher.get_latest_news(feeds_path)

        with self.assertRaises(RuntimeError):
            _run(scenario())


if __name__ == "__main__":
    unittest.main()
