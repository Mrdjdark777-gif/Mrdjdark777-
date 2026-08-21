"""Education Engine — Telegram-слой (раздел 18, 22 ТЗ).

Команды: /learn, /test, /exam, /progress, /weaknesses, /next.

Важное честное ограничение (см. PROJECT_PLAN.md, Phase 11 Known issues):
раздел 40 ТЗ ставит User Profile (SQLite, раздел 19) отдельной Phase 12,
ПОСЛЕ Education Engine. Персистентного хранилища пока нет — весь прогресс
(`context.user_data["edu_*"]`) живёт только в памяти процесса и пропадает
при перезапуске бота. /progress и /weaknesses прямо говорят об этом
пользователю, а не притворяются, что показывают историю за всё время.
Level System (раздел 20 ТЗ) не реализован вовсе — присвоение уровня
(Beginner/Junior/...) требует накопленной истории тестов, для которой
сейчас нет ни хранилища, ни достаточного количества уроков.
"""

import random

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ContextTypes

from config import LESSONS_PATH, TERMINOLOGY_PATH
from education.registry import LessonRegistry
from education.schema import Lesson, QuizQuestion
from knowledge.terminology import TerminologyRegistry

lesson_registry = LessonRegistry.load(LESSONS_PATH)
terminology_registry = TerminologyRegistry.load(TERMINOLOGY_PATH)

NO_LESSONS_TEXT = "Уроки пока не загружены."
NO_TOPIC_TEXT = (
    "Какую тему изучаем? Напиши, например: /learn Mirror Modifier\n\n"
    "Доступные темы:\n{topics}"
)
TOPIC_NOT_FOUND_TEXT = "Не нашёл такую тему. Доступные темы:\n{topics}"
NO_ACTIVE_TOPIC_FOR_TEST_TEXT = (
    "Сначала выбери тему: /learn <тема>, потом /test проверит именно её. "
    "Или сразу /exam — тест по всем темам сразу."
)
QUIZ_FINISHED_TEXT = "Вопросов больше нет — набери /next ещё раз или начни заново через /test или /exam."
NO_ACTIVE_QUIZ_TEXT = "Сейчас нет активного теста. Начни через /test или /exam."
NO_PROGRESS_TEXT = "В этой сессии ты пока не отвечал ни на один вопрос — начни с /test или /exam."
NO_WEAKNESSES_TEXT = "Пока не набралось данных о слабых местах в этой сессии."


def _resolve_lesson(query_text: str) -> Lesson | None:
    """Урок ищется по topic_id, который совпадает с Term.canonical_name
    (см. scripts/seed_education.py) — переиспользуем алиасы/переводы уже
    готового TerminologyRegistry (Phase 6), а не примитивное сравнение
    строк, чтобы "mirror", "зеркало" и "Mirror Modifier" находили один и
    тот же урок."""
    term = terminology_registry.find(query_text)
    if term:
        lesson = lesson_registry.get(term.canonical_name)
        if lesson:
            return lesson
    return lesson_registry.find_by_title(query_text)


def _topics_list_text() -> str:
    return "\n".join(f"• {lesson.title}" for lesson in lesson_registry.lessons)


def _quiz_keyboard(question: QuizQuestion) -> InlineKeyboardMarkup:
    buttons = [
        [InlineKeyboardButton(option, callback_data=f"edu:{i}")]
        for i, option in enumerate(question.options)
    ]
    return InlineKeyboardMarkup(buttons)


def _format_question(topic_title: str, question: QuizQuestion) -> str:
    return f"*{topic_title}*\n\n{question.text}"


def _format_result(correct: bool, question: QuizQuestion) -> str:
    verdict = "✅ Верно!" if correct else "❌ Неверно."
    lines = [
        verdict,
        f"Правильный ответ: {question.options[question.correct_index]}",
        f"\n{question.explanation}",
    ]
    if question.source:
        lines.append(f"\n_Источник: {question.source}_")
    return "\n".join(lines)


def _start_quiz(context: ContextTypes.DEFAULT_TYPE, questions: list[tuple[Lesson, QuizQuestion]]) -> None:
    context.user_data["edu_quiz"] = [
        (lesson.topic_id, q.question_id) for lesson, q in questions
    ]
    context.user_data["edu_quiz_index"] = 0


def _current_question(context: ContextTypes.DEFAULT_TYPE) -> tuple[Lesson, QuizQuestion] | None:
    quiz = context.user_data.get("edu_quiz")
    index = context.user_data.get("edu_quiz_index", 0)
    if not quiz or index >= len(quiz):
        return None
    topic_id, question_id = quiz[index]
    lesson = lesson_registry.get(topic_id)
    if not lesson:
        return None
    question = next((q for q in lesson.quiz if q.question_id == question_id), None)
    if not question:
        return None
    return lesson, question


def _record_answer(context: ContextTypes.DEFAULT_TYPE, lesson: Lesson, correct: bool) -> None:
    log = context.user_data.setdefault("edu_session_log", [])
    log.append({"topic_id": lesson.topic_id, "correct": correct})
    if not correct:
        weak = context.user_data.setdefault("edu_weak_topics", {})
        weak[lesson.topic_id] = weak.get(lesson.topic_id, 0) + 1


async def learn_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not lesson_registry.lessons:
        await update.message.reply_text(NO_LESSONS_TEXT)
        return

    query_text = " ".join(context.args) if context.args else ""
    if not query_text:
        await update.message.reply_text(NO_TOPIC_TEXT.format(topics=_topics_list_text()))
        return

    lesson = _resolve_lesson(query_text)
    if not lesson:
        await update.message.reply_text(TOPIC_NOT_FOUND_TEXT.format(topics=_topics_list_text()))
        return

    context.user_data["edu_current_topic"] = lesson.topic_id
    text = (
        f"*{lesson.title}*\n\n"
        f"*Теория:*\n{lesson.theory}\n\n"
        f"*Пример:*\n{lesson.example}\n\n"
        f"*Упражнение:*\n{lesson.exercise}\n\n"
        f"Когда попробуешь — набери /test, чтобы проверить себя по этой теме."
    )
    await update.message.reply_text(text, parse_mode="Markdown")


async def test_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    topic_id = context.user_data.get("edu_current_topic")
    lesson = lesson_registry.get(topic_id) if topic_id else None
    if not lesson:
        await update.message.reply_text(NO_ACTIVE_TOPIC_FOR_TEST_TEXT)
        return

    _start_quiz(context, [(lesson, q) for q in lesson.quiz])
    current = _current_question(context)
    lesson, question = current
    await update.message.reply_text(
        _format_question(lesson.title, question), parse_mode="Markdown",
        reply_markup=_quiz_keyboard(question),
    )


async def exam_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    all_questions = lesson_registry.all_questions()
    if not all_questions:
        await update.message.reply_text(NO_LESSONS_TEXT)
        return

    shuffled = list(all_questions)
    random.shuffle(shuffled)
    _start_quiz(context, shuffled)
    lesson, question = _current_question(context)
    await update.message.reply_text(
        _format_question(lesson.title, question), parse_mode="Markdown",
        reply_markup=_quiz_keyboard(question),
    )


async def next_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    quiz = context.user_data.get("edu_quiz")
    if not quiz:
        # Не в тесте — подсказываем, что изучить дальше: самую слабую тему
        # этой сессии, если такая есть, иначе первый урок из реестра.
        weak = context.user_data.get("edu_weak_topics", {})
        if weak:
            weakest_topic_id = max(weak, key=weak.get)
            lesson = lesson_registry.get(weakest_topic_id)
            if lesson:
                await update.message.reply_text(
                    f"Судя по прошлым ответам, стоит повторить «{lesson.title}» "
                    f"— набери /learn {lesson.title}"
                )
                return
        if lesson_registry.lessons:
            first = lesson_registry.lessons[0]
            await update.message.reply_text(f"Начни с /learn {first.title}")
        else:
            await update.message.reply_text(NO_LESSONS_TEXT)
        return

    current = _current_question(context)
    if current is None:
        context.user_data.pop("edu_quiz", None)
        context.user_data.pop("edu_quiz_index", None)
        await update.message.reply_text(QUIZ_FINISHED_TEXT)
        return

    lesson, question = current
    await update.message.reply_text(
        _format_question(lesson.title, question), parse_mode="Markdown",
        reply_markup=_quiz_keyboard(question),
    )


async def progress_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    log = context.user_data.get("edu_session_log", [])
    if not log:
        await update.message.reply_text(NO_PROGRESS_TEXT)
        return

    correct = sum(1 for entry in log if entry["correct"])
    topics = sorted({entry["topic_id"] for entry in log})
    text = (
        f"*Прогресс за эту сессию* (не сохраняется после перезапуска бота):\n\n"
        f"Отвечено вопросов: {len(log)}\n"
        f"Правильно: {correct}/{len(log)}\n"
        f"Темы: {', '.join(topics)}"
    )
    await update.message.reply_text(text, parse_mode="Markdown")


async def weaknesses_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    weak = context.user_data.get("edu_weak_topics", {})
    if not weak:
        await update.message.reply_text(NO_WEAKNESSES_TEXT)
        return

    lines = ["*Слабые места за эту сессию* (не сохраняется после перезапуска бота):", ""]
    for topic_id, count in sorted(weak.items(), key=lambda item: item[1], reverse=True):
        lines.append(f"• {topic_id} — {count} неверных ответов")
    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


async def quiz_answer_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()

    current = _current_question(context)
    if current is None:
        await query.edit_message_text(NO_ACTIVE_QUIZ_TEXT)
        return
    lesson, question = current

    try:
        chosen_index = int(query.data.split(":", 1)[1])
    except (ValueError, IndexError):
        await query.edit_message_text(NO_ACTIVE_QUIZ_TEXT)
        return

    correct = chosen_index == question.correct_index
    _record_answer(context, lesson, correct)
    context.user_data["edu_quiz_index"] = context.user_data.get("edu_quiz_index", 0) + 1

    result_text = _format_result(correct, question)
    is_last = _current_question(context) is None
    if is_last:
        result_text += "\n\nЭто был последний вопрос — набери /next, чтобы увидеть итог."
    else:
        result_text += "\n\nНабери /next для следующего вопроса."

    await query.edit_message_text(result_text, parse_mode="Markdown")
