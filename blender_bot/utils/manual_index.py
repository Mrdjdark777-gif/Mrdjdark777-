import difflib
import json
import re
from pathlib import Path

_WORD_RE = re.compile(r"[a-zа-яё0-9]+", re.IGNORECASE)
_STOPWORDS = {
    "как", "что", "это", "для", "или", "и", "в", "на", "с", "по", "а",
    "у", "к", "о", "мне", "я", "ты", "он", "она", "они", "мы", "вы",
    "можно", "нужно", "надо", "если", "то", "не", "ли", "же", "бы",
}


def _tokenize(text: str) -> set[str]:
    words = _WORD_RE.findall(text.lower())
    return {w for w in words if w not in _STOPWORDS and len(w) > 1}


class ManualIndex:
    def __init__(self, path: Path):
        self.entries: list[dict] = []
        if not path.exists():
            return
        with open(path, encoding="utf-8") as f:
            raw = json.load(f)
        for entry in raw:
            entry["_title_tokens"] = _tokenize(entry["title"])
            entry["_summary_tokens"] = _tokenize(entry["summary"])
            self.entries.append(entry)

    def search(self, query: str, threshold: float = 0.4):
        if not self.entries:
            return None

        query_tokens = _tokenize(query)
        if not query_tokens:
            return None

        best_entry = None
        best_score = 0.0
        for entry in self.entries:
            title_overlap = len(query_tokens & entry["_title_tokens"])
            title_score = title_overlap / max(len(entry["_title_tokens"]), 1)

            summary_overlap = len(query_tokens & entry["_summary_tokens"])
            summary_score = summary_overlap / max(len(query_tokens), 1)

            fuzzy_score = difflib.SequenceMatcher(
                None, query.lower(), entry["title"].lower()
            ).ratio()

            score = title_score * 0.55 + summary_score * 0.2 + fuzzy_score * 0.25

            if score > best_score:
                best_score = score
                best_entry = entry

        if best_entry and best_score >= threshold:
            return best_entry
        return None
