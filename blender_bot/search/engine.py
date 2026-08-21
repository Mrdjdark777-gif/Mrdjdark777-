"""Search Engine (раздел 10 ТЗ): многосигнальный поиск по knowledge/ registry.

Порядок по ТЗ: exact term match → normalized text match → alias match →
TF-IDF similarity → optional BM25 → metadata filtering. Финальный score
учитывает lexical_score, semantic_similarity, authority_score,
version_score, topic_score и exact_term_bonus.

Честная архитектурная заметка: "semantic_similarity" в этой реализации —
то же самое значение TF-IDF cosine, что и lexical_score. Полноценная
семантика потребовала бы embedding-модели, а раздел 2 ТЗ прямо запрещает
делать внешнюю LLM/тяжёлую ML-зависимость фундаментом системы. Раздел 10
не обязывает к embeddings буквально — TF-IDF/BM25 названы допустимым
инструментом, этим и ограничились.

BM25 не реализован — раздел 10 явно помечает его как "optional".
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from knowledge.registry import ChunkRegistry
from knowledge.schema import KnowledgeChunk
from knowledge.terminology import Term, TerminologyRegistry, normalize as normalize_term
from knowledge.version import compatible_with_request, detect_conflict, parse_version
from search.tfidf import TfidfIndex, tokenize

# Раздел 10 ТЗ: "Повышать score при совпадении версии, официального
# источника, точного термина, категории... Понижать при старой версии,
# отсутствии версии и низком authority." Прочитано буквально: authority/
# version/topic — МОДИФИКАТОРЫ поверх релевантности, а не независимые
# слагаемые. Первая версия этого движка складывала их аддитивно с
# lexical_score — из-за этого совершенно бессмысленный запрос получал
# score≈0.41 только за счёт того, что попадал в official-чанк с высоким
# authority, почти не уступая реальному совпадению (см. ручную проверку в
# PROJECT_PLAN.md, Phase 7). Здесь relevance (lexical ИЛИ точное совпадение
# термина) — обязательный множитель: без неё score = 0, сколько бы ни было
# authority. Конкретные числа ниже — инженерное решение этой фазы, не
# значения из самого ТЗ (там формула не задана дословно) — открыто для
# пересмотра в Phase 10 (Source ranking).
AUTHORITY_MODIFIER_WEIGHT = 0.3
VERSION_MODIFIER_WEIGHT = 0.6
TOPIC_MODIFIER_WEIGHT = 0.2
MODIFIER_FLOOR = 0.1  # модификатор не должен обнулить уже найденную релевантность

# Personal/непроверенный контент не имеет числового authority (раздел 3 ТЗ
# не даёт Custom tier числа) — расчётный базовый вес, примерно на уровне
# C-tier (30/100), не выше и не ниже официально прописанных тиров.
UNVERIFIED_AUTHORITY_BASELINE = 0.3

_VERSION_HINT_RE = re.compile(r"\b\d+\.\d+(?:\.\d+)?\b")


def extract_version_hint(text: str) -> str | None:
    """Достаёт из текста похожую на версию Blender подстроку ("4.2", "5.1.1").

    Грубая эвристика по regex "число.число" — может ложно сработать на
    произвольном числе с точкой в вопросе (например, размер в метрах). Раз
    результат идёт только в version_score (мягкая добавка/штраф, не жёсткий
    фильтр), цена ложного срабатывания невелика — известное ограничение,
    задокументировано в PROJECT_PLAN.md.
    """
    match = _VERSION_HINT_RE.search(text)
    return match.group(0) if match else None


@dataclass
class ScoredChunk:
    chunk: KnowledgeChunk
    score: float
    relevance: float
    lexical_score: float
    authority_score: float
    exact_term_bonus: float
    version_score: float
    topic_score: float
    matched_term: str | None = None


class SearchEngine:
    def __init__(self, chunk_paths: list[Path], terminology_path: Path):
        self.chunks: list[KnowledgeChunk] = []
        for path in chunk_paths:
            self.chunks.extend(ChunkRegistry.load(path).chunks)
        self._by_id = {c.id: c for c in self.chunks}

        self.terminology = TerminologyRegistry.load(terminology_path)

        self._tfidf = TfidfIndex()
        self._tfidf.fit([self._chunk_tokens(c) for c in self.chunks])

    @staticmethod
    def _chunk_tokens(chunk: KnowledgeChunk) -> list[str]:
        # Заголовок весит больше содержимого — совпадение в названии темы
        # обычно значимее случайного слова в середине длинного summary.
        return tokenize(chunk.translated_title) * 2 + tokenize(chunk.original_title) + tokenize(chunk.content)

    def get_chunk(self, chunk_id: str) -> KnowledgeChunk | None:
        return self._by_id.get(chunk_id)

    def _find_term(self, query: str) -> Term | None:
        """Exact term match / alias match (раздел 10 ТЗ).

        Перебирает все непрерывные подпоследовательности токенов запроса
        (n-граммы) и берёт САМОЕ ДЛИННОЕ совпадение с полным алиасом
        термина. Раньше проверялись только весь запрос целиком или
        отдельные однословные токены — многословные алиасы вроде "группа
        вершин", "покраска весов" внутри более длинного вопроса ("Что
        такое группа вершин?") никогда не находились, потому что "группа"
        и "вершин" по отдельности не зарегистрированы как алиасы, а весь
        вопрос целиком, конечно, не совпадал ни с одним алиасом. Найдено
        при добавлении новых personal-заметок (PROJECT_PLAN.md, после
        Phase 15). Более длинное совпадение предпочтительнее короткого:
        точное совпадение целой многословной фразы — более сильный сигнал,
        чем случайное совпадение одного общего слова где-то в вопросе."""
        tokens = tokenize(query)
        best: Term | None = None
        best_len = 0
        for i in range(len(tokens)):
            for j in range(i + 1, len(tokens) + 1):
                if j - i <= best_len:
                    continue
                candidate = self.terminology.find(" ".join(tokens[i:j]))
                if candidate:
                    best = candidate
                    best_len = j - i
        return best

    def _term_names(self, term: Term) -> set[str]:
        names = {term.canonical_name, term.russian_name, *term.aliases, *term.english_aliases}
        if term.ui_label:
            names.add(term.ui_label)
        return {normalize_term(n) for n in names}

    def _exact_term_bonus(self, term: Term | None, chunk: KnowledgeChunk) -> float:
        """Токенизированное сравнение, НЕ substring: короткий алиас вроде
        "риг" при поиске подстрокой ложно совпадал внутри "ориг[риг]инал".
        Все токены алиаса (для многословных вроде "шейдер материала")
        должны присутствовать среди токенов чанка.

        Заголовок и содержимое различаются по силе сигнала: термин в
        ЗАГОЛОВКЕ означает, что chunk реально ПРО эту тему; термин,
        встретившийся только в теле текста, может быть случайным
        упоминанием мимоходом. Раньше оба случая давали одинаковый
        bonus=1.0, из-за чего chunk "EEVEE" (который лишь мимоходом
        упоминает "PBR" в описании) конкурировал на равных с
        chunk'ом, который целиком ПРО PBR, и обычно побеждал за счёт
        авторитетности официального источника — найдено по обратной
        связи пользователя после реального использования на проде
        (PROJECT_PLAN.md, после Phase 15)."""
        if term is None:
            return 0.0
        title_tokens = set(tokenize(f"{chunk.translated_title} {chunk.original_title}"))
        body_tokens = set(tokenize(chunk.content))
        found_in_body_only = False
        for name in self._term_names(term):
            name_tokens = tokenize(name)
            if not name_tokens:
                continue
            if all(t in title_tokens for t in name_tokens):
                return 1.0
            if all(t in title_tokens or t in body_tokens for t in name_tokens):
                found_in_body_only = True
        if found_in_body_only:
            return 0.5
        return 0.3  # термин распознан в запросе, но не встречается в этом конкретном чанке

    def _authority_score(self, chunk: KnowledgeChunk) -> float:
        if chunk.authority is None:
            return UNVERIFIED_AUTHORITY_BASELINE
        return chunk.authority / 100

    def _version_score(self, chunk: KnowledgeChunk, requested_version: str | None) -> float:
        if requested_version is None:
            return 1.0
        conflict = detect_conflict(parse_version(chunk.version), parse_version(requested_version))
        if conflict is not None:
            return 0.2  # реальный конфликт версий — сильный штраф, но не обнуление
        return 1.0  # совместимо или версия чанка неизвестна (раздел 7: не наказывать за неизвестность)

    def _topic_score(self, chunk: KnowledgeChunk, term: Term | None) -> float:
        if term is None:
            return 0.5  # нет сигнала по теме вообще — нейтрально
        return 1.0 if chunk.topic == term.category else 0.4

    def search(
        self, query: str, requested_version: str | None = None, top_n: int = 5
    ) -> list[ScoredChunk]:
        if not self.chunks:
            return []

        query_tokens = tokenize(query)
        lexical_scores = self._tfidf.similarities(query_tokens)
        term = self._find_term(query)

        results = []
        for chunk, lexical_score in zip(self.chunks, lexical_scores):
            exact_term_bonus = self._exact_term_bonus(term, chunk)

            # relevance — единственный сигнал, отвечающий на вопрос "вообще
            # относится ли этот chunk к запросу". Считаем термин найденным
            # для целей relevance, только если exact_term_bonus == 1.0 —
            # т.е. термин реально встречается в ЭТОМ чанке, а не просто
            # распознан где-то в запросе (0.3 — слишком слабый сигнал,
            # чтобы поднимать нерелевантный чанк с нуля).
            relevance = max(lexical_score, 1.0 if exact_term_bonus >= 1.0 else 0.0)

            if relevance <= 0:
                score = 0.0
                authority_score = self._authority_score(chunk)
                version_score = self._version_score(chunk, requested_version)
                topic_score = self._topic_score(chunk, term)
            else:
                authority_score = self._authority_score(chunk)
                version_score = self._version_score(chunk, requested_version)
                topic_score = self._topic_score(chunk, term)
                modifier = (
                    1.0
                    + AUTHORITY_MODIFIER_WEIGHT * (authority_score - 0.5)
                    + VERSION_MODIFIER_WEIGHT * (version_score - 1.0)
                    + TOPIC_MODIFIER_WEIGHT * (topic_score - 0.5)
                )
                score = relevance * max(modifier, MODIFIER_FLOOR)

            results.append(
                ScoredChunk(
                    chunk=chunk,
                    score=score,
                    relevance=relevance,
                    lexical_score=lexical_score,
                    authority_score=authority_score,
                    exact_term_bonus=exact_term_bonus,
                    version_score=version_score,
                    topic_score=topic_score,
                    matched_term=term.canonical_name if term else None,
                )
            )

        # lexical_score как вторичный ключ сортировки: несколько chunk'ов
        # часто получают ОДИНАКОВЫЙ exact_term_bonus=1.0 (однословный алиас
        # вроде "фаска" или "bevel" совпадает и у chunk'а, который реально
        # ПРО эту тему, и у чанка, который просто упомянул слово мимоходом
        # — см. _exact_term_bonus). Без вторичного ключа сортировка была
        # стабильной по порядку файла, и при равном score побеждал более
        # ранний по индексу chunk, а не более релевантный — найдено при
        # добавлении новых personal-заметок (PROJECT_PLAN.md, после Phase
        # 15): "Что такое фаска (Bevel)?" содержательно точнее отвечает на
        # вопрос про Bevel, чем случайное упоминание слова "bevel" в
        # заметке про Apply Transform, но лексически совпадает с запросом
        # намного сильнее — это и должно решать исход при равном bonus.
        results.sort(key=lambda r: (r.score, r.lexical_score), reverse=True)
        return [r for r in results[:top_n] if r.score > 0]
