"""Тесты Phase 8 (Intent Engine, раздел 11 ТЗ)."""

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import KNOWLEDGE_BASE_PATH
from intents.engine import QUESTION_TYPE_INTENTS, TOPIC_INTENTS, IntentEngine


class QuestionTypeTests(unittest.TestCase):
    def setUp(self):
        self.engine = IntentEngine()

    def test_what_is(self):
        self.assertIn("WHAT_IS", self.engine.classify("Что такое Subdivision Surface?").question_types)

    def test_how_to(self):
        self.assertIn("HOW_TO", self.engine.classify("Как сделать булеан?").question_types)

    def test_why(self):
        self.assertIn("WHY", self.engine.classify("Зачем нужен Empty объект?").question_types)

    def test_error(self):
        self.assertIn("ERROR", self.engine.classify("Рендер вылетает с ошибкой Python").question_types)

    def test_troubleshooting(self):
        self.assertIn("TROUBLESHOOTING", self.engine.classify("Текстура пропала, ничего не помогает").question_types)

    def test_comparison(self):
        self.assertIn("COMPARISON", self.engine.classify("В чём разница между Cycles и Eevee?").question_types)

    def test_learning(self):
        self.assertIn("LEARNING", self.engine.classify("Хочу изучить моделирование с нуля").question_types)

    def test_exam(self):
        self.assertIn("EXAM", self.engine.classify("Хочу пройти тест по анимации").question_types)

    def test_best_practice(self):
        self.assertIn("BEST_PRACTICE", self.engine.classify("Стоит ли использовать N-gon?").question_types)

    def test_version(self):
        result = self.engine.classify("В блендере 4.2 как сделать риг")
        self.assertIn("VERSION", result.question_types)
        self.assertEqual(result.version_hint, "4.2")

    def test_no_match_returns_empty_list_not_none(self):
        result = self.engine.classify("Что делает Loop Cut?")
        self.assertIsInstance(result.question_types, list)

    def test_is_terminology_property(self):
        result = self.engine.classify("Что такое N-gon?")
        self.assertTrue(result.is_terminology)
        result2 = self.engine.classify("Как сделать булеан?")
        self.assertFalse(result2.is_terminology)


class TopicTests(unittest.TestCase):
    def setUp(self):
        self.engine = IntentEngine()

    def test_rendering(self):
        self.assertIn("RENDERING", self.engine.classify("Как ускорить рендер в Cycles?").topics)

    def test_rigging(self):
        self.assertIn("RIGGING", self.engine.classify("Как создать риг для персонажа?").topics)

    def test_materials(self):
        self.assertIn("MATERIALS", self.engine.classify("Материал не виден на объекте").topics)

    def test_word_stem_matches_inflected_forms(self):
        # "рендерить" — словоформа "рендер", должна матчиться через префикс
        self.assertIn("RENDERING", self.engine.classify("Как рендерить анимацию побыстрее?").topics)

    def test_word_boundary_no_false_positive_inside_unrelated_word(self):
        # Регрессия: "кости" (алиас RIGGING) раньше ложно совпадал внутри
        # "жид[кости]" (Fluid) — substring без учёта границы слова.
        result = self.engine.classify("Как настроить симуляцию жидкости?")
        self.assertNotIn("RIGGING", result.topics)

    def test_generic_word_or_does_not_trigger_comparison(self):
        # Регрессия: "или" как маркер COMPARISON ловил обычное перечисление
        # ("грань или ребро"), а не сравнение.
        result = self.engine.classify("Как экструдировать грань или ребро?")
        self.assertNotIn("COMPARISON", result.question_types)

    def test_multiple_topics_can_match_at_once(self):
        result = self.engine.classify("Как рендерить анимацию?")
        self.assertIn("RENDERING", result.topics)
        self.assertIn("ANIMATION", result.topics)


class IntentLabelSetTests(unittest.TestCase):
    def test_28_labels_total_matches_tz_section_11(self):
        self.assertEqual(len(QUESTION_TYPE_INTENTS) + len(TOPIC_INTENTS), 28)

    def test_no_overlap_between_type_and_topic_labels(self):
        self.assertEqual(set(QUESTION_TYPE_INTENTS) & set(TOPIC_INTENTS), set())


class RealQuestionsCoverageTests(unittest.TestCase):
    """Прогон по всем 70 реальным вопросам dima_notes — не строгий assert на
    каждый (эвристика не обязана покрыть 100%), а проверка, что классификатор
    в принципе работает на реальных данных и не падает, плюс минимальный
    порог полноты."""

    @classmethod
    def setUpClass(cls):
        with open(KNOWLEDGE_BASE_PATH, encoding="utf-8") as f:
            cls.questions = [e["question"] for e in json.load(f)]
        cls.engine = IntentEngine()

    def test_does_not_crash_on_real_questions(self):
        for q in self.questions:
            self.engine.classify(q)  # не должно бросить исключение

    def test_at_least_half_get_a_question_type(self):
        results = [self.engine.classify(q) for q in self.questions]
        with_type = sum(1 for r in results if r.question_types)
        self.assertGreaterEqual(with_type / len(results), 0.5)


if __name__ == "__main__":
    unittest.main()
