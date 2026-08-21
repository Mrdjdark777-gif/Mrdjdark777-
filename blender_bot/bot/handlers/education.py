"""Education Engine — Telegram-слой (раздел 18, 22 ТЗ).

Команды: /learn, /test, /exam, /progress, /weaknesses, /next.

Прогресс с Phase 12 хранится в SQLite (`profile/user_profile.py`, раздел 19
ТЗ) — переживает перезапуск бота. Активный quiz (какой вопрос сейчас,
какая тема только что изучалась) остаётся в `context.user_data["edu_*"]`
намеренно: это диалоговое состояние в рамках одного разговора, не история,
которую раздел 19 просит хранить (тот же принцип, что Diagnostic Engine,
Phase 9, для decision-tree диалога).

Level System (раздел 20 ТЗ) по-прежнему не реализован: даже с постоянным
хранилищем у нас всего 3 урока (Mirror Modifier, Boolean Modifier, N-gon)
— это покрывает 1 область из 10 требуемых разделом 20 (Modeling, Topology,
Materials, Lighting, Animation, Rendering, Geometry Nodes, Compositing,
Motion Design, Python). Присваивать уровень на основе такого узкого среза
было бы недостоверно, независимо от наличия хранилища.
"""

import random

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ContextTypes

from config import LESSONS_PATH, PROFILE_DB_PATH, TERMINOLOGY_PATH
from education.registry import LessonRegistry
from education.schema import Lesson, QuizQuestion
from knowledge.terminology import TerminologyRegistry
from profile.user_profile import UserProfileStore

lesson_registry = LessonRegistry.load(LESSONS_PATH)
terminology_registry = TerminologyRegistry.load(TERMINOLOGY_PATH)
profile_store = UserProfileStore(PROFILE_DB_PATH)

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
NO_PROGRESS_TEXT = "Ты пока не отвечал ни на один вопрос — начни с /test или /exam."
NO_WEAKNESSES_TEXT = "Пока не набралось данных о слабых местах."


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


def _lesson_question_ids() -> dict[str, set[str]]:
    return {lesson.topic_id: {q.question_id for q in lesson.quiz} for lesson in lesson_registry.lessons}


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
    profile_store.touch_topic(update.effective_user.id, lesson.topic_id)
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
        # по накопленной истории (Phase 12), а не только этой сессии.
        weak = profile_store.weak_topics(update.effective_user.id)
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
    user_id = update.effective_user.id
    summary = profile_store.progress_summary(user_id)
    if not summary["total"]:
        await update.message.reply_text(NO_PROGRESS_TEXT)
        return

    profile = profile_store.get_profile(user_id, _lesson_question_ids())
    lines = [
        "*Твой прогресс:*", "",
        f"Отвечено вопросов: {summary['total']}",
        f"Правильно: {summary['correct']}/{summary['total']}",
        f"Темы: {', '.join(summary['topics']) if summary['topics'] else '—'}",
    ]
    if profile.completed_topics:
        lines.append(f"Пройдено полностью: {', '.join(profile.completed_topics)}")
    if profile.blender_version:
        lines.append(f"Твоя версия Blender (по последнему упоминанию): {profile.blender_version}")
    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


async def weaknesses_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    weak = profile_store.weak_topics(update.effective_user.id)
    if not weak:
        await update.message.reply_text(NO_WEAKNESSES_TEXT)
        return

    lines = ["*Слабые места:*", ""]
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
    profile_store.record_quiz_answer(update.effective_user.id, lesson.topic_id, question.question_id, correct)
    context.user_data["edu_quiz_index"] = context.user_data.get("edu_quiz_index", 0) + 1

    result_text = _format_result(correct, question)
    is_last = _current_question(context) is None
    if is_last:
        result_text += "\n\nЭто был последний вопрос — набери /next, чтобы увидеть итог."
    else:
        result_text += "\n\nНабери /next для следующего вопроса."

    await query.edit_message_text(result_text, parse_mode="Markdown")
