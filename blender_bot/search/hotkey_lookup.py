import json
import re
from pathlib import Path

_KEY_TOKEN_RE = re.compile(r"[a-z0-9+]+")
# Дефис-соединённые сегменты — один токен, не два через дефис-разделитель:
# без этого "N-gon" разбивался на "n" и "gon", и одиночная "n" ложно
# совпадала с хоткеем N (показать/скрыть боковую панель) — раздел про
# находку Phase 13 (build_quality_test_suite) в PROJECT_PLAN.md. Формат
# hotkeys.json использует em-dash (" — ") как разделитель поле/описание,
# не ASCII-дефис, так что это не конфликтует с парсингом самого файла.
# Продолжение после дефиса — \w+ (юникод), а не только ASCII: "N-угольник"
# (русская приставка после дефиса) страдал тем же багом, что и "N-gon" —
# найдено Phase 13 на кейсе "Что такое N-угольник (N-gon)?". Сохранённые
# ключи в by_key дефисов не содержат (_normalize_key фильтрует их через
# _KEY_TOKEN_RE), так что склеенный "n-угольник"/"n-gon" токен всё равно
# никогда не совпадёт с одиночным "n" в словаре — только предотвращает
# ложное разбиение на части.
_QUERY_TOKEN_RE = re.compile(r"[a-zA-Z0-9+]+(?:-\w+)*")
# Похожие на версию Blender подстроки ("4.2", "5.1.1") вырезаются из
# запроса ДО токенизации: без этого "4.2" распадалось на токены "4" и "2",
# а одиночная "2" ложно совпадала с хоткеем "1/2/3 — режим вершин/рёбер/
# граней" — найдено Phase 13 (build_quality_test_suite.py) на кейсах вида
# "в блендере 4.2 subdivision surface".
_VERSION_LIKE_RE = re.compile(r"\b\d+\.\d+(?:\.\d+)?\b")


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
        query = _VERSION_LIKE_RE.sub(" ", query)
        # "Alt + N" (с пробелами вокруг +, как реально пишут пользователи —
        # найдено на живом вопросе "Что делает комбинация Alt + N") иначе
        # токенизируется как ["alt", "+", "n"] — одиночный "+" становится
        # СВОИМ токеном (он тоже входит в _QUERY_TOKEN_RE), из-за чего
        # склейка соседних токенов в комбо ниже строит мусор ("alt++",
        # "+n") вместо "alt+n", и find() тихо падает обратно на голое
        # совпадение по одной "n" — неверный, но правдоподобно выглядящий
        # ответ. _normalize_key() уже делает такой же .replace(" + ", "+")
        # для СОХРАНЁННЫХ ключей — тот же список должен применяться и к
        # ЗАПРОСУ до токенизации, а не только при построении индекса.
        query = query.replace(" + ", "+")
        tokens = _QUERY_TOKEN_RE.findall(query.lower())

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
