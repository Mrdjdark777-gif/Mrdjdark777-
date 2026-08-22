"""Бизнес-логика ответа на вопрос (Phase 7, раздел 10 ТЗ; Phase 10, разделы
14 и 17 ТЗ).

hotkeys (точный справочный поиск) и SearchEngine (exact term match → alias
match → BM25 → metadata filtering по knowledge/ registry) → confidence
tiers → fallback. С Phase 7 это уже настоящий многосигнальный поиск, а не
наивное сравнение ключевых слов по data/knowledge_base.json — подробности и
обоснование порогов см. search/engine.py и PROJECT_PLAN.md, Phase 7.

Phase 10 добавляет: confidence-метку (search/confidence.py, раздел 14 ТЗ) и
обнаружение конкурирующего источника по той же теме (раздел 17 ТЗ, Conflict
Engine) — если второй результат тоже точно про распознанный термин, но из
другого source_type, показываем это как найденный, но менее приоритетный
источник, а не молча скрываем.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from intents.engine import IntentEngine
from knowledge.schema import KnowledgeChunk
from search.confidence import classify_confidence
from search.engine import ScoredChunk, SearchEngine, extract_version_hint
from search.hotkey_lookup import HotkeyLookup
from search.unanswered_log import log_unanswered

# Пороги подобраны по ручной проверке реального корпуса (PROJECT_PLAN.md,
# Phase 7): бессмысленные запросы стабильно набирают ~0.13-0.16, слабая, но
# реальная лексическая релевантность — ~0.2-0.4, уверенные точные совпадения
# термина — ~0.9-1.13. Открыто для пересмотра, когда появится больше данных
# о реальных вопросах пользователей (data/unanswered_log.jsonl).
HIGH_CONFIDENCE_THRESHOLD = 0.75
SOFT_MATCH_THRESHOLD = 0.20

# Раздел 17 ТЗ, Conflict Engine: после ТЗ v3 этапа 5 одна официальная
# страница Manual регулярно распадается на десятки sub-chunk'ов
# (intro/note/warning/options на каждую подстраницу того же раздела),
# все с exact_term_bonus=1.0 по тому же термину — personal-заметка на ту
# же тему легко оказывается на 20-30 месте, а не на 2-м, просто из-за
# количества официальных вариаций. SearchEngine.search() всё равно
# считает score для ВСЕХ chunk'ов на каждый запрос (обрезка top_n —
# просто срез после сортировки), так что более широкий top_n здесь ничего
# не стоит по производительности и не меняет сам результат top[0].
CONFLICT_SEARCH_TOP_N = 30


def _find_competing_source(results: list[ScoredChunk]) -> KnowledgeChunk | None:
    """Conflict Engine (раздел 17 ТЗ): результат считается "конкурирующим
    источником", только если он тоже точно про распознанный термин
    (exact_term_bonus>=1.0 — не просто рядом по лексике) И источник
    другого типа (иначе это не конфликт источников, а просто два похожих
    официальных абзаца).

    Раньше проверялся только rank #2. После ТЗ v3 этапа 5 (полный
    docutils-парсер Manual) одна страница официального Manual регулярно
    распадается на несколько sub-chunk'ов (intro/note/warning/options) —
    все с exact_term_bonus=1.0 по тому же термину, тем же source_type и
    близким score. #2 теперь почти всегда — другой sub-chunk ТОЙ ЖЕ
    официальной страницы, а не personal-заметка, из-за чего конкурирующий
    personal-источник, даже если реально есть в топ-5, никогда не
    проверялся дальше #2 и Conflict Engine практически перестал
    срабатывать (найдено по регрессии тестов после этапа 5, не по живой
    обратной связи). Просматриваем весь переданный список результатов, не
    только второй — источник должен быть первым НЕсовпадающим по типу
    точным совпадением, а не обязательно вторым по рангу вообще."""
    if len(results) < 2:
        return None
    top = results[0]
    for candidate in results[1:]:
        if candidate.exact_term_bonus < 1.0:
            continue
        if candidate.chunk.source_type == top.chunk.source_type:
            continue
        return candidate.chunk
    return None


@dataclass
class QAResult:
    """kind: "chunk_confident" | "hotkeys" | "soft_match" | "fallback"."""

    kind: str
    chunk: KnowledgeChunk | None = None
    score: float = 0.0
    confidence: str = "UNKNOWN"
    competing_chunk: KnowledgeChunk | None = None
    hotkey_matches: list[tuple[str, str]] | None = None
    # Hardening ТЗ, живой баг (Loop Cut): reference chunk (Mode/Menu/
    # Shortcut) той же страницы Manual, что и chunk выше — см.
    # SearchEngine.find_reference_sibling(). None если chunk сам уже
    # reference, не с Manual, или у страницы такого блока нет.
    reference_chunk: KnowledgeChunk | None = None


class QAService:
    def __init__(
        self,
        hotkeys_path: Path,
        unanswered_log_path: Path,
        chunk_paths: list[Path],
        terminology_path: Path,
    ):
        self.hotkey_lookup = HotkeyLookup(hotkeys_path)
        self.engine = SearchEngine(chunk_paths, terminology_path)
        self.intent_engine = IntentEngine()
        self._unanswered_log_path = unanswered_log_path

    def answer(self, question: str) -> QAResult:
        requested_version = extract_version_hint(question)
        results = self.engine.search(
            question, requested_version=requested_version, top_n=CONFLICT_SEARCH_TOP_N
        )
        top = results[0] if results else None

        if top and top.score >= HIGH_CONFIDENCE_THRESHOLD:
            return QAResult(
                kind="chunk_confident", chunk=top.chunk, score=top.score,
                confidence=classify_confidence(top),
                competing_chunk=_find_competing_source(results),
                reference_chunk=self.engine.find_reference_sibling(top.chunk),
            )

        hotkey_matches = self.hotkey_lookup.find(question)
        if hotkey_matches:
            return QAResult(kind="hotkeys", hotkey_matches=hotkey_matches)

        if top and top.score >= SOFT_MATCH_THRESHOLD:
            return QAResult(
                kind="soft_match", chunk=top.chunk, score=top.score,
                confidence=classify_confidence(top),
                reference_chunk=self.engine.find_reference_sibling(top.chunk),
            )

        self.log_unanswered(question, top.score if top else 0.0)
        return QAResult(kind="fallback")

    def get_chunk(self, chunk_id: str) -> KnowledgeChunk | None:
        return self.engine.get_chunk(chunk_id)

    def log_unanswered(self, question: str, score: float = 0.0) -> None:
        # Phase 8: сохраняем ещё и распознанный intent — со временем по
        # data/unanswered_log.jsonl можно будет увидеть, каких ТИПОВ
        # вопросов (TROUBLESHOOTING? LEARNING?) или ТЕМ боту чаще всего не
        # хватает уверенного ответа, а не только сами тексты вопросов.
        result = self.intent_engine.classify(question)
        log_unanswered(
            self._unanswered_log_path, question, score,
            question_types=result.question_types, topics=result.topics,
        )
