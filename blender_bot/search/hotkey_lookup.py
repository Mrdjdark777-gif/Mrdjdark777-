import json
import re
from pathlib import Path

_KEY_TOKEN_RE = re.compile(r"[a-z0-9+]+")


def _normalize_key(raw: str) -> str | None:
    key = raw.strip().lower()
    key = key.replace(" + ", "+").replace(" ", "")
    key = key.strip("()")
    if not key or not _KEY_TOKEN_RE.fullmatch(key):
        return None
    return key


class HotkeyLookup:
    def __init__(self, path: Path):
        with open(path, encoding="utf-8") as f:
            raw = json.load(f)

        self.by_key: dict[str, list[tuple[str, str]]] = {}
        for category, items in raw.items():
            for item in items:
                if " — " not in item:
                    continue
                keys_part = item.split(" — ", 1)[0]
                for variant in re.split(r"\s*/\s*", keys_part):
                    norm = _normalize_key(variant)
                    if norm:
                        self.by_key.setdefault(norm, []).append((item, category))

    def find(self, query: str) -> list[tuple[str, str]]:
        tokens = re.findall(r"[a-zA-Z0-9+]+", query.lower())

        matches: list[tuple[str, str]] = []
        seen: set[str] = set()

        def add(entries: list[tuple[str, str]]) -> None:
            for desc, cat in entries:
                if desc not in seen:
                    seen.add(desc)
                    matches.append((desc, cat))

        for i, tok in enumerate(tokens):
            if tok in self.by_key:
                add(self.by_key[tok])
            if i + 1 < len(tokens):
                combo = f"{tok}+{tokens[i + 1]}"
                if combo in self.by_key:
                    add(self.by_key[combo])

        return matches
