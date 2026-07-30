import difflib
import json
import re
from pathlib import Path

STOPWORDS = {
    "как", "что", "это", "для", "или", "и", "в", "на", "с", "по", "а",
    "у", "к", "о", "мне", "я", "ты", "он", "она", "они", "мы", "вы",
    "можно", "нужно", "надо", "такое", "такой", "такая", "если", "то",
    "не", "ли", "же", "бы", "ну", "вот", "там", "тут", "вообще",
}

_WORD_RE = re.compile(r"[a-zа-яё0-9]+", re.IGNORECASE)


def _tokenize(text: str) -> set[str]:
    words = _WORD_RE.findall(text.lower())
    return {w for w in words if w not in STOPWORDS and len(w) > 1}


class KnowledgeBase:
    def __init__(self, path: Path):
        with open(path, encoding="utf-8") as f:
            self.entries = json.load(f)
        for idx, entry in enumerate(self.entries):
            entry["_idx"] = idx
            entry["_keyword_set"] = {kw.lower() for kw in entry.get("keywords", [])}
            entry["_question_tokens"] = _tokenize(entry["question"])

    def _score_entry(self, query: str, query_tokens: set[str], entry: dict) -> float:
        keyword_hits = sum(
            1
            for token in query_tokens
            if any(token in kw or kw in token for kw in entry["_keyword_set"])
        )
        keyword_score = keyword_hits / max(len(entry["_keyword_set"]), 1)

        question_overlap = len(query_tokens & entry["_question_tokens"])
        overlap_score = question_overlap / max(len(query_tokens), 1)

        fuzzy_score = difflib.SequenceMatcher(
            None, query.lower(), entry["question"].lower()
        ).ratio()

        return keyword_score * 0.5 + overlap_score * 0.3 + fuzzy_score * 0.2

    def best_match(self, query: str) -> tuple[dict | None, float]:
        """Возвращает (лучшая запись, её скор) даже если скор низкий."""
        query_tokens = _tokenize(query)
        if not query_tokens:
            return None, 0.0

        best_entry = None
        best_score = 0.0
        for entry in self.entries:
            score = self._score_entry(query, query_tokens, entry)
            if score > best_score:
                best_score = score
                best_entry = entry

        return best_entry, best_score

    def search(self, query: str, threshold: float = 0.35):
        """Уверенное совпадение — сразу отдаём ответ."""
        entry, score = self.best_match(query)
        if entry and score >= threshold:
            return entry
        return None

    def soft_match(self, query: str, low: float = 0.20, high: float = 0.35):
        """Совпадение похуже — стоит переспросить, а не отвечать напрямую."""
        entry, score = self.best_match(query)
        if entry and low <= score < high:
            return entry, score
        return None, 0.0

    def get_by_idx(self, idx: int) -> dict | None:
        if 0 <= idx < len(self.entries):
            return self.entries[idx]
        return None
