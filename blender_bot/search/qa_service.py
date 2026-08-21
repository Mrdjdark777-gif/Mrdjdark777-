from dataclasses import dataclass
from pathlib import Path

from search.hotkey_lookup import HotkeyLookup
from search.knowledge_base import KnowledgeBase
from search.manual_index import ManualIndex
from search.unanswered_log import log_unanswered


@dataclass
class QAResult:
    """Результат эскалации по источникам знаний — без Telegram-форматирования.

    kind: "kb_exact" | "hotkeys" | "soft_match" | "manual" | "fallback".
    Какое из полей заполнено, зависит от kind: entry для kb_exact/soft_match/
    manual, hotkey_matches для hotkeys, score только для soft_match.
    """

    kind: str
    entry: dict | None = None
    hotkey_matches: list[tuple[str, str]] | None = None
    score: float = 0.0


class QAService:
    """Бизнес-логика ответа на вопрос: KB → hotkeys → soft-match → manual → fallback.

    Раньше эта эскалация была перемешана с Telegram-форматированием прямо в
    handlers/qa.py (см. Phase 1 architecture map, PROJECT_PLAN.md). Здесь —
    тот же порядок и те же пороги, только без единой зависимости от
    telegram-объектов, поэтому логику можно тестировать напрямую и позже
    заменить на настоящий Search Engine (раздел 10 ТЗ, Phase 7) не трогая
    Telegram-слой.
    """

    def __init__(
        self,
        knowledge_base_path: Path,
        hotkeys_path: Path,
        manual_index_path: Path,
        unanswered_log_path: Path,
    ):
        self.knowledge_base = KnowledgeBase(knowledge_base_path)
        self.hotkey_lookup = HotkeyLookup(hotkeys_path)
        self.manual_index = ManualIndex(manual_index_path)
        self._unanswered_log_path = unanswered_log_path

    def answer(self, question: str) -> QAResult:
        kb_match = self.knowledge_base.search(question)
        if kb_match:
            return QAResult(kind="kb_exact", entry=kb_match)

        hotkey_matches = self.hotkey_lookup.find(question)
        if hotkey_matches:
            return QAResult(kind="hotkeys", hotkey_matches=hotkey_matches)

        soft_entry, soft_score = self.knowledge_base.soft_match(question)
        if soft_entry:
            return QAResult(kind="soft_match", entry=soft_entry, score=soft_score)

        manual_match = self.manual_index.search(question)
        if manual_match:
            self.log_unanswered(question)
            return QAResult(kind="manual", entry=manual_match)

        self.log_unanswered(question)
        return QAResult(kind="fallback")

    def get_kb_entry(self, idx: int) -> dict | None:
        return self.knowledge_base.get_by_idx(idx)

    def manual_fallback(self, question: str) -> dict | None:
        return self.manual_index.search(question)

    def log_unanswered(self, question: str, score: float = 0.0) -> None:
        log_unanswered(self._unanswered_log_path, question, score)
