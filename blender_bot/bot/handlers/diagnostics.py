"""Diagnostic Engine — Telegram-слой (разделы 12-13 ТЗ).

Единственное место в проекте, где бот хранит состояние между сообщениями
одного пользователя (`context.user_data["diag_*"]`) — Intent Engine
(Phase 8) сознательно этого не делал, отдав многошаговое состояние сюда,
Diagnostic Engine (Phase 9).
"""

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ContextTypes

from config import DIAGNOSTICS_PATH
from diagnostics.registry import DiagnosticRegistry
from diagnostics.schema import DecisionNode

diagnostic_registry = DiagnosticRegistry.load(DIAGNOSTICS_PATH)

# Раздел 11 ТЗ: TROUBLESHOOTING/ERROR — типы вопросов, для которых вообще
# имеет смысл проверять, не начало ли это известного диагностического
# сценария. WHAT_IS/HOW_TO про ту же тему не должны запускать диалог.
_DIAGNOSTIC_TRIGGER_TYPES = {"TROUBLESHOOTING", "ERROR"}

SESSION_EXPIRED_TEXT = "Сессия диагностики устарела — напиши вопрос заново."


def _options_keyboard(node: DecisionNode) -> InlineKeyboardMarkup:
    buttons = [
        [InlineKeyboardButton(option.label, callback_data=f"diag:{i}")]
        for i, option in enumerate(node.options)
    ]
    return InlineKeyboardMarkup(buttons)


def _format_solution(node: DecisionNode) -> str:
    return f"{node.cause}\n\n*Что делать:*\n{node.fix}"


def clear_session(context: ContextTypes.DEFAULT_TYPE) -> None:
    context.user_data.pop("diag_problem_id", None)
    context.user_data.pop("diag_node_id", None)


async def try_start_diagnostic(
    question: str,
    question_types: list[str],
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
) -> bool:
    """Если вопрос похож на начало известного диагностического сценария —
    запускает decision-tree диалог и возвращает True. Иначе — False,
    вызывающий код должен продолжить обычный поиск по knowledge/."""
    if not _DIAGNOSTIC_TRIGGER_TYPES & set(question_types):
        return False

    problem = diagnostic_registry.find_problem(question)
    if not problem:
        return False

    context.user_data["diag_problem_id"] = problem.problem_id
    context.user_data["diag_node_id"] = problem.root_node_id

    root = problem.root
    await update.message.reply_text(root.question_text, reply_markup=_options_keyboard(root))
    return True


async def diag_option_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()

    problem_id = context.user_data.get("diag_problem_id")
    node_id = context.user_data.get("diag_node_id")
    problem = diagnostic_registry.get(problem_id) if problem_id else None
    node = problem.get_node(node_id) if problem else None

    if not problem or not node:
        clear_session(context)
        await query.edit_message_text(SESSION_EXPIRED_TEXT)
        return

    try:
        option_index = int(query.data.split(":", 1)[1])
        option = node.options[option_index]
    except (ValueError, IndexError):
        clear_session(context)
        await query.edit_message_text(SESSION_EXPIRED_TEXT)
        return

    next_node = problem.get_node(option.next_node_id)
    if next_node is None:
        clear_session(context)
        await query.edit_message_text(SESSION_EXPIRED_TEXT)
        return

    if next_node.kind == "question":
        context.user_data["diag_node_id"] = next_node.node_id
        await query.edit_message_text(
            next_node.question_text, reply_markup=_options_keyboard(next_node)
        )
    else:
        clear_session(context)
        await query.edit_message_text(_format_solution(next_node), parse_mode="Markdown")
