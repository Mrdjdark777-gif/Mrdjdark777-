---
description: Run the relevant tests for recent changes, then the full regression gate if the change touches search/knowledge/qa_service or looks risky. Use after implementing a fix or feature in this repo, before considering the change done.
---

## Текущие незакоммиченные изменения

!`git -C "${CLAUDE_PROJECT_DIR}" status --short -- blender_bot`

## Инструкции

Это Level A из двухуровневой схемы проверки проекта (см.
`CLAUDE_CODE_SETUP_REPORT.md`). Быстрее, чем `validate-release`, для
использования в середине работы, не только перед самым концом.

**Важно про cwd.** Сессия запущена из корня репозитория (`TG BOT/`) —
`CLAUDE_PROJECT_DIR` указывает прямо на него (не на `blender_bot/`).
Команда выше это уже учитывает; для команд ниже (шаг 2) сначала перейди
в `blender_bot/` (`cd blender_bot` / `Set-Location blender_bot`).

1. По списку изменённых файлов выше определи затронутые тестовые файлы —
   тестовые файлы называются по фазам (`test_phaseN_*.py`) и темам
   (`test_admin_*.py`, `test_hotkeys_knowledge.py` и т.д.), однозначного
   сопоставления файл→тест нет, ищи по функциям/классам через Grep.

2. Прогони найденные тестовые файлы точечно:
   ```
   venv\Scripts\python.exe -m unittest tests.test_X tests.test_Y -v
   ```
   (из `blender_bot/`, реальный тестовый фреймворк — `unittest`, не
   pytest — pytest в проекте не установлен).

3. Реши, нужен ли полный regression gate прямо сейчас:
   - Изменения только в `bot/handlers/*.py` (форматирование, диалоги) —
     обычно достаточно точечного прогона.
   - Изменения в `search/`, `knowledge/`, `intents/`, `diagnostics/`,
     `education/`, `profile/` — рекомендуй (но не обязательно сразу
     выполняй) `validate-release` перед тем, как считать работу
     законченной, особенно если менялись веса/пороги ranking'а.
   - Любое изменение, где точечный прогон нашёл failures — обязательно
     разберись в причине перед тем, как продолжать (не маскируй
     формулировкой "почти готово", раздел 41 ТЗ проекта).

4. Если точечных тестов не нашлось вообще для изменённого файла — это
   само по себе находка (пробел в покрытии), скажи об этом явно, а не
   молчи.

## Результат

Короткий отчёт: какие файлы прогнаны, точные числа (N tests, M
failures/skips), нужен ли `validate-release` перед тем, как считать
работу законченной, и почему.
