"""Локальный лексический индекс — `BM25Index` (раздел 1.1 ТЗ v3: "Переход
на BM25 (замена базовому TF-IDF)... локальный лёгкий алгоритм на чистом
Python"). Реализован вручную на стандартной библиотеке — rank_bm25/
scikit-learn формально допустимы по ТЗ (раздел 2 ТЗ v2), но добавляют
зависимость ради корпуса в несколько сотен chunks, а бот работает на
слабом бесплатном сервере (Oracle VM.Standard.E2.1.Micro, см.
DEPLOYMENT.md).

До ТЗ v3 здесь же жил `TfidfIndex` (Phase 7, раздел 10 ТЗ v2) — удалён
при переходе на BM25, тем же способом, что и более ранние `search/
knowledge_base.py`/`search/manual_index.py` (Phase 2): полностью заменён,
восстановим через git log, если когда-нибудь понадобится сравнение
(см. PROJECT_PLAN.md, ТЗ v3 этап 4).
"""

from __future__ import annotations

import math
import re
from collections import Counter

_WORD_RE = re.compile(r"[a-zа-яё0-9]+", re.IGNORECASE)
_CYRILLIC_RE = re.compile(r"[а-яё]", re.IGNORECASE)
_STOPWORDS = {
    "как", "что", "это", "для", "или", "и", "в", "на", "с", "по", "а",
    "у", "к", "о", "мне", "я", "ты", "он", "она", "они", "мы", "вы",
    "можно", "нужно", "надо", "если", "то", "не", "ли", "же", "бы",
    "такое", "такой", "такая", "ну", "вот", "там", "тут", "вообще",
}

_morph_analyzer = None


def _get_morph_analyzer():
    # Ленивая инициализация: MorphAnalyzer грузит словарь один раз (~0.1-0.2с),
    # но не всем вызывающим он нужен (например, diagnostics/registry.py
    # использует только tokenize(), не lemmatize()) — незачем платить эту
    # цену на старте, если BM25Index ещё не строился.
    global _morph_analyzer
    if _morph_analyzer is None:
        import pymorphy3
        _morph_analyzer = pymorphy3.MorphAnalyzer()
    return _morph_analyzer


def tokenize(text: str) -> list[str]:
    words = _WORD_RE.findall(text.lower())
    return [w for w in words if w not in _STOPWORDS and len(w) > 1]


def lemmatize(tokens: list[str]) -> list[str]:
    """Приводит русские словоформы к начальной форме (лемме) — без этого
    TF-IDF считал "фаску"/"фаски", "применён"/"применить",
    "модификаторы"/"модификатор" РАЗНЫМИ словами и терял почти всё
    лексическое пересечение на естественно сформулированных вопросах
    (найдено по обратной связи пользователя, PROJECT_PLAN.md, после
    Phase 15: реальный вопрос "фаску... применён масштаб" не находил chunk,
    который дословно отвечает на него, потому что общих ТОКЕНОВ было
    только одно слово из всего вопроса).

    Английские/незнакомые словоформы (pymorphy3 умеет только русскую
    морфологию) возвращаются без изменений.

    Используется ТОЛЬКО в лексическом слое (SearchEngine._chunk_tokens и
    lexical_score в SearchEngine.search, сейчас через BM25Index) —
    сознательно НЕ применяется в
    _find_term()/TerminologyRegistry (exact term/alias match) и в
    diagnostics/registry.py (keyword prefix match): у них уже есть
    собственные, отдельно протестированные способы переживать словоформы
    (leading-boundary regex в intents/engine.py, startswith-префикс в
    diagnostics) — смешивать эти механизмы с лемматизацией рискованно и
    не нужно для их конкретной задачи."""
    morph = _get_morph_analyzer()
    return [
        morph.parse(token)[0].normal_form if _CYRILLIC_RE.search(token) else token
        for token in tokens
    ]


class BM25Index:
    """Okapi BM25 (раздел 1.1 ТЗ v3) — учитывает длину документа
    (параметр `b`) и насыщение частоты термина (параметр `k1`), в отличие
    от простого TF-IDF: слово, повторённое 20 раз, почти не даёт больше
    веса, чем повторённое 5 раз, а длинный документ не получает
    незаслуженное преимущество только за счёт объёма текста.

    Сырой BM25-score НЕ ограничен диапазоном [0, 1] (в отличие от
    косинусного сходства бывшего TfidfIndex, см. докстринг модуля) —
    необходима калибровка, чтобы результат остался совместим с уже
    настроенными порогами
    (HIGH_CONFIDENCE_THRESHOLD/SOFT_MATCH_THRESHOLD в search/qa_service.py)
    и модификаторами authority/version/topic в search/engine.py, без
    которых пришлось бы пересчитывать весь конвейер заново — куда более
    рискованное изменение, чем сама замена алгоритма.

    Два разных способа нормализации были осознанно НЕ выбраны:
    - Min-max по максимуму СРЕДИ РЕЗУЛЬТАТОВ ЭТОГО ЖЕ запроса (топ-результат
      всегда становится 1.0) — ломает устойчивость к бессмысленным
      запросам: даже у гарантированно плохого совпадения topN-результат
      получил бы score≈1.0, только потому что он лучший ИЗ ХУДШИХ.
    - Простое отбрасывание/обрезание — теряет сравнимость между разными
      запросами (одинаковый сырой score для "явно нашёл" и "еле нашёл"
      разных вопросов может означать разное).

    Вместо этого — насыщающее преобразование `raw / (raw + K)` (та же
    идея, что и у самого BM25 для tf: асимптотически приближается к 1 при
    росте score, но 0 остаётся 0, и относительный порядок/масштаб между
    РАЗНЫМИ запросами сохраняется, а не переопределяется каждый раз
    относительно её же локального максимума). `K` подобран вручную на
    реальном корпусе (см. PROJECT_PLAN.md, ТЗ v3 этап 4) так, чтобы
    сильные совпадения по-прежнему попадали в диапазон chunk_confident."""

    K1 = 1.5
    B = 0.75
    SATURATION_K = 8.0

    def __init__(self) -> None:
        self.doc_count = 0
        self.avgdl = 0.0
        self.doc_freq: dict[str, int] = {}
        self._doc_term_freqs: list[Counter] = []
        self._doc_lens: list[int] = []

    def fit(self, tokenized_docs: list[list[str]]) -> None:
        self.doc_count = len(tokenized_docs)
        self._doc_lens = [len(doc) for doc in tokenized_docs]
        self.avgdl = (sum(self._doc_lens) / self.doc_count) if self.doc_count else 0.0
        self._doc_term_freqs = [Counter(doc) for doc in tokenized_docs]

        doc_freq: dict[str, int] = {}
        # Раздел 4.1 ТЗ v3 (время отклика < 50мс): без инвертированного
        # индекса similarities() проходила по ВСЕМ документам на КАЖДЫЙ
        # запрос, даже когда подавляющее большинство не содержит ни
        # одного слова запроса — на 853 chunks (Phase 7) это было терпимо,
        # но после этапа 5 (рост корпуса до ~9000, в основном за счёт
        # умного чанкирования Manual) реальный прогон дал 380-475мс вместо
        # цели 50мс. postings[term] — список индексов документов,
        # содержащих term, — позволяет similarities() трогать только
        # документы, реально пересекающиеся с запросом, а не весь корпус.
        self._postings: dict[str, list[int]] = {}
        for i, tf in enumerate(self._doc_term_freqs):
            for term in tf:
                doc_freq[term] = doc_freq.get(term, 0) + 1
                self._postings.setdefault(term, []).append(i)
        self.doc_freq = doc_freq

    def _idf(self, term: str) -> float:
        n = self.doc_freq.get(term, 0)
        # "+1" внутри log (модификация Robertson-Walker) — гарантирует
        # неотрицательный idf даже термину, встретившемуся во всех
        # документах, в отличие от классической формулы Okapi BM25, где
        # такой термин получил бы ОТРИЦАТЕЛЬНЫЙ вес.
        return math.log((self.doc_count - n + 0.5) / (n + 0.5) + 1)

    def similarities(self, query_tokens: list[str]) -> list[float]:
        if not self.doc_count:
            return []
        query_terms = set(query_tokens)
        if not query_terms:
            return [0.0] * self.doc_count

        idfs = {term: self._idf(term) for term in query_terms}
        raw_scores = [0.0] * self.doc_count

        candidate_docs: set[int] = set()
        for term in query_terms:
            candidate_docs.update(self._postings.get(term, ()))

        for i in candidate_docs:
            doc_tf = self._doc_term_freqs[i]
            dl = self._doc_lens[i]
            length_norm = self.K1 * (1 - self.B + self.B * dl / self.avgdl) if self.avgdl else self.K1
            score = 0.0
            for term in query_terms:
                f = doc_tf.get(term, 0)
                if f == 0:
                    continue
                score += idfs[term] * (f * (self.K1 + 1)) / (f + length_norm)
            raw_scores[i] = score

        return [s / (s + self.SATURATION_K) for s in raw_scores]
