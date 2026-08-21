"""Бизнес-логика ответа на вопрос (Phase 7, раздел 10 ТЗ).

hotkeys (точный справочный поиск) и SearchEngine (exact term match → alias
match → TF-IDF → metadata filtering по knowledge/ registry) → confidence
tiers → fallback. С Phase 7 это уже настоящий многосигнальный поиск, а не
наивное сравнение ключевых слов по data/knowledge_base.json — подробности и
обоснование порогов см. search/engine.py и PROJECT_PLAN.md, Phase 7.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from intents.engine import IntentEngine
from knowledge.schema import KnowledgeChunk
from search.engine import SearchEngine, extract_version_hint
from search.hotkey_lookup import HotkeyLookup
from search.unanswered_log import log_unanswered

# Пороги подобраны по ручной проверке реального корпуса (PROJECT_PLAN.md,
# Phase 7): бессмысленные запросы стабильно набирают ~0.13-0.16, слабая, но
# реальная лексическая релевантность — ~0.2-0.4, уверенные точные совпадения
# термина — ~0.9-1.13. Открыто для пересмотра, когда появится больше данных
# о реальных вопросах пользователей (data/unanswered_log.jsonl).
HIGH_CONFIDENCE_THRESHOLD = 0.75
SOFT_MATCH_THRESHOLD = 0.20


@dataclass
class QAResult:
    """kind: "chunk_confident" | "hotkeys" | "soft_match" | "fallback"."""

    kind: str
    chunk: KnowledgeChunk | None = None
    score: float = 0.0
    hotkey_matches: list[tuple[str, str]] | None = None


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
        results = self.engine.search(question, requested_version=requested_version)
        top = results[0] if results else None

        if top and top.score >= HIGH_CONFIDENCE_THRESHOLD:
            return QAResult(kind="chunk_confident", chunk=top.chunk, score=top.score)

        hotkey_matches = self.hotkey_lookup.find(question)
        if hotkey_matches:
            return QAResult(kind="hotkeys", hotkey_matches=hotkey_matches)

        if top and top.score >= SOFT_MATCH_THRESHOLD:
            return QAResult(kind="soft_match", chunk=top.chunk, score=top.score)

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
