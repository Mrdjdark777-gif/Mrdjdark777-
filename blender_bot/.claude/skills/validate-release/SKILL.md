---
description: Full pre-deploy verification gate -- compileall, full unittest suite (includes the 540-case quality suite), a manual smoke check, only then is a deploy considered safe. Use before pushing/deploying any change to the live bot, not after every file save (this is the heavy Level B gate, ~5 minutes -- see run-regression for the fast Level A check).
---

## Инструкции

Это Level B из двухуровневой схемы проверки проекта — тяжёлый шлюз перед
тем, как считать изменение готовым к деплою на живой сервер
(@Blenderhelpbot, реальные пользователи в Telegram). Не гонять после
каждого сохранения файла — для этого есть Level A (`run-regression`,
плюс автоматический fast-check hook на каждый Edit/Write *.py).

**Важно про cwd.** Сессия запущена из корня репозитория (`TG BOT/`), а
не из `blender_bot/` — venv и tests/ лежат в `blender_bot/`. Сначала
`cd blender_bot` (Bash) / `Set-Location blender_bot` (PowerShell),
только потом команды ниже.

### 1. Compile check (весь проект, не только изменённые файлы)

```
venv\Scripts\python.exe -m compileall -q .
```
Код выхода 0 — синтаксис в порядке. Любой вывод об ошибке — стоп,
разбираться, не продолжать дальше.

### 2. Полный regression suite (включает quality-suite автоматически)

```
venv\Scripts\python.exe -m unittest discover tests
```
Занимает ~5 минут (540-кейсовый quality-suite + full-corpus поисковые
тесты на реальных ~10000+ chunks). Запускай в фоне
(`run_in_background: true` в PowerShell-инструменте), не жди
синхронно. **НЕ запускай параллельно с любым скриптом, который пишет в
`knowledge/*.json`/`terms.json`** — уже дважды в истории проекта это
портило baseline-измерение коллизией записи.

Ожидаемый результат: единственный известный нестабильный тест —
`test_phase7_search_engine.ResponseTimeTests.test_answer_latency_within_limit`
(флейк по времени ответа на большом корпусе, не блокирует деплой).
Любой ДРУГОЙ failure — разобраться в причине, не маскировать.

### 3. Manual smoke test

Прямой вызов через реальный `QAService` (без поднятия самого бота —
`@Blenderhelpbot` уже живой на сервере, второй `python bot.py` локально
с тем же токеном создаст конфликт `getUpdates`, см. CLAUDE.md/
project_bot_live_production в памяти):

```python
from config import HOTKEYS_PATH, UNANSWERED_LOG_PATH, KNOWLEDGE_CHUNK_PATHS, TERMINOLOGY_PATH
from search.qa_service import QAService
qa = QAService(HOTKEYS_PATH, UNANSWERED_LOG_PATH, KNOWLEDGE_CHUNK_PATHS, TERMINOLOGY_PATH)
for q in ["как сделать loop cut", "какой хоткей дублирует объект", "что такое bevel", "фыр мяу тарабарщина"]:
    r = qa.answer(q)
    print(q, "->", r.kind, r.confidence)
```
Проверь на очевидную бессмыслицу (пустой ответ, traceback, явно неверный
chunk на понятный вопрос) — тесты проверяют код, не качество реальных
ответов на реальные формулировки.

### 4. Только теперь — деплой

Коммит → push → SSH на сервер (данные в памяти
`reference_oracle_server_access.md`) → бэкап (`tar --exclude=venv
--exclude=__pycache__`) → `git pull --ff-only` → `sudo systemctl restart
blenderbot` → подожди ~90-150 сек (корпус большой, индексация не
мгновенная) → проверь чистый старт по `journalctl` (строки "app.main -
INFO - Бот запущен" и "Application started", без traceback). Деплой —
действие с реальными последствиями для живых пользователей: если что-то
из этого пайплайна неочевидно или рискованно, уточни у пользователя
перед выполнением, не действуй молча.

## Результат

Чеклист по всем 4 пунктам с реальными числами/статусами (не "готово" без
проверки — раздел 41 ТЗ проекта прямо это запрещает), и явный вывод:
можно деплоить / нет, с причиной.
