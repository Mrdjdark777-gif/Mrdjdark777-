"""Разово наполняет knowledge/system/education/lessons.json (Phase 11,
раздел 18 ТЗ). 3 урока — раздел 36 ТЗ («1000 качественных лучше 100000
мусорных») применён и здесь: не претензия на полный курс Blender, а
проверенное качественное ядро.

Темы выбраны не случайно — все три уже есть в knowledge/system/terminology
(Phase 6, common_mistakes оттуда прямо легли в quiz-вопросы) и Mirror/
N-gon/Subdivision связаны с диагностикой Phase 9 (subdivision_breaks_model)
— видно то же самое понятие с трёх разных сторон: справочник (Terminology),
диагностика (Diagnostics) и обучение (Education).

Запуск (идемпотентно):
    python scripts/seed_education.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from education.registry import LessonRegistry  # noqa: E402
from education.schema import Lesson, QuizQuestion  # noqa: E402

OUTPUT_PATH = (
    Path(__file__).resolve().parent.parent
    / "knowledge" / "system" / "education" / "lessons.json"
)

MIRROR_MODIFIER = Lesson(
    topic_id="Mirror Modifier",
    title="Модификатор Mirror",
    theory=(
        "Mirror Modifier отражает меш по выбранной оси относительно точки "
        "Origin объекта. Это процедурный способ построить симметричную "
        "модель, редактируя только половину — модификатор автоматически "
        "копирует изменения на другую сторону."
    ),
    example=(
        "Например, при моделировании лица персонажа достаточно "
        "смоделировать одну половину и добавить Mirror по оси X — вторая "
        "половина обновляется автоматически при каждом изменении."
    ),
    exercise=(
        "Смоделируй половину простого объекта (например, кружку с ручкой "
        "сбоку) и добавь модификатор Mirror по нужной оси, чтобы получить "
        "симметричный результат."
    ),
    quiz=[
        QuizQuestion(
            question_id="mirror_q1", question_type="multiple_choice",
            text="Что нужно сделать перед добавлением Mirror, если у объекта был неоднородный масштаб?",
            options=[
                "Ничего, Mirror сработает как есть",
                "Применить масштаб (Ctrl+A → Scale)",
                "Удалить объект и создать заново",
                "Включить Auto Smooth",
            ],
            correct_index=1,
            explanation=(
                "Неприменённый масштаб искажает копию — это одна из "
                "типичных ошибок с Mirror."
            ),
            source="knowledge/system/terminology (Mirror Modifier)",
        ),
        QuizQuestion(
            question_id="mirror_q2", question_type="true_false",
            text="Модификатор Mirror всегда должен стоять последним в стеке модификаторов.",
            options=["Да", "Нет"], correct_index=1,
            explanation=(
                "Порядок важен, но не «всегда последним» — например, если "
                "нужна ровная фаска по шву, Mirror обычно ставят ДО Bevel, "
                "а не после."
            ),
            source="knowledge/system/terminology (Mirror Modifier)",
        ),
    ],
)

BOOLEAN_MODIFIER = Lesson(
    topic_id="Boolean Modifier",
    title="Модификатор Boolean",
    theory=(
        "Boolean Modifier выполняет логическую операцию между двумя "
        "объектами: Union (объединение), Difference (вычитание) и "
        "Intersect (пересечение)."
    ),
    example=(
        "Чтобы вырезать отверстие в стене, добавь модификатор Boolean на "
        "стену, выбери операцию Difference и укажи в качестве второго "
        "объекта форму отверстия (например, куб)."
    ),
    exercise=(
        "Создай два перекрывающихся объекта (например, куб и сферу) и "
        "попробуй все три операции Boolean по очереди — сравни результат."
    ),
    quiz=[
        QuizQuestion(
            question_id="boolean_q1", question_type="multiple_choice",
            text="После применения Boolean с операцией Difference, что обычно делают со вторым объектом?",
            options=[
                "Оставляют видимым в рендере",
                "Скрывают или удаляют",
                "Увеличивают в 2 раза",
                "Ничего специально не делают",
            ],
            correct_index=1,
            explanation=(
                "Второй объект послужил только «формой» для вычитания и "
                "обычно не нужен дальше — его прячут (H) или удаляют."
            ),
            source="knowledge/system/terminology (Boolean Modifier)",
        ),
        QuizQuestion(
            question_id="boolean_q2", question_type="true_false",
            text="Boolean модификатор в Blender всегда даёт идеально чистую топологию без дополнительной обработки.",
            options=["Да", "Нет"], correct_index=1,
            explanation=(
                "Boolean часто создаёт N-gon'ы и грязную топологию на "
                "стыках — после операции обычно нужна чистка сетки вручную."
            ),
            source="knowledge/system/terminology (Boolean Modifier)",
        ),
    ],
)

NGON = Lesson(
    topic_id="N-gon",
    title="N-gon",
    theory=(
        "N-gon — грань с 5 и более сторонами (в отличие от Tri — "
        "треугольника и Quad — четырёхугольника, золотого стандарта чистой "
        "сетки)."
    ),
    example=(
        "Плоская крышка цилиндра часто остаётся N-gon'ом (например, "
        "8-угольником) — это нормально для плоских нередактируемых "
        "участков, но проблематично там, где сетка будет деформироваться "
        "или сглаживаться."
    ),
    exercise=(
        "Возьми объект с N-gon (например, крышку цилиндра), добавь "
        "модификатор Subdivision Surface и посмотри на артефакт в центре, "
        "затем раздели N-gon на quad'ы (Face → Grid Fill) и сравни результат."
    ),
    quiz=[
        QuizQuestion(
            question_id="ngon_q1", question_type="multiple_choice",
            text="Почему N-gon может испортить результат Subdivision Surface?",
            options=[
                "Модификатор вообще не работает с N-gon",
                "Subdivision Surface может создать пинч/звезду в центре N-gon",
                "N-gon автоматически удаляется модификатором",
                "Проблем нет, N-gon работает как обычный quad",
            ],
            correct_index=1,
            explanation=(
                "Subdivision Surface обрабатывает N-gon особым образом — в "
                "центре может появиться характерная звезда-артефакт вместо "
                "ровной поверхности."
            ),
            source="knowledge/system/diagnostics (subdivision_breaks_model)",
        ),
        QuizQuestion(
            question_id="ngon_q2", question_type="true_false",
            text="N-gon уместен на любом участке модели без ограничений.",
            options=["Да", "Нет"], correct_index=1,
            explanation=(
                "Хорошая практика — держать модель на quad'ах, допуская "
                "N-gon только на плоских нередактируемых участках, не там, "
                "где будет деформация, сглаживание или анимация."
            ),
            source="knowledge/system/terminology (N-gon)",
        ),
    ],
)

LESSONS = [MIRROR_MODIFIER, BOOLEAN_MODIFIER, NGON]


def main() -> None:
    registry = LessonRegistry()
    for lesson in LESSONS:
        registry.add(lesson)
    registry.save(OUTPUT_PATH)
    print(f"Сохранено {len(registry.lessons)} уроков -> {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
