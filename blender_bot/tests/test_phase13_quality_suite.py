"""Test Suite / Quality Score (разделы 34-35 ТЗ).

Прогоняет tests/quality/cases.json через реальный QAService + IntentEngine
+ DiagnosticRegistry и считает Quality Score по формуле раздела 35. Не
юнит-тест кода (как test_phase*_*.py остальных фаз) — это оценка КАЧЕСТВА
самой системы отвечать на вопросы, поэтому порог прохождения — не
"0 ошибок", а собственная цель ТЗ (раздел 35: v2 ≥ 70%).
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import (
    DIAGNOSTICS_PATH,
    HOTKEYS_PATH,
    KNOWLEDGE_CHUNK_PATHS,
    TERMINOLOGY_PATH,
    UNANSWERED_LOG_PATH,
)
from diagnostics.registry import DiagnosticRegistry
from search.qa_service import QAService
from tests.quality.metrics import compute_quality_score, evaluate_case
from tests.quality.schema import CATEGORIES, MIN_CASES_PER_CATEGORY, load_cases

CASES_PATH = Path(__file__).resolve().parent / "quality" / "cases.json"

# Раздел 35 ТЗ: "Цели: v2 ≥ 70%". Это цель проекта в целом (сюда войдут и
# будущие фазы — Structural Chunking, community-источники и т.д.), а не
# жёсткий CI-порог этой конкретной фазы — если реальный замер ниже, тест
# честно печатает фактическое число и почему, а не подгоняется под 70%.
V2_TARGET = 0.70


class TestSuiteStructureTests(unittest.TestCase):
    """Проверяет сам набор тестовых случаев (раздел 34: минимум по категориям),
    отдельно от вопроса, насколько хорошо система на них отвечает."""

    @classmethod
    def setUpClass(cls):
        if not CASES_PATH.exists():
            raise unittest.SkipTest(f"{CASES_PATH} не найден — запусти scripts/build_quality_test_suite.py")
        cls.cases = load_cases(CASES_PATH)

    def test_total_at_least_400(self):
        self.assertGreaterEqual(len(self.cases), 400)

    def test_every_category_meets_minimum(self):
        from collections import Counter
        counts = Counter(c.category for c in self.cases)
        for category, minimum in MIN_CASES_PER_CATEGORY.items():
            self.assertGreaterEqual(
                counts.get(category, 0), minimum,
                f"{category}: {counts.get(category, 0)} < {minimum}",
            )

    def test_no_unknown_category(self):
        for case in self.cases:
            self.assertIn(case.category, CATEGORIES, case.case_id)

    def test_case_ids_are_unique(self):
        ids = [c.case_id for c in self.cases]
        self.assertEqual(len(ids), len(set(ids)))


class QualityScoreTests(unittest.TestCase):
    """Реально прогоняет весь набор через QAService и печатает честный отчёт."""

    @classmethod
    def setUpClass(cls):
        if not CASES_PATH.exists():
            raise unittest.SkipTest(f"{CASES_PATH} не найден")
        missing = [p for p in KNOWLEDGE_CHUNK_PATHS if not p.exists()]
        if missing:
            raise unittest.SkipTest(f"нет данных: {missing}")

        cls.cases = load_cases(CASES_PATH)
        cls.qa_service = QAService(HOTKEYS_PATH, UNANSWERED_LOG_PATH, KNOWLEDGE_CHUNK_PATHS, TERMINOLOGY_PATH)
        cls.diagnostic_registry = DiagnosticRegistry.load(DIAGNOSTICS_PATH)
        cls.outcomes = [
            evaluate_case(case, cls.qa_service, cls.diagnostic_registry)
            for case in cls.cases
        ]
        cls.score = compute_quality_score(cls.outcomes)

    def test_prints_quality_report(self):
        s = self.score
        print("\n" + "=" * 70)
        print(f"Quality Score (раздел 35 ТЗ): {s.weighted_score:.1%}  (цель v2 >= {V2_TARGET:.0%})")
        print(f"Кейсов прогнано: {s.total_cases}")
        for category, count in sorted(s.counts_by_category.items()):
            print(f"  {category}: {count}")
        print("-" * 70)

        def fmt(name, value):
            return f"{name}: {'n/a' if value is None else f'{value:.1%}'}"

        print(fmt("Intent accuracy (20%)", s.intent_accuracy))
        print(fmt("Retrieval accuracy (20%)", s.retrieval_accuracy))
        print(fmt("Source authority accuracy (20%)", s.source_authority_accuracy))
        print(fmt("Version accuracy (15%)", s.version_accuracy))
        print(fmt("Diagnosis accuracy (15%)", s.diagnosis_accuracy))
        print(fmt("Hallucination resistance (10%)", s.hallucination_resistance))
        print("=" * 70)
        # Не assert — это отчёт для человека, а не бинарный pass/fail порог
        # этой фазы (см. докстринг файла).

    def test_score_is_computed_and_bounded(self):
        self.assertGreaterEqual(self.score.weighted_score, 0.0)
        self.assertLessEqual(self.score.weighted_score, 1.0)

    def test_at_least_one_case_per_metric_dimension(self):
        # Если какая-то метрика оказалась "n/a" (ни одного применимого
        # кейса) — это баг в наборе тестов, не в системе, и должен падать
        # явно, а не тихо перенормироваться.
        self.assertIsNotNone(self.score.intent_accuracy)
        self.assertIsNotNone(self.score.retrieval_accuracy)
        self.assertIsNotNone(self.score.source_authority_accuracy)
        self.assertIsNotNone(self.score.version_accuracy)
        self.assertIsNotNone(self.score.diagnosis_accuracy)
        self.assertIsNotNone(self.score.hallucination_resistance)


if __name__ == "__main__":
    unittest.main()
