"""Test Suite runner + Quality Score (разделы 34-35 ТЗ).

Раздел 35: метрики Intent accuracy, Search accuracy, Version accuracy,
Source accuracy, Diagnostic accuracy, Citation accuracy, Unknown handling;
вес 20% intent, 20% retrieval, 20% source authority, 15% version,
15% diagnosis, 10% resistance to hallucination. "Citation accuracy" из
списка метрик не входит в формулу веса (в самом ТЗ 6 весов, не 7 метрик) —
здесь она не считается отдельно, чтобы не выдумывать вес, которого нет в
тексте раздела 35.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from diagnostics.registry import DiagnosticRegistry
from knowledge.schema import AUTHORITY_TIERS
from search.confidence import classify_confidence
from search.qa_service import QAService
from tests.quality.schema import TestCase

_TIER_BY_AUTHORITY = {v: k for k, v in AUTHORITY_TIERS.items()}


def _source_tier(source_type: str, authority: int | None) -> str:
    if source_type == "ai_generated_unverified":
        return "personal"
    if authority is not None and authority in _TIER_BY_AUTHORITY:
        return _TIER_BY_AUTHORITY[authority]
    return "unknown"


@dataclass
class CaseOutcome:
    case: TestCase
    actual_kind: str
    actual_intent: list[str]
    actual_topics: list[str]
    actual_source_tier: str | None
    actual_confidence: str
    actual_content: str | None
    diagnostic_triggered: bool

    intent_ok: bool | None = None
    retrieval_ok: bool | None = None
    source_tier_ok: bool | None = None
    version_ok: bool | None = None
    diagnosis_ok: bool | None = None
    hallucination_ok: bool | None = None


def evaluate_case(
    case: TestCase,
    qa_service: QAService,
    diagnostic_registry: DiagnosticRegistry,
) -> CaseOutcome:
    intent_result = qa_service.intent_engine.classify(case.input)

    diagnostic_triggered = bool(
        {"TROUBLESHOOTING", "ERROR"} & set(intent_result.question_types)
        and diagnostic_registry.find_problem(case.input)
    )

    result = qa_service.answer(case.input)

    actual_source_tier = None
    actual_content = None
    if result.chunk is not None:
        actual_source_tier = _source_tier(result.chunk.source_type, result.chunk.authority)
        actual_content = f"{result.chunk.translated_title}\n{result.chunk.content}"
    elif result.kind == "hotkeys" and result.hotkey_matches:
        # Раньше retrieval_ok всегда считался провалом для kind="hotkeys",
        # даже когда описание клавиши реально отвечает на вопрос (найдено
        # Phase 13: "Что делает Loop Cut (Ctrl+R)?" корректно находил
        # хоткей с описанием "Loop Cut, добавляет кольцо рёбер...", но тест
        # проверял только result.chunk, которого в hotkeys-ответе нет).
        actual_content = "\n".join(desc for desc, _category in result.hotkey_matches)

    actual_confidence = result.confidence if result.kind in ("chunk_confident", "soft_match") else "UNKNOWN"

    outcome = CaseOutcome(
        case=case,
        actual_kind=result.kind,
        actual_intent=intent_result.question_types,
        actual_topics=intent_result.topics,
        actual_source_tier=actual_source_tier,
        actual_confidence=actual_confidence,
        actual_content=actual_content,
        diagnostic_triggered=diagnostic_triggered,
    )

    if case.expected_intent:
        outcome.intent_ok = bool(set(case.expected_intent) & set(intent_result.question_types))

    if case.expected_answer_elements:
        haystack = (actual_content or "").lower()
        outcome.retrieval_ok = any(el.lower() in haystack for el in case.expected_answer_elements)

    if case.expected_source_tier is not None:
        outcome.source_tier_ok = actual_source_tier == case.expected_source_tier
    elif case.category in ("ambiguous", "no_answer"):
        # expected_source_tier=None здесь означает "ответа быть не должно"
        outcome.source_tier_ok = result.kind in ("fallback", "soft_match")

    if case.category == "version":
        if case.expected_confidence is not None:
            outcome.version_ok = outcome_confidence_matches(case.expected_confidence, actual_confidence)

    if case.category == "troubleshooting" and case.note and "diagnostic:" in case.note:
        outcome.diagnosis_ok = diagnostic_triggered

    if case.category in ("ambiguous", "no_answer"):
        # раздел 26 ТЗ, Zero-Hallucination Mode: на мусорный/двусмысленный
        # запрос система не должна отвечать так, будто уверена (HIGH и
        # chunk_confident на LOW/MEDIUM данных были бы галлюцинацией).
        outcome.hallucination_ok = not (result.kind == "chunk_confident" and actual_confidence == "HIGH")

    return outcome


def outcome_confidence_matches(expected: str, actual: str) -> bool:
    return expected == actual


@dataclass
class QualityScore:
    intent_accuracy: float | None
    retrieval_accuracy: float | None
    source_authority_accuracy: float | None
    version_accuracy: float | None
    diagnosis_accuracy: float | None
    hallucination_resistance: float | None
    weighted_score: float
    total_cases: int
    counts_by_category: dict[str, int] = field(default_factory=dict)


_WEIGHTS = {
    "intent_accuracy": 0.20,
    "retrieval_accuracy": 0.20,
    "source_authority_accuracy": 0.20,
    "version_accuracy": 0.15,
    "diagnosis_accuracy": 0.15,
    "hallucination_resistance": 0.10,
}


def _ratio(flags: list[bool]) -> float | None:
    if not flags:
        return None
    return sum(flags) / len(flags)


def compute_quality_score(outcomes: list[CaseOutcome]) -> QualityScore:
    intent_flags = [o.intent_ok for o in outcomes if o.intent_ok is not None]
    retrieval_flags = [o.retrieval_ok for o in outcomes if o.retrieval_ok is not None]
    source_flags = [o.source_tier_ok for o in outcomes if o.source_tier_ok is not None]
    version_flags = [o.version_ok for o in outcomes if o.version_ok is not None]
    diagnosis_flags = [o.diagnosis_ok for o in outcomes if o.diagnosis_ok is not None]
    hallucination_flags = [o.hallucination_ok for o in outcomes if o.hallucination_ok is not None]

    metrics = {
        "intent_accuracy": _ratio(intent_flags),
        "retrieval_accuracy": _ratio(retrieval_flags),
        "source_authority_accuracy": _ratio(source_flags),
        "version_accuracy": _ratio(version_flags),
        "diagnosis_accuracy": _ratio(diagnosis_flags),
        "hallucination_resistance": _ratio(hallucination_flags),
    }

    # Взвешенная сумма только по метрикам, для которых нашлись применимые
    # кейсы — вес отсутствующей метрики не засчитывается ни в чью пользу
    # (перенормировка на сумму фактически использованных весов), а не
    # молча считается за 100% или 0%.
    applicable_weight = sum(_WEIGHTS[k] for k, v in metrics.items() if v is not None)
    weighted_sum = sum(_WEIGHTS[k] * v for k, v in metrics.items() if v is not None)
    weighted_score = (weighted_sum / applicable_weight) if applicable_weight > 0 else 0.0

    counts_by_category: dict[str, int] = {}
    for outcome in outcomes:
        counts_by_category[outcome.case.category] = counts_by_category.get(outcome.case.category, 0) + 1

    return QualityScore(
        **metrics,
        weighted_score=weighted_score,
        total_cases=len(outcomes),
        counts_by_category=counts_by_category,
    )
