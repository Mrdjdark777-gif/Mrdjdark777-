"""Test Suite — схема тестового случая (раздел 34 ТЗ).

Каждый тест: input, expected_intent, expected_topic, expected_source_tier,
expected_answer_elements, expected_confidence. Раздел 34 требует минимум
400 случаев по 7 категориям: 100 basic, 100 technical, 100 troubleshooting,
50 version, 50 terminology, 50 deliberately ambiguous, 50 без ответа в базе.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path

CATEGORIES = (
    "basic", "technical", "troubleshooting", "version",
    "terminology", "ambiguous", "no_answer",
)

# Раздел 34 ТЗ — минимальное число случаев на категорию.
MIN_CASES_PER_CATEGORY = {
    "basic": 100,
    "technical": 100,
    "troubleshooting": 100,
    "version": 50,
    "terminology": 50,
    "ambiguous": 50,
    "no_answer": 50,
}


@dataclass
class TestCase:
    case_id: str
    category: str
    input: str
    expected_intent: list[str] = field(default_factory=list)
    expected_topic: str | None = None
    expected_source_tier: str | None = None  # "S"|"A"|"B"|"C"|"D"|"personal"|None (None=fallback ожидается)
    expected_answer_elements: list[str] = field(default_factory=list)
    expected_confidence: str | None = None  # "HIGH"|"MEDIUM"|"LOW"|"UNKNOWN"
    note: str | None = None  # почему этот кейс устроен именно так — для непрозрачных случаев

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "TestCase":
        return cls(**data)


def load_cases(path: Path) -> list[TestCase]:
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)
    return [TestCase.from_dict(item) for item in raw]


def save_cases(cases: list[TestCase], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump([c.to_dict() for c in cases], f, ensure_ascii=False, indent=1)
