"""Education Engine — схема (раздел 18, 22 ТЗ).

Lesson: Theory → Example → Exercise → Quiz (раздел 18). QuizQuestion —
раздел 22 (Exam Engine) перечисляет 6 типов вопросов: multiple choice,
true/false, scenario, diagnostic, workflow, technical. Реализованы первые
два (multiple_choice, true_false) — остальные требуют контента, для
которого пока нет содержательных оснований (см. PROJECT_PLAN.md, Known
issues Phase 11).
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field

QUESTION_TYPES = ("multiple_choice", "true_false")


@dataclass
class QuizQuestion:
    question_id: str
    question_type: str
    text: str
    options: list[str]
    correct_index: int
    explanation: str
    source: str | None = None

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "QuizQuestion":
        return cls(**data)


@dataclass
class Lesson:
    topic_id: str
    title: str
    theory: str
    example: str
    exercise: str
    quiz: list[QuizQuestion] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "topic_id": self.topic_id,
            "title": self.title,
            "theory": self.theory,
            "example": self.example,
            "exercise": self.exercise,
            "quiz": [q.to_dict() for q in self.quiz],
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Lesson":
        return cls(
            topic_id=data["topic_id"],
            title=data["title"],
            theory=data["theory"],
            example=data["example"],
            exercise=data["exercise"],
            quiz=[QuizQuestion.from_dict(q) for q in data.get("quiz", [])],
        )


class LessonValidationError(ValueError):
    pass


def validate_lesson(lesson: Lesson) -> None:
    errors = []
    if not lesson.topic_id:
        errors.append("topic_id")
    if not lesson.title:
        errors.append("title")
    if not lesson.theory:
        errors.append("theory")
    if not lesson.example:
        errors.append("example")
    if not lesson.exercise:
        errors.append("exercise")
    if not lesson.quiz:
        errors.append("quiz (пусто — раздел 22 ТЗ требует вопросы после теории)")

    for q in lesson.quiz:
        if q.question_type not in QUESTION_TYPES:
            errors.append(f"question {q.question_id!r}: type={q.question_type!r} не поддерживается")
        if not (0 <= q.correct_index < len(q.options)):
            errors.append(f"question {q.question_id!r}: correct_index вне диапазона options")
        if len(q.options) < 2:
            errors.append(f"question {q.question_id!r}: меньше 2 вариантов ответа")
        if not q.explanation:
            errors.append(f"question {q.question_id!r}: explanation пуст — раздел 22 требует объяснение после ответа")

    if errors:
        raise LessonValidationError(f"lesson {lesson.topic_id!r}: {errors} (раздел 18/22 ТЗ)")
