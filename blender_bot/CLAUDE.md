# CLAUDE.md

Правила работы над этим репозиторием для Claude Code. Полное ТЗ —
`docs/Blender_Expert_System_v2_TZ.pdf`. Журнал фаз и статус — `PROJECT_PLAN.md`.

## Что это за проект

Telegram-бот-помощник по Blender, переделываемый в бесплатную экспертную
систему без обязательного внешнего LLM API (раздел 1–2 ТЗ). Работа идёт
поэтапно по 15 фазам из раздела 40 ТЗ; текущий статус — в `PROJECT_PLAN.md`.

## Жёсткие ограничения (раздел 2 ТЗ)

- Основная версия обязана работать **без внешней LLM** (без OpenAI/Anthropic/
  Gemini API). Допустимы Python, SQLite, JSON, YAML, scikit-learn, стандартные
  библиотеки, локальный full-text search, TF-IDF/BM25, Telegram Bot API, Git.
- Локальная LLM может появиться позже как необязательный дополнительный слой,
  не фундамент.

## Архитектура (раздел 39 ТЗ)

```
app/          — composition root: сборка Application, регистрация хендлеров (app/main.py)
bot/          — Telegram-слой: handlers/*, только формат сообщений и диалоги,
                никакой бизнес-логики поиска/диагностики
knowledge/    — база знаний: schema.py/registry.py/version.py/terminology.py
                готовы (Phase 3, 5, 6); official/manual/5.1 заполнен (Phase 4,
                770 chunks); personal/dima_notes заполнен (Phase 3, 70 chunks,
                нужна ручная проверка — см. PROJECT_PLAN.md). Остальные
                official/*, community/*, system/synonyms — ещё пусто.
                С Phase 7 knowledge/ — единственный источник данных для
                живого поиска (через search/engine.py).
search/       — SearchEngine (Phase 7, раздел 10 ТЗ: TF-IDF + terminology
                alias match + version/authority/topic score поверх
                knowledge/ registry), confidence.py (Phase 10, раздел 14:
                HIGH/MEDIUM/LOW/UNKNOWN) и QAService (бизнес-логика ответа
                на вопрос + Conflict Engine раздела 17 — единственная точка
                входа для bot/handlers/qa.py и bot/handlers/inline.py)
intents/      — Intent Engine (Phase 8, раздел 11 ТЗ): классификация типа
                вопроса (WHAT_IS/HOW_TO/...) и темы (RENDERING/RIGGING/...)
                по keywords/patterns. Подключено только к логированию
                unanswered-вопросов (search/qa_service.py); не используется
                для форматирования ответов или диагностики — это Phase 9+
diagnostics/  — Diagnostic Engine (Phase 9, разделы 12-13 ТЗ): decision-tree
                диалог для TROUBLESHOOTING/ERROR-вопросов. 2 проблемы
                засеяны. Единственное место в проекте с состоянием между
                сообщениями (context.user_data в bot/handlers/diagnostics.py)
education/    — Education Engine (Phase 11, раздел 18, 22 ТЗ): /learn,
                /test, /exam, /progress, /weaknesses, /next. 3 урока
                засеяны. С Phase 12 прогресс хранится в SQLite
                (profile/user_profile.py) и переживает перезапуск бота;
                активный quiz (какой вопрос сейчас) остаётся в
                context.user_data — это диалоговое состояние, не история.
                Level System (раздел 20) всё ещё не реализован — 3 урока
                покрывают 1 область компетенций из 10 требуемых
profile/      — пользовательские данные: subscribers.py (список чатов для
                /broadcast) и user_profile.py (Phase 12, раздел 19 ТЗ:
                SQLite, user_id/blender_version/level/topics/
                completed_topics/weak_topics/test_results/mistakes/
                last_questions/learning_goal — level, competency matrix и
                общий topics-охват по всем 10 областям раздела 20 всё ещё
                не заполняются, см. PROJECT_PLAN.md)
tests/        — автотесты
scripts/      — разовые/обслуживающие скрипты (build_manual_index.py)
config/       — настройки, пути к data/
data/         — JSON-данные бота
```

**Не смешивать слои.** Telegram-логика, поиск знаний, диагностика и
хранилище не должны жить в одном файле (это и была главная проблема
исходного `handlers/qa.py` — см. Phase 1/2 в `PROJECT_PLAN.md`). Новый код
для конкретной ответственности должен идти в соответствующую папку, а не
дописываться в `bot/handlers/*`.

`bot.py` в корне — тонкий совместимый entry point для существующего
systemd-юнита на сервере (`ExecStart=... python bot.py`, см.
`DEPLOYMENT.md`); настоящая сборка приложения — в `app/main.py`. Не удалять
и не менять сигнатуру `bot.py`, пока деплой не обновлён явно.

## Правила работы (раздел 41 ТЗ)

- Перед изменением кода — изучить репозиторий, понять, что уже есть и что
  переиспользуется, а что устарело.
- Не переписывать проект целиком без необходимости.
- Не удалять работающий функционал без доказанной причины. Репозиторий
  теперь под git с полной историей на GitHub (см. «Специфика репозитория»
  ниже) — устаревшие файлы можно удалять напрямую после того, как новая
  версия протестирована; старое содержимое остаётся восстановимым через
  `git log`/`git show`.
- Изменения — небольшими этапами, по одной фазе из `PROJECT_PLAN.md` за раз.
- После каждого этапа — запускать тесты (`python -m unittest discover tests`
  или конкретный файл).
- Не утверждать, что функция работает, пока она реально не протестирована.
  Если тест провален — называть конкретную причину, не маскировать
  формулировкой «почти готово».

## Отчёт после каждой фазы (раздел 42 ТЗ)

После завершения фазы — короткий отчёт в этом формате (и запись в
`PROJECT_PLAN.md`):

```
Changed:      что изменено в существующих файлах
Added:        что создано новое
Removed:      что удалено/выведено из употребления
Tests:        какие тесты запущены и с каким результатом
Known issues: известные проблемы/ограничения этой фазы, без приукрашивания
Next phase:   что дальше по PROJECT_PLAN.md
```

## Специфика репозитория

- **Корень git-репозитория — на уровень ВЫШЕ этой папки.** Реальный git и
  связь с GitHub (`github.com/Mrdjdark777-gif/Mrdjdark777-`, ветка
  `claude/create-application-1ltl3a`) находятся в родительской директории
  (та же, где лежит верхнеуровневый `README.md` рядом с `blender_bot/`), а
  не внутри `blender_bot/`. Все git-команды (`git status`, `git add`,
  `git commit`, `git push`) нужно выполнять из родительской папки, иначе
  git не найдёт репозиторий. Все пути внутри коммитов идут с префиксом
  `blender_bot/...`. Эта путаница уже случилась один раз (см.
  PROJECT_PLAN.md, раздел про синхронизацию Phase 2-6) — не повторять.
- `git`/`git push` требуют `C:\Program Files\Git\cmd` в `$env:PATH` —
  переменные окружения PowerShell не сохраняются между вызовами инструмента
  в этой среде, добавлять в начало каждой команды.
- `profile/` как имя пакета совпадает со стандартным модулем `profile`
  (cProfile-related) из stdlib — в проекте это не используется, но если
  когда-то понадобится профилировать код через `import profile`, это имя
  будет перекрыто локальным пакетом.
- `data/user_profile.db` (Phase 12) — реальные данные пользователей,
  в `.gitignore`. Тесты (`tests/test_phase11_education.py`,
  `tests/test_phase12_user_profile.py`) подменяют
  `bot.handlers.education.profile_store` / `bot.handlers.qa.profile_store`
  на временную БД — не трогать этот файл напрямую в новых тестах.
- `data/manual_index.json` и `data/knowledge_base.json` — сырьё для скриптов
  `scripts/build_manual_index.py` / `scripts/migrate_knowledge_base_to_registry.py`
  / `scripts/ingest_manual_to_registry.py`. Живой поиск (`search/engine.py`)
  их больше не читает — с Phase 7 источник только `knowledge/` через
  `config.KNOWLEDGE_CHUNK_PATHS`. `data/manual_index.json` в `.gitignore`
  (регенерируется), `knowledge/official/manual/5.1/manual.json` — в git.
- Язык интерфейса и общения с пользователем бота — русский (раздел 24 ТЗ).
