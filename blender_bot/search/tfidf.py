"""Локальный TF-IDF индекс (раздел 10 ТЗ: "TF-IDF similarity → optional BM25").

Реализован вручную на стандартной библиотеке — scikit-learn формально
допустим по ТЗ (раздел 2), но добавляет тяжёлую зависимость (numpy/scipy)
ради корпуса в несколько сотен чанков, а бот работает на слабом бесплатном
сервере (Oracle VM.Standard.E2.1.Micro, см. DEPLOYMENT.md). BM25 не
реализован — раздел 10 ТЗ явно помечает его как "optional".
"""

from __future__ import annotations

import math
import re
from collections import Counter

_WORD_RE = re.compile(r"[a-zа-яё0-9]+", re.IGNORECASE)
_STOPWORDS = {
    "как", "что", "это", "для", "или", "и", "в", "на", "с", "по", "а",
    "у", "к", "о", "мне", "я", "ты", "он", "она", "они", "мы", "вы",
    "можно", "нужно", "надо", "если", "то", "не", "ли", "же", "бы",
    "такое", "такой", "такая", "ну", "вот", "там", "тут", "вообще",
}


def tokenize(text: str) -> list[str]:
    words = _WORD_RE.findall(text.lower())
    return [w for w in words if w not in _STOPWORDS and len(w) > 1]


class TfidfIndex:
    """TF-IDF индекс с L2-нормализованными векторами (косинус = dot product)."""

    def __init__(self) -> None:
        self.doc_count = 0
        self.idf: dict[str, float] = {}
        self.doc_vectors: list[dict[str, float]] = []

    def fit(self, tokenized_docs: list[list[str]]) -> None:
        self.doc_count = len(tokenized_docs)
        doc_freq: dict[str, int] = {}
        for tokens in tokenized_docs:
            for term in set(tokens):
                doc_freq[term] = doc_freq.get(term, 0) + 1

        # Сглаженный idf (как в scikit-learn по умолчанию): гарантирует
        # положительный вес даже термину, встретившемуся во всех документах.
        self.idf = {
            term: math.log((1 + self.doc_count) / (1 + df)) + 1
            for term, df in doc_freq.items()
        }
        self.doc_vectors = [self._vectorize(tokens) for tokens in tokenized_docs]

    def _vectorize(self, tokens: list[str]) -> dict[str, float]:
        tf = Counter(tokens)
        vec: dict[str, float] = {}
        for term, count in tf.items():
            idf = self.idf.get(term)
            if idf is None:
                continue  # термин запроса не встречался в корпусе на момент fit()
            vec[term] = count * idf
        norm = math.sqrt(sum(w * w for w in vec.values())) or 1.0
        return {term: w / norm for term, w in vec.items()}

    def query_vector(self, tokens: list[str]) -> dict[str, float]:
        return self._vectorize(tokens)

    @staticmethod
    def cosine(vec_a: dict[str, float], vec_b: dict[str, float]) -> float:
        if len(vec_a) > len(vec_b):
            vec_a, vec_b = vec_b, vec_a
        return sum(weight * vec_b.get(term, 0.0) for term, weight in vec_a.items())

    def similarities(self, query_tokens: list[str]) -> list[float]:
        """Косинусное сходство запроса с каждым документом в порядке fit()."""
        qvec = self.query_vector(query_tokens)
        if not qvec:
            return [0.0] * len(self.doc_vectors)
        return [self.cosine(qvec, dvec) for dvec in self.doc_vectors]
