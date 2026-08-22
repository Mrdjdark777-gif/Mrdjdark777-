import json
import logging
import os
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)


def _load(path: Path) -> set[int]:
    # BB-005 (hardening ТЗ): если файл повреждён (например, процесс был
    # убит посреди записи ДО перехода на atomic write ниже, или диск
    # заполнился) — не роняем /start для всех пользователей, а честно
    # логируем и считаем список подписчиков пустым, а не падаем с
    # необработанным JSONDecodeError.
    if not path.exists():
        return set()
    try:
        with open(path, encoding="utf-8") as f:
            return set(json.load(f))
    except (json.JSONDecodeError, ValueError, OSError):
        logger.exception("subscribers.py: не удалось прочитать %s, список подписчиков считается пустым", path)
        return set()


def _save(path: Path, chat_ids: set[int]) -> None:
    # BB-005: atomic write — пишем во временный файл В ТОЙ ЖЕ директории
    # (гарантирует, что os.replace — это rename на одной файловой системе,
    # а значит атомарен), fsync перед replace, чтобы данные реально дошли
    # до диска, а не только до буфера ОС. Раньше запись шла напрямую в
    # subscribers.json — SIGKILL/OOM/потеря питания посреди json.dump()
    # оставляли обрезанный, невалидный JSON, который затем ронял КАЖДЫЙ
    # следующий /start (см. _load выше).
    fd, tmp_path = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(sorted(chat_ids), f)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, path)
    except BaseException:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def add_subscriber(path: Path, chat_id: int) -> None:
    chat_ids = _load(path)
    if chat_id not in chat_ids:
        chat_ids.add(chat_id)
        _save(path, chat_ids)


def remove_subscriber(path: Path, chat_id: int) -> None:
    chat_ids = _load(path)
    if chat_id in chat_ids:
        chat_ids.discard(chat_id)
        _save(path, chat_ids)


def get_subscribers(path: Path) -> list[int]:
    return sorted(_load(path))
