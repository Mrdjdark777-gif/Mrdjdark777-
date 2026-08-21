# knowledge/system/education

Education Engine (раздел 18 ТЗ). Phase 11 — готово.

Не было в исходном списке раздела 5 ТЗ (там только synonyms, terminology,
intents, diagnostics, rules) — добавлено по аналогии: уроки такие же
структурированные знания, как и всё остальное в `knowledge/`, и для них не
было другого логичного места в архитектуре раздела 39.

`lessons.json` — **3 урока** (Theory → Example → Exercise → Quiz, раздел 18
ТЗ): `Mirror Modifier`, `Boolean Modifier`, `N-gon`. Темы выбраны не
случайно — все три уже есть в `knowledge/system/terminology` (Phase 6,
`common_mistakes` оттуда легли в quiz-вопросы напрямую), а Mirror/N-gon
связаны с диагностикой Phase 9 (`subdivision_breaks_model`) — одно и то же
понятие видно с трёх разных сторон: справочник, диагностика, обучение.

Код — `education/schema.py` (`Lesson`, `QuizQuestion`, `validate_lesson`) и
`education/registry.py` (`LessonRegistry`). Telegram-слой —
`bot/handlers/education.py` (`/learn`, `/test`, `/exam`, `/progress`,
`/weaknesses`, `/next`). Сидинг — `scripts/seed_education.py`.

## Реализованные типы вопросов (раздел 22 ТЗ)

Раздел 22 перечисляет 6 типов: multiple choice, true/false, scenario,
diagnostic, workflow, technical. Реализованы первые два — `scenario`,
`diagnostic`, `workflow`, `technical` требуют содержательных сценариев,
для которых пока нет оснований (см. Known issues Phase 11 в
`PROJECT_PLAN.md`).

## Известное ограничение — нет персистентного хранилища

Раздел 40 ТЗ ставит User Profile (SQLite, раздел 19) отдельной **Phase 12,
после** Education Engine. Весь прогресс (`context.user_data["edu_*"]`)
живёт только в памяти процесса и пропадает при перезапуске бота —
`/progress` и `/weaknesses` прямо говорят об этом пользователю. Level
System (раздел 20 ТЗ, Beginner/Junior/.../Senior) не реализован вовсе —
присвоение уровня требует накопленной истории тестов за много сессий,
для которой нет ни хранилища, ни достаточного количества уроков.
