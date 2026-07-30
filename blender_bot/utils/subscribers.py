import json
from pathlib import Path


def _load(path: Path) -> set[int]:
    if not path.exists():
        return set()
    with open(path, encoding="utf-8") as f:
        return set(json.load(f))


def _save(path: Path, chat_ids: set[int]) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(sorted(chat_ids), f)


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
