"""Education Engine — реестр уроков (раздел 18 ТЗ)."""

from __future__ import annotations

import json
from pathlib import Path

from education.schema import Lesson, QuizQuestion, validate_lesson


class LessonRegistry:
    def __init__(self) -> None:
        self.lessons: list[Lesson] = []

    def add(self, lesson: Lesson) -> Lesson:
        validate_lesson(lesson)
        self.lessons.append(lesson)
        return lesson

    def get(self, topic_id: str) -> Lesson | None:
        for lesson in self.lessons:
            if lesson.topic_id == topic_id:
                return lesson
        return None

    def find_by_title(self, text: str) -> Lesson | None:
        """Ищет урок по вхождению названия темы в текст (регистронезависимо)
        — для /learn <название темы>, введённого свободным текстом."""
        normalized = text.strip().lower()
        for lesson in self.lessons:
            if lesson.title.lower() in normalized or normalized in lesson.title.lower():
                return lesson
        return None

    def all_questions(self) -> list[tuple[Lesson, QuizQuestion]]:
        return [(lesson, q) for lesson in self.lessons for q in lesson.quiz]

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump([lesson.to_dict() for lesson in self.lessons], f, ensure_ascii=False, indent=1)

    @classmethod
    def load(cls, path: Path) -> "LessonRegistry":
        registry = cls()
        if not path.exists():
            return registry
        with open(path, encoding="utf-8") as f:
            raw = json.load(f)
        for item in raw:
            registry.add(Lesson.from_dict(item))
        return registry
