"""Тесты Phase 9 (Diagnostic Engine, разделы 12-13 ТЗ)."""

import asyncio
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import DIAGNOSTICS_PATH
from diagnostics.registry import DiagnosticRegistry
from diagnostics.schema import (
    DecisionNode,
    DiagnosticOption,
    DiagnosticProblem,
    DiagnosticValidationError,
    validate_problem,
)
from intents.engine import IntentEngine


def _simple_problem(**overrides) -> DiagnosticProblem:
    nodes = {
        "root": DecisionNode(
            node_id="root", kind="question", question_text="Где именно?",
            options=[
                DiagnosticOption(label="Тут", next_node_id="sol_a"),
                DiagnosticOption(label="Там", next_node_id="sol_b"),
            ],
        ),
        "sol_a": DecisionNode(node_id="sol_a", kind="solution", cause="Причина A", fix="Решение A"),
        "sol_b": DecisionNode(node_id="sol_b", kind="solution", cause="Причина B", fix="Решение B"),
    }
    defaults = dict(
        problem_id="test_problem", title="Тестовая проблема", symptoms="Что-то не так",
        keywords=["тест", "проблема"], possible_causes=["A", "B"],
        root_node_id="root", nodes=nodes, version=None, sources=[], severity="medium",
    )
    defaults.update(overrides)
    return DiagnosticProblem(**defaults)


class SchemaValidationTests(unittest.TestCase):
    def test_valid_problem_passes(self):
        validate_problem(_simple_problem())

    def test_missing_keywords_raises(self):
        with self.assertRaises(DiagnosticValidationError):
            validate_problem(_simple_problem(keywords=[]))

    def test_bad_severity_raises(self):
        with self.assertRaises(DiagnosticValidationError):
            validate_problem(_simple_problem(severity="critical"))

    def test_missing_root_node_raises(self):
        with self.assertRaises(DiagnosticValidationError):
            validate_problem(_simple_problem(root_node_id="does-not-exist"))

    def test_question_without_options_raises(self):
        nodes = {"root": DecisionNode(node_id="root", kind="question", question_text="Q?", options=[])}
        with self.assertRaises(DiagnosticValidationError):
            validate_problem(_simple_problem(nodes=nodes))

    def test_solution_without_fix_raises(self):
        nodes = {"root": DecisionNode(node_id="root", kind="solution", cause="X", fix=None)}
        with self.assertRaises(DiagnosticValidationError):
            validate_problem(_simple_problem(nodes=nodes))

    def test_option_pointing_to_missing_node_raises(self):
        nodes = {
            "root": DecisionNode(
                node_id="root", kind="question", question_text="Q?",
                options=[DiagnosticOption(label="X", next_node_id="ghost")],
            ),
        }
        with self.assertRaises(DiagnosticValidationError):
            validate_problem(_simple_problem(nodes=nodes))


class DecisionTreeWalkTests(unittest.TestCase):
    def test_walk_root_to_solution(self):
        problem = _simple_problem()
        root = problem.root
        self.assertEqual(root.kind, "question")
        option = root.options[0]
        next_node = problem.get_node(option.next_node_id)
        self.assertEqual(next_node.kind, "solution")
        self.assertEqual(next_node.cause, "Причина A")

    def test_get_unknown_node_returns_none(self):
        problem = _simple_problem()
        self.assertIsNone(problem.get_node("no-such-node"))


class RegistryRoundtripTests(unittest.TestCase):
    def test_save_load_roundtrip(self):
        registry = DiagnosticRegistry()
        registry.add(_simple_problem())
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "problems.json"
            registry.save(path)
            loaded = DiagnosticRegistry.load(path)
            self.assertEqual(len(loaded.problems), 1)
            p = loaded.get("test_problem")
            self.assertIsNotNone(p)
            self.assertEqual(p.root.question_text, "Где именно?")

    def test_load_missing_file_returns_empty_registry(self):
        registry = DiagnosticRegistry.load(Path("does/not/exist.json"))
        self.assertEqual(registry.problems, [])


class FindProblemTests(unittest.TestCase):
    def setUp(self):
        self.registry = DiagnosticRegistry()
        self.registry.add(_simple_problem(keywords=["subdivision", "сабдив", "ломае"]))

    def test_matches_on_two_keywords(self):
        problem = self.registry.find_problem("subdivision модель ломается")
        self.assertIsNotNone(problem)
        self.assertEqual(problem.problem_id, "test_problem")

    def test_single_keyword_is_not_enough(self):
        # min_matches=2 по умолчанию — одного слова недостаточно
        self.assertIsNone(self.registry.find_problem("subdivision surface это модификатор"))

    def test_unrelated_question_no_match(self):
        self.assertIsNone(self.registry.find_problem("как сделать булеан"))

    def test_prefix_match_catches_word_forms(self):
        # "ломае" как основа должен поймать "ломается"/"ломало"/"поломали" и т.п.
        problem = self.registry.find_problem("subdivision почему-то всё ломается у меня")
        self.assertIsNotNone(problem)

    def test_empty_registry_returns_none(self):
        self.assertIsNone(DiagnosticRegistry().find_problem("subdivision ломается"))


class RealSeededDataTests(unittest.TestCase):
    """Проверки на реально засеянные knowledge/system/diagnostics/problems.json."""

    @classmethod
    def setUpClass(cls):
        if not DIAGNOSTICS_PATH.exists():
            raise unittest.SkipTest(f"{DIAGNOSTICS_PATH} не найден — запусти scripts/seed_diagnostics.py")
        cls.registry = DiagnosticRegistry.load(DIAGNOSTICS_PATH)
        cls.intents = IntentEngine()

    def test_has_at_least_two_problems(self):
        self.assertGreaterEqual(len(self.registry.problems), 2)

    def test_every_problem_is_valid(self):
        for problem in self.registry.problems:
            validate_problem(problem)

    def test_tz_section_13_example_matches_and_triggers_troubleshooting(self):
        # Буквальный пример раздела 13 ТЗ.
        question = "После Subdivision модель ломается"
        result = self.intents.classify(question)
        self.assertIn("TROUBLESHOOTING", result.question_types)

        problem = self.registry.find_problem(question)
        self.assertIsNotNone(problem)
        self.assertEqual(problem.problem_id, "subdivision_breaks_model")
        self.assertIn("Где именно", problem.root.question_text)
        option_labels = [o.label for o in problem.root.options]
        self.assertEqual(
            option_labels,
            ["На углах", "На отверстиях", "На плоских поверхностях", "По всей модели"],
        )

    def test_every_leaf_reachable_from_root(self):
        # Каждый узел дерева должен быть достижим из root — иначе это
        # мёртвый узел, который никогда не покажется пользователю.
        for problem in self.registry.problems:
            reachable = {problem.root_node_id}
            frontier = [problem.root_node_id]
            while frontier:
                node = problem.get_node(frontier.pop())
                for option in node.options:
                    if option.next_node_id not in reachable:
                        reachable.add(option.next_node_id)
                        frontier.append(option.next_node_id)
            self.assertEqual(reachable, set(problem.nodes.keys()), problem.problem_id)

    def test_what_is_question_does_not_match_troubleshooting_intent(self):
        result = self.intents.classify("Что такое Subdivision Surface?")
        self.assertNotIn("TROUBLESHOOTING", result.question_types)
        self.assertNotIn("ERROR", result.question_types)

    def test_black_material_problem_findable(self):
        problem = self.registry.find_problem("материал не виден на объекте, всё черное")
        self.assertIsNotNone(problem)
        self.assertEqual(problem.problem_id, "black_material_or_render")


class TelegramLayerTests(unittest.TestCase):
    """Проверяет сами хендлеры bot/handlers/diagnostics.py через моки
    Update/Context — раньше (Phase 7 Known issues) Telegram-слой нигде не
    тестировался напрямую, только бизнес-логика. Многошаговое состояние
    диагностики (context.user_data между сообщениями) — первый случай в
    проекте, где баг в самом хендлере, а не в бизнес-логике, реально может
    сломать сессию пользователя, поэтому здесь это оправдано."""

    def setUp(self):
        if not DIAGNOSTICS_PATH.exists():
            self.skipTest(f"{DIAGNOSTICS_PATH} не найден")
        from bot.handlers import diagnostics as diag_module
        self.diag_module = diag_module

    def _run(self, coro):
        return asyncio.run(coro)

    def _make_update_with_message(self):
        update = MagicMock()
        update.message.reply_text = AsyncMock()
        return update

    def _make_context(self):
        context = MagicMock()
        context.user_data = {}
        return context

    def test_full_flow_root_to_solution(self):
        update = self._make_update_with_message()
        context = self._make_context()

        started = self._run(
            self.diag_module.try_start_diagnostic(
                "После Subdivision модель ломается", ["TROUBLESHOOTING"], update, context
            )
        )
        self.assertTrue(started)
        update.message.reply_text.assert_called_once()
        self.assertEqual(context.user_data["diag_problem_id"], "subdivision_breaks_model")
        self.assertEqual(context.user_data["diag_node_id"], "root")

        # Кликаем "На плоских поверхностях" — по порядку опций это индекс 2
        problem = self.diag_module.diagnostic_registry.get("subdivision_breaks_model")
        option_index = [o.label for o in problem.root.options].index("На плоских поверхностях")

        callback_update = MagicMock()
        callback_update.callback_query.answer = AsyncMock()
        callback_update.callback_query.edit_message_text = AsyncMock()
        callback_update.callback_query.data = f"diag:{option_index}"

        self._run(self.diag_module.diag_option_callback(callback_update, context))

        callback_update.callback_query.edit_message_text.assert_called_once()
        sent_text = callback_update.callback_query.edit_message_text.call_args.args[0]
        self.assertIn("N-gon", sent_text)  # решение для "плоских поверхностей"
        # сессия должна закрыться — решение это лист дерева
        self.assertNotIn("diag_problem_id", context.user_data)
        self.assertNotIn("diag_node_id", context.user_data)

    def test_multi_step_flow_through_nested_question(self):
        update = self._make_update_with_message()
        context = self._make_context()
        self._run(
            self.diag_module.try_start_diagnostic(
                "После Subdivision модель ломается", ["TROUBLESHOOTING"], update, context
            )
        )

        problem = self.diag_module.diagnostic_registry.get("subdivision_breaks_model")
        idx = [o.label for o in problem.root.options].index("По всей модели")

        first_click = MagicMock()
        first_click.callback_query.answer = AsyncMock()
        first_click.callback_query.edit_message_text = AsyncMock()
        first_click.callback_query.data = f"diag:{idx}"
        self._run(self.diag_module.diag_option_callback(first_click, context))

        # "По всей модели" ведёт на ещё один вопрос, не сразу на решение
        self.assertEqual(context.user_data.get("diag_node_id"), "everywhere")
        first_text = first_click.callback_query.edit_message_text.call_args.args[0]
        self.assertIn("масштаб", first_text.lower())

        second_click = MagicMock()
        second_click.callback_query.answer = AsyncMock()
        second_click.callback_query.edit_message_text = AsyncMock()
        second_click.callback_query.data = "diag:0"  # "Нет, не применял"
        self._run(self.diag_module.diag_option_callback(second_click, context))

        self.assertNotIn("diag_node_id", context.user_data)  # дошли до решения
        final_text = second_click.callback_query.edit_message_text.call_args.args[0]
        self.assertIn("Apply", final_text)

    def test_expired_session_shows_expired_text_not_crash(self):
        context = self._make_context()  # пустой user_data — "сессии" нет
        callback_update = MagicMock()
        callback_update.callback_query.answer = AsyncMock()
        callback_update.callback_query.edit_message_text = AsyncMock()
        callback_update.callback_query.data = "diag:0"

        self._run(self.diag_module.diag_option_callback(callback_update, context))

        callback_update.callback_query.edit_message_text.assert_called_once_with(
            self.diag_module.SESSION_EXPIRED_TEXT
        )

    def test_non_troubleshooting_intent_does_not_start_diagnostic(self):
        update = self._make_update_with_message()
        context = self._make_context()
        started = self._run(
            self.diag_module.try_start_diagnostic(
                "Что такое Subdivision Surface?", ["WHAT_IS"], update, context
            )
        )
        self.assertFalse(started)
        update.message.reply_text.assert_not_called()
        self.assertNotIn("diag_problem_id", context.user_data)


if __name__ == "__main__":
    unittest.main()
