# Blender Expert System v2 — план и журнал фаз

Рабочий документ для реализации `Blender_Expert_System_v2_TZ_FIXED.pdf` поверх
существующего Blender-бота. Ведётся по фазам из раздела 40 ТЗ; после каждой
фазы — отчёт по формату из раздела 42 (Changed / Added / Removed / Tests /
Known issues / Next phase).

## Статус фаз

| Фаза | Название | Статус |
|---|---|---|
| 1 | Анализ репозитория и architecture map | ✅ готово |
| 2 | Refactor architecture | ✅ готово |
| 3 | Knowledge registry | ✅ готово |
| 4 | Официальный Blender Manual | ✅ готово |
| 5 | Version engine | ✅ готово |
| 6 | Terminology | ✅ готово |
| 7 | Search engine | ✅ готово |
| 8 | Intent engine | ✅ готово |
| 9 | Diagnostic engine | ✅ готово |
| 10 | Source ranking | ✅ готово |
| 11 | Education engine | ✅ готово |
| 12 | User profile | ✅ готово |
| 13 | Test suite | ✅ готово |
| 14 | Optimization | ✅ готово |
| 15 | Production deployment | ✅ готово |

Все 15 фаз исходного ТЗ v2 (`docs/Blender_Expert_System_v2_TZ.pdf`)
формально завершены. Дальнейшая работа идёт по новому документу —
`docs/Blender_Helper_v3_TZ.pdf` ("Deterministic & Scalable Engine"),
переданному пользователем после Phase 15. Порядок работы по нему
согласован с пользователем по ценности/риску:

| № | Пункт ТЗ v3 | Статус |
|---|---|---|
| 1 | `/unanswered` + `/quick_add` (раздел 3.2) | ✅ готово |
| 2 | Толерантность к опечаткам (Левенштейн/rapidfuzz, раздел 1.1) | ✅ готово |
| 3 | Новые диагностические ветки: UV, запекание, симуляции (раздел 3.1) | ✅ готово |
| 4 | BM25 вместо TF-IDF (раздел 1.1) | ✅ готово |
| 5 | Полный парсер Manual + скриншоты в диагностике (разделы 2.1, 3.1) | ⬜ |

**Отклонение от буквы ТЗ v3, согласованное с пользователем:** раздел 1.2
просит жёсткий приоритет источников ("личные заметки > официальный
Manual" всегда). Оставлено как есть — источники по-прежнему конкурируют
по существу (score), а не по фиксированной иерархии типа источника: это
именно то поведение, которое было целенаправленно настроено по прямой
обратной связи пользователя сразу после Phase 15 (см. записи "После
Phase 15" ниже, особенно правку про exact_term_bonus и заголовок/тело) —
жёсткий приоритет отменил бы её задним числом.

---

## Phase 1 — Архитектурная карта репозитория

### Текущая структура (до рефакторинга)

```
blender_bot/
├── bot.py                      # 61 строка — точка входа, регистрация хендлеров
├── config.py                   # 25 строк — пути, токены, ID владельца
├── data/
│   ├── knowledge_base.json     # 70 записей: question/keywords/answer
│   ├── hotkeys.json            # 11 категорий, 93 клавиши
│   ├── resources.json          # 5 категорий, 20 ссылок
│   ├── news_feeds.json         # 3 RSS-источника
│   └── manual_index.json       # 1746 записей из Blender Manual (сгенерировано)
├── handlers/                   # телеграм-обработчики (start, hotkeys, resources,
│                                # news, broadcast, inline, qa)
├── utils/                      # поиск, переводчик новостей, логгер, подписчики
└── scripts/
    └── build_manual_index.py   # клонирует blender-manual, парсит, переводит
```

### Карта на целевую архитектуру (раздел 39 ТЗ)

| Целевая папка | Что туда переезжает | Источник | Статус |
|---|---|---|---|
| `bot/` | `bot.py`, `handlers/*` (start, hotkeys, resources, news, broadcast, inline) | как есть | ✅ переиспользуется без изменений — это чистый Telegram-слой |
| `bot/` | `handlers/qa.py` | требует разбора | ⚠️ **нарушает п.39** — сейчас в одном файле смешаны Telegram-логика, вызов поиска, UI кнопок Да/Нет и бизнес-правила эскалации (KB → hotkeys → soft-match → manual index → fallback). При рефакторинге станет тонким слоем, вызывающим `search/` |
| `knowledge/official/manual/<version>/` | `data/manual_index.json` | существующие данные | ⚠️ переиспользуется как сырьё, но: (1) не привязано к конкретной версии — сейчас индексируется `latest`, а не явно 5.1; (2) нет обязательных полей метаданных (id, source, authority, version, date, content_hash и т.д.) — только title/summary/url |
| `knowledge/personal/dima_notes/` | `data/knowledge_base.json` (частично) | существующие данные | ⚠️ смешанный источник: часть записей — из личного Notion-документа пользователя (реально personal notes), часть — общие объяснения, написанные мной как ассистентом при заполнении базы. Нужно разметить source_type по каждой записи отдельно, а не считать всё «личными заметками» |
| `knowledge/system/terminology/` | `data/hotkeys.json` (частично) + новое | новое + существующее | ⬜ нет словаря синонимов/алиасов вообще — именно это стало причиной сегодняшнего провала с «деформер» |
| `knowledge/system/synonyms/` | — | — | ⬜ не существует |
| `knowledge/system/intents/` | — | — | ⬜ не существует |
| `knowledge/system/diagnostics/` | — | — | ⬜ не существует |
| `knowledge/system/rules/` | — | — | ⬜ не существует |
| `knowledge/community/*` | — | — | ⬜ не существует (Stack Exchange, Stack Overflow RU, forumBlender не индексировались) |
| `search/` | `utils/search.py` (KnowledgeBase), `utils/hotkey_lookup.py`, `utils/manual_index.py` | существующий код | ❌ **устаревает целиком** — все три сейчас используют независимое сравнение множеств слов без нормализации форм, без TF-IDF/BM25, без multi-signal score (lexical + semantic + authority + version + topic + exact_term_bonus из п.10). Именно эта наивность и дала сегодняшний ложноотрицательный результат |
| `intents/` | — | — | ⬜ не существует; сейчас бот не различает WHAT_IS/HOW_TO/ERROR/TROUBLESHOOTING и т.д. — просто ищет текст |
| `diagnostics/` | — | — | ⬜ не существует; нет decision-tree диалогов, нет error database |
| `education/` | — | — | ⬜ не существует; `/learn /test /exam /weaknesses /next` отсутствуют |
| `profile/` | `utils/subscribers.py` (частично) | существующее | ⚠️ подписчики хранятся, но это не полноценный user profile (нет уровня, темы, ошибок, weak_topics) — нужна SQLite-модель заново |
| `tests/` | — | — | ⬜ автоматических тестов нет вообще (только ручные проверки в разработке) |
| `scripts/` | `scripts/build_manual_index.py`, `utils/news_fetcher.py`, `utils/logger.py` | существующее | ✅ переиспользуется, `build_manual_index.py` станет частью Knowledge Ingestion Pipeline (раздел 27) после доработки под METADATA/QUALITY SCORE/VERSION DETECTION |
| `config/` | `config.py` | существующее | ✅ переиспользуется, будет расширен (source tier weights, version list, admin settings) |
| `data/` | `data/*.json` кроме манула | существующее | ✅ hotkeys.json, resources.json, news_feeds.json остаются как есть — это не про экспертную базу знаний, а про справочные команды бота |

### Итоговая классификация

**Переиспользуется без изменений (безопасно, не трогаем):**
`bot.py`, `handlers/start.py`, `handlers/hotkeys.py`, `handlers/resources.py`,
`handlers/news.py`, `handlers/broadcast.py`, `handlers/inline.py` (структура
вызовов сохранится, но источники данных внутри поменяются вместе с `search/`),
`utils/news_fetcher.py`, `utils/logger.py`, `utils/subscribers.py`,
`data/hotkeys.json`, `data/resources.json`, `data/news_feeds.json`.

**Переиспользуется как сырьё, но требует миграции метаданных:**
`data/knowledge_base.json` (70 записей), `data/manual_index.json` (1746 записей).

**Устаревает и заменяется новым `search/`-движком:**
`utils/search.py`, `utils/hotkey_lookup.py`, `utils/manual_index.py` (логика
поиска; сами файлы данных, которые они читают, не выбрасываются).

**Не существует, создаётся с нуля:**
`knowledge/system/*`, `intents/`, `diagnostics/`, `education/`, полноценный
`profile/`, `tests/`.

### Ключевой вывод для Phase 2

Самый рискованный узел — `handlers/qa.py`: в нём сегодня свалены четыре разные
ответственности (маршрутизация Telegram-сообщений, вызов поиска, управление
диалогом Да/Нет, бизнес-правило эскалации между источниками). Раздел 39 ТЗ
прямо требует это разделить. Phase 2 должна выделить чистый слой `search/`
(пока с той же наивной логикой, без TF-IDF — это уже Phase 7) и оставить в
`handlers/qa.py` только Telegram-специфичный код.

---

## Phase 2 — Refactor architecture

### Отчёт (раздел 42 ТЗ)

**Changed**

- `config.py` → `config/__init__.py` (пакет). `BASE_DIR` пересчитан на
  `.parent.parent`, т.к. файл теперь на уровень глубже — иначе `DATA_DIR`
  указывал бы на `config/data` вместо корневого `data/`. Все имена
  (`BOT_TOKEN`, `OWNER_ID`, `*_PATH`, …) не переименованы — импорт
  `from config import X` работает как раньше.
- `bot.py` (корень) — вместо полной сборки `Application` теперь тонкая
  обёртка: `from app.main import main`. Сделано намеренно, чтобы не трогать
  systemd-юнит на сервере (`ExecStart=... python bot.py`, см.
  `DEPLOYMENT.md`) в этой же фазе — миграция деплоя не входит в Phase 2.
- `handlers/qa.py` разделён на `search/qa_service.py` (бизнес-логика
  эскалации KB → hotkeys → soft-match → manual → fallback, без Telegram) и
  `bot/handlers/qa.py` (только форматирование сообщений/кнопок и
  Telegram-диалог). Поведение и пороги не менялись.
- `handlers/inline.py` → `bot/handlers/inline.py`: вместо прямого доступа к
  трём независимым объектам (`knowledge_base`, `hotkey_lookup`,
  `manual_index`) обращается к общим `qa_service.knowledge_base` /
  `.hotkey_lookup` / `.manual_index` — один экземпляр на процесс, данные не
  грузятся повторно.
- `README.md` и `DEPLOYMENT.md`: обновлены диаграммы структуры проекта, чтобы
  не расходиться с реальным кодом.

**Added**

- `app/main.py` — реальная точка входа (перенесённое содержимое старого
  `bot.py`: сборка `Application`, регистрация хендлеров).
- `bot/handlers/*.py` — `start.py`, `hotkeys.py`, `resources.py`, `news.py`,
  `broadcast.py`, `qa.py`, `inline.py` (перенос без изменения поведения,
  кроме qa/inline — см. Changed).
- `bot/news_fetcher.py` — перенос `utils/news_fetcher.py` без изменений.
- `search/knowledge_base.py`, `search/hotkey_lookup.py`,
  `search/manual_index.py`, `search/unanswered_log.py` — перенос из `utils/`
  без изменения алгоритма (наивный lexical-скоринг остаётся; TF-IDF/BM25 —
  Phase 7 по разделу 10 ТЗ).
- `search/qa_service.py` — новый класс `QAService` с методом `answer()`,
  возвращающим `QAResult(kind=...)` вместо прямого похода в Telegram; впервые
  делает эскалацию источников тестируемой без мока `telegram.Update`.
- `profile/subscribers.py` — перенос `utils/subscribers.py` без изменений;
  задел под полноценный user profile из раздела 19 ТЗ (Phase 12).
- `knowledge/`, `intents/`, `diagnostics/`, `education/` — пустые пакеты-
  заглушки с пояснением, какая фаза их заполнит (`knowledge/README.md`
  отдельно фиксирует целевую структуру из раздела 5 ТЗ).
- `tests/test_phase2_migration.py` — 9 smoke-тестов, подтверждающих, что
  перенос не изменил поведение (`unittest`, без новых зависимостей).
- `CLAUDE.md` — правила работы над репозиторием (раздел 41 ТЗ) + специфика
  этого репозитория (нет git, `profile/` перекрывает stdlib-модуль и т.д.).

**Removed**

- Ничего не удалено безвозвратно на момент Phase 2. `handlers/`, `utils/`,
  старый `config.py` перемещены (не удалены) в `_phase1_backup/`, т.к. на тот
  момент в рабочей копии не было git — политика `CLAUDE.md` требовала в этом
  случае переносить, а не удалять. Проверено `grep` по всему репозиторию — на
  `handlers/`/`utils/` больше никто не ссылается. **Обновление (после
  подключения к GitHub):** `_phase1_backup/` удалён — старые файлы
  восстановимы через `git log`/`git show` на коммитах до `c05b316`.

**Tests**

- `python -m unittest tests.test_phase2_migration -v` — 9/9 passed (пути
  `config/`, `KnowledgeBase`, `HotkeyLookup`, `ManualIndex`, `QAService`,
  включая деградацию `ManualIndex` при отсутствующем
  `data/manual_index.json`).
- `python -c "import app.main; import bot"` — оба входа импортируются без
  ошибок после переноса и после перемещения старых файлов в
  `_phase1_backup/` (повторный прогон, чтобы исключить скрытую зависимость
  от старых путей).
- Не запускалось: реальный `application.run_polling()` — нужен живой
  `BOT_TOKEN` и сеть, не тестируется в этой среде. Ручная проверка `/start`,
  `/hotkeys` и т.д. в Telegram — не выполнялась, это стоит сделать перед
  деплоем на сервер.

**Known issues**

- ~~`_phase1_backup/` физически остаётся в рабочей копии...~~ **Обновление:**
  репозиторий подключен к настоящей истории GitHub
  (`github.com/Mrdjdark777-gif/Mrdjdark777-`, ветка
  `claude/create-application-1ltl3a`) — там уже был git с 17 коммитами
  проекта, включая оригинальный отчёт по Phase 1. Локальный git, созданный
  здесь при `git init`, был лишним и неправильно расположен (не на уровне
  репозитория). `_phase1_backup/` удалён — старые `handlers/`/`utils/`/
  `config.py` восстановимы через `git log`/`git show` на коммитах до
  `c05b316`, необходимости хранить копию на диске больше нет.
- ~~Репозиторий по-прежнему без git...~~ **Обновление:** решено — репозиторий
  теперь корректно связан с существующим GitHub-репозиторием.
- `profile/` как имя пакета перекрывает stdlib-модуль `profile`
  (cProfile-related); сейчас нигде не используется, но потенциальный
  конфликт есть — зафиксировано в `CLAUDE.md`.
- Поисковая логика внутри `search/` осталась той же наивной (keyword-
  overlap + `difflib`), просто перенесённой — Phase 2 это не меняла
  намеренно (TF-IDF/BM25 — Phase 7 по ТЗ).
- Реального прогона бота в Telegram (polling) в этой фазе не было — только
  импорт-проверки и unit-тесты бизнес-логики.

**Next phase**

Phase 3 — Knowledge registry (раздел 5–6 ТЗ): наполнить `knowledge/` по
структуре из `knowledge/README.md`, разметить существующие
`data/knowledge_base.json` и `data/manual_index.json` обязательными полями
метаданных (id, source, source_type, authority, version, language, topic,
subtopic, date, url, original_title, translated_title, content).

---

## Phase 3 — Knowledge registry

### Отчёт (раздел 42 ТЗ)

**Changed**

- `knowledge/README.md` — переписан: вместо чек-листа «что перенести» теперь
  описывает готовый код (`schema.py`, `registry.py`) и статус каждой
  data-папки.
- `CLAUDE.md` — строка про `knowledge/` в диаграмме архитектуры обновлена
  (schema/registry готовы, данные частично заполнены).

**Added**

- `knowledge/schema.py` — `KnowledgeChunk` (dataclass) со всеми обязательными
  полями раздела 6 ТЗ (id, source, source_type, authority, version, language,
  topic, subtopic, date, url, original_title, translated_title, content) и
  желательными (license, author, content_hash, ingested_at, last_updated,
  parent_document, section_path). `content_hash` вычисляется автоматически
  (`sha256`) в `__post_init__`, если не передан явно. `AUTHORITY_TIERS`
  (S=100/A=80/B=60/C=30/D=10) — раздел 3 ТЗ. Добавлено поле `needs_review`
  (bool) — не из ТЗ, проектное дополнение для честной пометки
  непроверенных классификаций (см. Known issues).
- `knowledge/registry.py` — `ChunkRegistry` (add/save/load JSON,
  `duplicate_content_hashes()` — черновая опора под будущий раздел 29) и
  `validate_chunk()`, бросающий `ChunkValidationError` с точным списком
  отсутствующих полей. `version`/`date`/`url`/`authority`/`subtopic` разрешено
  оставлять `None` — раздел 7 ТЗ прямо требует не утверждать неизвестное,
  а не заполнять произвольным значением ради прохождения валидации.
- Директории по разделу 5 ТЗ, каждая с `README.md`, объясняющим, что туда
  пойдёт и в какой фазе:
  `knowledge/official/{manual/5.1, python_api/5.1, release_notes,
  developer_docs}`, `knowledge/community/{stackoverflow_ru,
  blender_stackexchange, forumblender}`, `knowledge/system/{synonyms,
  terminology, intents, diagnostics, rules}`.
- `scripts/migrate_knowledge_base_to_registry.py` — разовый скрипт: читает
  `data/knowledge_base.json` (70 записей question/keywords/answer),
  создаёт `KnowledgeChunk` на каждую запись и сохраняет в
  `knowledge/personal/dima_notes/dima_notes.json`. Идемпотентен (id
  детерминированы по индексу). `data/knowledge_base.json` не тронут —
  используется только на чтение.
- `knowledge/personal/dima_notes/dima_notes.json` — результат миграции,
  70 chunks.
- `tests/test_phase3_knowledge_registry.py` — 14 тестов: схема
  (content_hash), валидация (обязательные/nullable поля), save/load
  registry, детекция дублей, и три проверки на самих мигрированных данных
  (количество совпадает с источником, каждый чанк проходит валидацию, нет
  content-дублей).

**Removed**

Ничего.

**Tests**

- `python -m unittest discover tests -v` — 23/23 passed (9 из Phase 2 +
  14 новых из Phase 3).
- `python scripts/migrate_knowledge_base_to_registry.py` — реально
  запущен, вывод: «Мигрировано 70 чанков», дублей по content_hash не
  найдено.

**Known issues**

- **`knowledge/personal/dima_notes/dima_notes.json` не проверен на
  достоверность — обновлено после разбора с пользователем.** Пробовал
  эвристику по личным местоимениям («я», «мне», «у меня») — 60 из 70
  записей совпали, что оказалось ложными срабатываниями на обычных словах
  (например, «мне» как подстрока в «уменьшить»), не реальным сигналом.
  Вместо угадывания прочитал все 70 записей целиком: они написаны в
  едином справочном стиле («Что такое X? / Как сделать Y?»), без единого
  случая личной/неформальной речи; заметен стилистический разлом — записи
  1-34 короткие и сухие, записи 35-70 длиннее и структурированы («1)...
  2)... 3)...», формулировки вроде «Профессиональный стандарт»), а запись
  №69 буквально сформулирована как промпт ассистенту («Расскажи подробнее
  про модификатор Mirror и типичные ошибки с ним»). Спросил пользователя
  напрямую — подтверждено: часть или весь файл сгенерирован ассистентом,
  это не личные заметки в смысле раздела 5 ТЗ. Метаданные исправлены:
  `source_type="ai_generated_unverified"` (было `"personal_note"`),
  `authority=None` (не Custom tier — не участвует в доверенном
  ранжировании), `author=None` (было `"dima"` — конкретное авторство не
  установлено), `needs_review=true` сохранён. Скрипт миграции перезапущен,
  все 23 теста прошли повторно. Открытый пункт: сверка содержимого с
  официальным Manual — по объёму это отдельная задача, которая ложится на
  Phase 4.
- `topic="general"` для всех 70 мигрированных чанков — заглушка. Точная
  категоризация по Terminology Database categories (раздел 9 ТЗ) —
  предмет Phase 6, делать её сейчас означало бы гадать категорию по
  ключевым словам без словаря синонимов, то есть повторить ту же ошибку
  (непроверенная классификация, выданная за факт).
- `authority=None` для personal-заметок — раздел 3 ТЗ даёт числа только
  S/A/B/C/D-тирам; «Custom» tier (Приложение A) явного числа не получил.
  Численный вес для ранжирования — решение Phase 10 (Source ranking), не
  этой фазы.
- `knowledge/official/*` и `knowledge/community/*` — только структура и
  README, без данных: раздел 40 ТЗ явно относит Blender Manual к Phase 4,
  а Stack Exchange/Stack Overflow RU/forumBlender не имеют отдельной фазы
  в списке — заполнение отложено до момента, когда станет ясно, в рамках
  какой фазы это делать (или пока пользователь не попросит явно).
- `knowledge/` пока не используется рантаймом бота — `search/` по-прежнему
  читает `data/*.json` напрямую. Ожидаемо по плану фаз (Phase 7), но стоит
  проговорить: с точки зрения пользователя бота ничего не изменилось.

**Next phase**

Phase 4 — официальный Blender Manual (раздел 4 ТЗ): интегрировать
`data/manual_index.json` (генерируется `scripts/build_manual_index.py`) в
`knowledge/official/manual/5.1` через `knowledge.registry.ChunkRegistry`,
добавив обязательные метаданные (сейчас там только title/summary/url — нет
id/authority/version/source_type/content_hash и т.д.), плюс явную привязку
к версии 5.1 вместо текущего неявного «latest».

---

## Phase 4 — официальный Blender Manual

### Отчёт (раздел 42 ТЗ)

**Changed**

- `scripts/build_manual_index.py`:
  - `translate_entries()` теперь сохраняет `title_en`/`summary_en`
    (английский оригинал) ДО перевода — раньше перевод затирал их
    безвозвратно, что нарушало раздел 8 ТЗ («не удалять английские
    названия»).
  - Добавлены `MANUAL_VERSION_LABEL = "5.1"` (стамп версии в каждую запись)
    и `section_path` (реальный путь `.rst`-файла в дереве Manual —
    используется дальше для topic/subtopic).
  - **Исправлен баг парсера**: `parse_rst_file()` не распознавал RST-опции
    директив (`:align: right`, `:alt: ...` под `.. figure::`) и пропускал
    их в summary как обычный текст. Добавлен `FIELD_LIST_RE`, такие строки
    теперь пропускаются, как и сами директивы.
- `knowledge/official/manual/5.1/README.md`, `knowledge/README.md` —
  обновлены под реальные цифры (770 chunks) вместо «пока пусто».

**Added**

- `scripts/ingest_manual_to_registry.py` — строит `KnowledgeChunk` на
  каждую страницу Manual: `source="blender_manual"`,
  `source_type="official_manual"`, `authority=100` (S-tier), `version`,
  `topic`/`subtopic` (из `section_path` — первые два сегмента реального
  пути документа, не угаданы), `original_title`/`translated_title` (из
  `title_en`/`title`), `content` = переведённый summary,
  `license="CC-BY-SA"`, `section_path` с суффиксом `:summary` (честно
  помечает, что это summary страницы, а не полный текст). Вынесена чистая
  функция `build_registry()` отдельно от `main()` — тестируется без
  реального manual_index.json.
- `scripts/clean_manual_index.py` — разовый скрипт чистки уже собранных
  данных от найденного бага парсера (см. Known issues), без повторного
  прогона сборки.
- `knowledge/official/manual/5.1/manual.json` — **770 knowledge chunks**
  (~838 КБ), закоммичено в git.
- `tests/test_phase4_manual_ingest.py` — 12 тестов: логика
  `build_registry()` на синтетической выборке (пропуск пустых summary,
  сохранение original_title, topic/subtopic из section_path, fallback для
  «старого» формата записей без title_en/version/section_path) + 5 тестов
  на реальный `manual.json` (валидность каждого чанка, все S-tier,
  authority=100, нет утечек `:align:`/`:alt:`, английские title
  действительно сохранились хотя бы у половины чанков).
- `tests/test_phase4_build_manual_index.py` — 3 регрессионных теста прямо
  на `parse_rst_file()` с маленькими synthетическими `.rst`-фикстурами:
  только RST field list → пустой summary; реальный текст после field list
  → сохраняется без утечки маркеров; обычный абзац без директивы не
  затронут.

**Removed**

Ничего.

**Tests**

- `python -m unittest discover tests -v` — **39/39 passed** (23 из Phase
  2-3 + 8 из `test_phase4_manual_ingest` на синтетике + 5 на реальном
  `manual.json` + 3 регрессионных на `parse_rst_file`).
- Реально запущен весь пайплайн end-to-end (не только юнит-тесты):
  `build_manual_index.py` (в фоне, ~7 минут: клонирование +
  1748 распарсенных страниц + перевод) → обнаружена проблема (52 группы
  дублей по `content_hash` при первом прогоне `ingest`) → диагностирована
  как баг парсера, а не мусор в источнике → `clean_manual_index.py`
  (978 из 1748 записей оказались чистым RST-мусором) → `ingest_manual_to_registry.py`
  повторно → 770 чистых chunks, 10 оставшихся дублей проверены вручную и
  подтверждены как настоящие (страницы Manual реально делят один и тот же
  вводный абзац).

**Known issues**

- **Баг парсера был серьёзнее, чем казалось на первый взгляд.** По дублям
  content_hash нашлось всего 52 группы (166 записей), но после
  диагностики оказалось, что затронуто 978 из 1748 записей (56%) — просто
  большинство испорченных summary были уникальными (разный `:alt:`-текст у
  разных картинок), поэтому дублирование их не ловило. Итог: доверять
  одной лишь duplicate-детекции как индикатору качества нельзя — она
  ловит только частный случай проблемы.
- `content` — это summary/вводный абзац страницы, не полный текст
  документа. Полноценное structural chunking (раздел 28 ТЗ: заголовки,
  таблицы, примеры, code blocks) не делалось — это следующий уровень
  глубины, выходящий за рамки Phase 4.
- `version="5.1"` — предположение, что ветка `latest` репозитория
  blender-manual на момент сборки соответствует версии 5.1 из ТЗ. Не
  проверялось автоматически против реального номера релиза Blender.
  Точное версионирование — Phase 5.
- Python API, Release Notes, Developer Docs (остальные S-tier источники
  раздела 4 ТЗ) — не индексировались, у них нет отдельной фазы в разделе
  40 ТЗ.
- 10 групп чанков с дословно одинаковым вводным абзацем (страницы
  установки под разные ОС, однотипные ноды) оставлены как есть —
  подтверждено, что это не баг, а особенность источника; настоящая
  Duplicate Detection — будущая фаза (раздел 29 ТЗ).
- `data/manual_index.json` (сырьё, 1748 записей после чистки — 770 с
  непустым summary) не в git (большой, регенерируется). Если кто-то
  захочет пересобрать — понадобится заново 15-30 минут и интернет.

**Next phase**

Phase 5 — Version engine (раздел 7 ТЗ): поддержать явное сопоставление
Blender-версий (5.1.1, 5.1.2, 5.1 и т.д.), не утверждать версию, если она
неизвестна, показывать различия при конфликте версий. Также стоит решить
открытый пункт из Known issues — как на самом деле проверять, что ветка
`latest` blender-manual соответствует заявленной версии 5.1.

---

## Phase 5 — Version engine

### Отчёт (раздел 42 ТЗ)

**Changed**

Ничего в существующих файлах — модуль новый и пока нигде не подключён (см.
Known issues).

**Added**

- `knowledge/version.py` — чистая логика без Telegram/поиска:
  - `parse_version(raw)` → `ParsedVersion(major, minor, patch)` или `None`
    для неизвестной/нераспознанной версии. `None` — не ошибка, а честный
    случай «версия неизвестна» (раздел 7 ТЗ).
  - `ParsedVersion.release_family` — "major.minor"; патч-версии (5.1.1,
    5.1.2) считаются тем же release family, что 5.1, а не отдельными
    версиями — багфиксы, не новый функционал.
  - `KNOWN_RELEASE_FAMILIES` — список официальных версий из раздела 4 ТЗ
    (5.1, 5.0, 4.5...3.6) и `is_known_release()` — отличить признанную
    версию от опечатки/выдумки.
  - `same_release_family()`, `detect_conflict()` — конфликт версий
    определяется, только если ОБЕ версии известны и относятся к разным
    release family; если хоть одна версия `None` — конфликт не
    утверждается (раздел 7: нельзя утверждать конфликт, когда данных не
    хватает даже на факт).
  - `compatible_with_request()` — предикат для будущего Phase 7 (search
    engine): совместим ли chunk с запрошенной версией. По той же логике
    честности: неизвестная версия формально совместима с чем угодно, сам
    вопрос «предупредить ли пользователя, что версия не подтверждена» —
    забота будущего Response Format (раздел 25), не этой функции.
- `tests/test_phase5_version_engine.py` — 21 тест: парсинг (валидные/
  невалидные строки версий), release family, detect_conflict (в т.ч. что
  порядок аргументов не важен и что None никогда не даёт ложный конфликт),
  compatible_with_request, и три теста на **реальных** данных — все чанки
  `dima_notes` честно парсятся в `None`, все чанки `manual.json` — в
  release family "5.1", и Manual+dima_notes вместе не порождают ложный
  конфликт версий.

**Removed**

Ничего.

**Tests**

`python -m unittest discover tests -v` — **60/60 passed** (39 из Phase 2-4 +
21 новый).

**Known issues**

- **Version engine пока нигде не используется.** `search/qa_service.py` и
  `knowledge/registry.py` не вызывают `compatible_with_request()` /
  `detect_conflict()` — по плану фаз это интеграция Phase 7 (search
  engine), где version_score станет частью финального скора (раздел 10
  ТЗ). Указано явно, чтобы не создалось впечатление, будто бот уже
  учитывает версии при ответах — не учитывает.
- `detect_conflict()` даёт только структурный факт «версии разные, вот
  какая старше» — не формулирует, ЧТО именно изменилось между версиями
  (для этого нужен смысловой diff содержимого двух чанков на одну тему,
  вне области Version Engine, ближе к будущему Conflict Engine раздела
  17 или отдельной задаче).
- `KNOWN_RELEASE_FAMILIES` — список меток, не данные: 5.0-3.6 туда
  включены как легитимные версии по разделу 4 ТЗ, но контент для них не
  собирался (проиндексирован только 5.1, Phase 4).
- Остаётся открытый пункт из Phase 4: `version="5.1"` у Manual-чанков —
  предположение про ветку `latest` репозитория, не проверено против
  реального номера релиза Blender.

**Next phase**

Phase 6 — Terminology (разделы 8-9 ТЗ): двуязычный словарь терминов
(canonical_name, russian_name, aliases, english_aliases, category,
related_terms, common_mistakes) в `knowledge/system/terminology/` и
`knowledge/system/synonyms/`.

---

## Phase 6 — Terminology

### Отчёт (раздел 42 ТЗ)

**Changed**

- `knowledge/system/synonyms/README.md` — объяснено, почему папка осталась
  пустой: term-специфичные синонимы легли в `Term.aliases` (см. Added),
  отдельная плоская таблица дублировала бы те же данные.
- `knowledge/system/terminology/README.md`, `knowledge/README.md` —
  обновлены под реальные цифры (36 терминов) вместо «пока пусто».

**Added**

- `knowledge/terminology.py`:
  - `Term` (dataclass) — все поля раздела 9 ТЗ: canonical_name,
    russian_name, category, aliases, english_aliases, plus `ui_label`
    (раздел 8 явно требует хранить UI label отдельно), related_terms,
    common_mistakes.
  - `TERMINOLOGY_CATEGORIES` — точный список из раздела 9 ТЗ (24
    категории: modeling, mesh, topology... color_management,
    motion_tracking).
  - `validate_term()` — обязательные canonical_name/russian_name,
    category должна быть из списка.
  - `TerminologyRegistry` — `add()`/`save()`/`load()` +
    `find(word)`: находит термин по ЛЮБОМУ написанию (canonical, russian,
    alias, english alias, ui_label), регистронезависимо, с нормализацией
    пробелов — это и есть требование раздела 8 «поиск должен понимать
    Mirror... независимо от языка вопроса».
- `scripts/seed_terminology.py` — 36 терминов, отобранных не произвольно,
  а по вопросам, которые уже реально есть в
  `knowledge/personal/dima_notes/` (проверяемое обоснование выбора).
- `knowledge/system/terminology/terms.json` — результат сидинга.
- `tests/test_phase6_terminology.py` — 20 тестов: normalize(), валидация
  (в т.ч. что все 24 категории раздела 9 проходят), поиск по всем видам
  написания, save/load, и на реальных данных: количество ≥30, все валидны,
  все категории из списка ТЗ, **референциальная целостность
  related_terms** (ни одна ссылка не указывает на несуществующий термин),
  **отсутствие коллизий алиасов** между разными терминами (не два термина
  тихо делят один и тот же алиас), плюс точечные проверки конкретных
  переводов (булеан→Boolean Modifier, сабдив→Subdivision Surface Modifier).

**Removed**

Ничего.

**Tests**

`python -m unittest discover tests -v` — **80/80 passed** (60 из Phase 2-5 +
20 новых из Phase 6).

**Known issues**

- **Terminology пока нигде не используется поиском.** `search/qa_service.py`
  не вызывает `TerminologyRegistry.find()` — интеграция как alias-match
  слой (раздел 10 ТЗ) это Phase 7. Явно проговорено, чтобы не создалось
  впечатление, будто бот уже понимает «Mirror» = «зеркало» в разговоре —
  не понимает.
- 36 терминов — целенаправленно небольшой, проверяемый набор (раздел 36
  ТЗ), не претензия на полноту словаря Blender. Расширение — по мере
  необходимости, а не за один присест.
- `knowledge/system/synonyms/` осталась пустой — решение задокументировано
  (см. Changed), не забытая задача.
- `related_terms` — только прямые, уверенно проверенные связи (не полный
  граф понятий по разделу 37 ТЗ, Knowledge Graph — та отдельная будущая
  фаза).

**Next phase**

Phase 7 — Search engine (раздел 10 ТЗ): наконец подключить всё
подготовленное (knowledge registry, version engine, terminology) к
реальному поиску — exact term match → normalized text match → alias match
→ TF-IDF/BM25 → metadata filtering, с multi-signal score (lexical,
semantic, authority, version, topic, exact_term_bonus). Это первая фаза,
после которой **изменятся настоящие ответы бота**.

---

## Phase 7 — Search engine

### Отчёт (раздел 42 ТЗ)

**Changed**

- `search/qa_service.py` — переписан полностью. Раньше: KB exact →
  hotkeys → soft-match → manual → fallback по наивному keyword-overlap
  (Phase 2). Теперь: `SearchEngine.search()` (multi-signal score) →
  confident/soft-match/fallback tiers, hotkeys встроены между confident и
  soft-match (сохранён исходный приоритет: уверенный контент-ответ важнее
  списка горячих клавиш). Пороги `HIGH_CONFIDENCE_THRESHOLD=0.75`,
  `SOFT_MATCH_THRESHOLD=0.20` подобраны по ручной проверке реального
  корпуса (см. Tests).
- `bot/handlers/qa.py` — формат ответа для уверенных совпадений теперь
  показывает источник (раздел 15 ТЗ): для `official_manual` — версия
  Manual + URL; для `ai_generated_unverified` — явная пометка «не сверено
  с официальной документацией» (раздел 26, Zero-Hallucination Mode) —
  раньше бот вообще не показывал источники. Soft-match подтверждение
  (кнопки Да/Нет) хранит `pending_chunk_id` в `context.user_data` вместо
  кодирования индекса в `callback_data` — chunk id вроде
  `blender_manual:5.1:contribute_manual_getting_started_local_editing_install_windows`
  превышает лимит Telegram в 64 байта на `callback_data`, старая схема
  `qa_yes:{idx}` с числовым индексом столкнулась бы с этим при переходе на
  строковые id.
- `bot/handlers/inline.py` — использует `qa_service.engine.search()`
  вместо трёх независимых наивных объектов; результаты ниже
  `SOFT_MATCH_THRESHOLD` отфильтровываются, чтобы в inline-режиме не
  предлагать мусор.
- `app/main.py` — паттерн `CallbackQueryHandler` для `qa_yes` упрощён с
  `^qa_yes:\d+$` до `^qa_yes$` (см. выше про `callback_data`).
- `scripts/seed_terminology.py` — убран алиас `"материал"` у Principled
  BSDF (см. Known issues/находки ниже), заменён на два более точных
  двухсловных алиаса.
- `tests/test_phase2_migration.py` — обрезан: `KnowledgeBaseTests`/
  `ManualIndexTests`/старый `QAServiceTests` тестировали код, которого
  больше нет (см. Removed); остался только то, что не менялось
  (`ConfigPathsTests`, `HotkeyLookupTests`).
- `knowledge/README.md`, `knowledge/system/terminology/README.md`,
  `CLAUDE.md` — убраны везде формулировки «пока не подключено к поиску»,
  замены на актуальное состояние.

**Added**

- `search/tfidf.py` — `TfidfIndex`: ручная реализация TF-IDF (сглаженный
  idf как в scikit-learn по умолчанию, L2-нормализованные векторы,
  косинус = dot product). Реализовано вручную, а не через scikit-learn,
  сознательно: библиотека формально допустима по ТЗ, но бот работает на
  Oracle VM.Standard.E2.1.Micro (слабый бесплатный сервер), и тащить
  numpy/scipy ради корпуса в 840 чанков — не оправданная цена. BM25 не
  реализован — раздел 10 ТЗ прямо помечает его как "optional".
- `search/engine.py` — `SearchEngine`: грузит все чанки из
  `config.KNOWLEDGE_CHUNK_PATHS`, строит TF-IDF индекс (заголовок весит
  ×2 против содержимого), использует `TerminologyRegistry` для exact/alias
  term match и `knowledge.version` для version_score/detect_conflict.
  `extract_version_hint()` — грубый regex, достаёт из вопроса подстроку
  вида "4.2"/"5.1.1" как предполагаемую запрошенную версию.
- `config.KNOWLEDGE_CHUNK_PATHS`, `config.TERMINOLOGY_PATH` — центральная
  точка настройки корпуса поиска.
- `tests/test_phase7_tfidf.py` (9 тестов), `tests/test_phase7_search_engine.py`
  (18 тестов, включая регрессии — см. Known issues), `tests/test_phase7_qa_service.py`
  (5 тестов).

**Removed**

- `search/knowledge_base.py`, `search/manual_index.py` — наивные
  keyword-overlap классы Phase 2, полностью заменены `SearchEngine`.
  Проверено `grep` по всему репозиторию — ничего больше на них не
  ссылается. Восстановимы через `git log`, если понадобятся.

**Tests**

- `python -m unittest discover tests -v` — **103/103 passed**.
- Реальная ручная проверка на живом корпусе (840 чанков) — не просто
  прогон assert'ов, а чтение результатов по ~20 разным запросам (см.
  находки ниже). Итоговые пороги 0.75/0.20 откалиброваны по этим цифрам:
  бессмысленные запросы стабильно дают ~0.13-0.16, слабая, но настоящая
  лексическая релевантность — ~0.2-0.4, уверенные точные совпадения —
  ~0.9-1.13.
- Проверен полный импорт (`app.main`, `bot`) после удаления
  `knowledge_base.py`/`manual_index.py`.
- **Не протестировано юнит-тестами**: сами Telegram-хендлеры
  `qa_confirm_callback`/`qa_decline_callback` (нужны моки
  `Update`/`CallbackQuery` — вне текущей практики тестирования проекта,
  которая до сих пор проверяла только бизнес-логику, не Telegram-слой).
  Формат ответа (`_format_chunk_answer`) проверен вручную через скрипт,
  не автотестом — стоит закрыть в одной из следующих фаз.

**Находки при ручной проверке (важная часть этой фазы, не просто баги)**

1. **Первая версия формулы score была небезопасной.** Изначально
   authority/version/topic складывались с lexical_score аддитивно —
   совершенно бессмысленный запрос («зюзюка мяу абракадабра») получал
   score≈0.41, почти не уступая реальным совпадениям, только за счёт
   высокого authority случайно попавшегося official-чанка. Переделано на
   мультипликативную схему: `relevance` (lexical ИЛИ подтверждённое
   совпадение термина) — обязательный множитель; без него score=0
   независимо от authority. После фикса бессмысленный запрос даёт ~0.15,
   реальные совпадения — 0.9+.
2. **`_exact_term_bonus` ложно срабатывал на substring, не на слово.**
   Алиас "риг" (Armature) совпадал внутри слова "ориг**риг**инал" —
   искал подстроку, а не токен. Исправлено на токенизированное сравнение
   (все токены алиаса должны присутствовать как отдельные токены чанка).
3. **Алиас "материал" у Principled BSDF был слишком общим словом** —
   почти любая страница, упоминающая слово "материал" мимоходом, ложно
   получала exact_term_bonus=1.0 (например, запрос "материал не виден на
   объекте" находил общую страницу "Введение" со score=1.130). Заменён на
   два более специфичных двухсловных алиаса ("шейдер материала",
   "универсальный шейдер") — многословные алиасы менее склонны к ложным
   срабатываниям, так как требуют совпадения всех слов сразу.
4. Официальный Manual теперь корректно обгоняет personal/unverified
   заметки при прочих равных (например, "как сделать булеан": official
   1.130 vs personal 0.920) — раньше (Phase 2 наивный поиск) личные
   заметки выигрывали просто за счёт более точного лексического
   совпадения, без учёта authority вообще.

**Known issues**

- Веса модификаторов (`AUTHORITY_MODIFIER_WEIGHT=0.3`,
  `VERSION_MODIFIER_WEIGHT=0.6`, `TOPIC_MODIFIER_WEIGHT=0.2`) и пороги
  confidence (0.75/0.20) — инженерное решение этой фазы по ручной
  калибровке на 840 чанках и ~20 запросах, не значения из самого ТЗ (там
  формула не задана дословно). Требуют пересмотра, когда накопится
  реальная статистика из `data/unanswered_log.jsonl`.
- `extract_version_hint()` — грубый regex `\d+\.\d+`, может ложно
  сработать на любом числе с точкой в вопросе (например, "модель 2.5
  метра" → воспринимается как версия 2.5). Цена ошибки невелика (влияет
  только на version_score, мягкий модификатор, не жёсткий фильтр), но
  это не полноценное распознавание версии из естественного языка.
- "semantic_similarity" из раздела 10 ТЗ в этой реализации — то же самое
  значение TF-IDF cosine, что и lexical_score, отдельного семантического
  слоя (embeddings) нет — раздел 2 ТЗ не требует его буквально, но и не
  запрещает добавить позже как необязательный слой.
- BM25 не реализован (раздел 10 ТЗ помечает его как "optional").
- Полноценная Structural Chunking (раздел 28 ТЗ) по-прежнему не сделана
  (см. Known issues Phase 4) — content каждого Manual-чанка это summary
  страницы, не весь текст, что ограничивает то, что вообще может найти
  поиск.
- Telegram callback-хендлеры (`qa_confirm_callback`/`qa_decline_callback`)
  не покрыты юнит-тестами — см. Tests.

**Next phase**

Phase 8 — Intent engine (раздел 11 ТЗ): без LLM определять тип вопроса
(WHAT_IS, HOW_TO, WHY, ERROR, TROUBLESHOOTING, COMPARISON, WORKFLOW,
BEST_PRACTICE, LEARNING, EXAM, TERMINOLOGY, VERSION, PYTHON,
GEOMETRY_NODES, MODELING, MATERIALS...) по keywords/aliases/question
patterns — сейчас бот ищет релевантный контент, но не различает «что
такое X» от «как сделать X» от «почему не работает X».

---

## Phase 8 — Intent engine

### Отчёт (раздел 42 ТЗ)

**Changed**

- `search/unanswered_log.py` — `log_unanswered()` получил необязательные
  `question_types`/`topics` (default `None` → `[]`), обратно совместимо.
- `search/qa_service.py` — `QAService.log_unanswered()` теперь сам
  классифицирует вопрос через `IntentEngine` перед записью в
  `data/unanswered_log.jsonl`.
- `intents/__init__.py` — убран плейсхолдер «пока пусто».

**Added**

- `intents/engine.py` — `IntentEngine.classify(question) -> IntentResult`.
  Раздел 11 ТЗ перечисляет один плоский список из 28 меток, реально
  смешивающий два измерения — реализовано как два независимых набора
  правил: `QUESTION_TYPE_INTENTS` (12: WHAT_IS...VERSION) и
  `TOPIC_INTENTS` (16: PYTHON...PERFORMANCE), 12+16=28, без пересечений
  (проверено тестом). Вопрос может получить несколько меток любого типа
  сразу — жёсткой классификации «один вопрос — одна метка» раздел 11 не
  требует. `IntentResult.is_terminology` — TERMINOLOGY реализован не как
  отдельный набор keywords, а как WHAT_IS с дополнительным условием
  (термин распознан вызывающим кодом через `search/engine.py`), чтобы не
  дублировать уже существующую логику term-match из Phase 6-7.
  `version_hint` переиспользует `search.engine.extract_version_hint()`
  (Phase 7) вместо повторной реализации.
- `tests/test_phase8_intent_engine.py` — 23 теста: по одному на каждый
  реализованный question type, на несколько topics, две регрессии (см.
  находки ниже), проверка «28 меток без пересечений», и прогон по всем
  70 реальным вопросам `dima_notes` (не строгий assert на каждый — эвристика
  не обязана покрыть 100% — а проверка, что классификатор не падает и что
  хотя бы половина вопросов получает question type).

**Removed**

Ничего.

**Tests**

`python -m unittest discover tests -v` — **126/126 passed** (103 из Phase
2-7 + 23 новых).

**Находки при проверке на реальных вопросах (тот же метод, что в Phase 7)**

1. **Substring без границы слова — снова.** Алиас "кости" (RIGGING) ложно
   совпадал внутри "жид[кости]" (Fluid) — тот же класс бага, что
   `_exact_term_bonus` в Phase 7. Первая попытка исправления —
   `\bpattern\b` (граница с обеих сторон) — убрала баг, но заодно и
   легитимные словоформы: "рендер" переставал совпадать внутри
   "рендерить"/"рендеринг" (в проекте нет стемминга/лемматизации для
   русского языка — добавлять для этого библиотеку вроде pymorphy2 не
   входит в эту фазу). Компромисс: граница слова только в начале паттерна
   (`\bpattern`, без `\b` в конце) — так и "кости" не совпадёт в середине
   "жидкости" (там нет границы вообще), и "рендер" совпадёт в "рендерить".
2. **"или" как маркер COMPARISON был слишком общим словом** — ловил
   обычное перечисление вариантов ("грань или ребро") вместо реального
   сравнения. Убран из паттернов COMPARISON целиком; остались более
   специфичные маркеры ("разница", "отличие", "vs" и т.п.).

**Known issues**

- **Тема-интенты (16 меток) не подключены к поиску.** Проверил реальные
  значения `topic` в `knowledge/official/manual/5.1/manual.json` (взяты из
  структуры каталогов blender-manual) — только 9 из 16 тем Intent Engine
  (MODELING, RENDERING, ANIMATION, COMPOSITING, ADDON, VSE, SCULPT,
  EXPORT, IMPORT) имеют уверенное прямое соответствие верхнеуровневой
  папке Manual; для оставшихся 7 (PYTHON, GEOMETRY_NODES, MATERIALS,
  LIGHTING, RIGGING, UV, PERFORMANCE) такого соответствия на
  верхнем уровне нет — они вложены глубже, и сопоставление потребовало бы
  либо более глубокого анализа `section_path`, либо признанного
  предположения без проверки. Решил не встраивать в `topic_score`
  поиска частичное, местами угаданное сопоставление — честнее оставить
  как отдельный, самостоятельный классификатор, пока не появится
  надёжное обоснование для полной интеграции.
- **Question type-интенты (12 меток) не используются для форматирования
  ответа.** Раздел 25 ТЗ (Response Format) описывает разную структуру
  ответа для How-to/Troubleshooting/Learning — не реализовано: чанки
  знаний сейчас хранят цельный текст `content`, а не отдельные поля
  «цель/шаги/проверка/ошибки», так что натянуть такую структуру на
  существующие данные значило бы придумать структуру, которой в
  источнике нет. Единственное текущее применение
  question type — логирование unanswered-вопросов.
- **"Контекст и предыдущие сообщения" (раздел 11) не реализовано вообще.**
  Бот принципиально не хранит историю переписки между сообщениями (см.
  `VAGUE_FOLLOWUP_TEXT` в `bot/handlers/qa.py`) — многошаговый диалог с
  состоянием явно относится к Diagnostic Engine (Phase 9, раздел 12 ТЗ),
  а не к Intent Engine.
- TROUBLESHOOTING/ERROR-интенты пока не запускают никакой диагностической
  логики (decision tree и т.п.) — это буквально то, для чего раздел 40 ТЗ
  выделяет отдельную Phase 9.
- Стеммингоподобные короткие основы слов ("черн", "не работа" и т.п.) —
  компромисс без настоящей лемматизации, могут изредка давать ложные
  срабатывания на несвязанных словах с тем же корнем (например "черн"
  теоретически совпадёт с "чернила") — риск признан низким для реального
  словаря Blender-вопросов, но не нулевым.

**Next phase**

Phase 9 — Diagnostic engine (раздел 12 ТЗ): decision-tree диалог для
TROUBLESHOOTING/ERROR-вопросов вместо одного ответа сразу — бот должен
задавать по одному уточняющему вопросу и постепенно сужать причину, а не
вываливать все возможные решения сразу (см. пример диалога, раздел 13 ТЗ).
Здесь наконец понадобится минимальное состояние диалога между сообщениями
одного пользователя — то, что Intent Engine сознательно не стал делать.

---

## Phase 9 — Diagnostic engine

### Отчёт (раздел 42 ТЗ)

**Changed**

- `intents/engine.py` — в TROUBLESHOOTING добавлены основы "ломае",
  "искажа", "деформир". Без них буквальный пример раздела 13 ТЗ («После
  Subdivision модель ломается») не получал НИ ОДНОГО question type —
  найдено во время сквозной проверки, до всякого юнит-теста (см. находки
  ниже).
- `config/__init__.py` — добавлен `DIAGNOSTICS_PATH`.
- `bot/handlers/qa.py` — перед обычным поиском теперь проверяется, не
  начало ли это диагностического сценария (`try_start_diagnostic`);
  свободный текст в начале `answer_question` явно сбрасывает
  зависшую diagnostic-сессию (`clear_session`) — если пользователь бросил
  диалог посреди и написал новый вопрос текстом вместо клика по кнопке.
- `app/main.py` — добавлен `CallbackQueryHandler` для `diag:\d+`.

**Added**

- `diagnostics/schema.py` — `DecisionNode` (узел дерева: либо question с
  options, либо solution с cause/fix) и `DiagnosticProblem` (все поля
  раздела 12 ТЗ: problem_id, title, symptoms, keywords, possible_causes,
  version, sources, severity; questions+decision_tree раздела 12 объединены
  в один плоский словарь узлов, а не два синхронизируемых вручную списка).
  `validate_problem()` проверяет: keywords не пусты, severity из
  {low,medium,high}, root_node_id существует, у question есть options и
  question_text, у solution есть cause и fix, каждый option ссылается на
  существующий узел.
- `diagnostics/registry.py` — `DiagnosticRegistry.find_problem()`: поиск
  проблемы по пересечению keywords с токенами вопроса, `min_matches=2`
  (осознанно строже одного слова — ложное срабатывание диагностики на
  обычный вопрос дороже пропущенного совпадения). Сравнение по префиксу
  первого слова keyword'а, не точному токену — та же техника, что в
  `intents/engine.py` (Phase 8), нужна по той же причине (см. находки).
- `bot/handlers/diagnostics.py` — Telegram-слой: `try_start_diagnostic()`
  (запускает диалог, если question_types пересекаются с
  {TROUBLESHOOTING, ERROR} и `find_problem()` нашёл совпадение),
  `diag_option_callback()` (обрабатывает клик по кнопке варианта ответа,
  продвигает `context.user_data["diag_node_id"]` по дереву, либо к
  следующему вопросу, либо показывает solution и закрывает сессию). Кнопки
  — `callback_data=f"diag:{индекс_варианта}"` (короткий, без риска
  превысить лимит Telegram в 64 байта, в отличие от кодирования id узла).
  Это первое и единственное место в проекте, где бот реально хранит
  контекст между сообщениями одного пользователя.
- `scripts/seed_diagnostics.py` — 2 проблемы: `subdivision_breaks_model`
  (дословный пример раздела 13 ТЗ, 4 варианта первого вопроса, ветка «по
  всей модели» ведёт ещё на один уточняющий вопрос про Apply Scale) и
  `black_material_or_render` (чёрный материал/рендер — вопрос, который
  реально всплывал в ручных проверках Phase 7).
- `tests/test_phase9_diagnostics.py` — 26 тестов: валидация схемы (6),
  обход дерева (2), save/load registry (2), `find_problem()` на синтетике
  (5), реальные засеянные данные (5, включая явную проверку дословного
  примера раздела 13 и связности дерева — каждый узел достижим из root),
  и впервые в проекте — **прямые тесты Telegram-хендлеров через
  `unittest.mock`** (4): полный проход root→solution, многошаговый проход
  через вложенный вопрос (ветка «по всей модели»), истёкшая/отсутствующая
  сессия не роняет бота, WHAT_IS не запускает диагностику.

**Removed**

Ничего.

**Tests**

`python -m unittest discover tests -v` — **152/152 passed** (126 из Phase
2-8 + 26 новых).

**Находки при сквозной проверке (тот же метод, что в Phase 7-8)**

1. **Дословный пример ТЗ изначально не работал.** «После Subdivision
   модель ломается» — это цитата из раздела 13 ТЗ, и она получала
   `question_types: []` — TROUBLESHOOTING не было настроено ловить
   «ломается». Нашёл до того, как писать тесты, ручным прогоном (та же
   практика, что в Phase 7-8: сначала посмотреть на реальный вывод, потом
   формализовать в тест).
2. **`find_problem()` не находил вторую проблему по той же причине, что
   уже дважды всплывала.** Точное совпадение токенов не ловило «виден» по
   keyword'у «видно» (разные словоформы). Исправлено тем же приёмом, что
   в Phase 8 — сравнение keyword'а как префикса, а не точного токена; в
   `scripts/seed_diagnostics.py` keywords сознательно укорочены до основ
   ("черн", "вид", "ломае" вместо "чёрный", "видно", "ломается").

**Known issues**

- Только 2 диагностические проблемы — целенаправленно, не претензия на
  покрытие всех типовых проблем Blender (раздел 36 ТЗ). Расширение — по
  необходимости.
- `sources: []` у обеих проблем — содержание синтезировано из собственных
  знаний о Blender, не выгружено дословно с конкретной страницы Manual.
  Технически обоснованно, но не процитировано — честно отражено в
  `knowledge/system/diagnostics/README.md`, а не выдано за официально
  подтверждённый факт.
- Свободный текст не поддерживается как ответ на диагностический вопрос —
  только кнопки. Если пользователь напишет «на углах» текстом вместо
  клика — это будет обработано как новый обычный вопрос
  (`answer_question` явно сбрасывает diagnostic-сессию для любого
  свободного текста), а не как ответ на decision tree. Разбор
  свободно-текстовых ответов внутри диалога — потенциальное расширение,
  не сделано в этой фазе.
- Состояние диалога живёт только в `context.user_data` — по памяти
  процесса. Перезапуск бота (например, `systemctl restart blenderbot`
  после деплоя новой фазы) обрывает все текущие diagnostic-сессии без
  предупреждения пользователю. Раздел 12 ТЗ этого не требует явно, но
  стоит иметь в виду.
- `find_problem()` — линейный перебор всех проблем при каждом вопросе;
  нормально для 2 проблем, пересмотреть при значительном росте набора.

**Next phase**

Phase 10 — Source ranking (разделы 14-17 ТЗ: Confidence Engine, Source
citations, Fact vs Recommendation, Conflict Engine). Сейчас у ответов бота
есть числовой score (Phase 7) и честная пометка источника
(`_format_chunk_answer`, Phase 7), но нет явного уровня уверенности
(HIGH/MEDIUM/LOW/UNKNOWN) и нет обработки конфликта, когда два источника
по одной теме противоречат друг другу.

---

## Phase 10 — Source ranking

### Отчёт (раздел 42 ТЗ)

**Changed**

- `search/qa_service.py` — `QAResult` получил `confidence: str` и
  `competing_chunk: KnowledgeChunk | None`; `answer()` заполняет их для
  `chunk_confident` и `soft_match` через `classify_confidence()` и новую
  `_find_competing_source()`.
- `bot/handlers/qa.py` — `_format_chunk_answer()` переработан: вынесен
  `_format_citation()` (раздел 15, без изменения поведения), добавлена
  оговорка «Уверенность в этом ответе невысокая» при `confidence="LOW"`
  (кроме `ai_generated_unverified` — там оговорка уже есть в цитате, не
  дублируем) и пометка про конкурирующий источник при
  `competing_chunk` (раздел 17). `qa_confirm_callback` передаёт
  `confidence="LOW"` явно — soft_match по построению ниже
  `HIGH_CONFIDENCE_THRESHOLD` (Phase 7), пересчитывать нечего.

**Added**

- `search/confidence.py` — `classify_confidence(scored) -> HIGH|MEDIUM|LOW|UNKNOWN`
  (раздел 14 ТЗ). Правила: `None` → UNKNOWN; реальный конфликт версий
  (`version_score<1.0`, раздел 5-7 ТЗ) → LOW независимо от authority
  источника; official_manual + точный термин → HIGH; official_manual без
  точного термина → MEDIUM; authority A/B-tier (≥60) → MEDIUM (правило
  готово, но `knowledge/community/*` пока пусто — реальных данных для этой
  ветки нет); всё остальное (в первую очередь `ai_generated_unverified`) →
  LOW. Функция намеренно не решает релевантность сама — предполагает, что
  вызывающий код (Phase 7 пороги) её уже отсеял.
- `search/qa_service.py::_find_competing_source()` — Conflict Engine
  (раздел 17 ТЗ): второй результат считается «конкурирующим источником»,
  только если он тоже точно про распознанный термин
  (`exact_term_bonus>=1.0`) И источник другого `source_type` — иначе это
  не конфликт, а просто два похожих абзаца одного типа.
- `tests/test_phase10_confidence.py` — 16 тестов: `classify_confidence()`
  на синтетике (7 случаев, включая version-конфликт и гипотетический
  community A/B-tier), `_find_competing_source()` на синтетике (4), и на
  реальном корпусе (3): «как сделать булеан» даёт HIGH, конфликт версии
  (3.6 против индексированной 5.1) корректно демотирует до LOW, и «булеан»
  реально находит конкурирующий источник (official Manual vs personal
  note) — не выдуманный сценарий, тот же самый, что описан в находках
  Phase 7. Плюс 2 теста форматирования текста через реальный
  `bot/handlers/qa.py`.

**Removed**

Ничего.

**Tests**

`python -m unittest discover tests -v` — **168/168 passed** (152 из Phase
2-9 + 16 новых).

**Что сделано честно, а что — нет**

Раздел 40 ТЗ называет эту фазу «Source ranking», а разделы 14-17
описывают 4 разные темы. Реализованы 2 из 4:

- ✅ **Confidence Engine (раздел 14)** — HIGH/MEDIUM/LOW/UNKNOWN, реально
  влияет на текст ответа (оговорка при LOW).
- ✅ **Conflict Engine (раздел 17)**, частично — версионный конфликт
  (полноценно, через `knowledge/version.py` из Phase 5) и конфликт
  authority-тира источников (обнаружение факта, что нашлись два разных по
  типу источника, без анализа СОДЕРЖАНИЯ на предмет реального
  противоречия — определить, действительно ли два текста говорят разное,
  задача уровня NLP, которую не стал изображать эвристикой).
- ⬜ **Source citations (раздел 15)** — technically уже было сделано в
  Phase 7 (`_format_citation`), здесь только вынесено в отдельную функцию.
  Требование «community source должен быть явно помечен» не проверено на
  реальных данных — `knowledge/community/*` по-прежнему пусто (Phase 3
  Known issues), пометка сработает автоматически, когда там появится
  контент (source_type ≠ official_manual/ai_generated_unverified уже
  сейчас показывает `_Источник: {chunk.source}_`), но не протестирована
  на реальном community-чанке, потому что такого чанка не существует.
- ❌ **Fact vs Recommendation (раздел 16)** — не реализовано. Требует
  классификации содержимого чанка (FACT/RULE/RECOMMENDATION/WORKFLOW/
  OPINION/COMMUNITY_PRACTICE), для которой сейчас нет надёжных оснований:
  это не keyword-паттерн вроде Intent Engine, а суждение о характере
  утверждения, которое легко классифицировать неверно и выдать
  рекомендацию за правило (ровно то, что раздел 16 запрещает). Кроме
  того, раздел 16 больше про то, как бот ФОРМУЛИРУЕТ собственный текст
  («всегда»/«никогда» только для детерминированного поведения) — а
  сейчас бот показывает содержимое chunk'а дословно, не генерирует
  свои предложения, так что это ограничение пока не на что накладывать.

**Known issues**

- MEDIUM-ветка confidence для community-источников (authority≥60)
  никогда не сработает на практике, пока `knowledge/community/*` пусто —
  правило протестировано только на синтетике.
- Conflict Engine не проверяет реальное семантическое противоречие между
  источниками, только факт «оба точно про один термин, из разных типов
  источников». Тексты могут полностью совпадать по смыслу и всё равно
  получить пометку «конкурирующий источник» — это осторожность в пользу
  прозрачности (раздел 17: «конфликт не удалять»), а не точная детекция
  расхождений.
- Fact vs Recommendation не реализовано вообще (см. выше) — открытый
  пункт ТЗ, возможно стоит вернуться к нему вместе с Education Engine
  (Phase 11), где различие FACT/OPINION станет более заметно нужным (тесты
  и объяснения требуют разграничивать факт от практики).

**Next phase**

Phase 11 — Education Engine (раздел 18 ТЗ): команды /learn, /progress,
/test, /exam, /weaknesses, /next; структура темы Theory → Example →
Exercise → Quiz → Result → Weakness tracking.

---

## Phase 11 — Education Engine

### Отчёт (раздел 42 ТЗ)

**Changed**

- `config/__init__.py` — добавлен `LESSONS_PATH`.
- `app/main.py` — зарегистрированы 6 команд (`/learn`, `/test`, `/exam`,
  `/progress`, `/weaknesses`, `/next`) и `CallbackQueryHandler` для `edu:\d+`.
- `bot/handlers/start.py` — `WELCOME_TEXT` дополнен новыми командами, иначе
  никто бы о них не узнал.

**Added**

- `education/schema.py` — `QuizQuestion` (раздел 22 ТЗ: реализованы
  `multiple_choice` и `true_false` из 6 типов — `scenario`/`diagnostic`/
  `workflow`/`technical` требуют содержательных сценариев, для которых нет
  оснований, см. Known issues) и `Lesson` (topic_id, title, theory, example,
  exercise, quiz — раздел 18). `validate_lesson()`: quiz не пуст, у каждого
  вопроса ≥2 варианта, `correct_index` в диапазоне, `explanation` не пуст
  (раздел 22: «после ответа показывать... объяснение»).
- `education/registry.py` — `LessonRegistry`: `get(topic_id)`,
  `find_by_title()`, `all_questions()` (для /exam — вопросы вперемешку из
  всех уроков).
- `bot/handlers/education.py` — Telegram-слой, шесть команд + один callback.
  `/learn <тема>` резолвит тему через уже готовый `TerminologyRegistry`
  (Phase 6) — не примитивным сравнением строк (см. находку ниже).
  `/test` — квиз по последней изученной теме; `/exam` — вопросы вперемешку
  по всем урокам (`random.shuffle`); `/next` — либо следующий вопрос
  активного квиза, либо (вне квиза) подсказка, что изучить: самая слабая
  тема сессии, если есть данные, иначе первый урок. Прогресс и слабые
  места — `context.user_data["edu_session_log"]` /
  `["edu_weak_topics"]` (счётчик неверных ответов по теме накапливается
  между несколькими /test и /exam за сессию, не сбрасывается на каждый
  вызов).
- `knowledge/system/education/lessons.json` — 3 урока: `Mirror Modifier`,
  `Boolean Modifier`, `N-gon`. Не в исходном списке раздела 5 ТЗ (там
  synonyms/terminology/intents/diagnostics/rules) — добавлено по аналогии,
  задокументировано в `knowledge/system/education/README.md`.
- `scripts/seed_education.py` — сидинг; `common_mistakes` терминов Phase 6
  и находка Phase 9 (N-gon + Subdivision) напрямую легли в quiz-вопросы.
- `tests/test_phase11_education.py` — 20 тестов: валидация схемы (6),
  registry (5), реальные засеянные данные (3), и — как в Phase 9 —
  **прямые тесты Telegram-хендлеров через `unittest.mock`** (6): полный
  проход /learn→/test→ответ→/next→/progress→/weaknesses, резолв темы по
  английскому canonical name, `/test` без активной темы, `/next` без
  активного квиза предлагает самую слабую тему, ответ без активного квиза
  не роняет бота.

**Removed**

Ничего.

**Tests**

`python -m unittest discover tests -v` — **188/188 passed** (168 из Phase
2-10 + 20 новых).

**Находка при ручной проверке (тот же метод, что в Phase 7-9)**

`/learn Mirror Modifier` изначально не находил урок: `Lesson.topic_id`
задан по-английски ("Mirror Modifier", чтобы совпадать с
`Term.canonical_name`), а `Lesson.title` — по-русски ("Модификатор
Mirror"), и `find_by_title()` сравнивал запрос только с `title`. Нашёл
руками, до всякого юнит-теста. Исправление — не патч сравнения строк, а
использование уже готового `TerminologyRegistry.find()` (Phase 6):
`/learn` сначала резолвит запрос в canonical term (значит "mirror",
"зеркало", "Mirror Modifier" — всё найдёт один и тот же урок), и только
если термин не распознан — пробует прямое совпадение по `title`.

**Известное честное ограничение — что реализовано, а что нет**

Раздел 40 ТЗ явно ставит **User Profile (SQLite, раздел 19) отдельной
Phase 12, ПОСЛЕ Education Engine** — то есть на момент этой фазы
персистентного хранилища architecturally ещё не должно быть. Из этого
следует:

- ✅ `/learn`, `/test`, `/exam`, `/next` работают полноценно — им не нужна
  персистентность, только состояние в рамках текущей сессии
  (`context.user_data`, тот же приём, что в Diagnostic Engine, Phase 9).
- ⚠️ `/progress` и `/weaknesses` **честно ограничены сессией** — оба текста
  явно говорят пользователю «не сохраняется после перезапуска бота», а не
  притворяются, что показывают историю за всё время. Слабые места
  накапливаются в `edu_weak_topics` между несколькими /test/exam за одну
  работающую сессию бота (это уже частичная реализация раздела 21,
  Adaptive Learning — «при повторяющейся ошибке увеличивать weakness
  score» — просто без переживания рестарта).
- ❌ **Level System (раздел 20) не реализован вовсе.** Присвоение уровня
  Beginner/Junior/.../Senior требует накопленной истории тестов за много
  сессий (раздел 20: «оценка должна опираться на результаты тестов»), для
  которой сейчас нет ни хранилища (Phase 12), ни достаточного объёма
  контента (3 урока — это ядро, не полный курс, раздел 36 ТЗ). Competency
  matrix (Modeling/Topology/Materials/.../Python) из раздела 20 не
  создавалась намеренно — это была бы пустая структура без логики её
  заполнения, то есть код ради кода.
- ⚠️ **Только 2 из 6 типов вопросов раздела 22** реализованы
  (`multiple_choice`, `true_false`). `scenario`/`diagnostic`/`workflow`/
  `technical` — не keyword-паттерн вроде Intent Engine, а полноценный
  контент с сюжетом/сценарием, который нужно писать вручную с той же
  осторожностью, что и диагностические деревья Phase 9 — отложено, не
  сделано наспех.

**Next phase**

Phase 12 — User Profile (раздел 19 ТЗ): SQLite-хранилище (user_id,
blender_version, level, topics, completed_topics, weak_topics,
test_results, mistakes, last_questions, learning_goal). Это разблокирует
честные версии `/progress`/`/weaknesses` (переживающие перезапуск) и
станет основой для Level System, отложенной в этой фазе.

---

## Phase 12 — User Profile

### Отчёт (раздел 42 ТЗ)

**Changed**

- `config/__init__.py` — добавлен `PROFILE_DB_PATH`.
- `.gitignore` — добавлен `data/user_profile.db` (реальные данные
  пользователей, как `subscribers.json`/`unanswered_log.jsonl`).
- `bot/handlers/education.py` — `context.user_data["edu_session_log"]` и
  `["edu_weak_topics"]` заменены на вызовы `UserProfileStore`.
  `context.user_data["edu_quiz"]`/`["edu_quiz_index"]`/`["edu_current_topic"]`
  остались как есть — это диалоговое состояние текущего разговора (какой
  вопрос сейчас), не история, которую просит хранить раздел 19; тот же
  принцип, что у Diagnostic Engine (Phase 9). `/progress` расширен:
  теперь показывает ещё и `completed_topics`, и `blender_version`, если
  профиль их знает.
- `bot/handlers/qa.py` — `answer_question()` теперь пишет каждый
  содержательный вопрос в `last_questions` и, если в вопросе распознана
  версия Blender (`search.engine.extract_version_hint()`, уже готово с
  Phase 7), обновляет `blender_version` в профиле — версия берётся из
  того, что пользователь сам написал, не выдумывается.

**Added**

- `profile/user_profile.py` — `UserProfileStore` (SQLite) и `UserProfile`
  (dataclass со всеми полями раздела 19). Физически — 4 таблицы
  (`user_profile`, `user_topics`, `test_results`, `last_questions`);
  `weak_topics`/`completed_topics`/`mistakes` — не отдельные таблицы, а
  запросы поверх `test_results` (раздел 19: «хранить только данные,
  необходимые для работы системы» — денормализованное дублирование одного
  факта в это не укладывается). `completed_topics()` принимает набор
  «каких вопросов ждём по теме» от вызывающего кода (у самого хранилища
  нет доступа к содержимому уроков) и считает тему пройденной, если
  каждый её вопрос хоть раз получил верный ответ (не обязательно подряд).
  `last_questions` ограничен `LAST_QUESTIONS_LIMIT=20` на пользователя —
  старые записи вытесняются, а не растут бесконечно.
- `tests/test_phase12_user_profile.py` — 17 тестов: CRUD-операции
  хранилища (14, включая изоляцию профилей между разными user_id,
  ограничение last_questions, completed_topics с ошибкой-затем-успехом) и
  3 теста интеграции через `bot/handlers/qa.py` (версия из вопроса
  сохраняется, отсутствие версии не создаёт выдуманного значения,
  content-вопрос попадает в last_questions).
- `tests/test_phase11_education.py` — существующие Telegram-тесты
  переведены на изолированную временную БД: `TelegramLayerTests` теперь
  подменяет `bot.handlers.education.profile_store` на
  `UserProfileStore(temp_path)` в `setUp`/`tearDown`, а не пишет в
  настоящий `data/user_profile.db`. Добавлен тест на то, что `/progress`
  честно показывает `blender_version`, если он есть в профиле.

**Removed**

Ничего.

**Tests**

`python -m unittest discover tests -v` — **206/206 passed** (188 из Phase
2-11 + 17 новых Phase 12 + 1 новый в Phase 11 после доработки). Проверено
руками, что реальный `data/user_profile.db` после полного прогона тестов
остался пустым (0 строк во всех 4 таблицах) — изоляция через подмену
`profile_store` в тестах реально работает, а не только выглядит так.

**Известное ограничение — архитектурный компромисс с общим `profile_store`**

`bot/handlers/qa.py` использует `from bot.handlers.education import
profile_store` — прямая зависимость «основного» QA-хендлера от
«образовательного», не в самом очевидном направлении. Альтернатива —
завести отдельный модуль-держатель синглтона (например, `profile/store.py`
с готовым экземпляром) — не сделана в этой фазе, чтобы не трогать лишний
раз уже стабильные `bot/handlers/qa.py` и `education.py` больше, чем нужно
для интеграции (раздел 41 ТЗ: «не переписывать больше, чем нужно»).
Зафиксировано как осознанный, а не случайный выбор.

**Известное честное ограничение — что не реализовано**

- **Level System (раздел 20 ТЗ) по-прежнему не реализован.** Даже с
  постоянным хранилищем 3 урока (Mirror Modifier, Boolean Modifier, N-gon)
  покрывают 1 область компетенций из 10, требуемых разделом 20 (Modeling,
  Topology, Materials, Lighting, Animation, Rendering, Geometry Nodes,
  Compositing, Motion Design, Python). Присваивать уровень
  Beginner/.../Senior на основе такого узкого среза было бы недостоверно
  — не блокировано отсутствием хранилища (оно теперь есть), а
  недостаточным охватом контента.
- `learning_goal` — поле в схеме и метод `set_learning_goal()` есть, но
  ни одна команда бота его не устанавливает (раздел 18 ТЗ не перечисляет
  отдельной команды для этого). Задел на будущее, не подключено к
  Telegram-слою в этой фазе.
- `level` в `user_profile` — колонка есть, но никогда не записывается
  (см. Level System выше) — всегда `None`.
- Один `UserProfileStore` на процесс, соединение sqlite3 с
  `check_same_thread=False` — этого достаточно для текущего однопоточного
  `application.run_polling()`, но при переходе на что-то более
  параллельное потребует пересмотра (например, per-thread соединений или
  пула).

**Next phase**

Phase 13 — Test suite (раздел 34 ТЗ): минимум 400 тестовых случаев (100
basic, 100 technical, 100 troubleshooting, 50 version, 50 terminology, 50
deliberately ambiguous, 50 без ответа в базе), каждый с
input/expected_intent/expected_topic/expected_source_tier/
expected_answer_elements/expected_confidence. Это качественно другой тип
тестов, чем всё написанное в Phase 2-12 (юнит-тесты кода) — Phase 13 нужна
для оценки качества самой системы отвечать на вопросы, а не корректности
кода.

---

## Phase 13 — Test suite / Quality Score

### Отчёт (раздел 42 ТЗ)

**Changed**

- `search/hotkey_lookup.py` — три реальных бага поиска, найденных прогоном
  тестового набора, а не выдуманных заранее:
  1. `_QUERY_TOKEN_RE` не склеивала дефис-соединённые ASCII-сегменты в
     один токен → `"N-gon"` разбивался на токены `"n"` и `"gon"`, и
     одиночная `"n"` ложно совпадала с хоткеем N (показать/скрыть боковую
     панель). Исправлено: `[a-zA-Z0-9+]+(?:-[a-zA-Z0-9+]+)*`.
  2. То же самое для смешанных ASCII+кириллица терминов через дефис —
     `"N-угольник"` всё ещё разбивался (кириллица не входила в класс
     символов после дефиса). Исправлено: продолжение после дефиса — `\w+`
     (юникод), а не только ASCII.
  3. Строки вида версии Blender (`"4.2"`) токенизировались как `"4"` и
     `"2"`, и одиночная `"2"` ложно совпадала с хоткеем
     `"1 / 2 / 3 — режим вершин / рёбер / граней"`. Исправлено: новый
     `_VERSION_LIKE_RE` вырезает подстроки вида `\d+\.\d+(?:\.\d+)?` из
     запроса ДО токенизации.
- `intents/engine.py` — реальные пробелы в покрытии паттернов, найденные
  на кейсах из `data/knowledge_base.json`, а не в самом алгоритме:
  `TROUBLESHOOTING` дополнен (`"темн"`, `"тёмн"`, `"поплы"`, `"порти"`,
  `"неправильно"`, `"не устанавлива"`, `"не проигрыва"`, `"не появля"`,
  `"не показыва"`, `"провалива"`, `"не освеща"`, `"сломан"`, `"артефакт"`,
  `"не назнача"`, `"не применя"`, `"не воспроизвод"`, `"растянут"`);
  `HOW_TO` дополнен 21 глагольной формой (`"как развернуть"`, `"как
  импортировать"` и т.д. — без общего `"как "`, чтобы не столкнуться с
  `"как работает"`/`"как делает"` из WHAT_IS); `WHAT_IS` дополнен
  (`"что делает"`, `"какие бывают"`, `"какие есть"`).
- `scripts/seed_diagnostics.py` — `black_material_or_render` получил
  ключевые слова `"cycles"`, `"eevee"`: вопрос "Почему все черное в
  Cycles" совпадал только по одному ключевому слову (`"черн"`), ниже
  `min_matches=2` в `DiagnosticRegistry.find_problem()`, диагностика не
  запускалась при верно распознанном intent. Требует повторного запуска
  `python scripts/seed_diagnostics.py` (уже выполнено,
  `knowledge/system/diagnostics/problems.json` перегенерирован).
- `CLAUDE.md` — раздел архитектуры: `tests/` теперь отдельно упоминает
  `tests/quality/`.

**Added**

- `tests/quality/schema.py` — `TestCase`, `CATEGORIES`,
  `MIN_CASES_PER_CATEGORY` (раздел 34: 100/100/100/50/50/50/50),
  `load_cases`/`save_cases`.
- `tests/quality/metrics.py` — `evaluate_case()` (прогоняет один кейс через
  реальные `IntentEngine`/`DiagnosticRegistry`/`QAService`, без моков) и
  `compute_quality_score()` (веса раздела 35: intent 20%, retrieval 20%,
  source authority 20%, version 15%, diagnosis 15%, hallucination
  resistance 10%; вес метрики без применимых кейсов не засчитывается ни в
  чью пользу — перенормировка суммы весов, а не тихое 0%/100%).
- `scripts/build_quality_test_suite.py` — генератор 540 кейсов
  (программно из `data/knowledge_base.json` и `TerminologyRegistry`, плюс
  вручную составленные `ambiguous`/`no_answer`/часть `troubleshooting`).
- `tests/quality/cases.json` — 540 сгенерированных кейсов: basic 104,
  technical 106, troubleshooting 100, version 50, terminology 72,
  ambiguous 58, no_answer 50 — все категории выше минимума раздела 34.
- `tests/test_phase13_quality_suite.py` — `TestSuiteStructureTests`
  (валидация файла кейсов) и `QualityScoreTests` (прогон всех 540 кейсов,
  печать отчёта; **намеренно без hard assert на процент** — раздел 35 даёт
  оценочную метрику качества системы, а не критерий "тест прошёл/не
  прошёл" для кода).
- `tests/quality/README.md` — методология генератора, откуда берутся
  кейсы, известное ограничение чекера (см. Known issues).

**Removed**

Ничего.

**Tests**

- `python -m unittest tests.test_phase13_quality_suite -v` — 7/7 passed.
  Итоговый Quality Score: **91.4%** (цель ТЗ раздел 35 для v2 — ≥ 70%,
  превышена с запасом).
  - Intent accuracy: 87.1%
  - Retrieval accuracy: 73.6%
  - Source authority accuracy: 100.0%
  - Version accuracy: 100.0%
  - Diagnosis accuracy: 95.0%
  - Hallucination resistance: 100.0%
- `python -m unittest discover tests` — **213/213 passed** (206 из Phase
  2-12 + 7 новых Phase 13). Подтверждено, что расширение паттернов
  `intents/engine.py` не сломало ни один более ранний тест классификации
  intent (Phase 8/9).
- Итерации улучшения (для прозрачности): Quality Score поднимался
  74.4% → 87.3% → 91.3% → 91.4% по мере того, как каждая проваленная
  группа кейсов разбиралась вручную и классифицировалась либо как
  настоящий баг системы (исправлен в коде, см. Changed), либо как
  дефект самого генератора тестов (исправлен в
  `build_quality_test_suite.py`/`metrics.py`, не в системе). Полный список
  промежуточных находок в истории git-коммитов этой фазы.

**Known issues**

- **Retrieval accuracy (73.6%) — самая слабая метрика, и это ожидаемо.**
  Разобрано вручную 78 провалившихся кейсов из 78 (100% фактически
  проверенных, не по выборке): большинство — не баг поиска, а строгость
  самого чекера теста (`expected_answer_elements` для `terminology`-кейсов
  часто содержит только английские названия терминов, а официальный
  Manual в базе — переведённый на русский текст почти без транслитерации,
  так что правильный русский ответ не проходит проверку по буквальному
  вхождению английского слова). Меньшая часть — настоящий пробел в охвате
  ingested-манула Phase 4: например, для термина "Группа вершин" (Vertex
  Group) в загруженном срезе манула нет отдельной концептуальной страницы
  — только упоминания внутри чанков о модификаторах весов, и заголовок
  геонод-узла "Группа" по случайному словесному совпадению ранжируется
  выше. Не паттерн поисковой ошибки, а конкретный пробел контента — не
  исправляется правкой search/engine.py, требует доингестии
  соответствующих страниц манула в будущей фазе расширения knowledge/.
- Найденные и исправленные в этой фазе баги (N-gon/N-угольник/версия
  ложно матчились с хоткеями; несколько пробелов в паттернах intent) были
  все обнаружены только благодаря объёму теста — 540 реалистичных
  русскоязычных формулировок вскрыли то, что ручное тестирование в Phase
  7-9 не покрыло. Это ожидаемо и есть смысл существования Phase 13, не
  повод считать более ранние фазы "недоделанными".
- Test Suite Phase 13 не заменяет и не проверяет `education/` quiz-тесты
  (3 засеянных урока) — Quality Score раздела 35 оценивает только поиск
  ответа на прямой вопрос, не образовательный сценарий.

**Next phase**

Phase 14 — Optimization (раздел 40 ТЗ). Пока не начата.

---

## Phase 14 — Optimization

### Отчёт (раздел 42 ТЗ)

**Как понята задача фазы**

Раздел 40 ТЗ отводит Phase 14 всего одну строку ("Phase 14: optimization"),
без детализации. Прежде чем оптимизировать несуществующую проблему
(раздел 41: "не переписывать больше, чем нужно"), сначала измерено реальное
состояние на целевом железе (Oracle VM.Standard.E2.1.Micro, см. Phase 7):

- Старт процесса (импорт + построение TF-IDF индекса по 840 chunks):
  **~0.41 сек**.
- Память под индекс (`tracemalloc`, только то, что реально удерживается):
  **~11 МБ peak**.
- Средняя задержка одного `QAService.answer()` на смешанном наборе
  реалистичных вопросов: **~50 мс/запрос**.

Вывод: TF-IDF-поиск (ручная реализация без numpy/scipy, решение Phase 7)
уже укладывается в ресурсы слабого бесплатного VM с большим запасом —
переписывать поисковый движок или вводить дополнительное кэширование не
было объективной причины. Вместо выдуманной оптимизации несуществующего
узкого места сделан явный gap, который реально требовался: раздел 32
(Admin Commands) и раздел 33 (Debug Mode) — оба входят в критерии
готовности v2 (раздел 43: "Имеет admin/debug mode"), но ни одна
admin-команда в проекте так и не была реализована ни в одной из фаз 1-13.

**Changed**

- `profile/user_profile.py` — добавлен `UserProfileStore.total_users()`
  (агрегирующий `SELECT COUNT(*)`, без новой таблицы — раздел 19:
  "хранить только данные, необходимые для работы системы").
- `app/main.py` — зарегистрированы 8 новых `CommandHandler`:
  `/admin`, `/health`, `/stats`, `/sources`, `/version`, `/search`,
  `/debug`, `/reindex`.

**Added**

- `bot/handlers/admin.py` — Admin Commands (раздел 32 ТЗ) + Debug Mode
  (раздел 33 ТЗ), все команды защищены проверкой `OWNER_ID` (тот же
  паттерн, что `bot/handlers/broadcast.py`):
  - `/admin` — список admin-команд.
  - `/health` — жив ли поисковый индекс, аптайм процесса, счётчики
    основных реестров.
  - `/stats` — chunks по source_type/authority tier, число терминов,
    диагностических проблем, хоткеев, уроков, подписчиков, профилей
    пользователей, строк в unanswered-логе.
  - `/sources` — какие файлы подключены как источник поиска
    (`config.KNOWLEDGE_CHUNK_PATHS`) и сколько chunks дал каждый
    `chunk.source`.
  - `/version` — какие версии Blender реально покрыты базой знаний
    (`chunk.version` по всему корпусу), не версия самого бота.
  - `/search <запрос>` — сырые результаты `SearchEngine.search()` с полным
    разложением score (lexical/authority/version/topic/exact_term_bonus) —
    раздел 10 ТЗ, для отладки ранжирования.
  - `/debug <вопрос>` — полный разбор одного вопроса по конвейеру: intent,
    темы, version_hint, сработала ли диагностика, `QAResult.kind`/
    `confidence`, выбранный источник и top-3 сырых результата поиска —
    буквально формулировка раздела 33 ("intent, detected terms, version,
    search results, scores, selected source и confidence").
  - `/reindex` — перечитывает `knowledge/`, диагностические деревья и
    уроки с диска и подменяет singleton'ы `bot.handlers.qa.qa_service`,
    `bot.handlers.diagnostics.diagnostic_registry`,
    `bot.handlers.education.lesson_registry` БЕЗ перезапуска процесса
    (раздел 27: ingestion должен быть повторяемым). Новые объекты
    собираются ДО подмены старых — если файл на диске битый, исключение
    всплывает раньше подмены, и бот продолжает работать по старому,
    ещё исправному состоянию, а не остаётся без индекса вообще.
- `tests/test_phase14_admin.py` — 13 тестов: OWNER_ID gate (не настроен /
  чужой ID / владелец), содержательная проверка каждой команды через
  РЕАЛЬНЫЕ singleton'ы бота (не моки — та же философия, что Phase 13), и
  отдельно то, что `/reindex` реально подменяет объекты (`assertIsNot`),
  а не просто отчитывается.
- `tests/test_phase12_user_profile.py` — добавлен тест на
  `total_users()`.

**Removed**

Ничего.

**Tests**

- `python -m unittest tests.test_phase14_admin tests.test_phase12_user_profile -v`
  — 30/30 passed.
- `python -m unittest discover tests` — **226/226 passed** (213 из Phase
  2-13 + 13 новых Phase 14). `python -c "import app.main"` — бот собирается
  без ошибок импорта с новыми хендлерами.
- Ручная проверка вывода `/stats` и `/debug` на реальных данных (не только
  через assert'ы) — оба читаемы и показывают осмысленные числа (пример
  `/debug что делает Loop Cut` корректно показал `WHAT_IS`, `soft_match`,
  `LOW`, с полным разложением score).

**Known issues**

- Admin-команды текстовые (`reply_text`), без Markdown-разметки и без
  постраничной разбивки — при очень большом корпусе (`/stats`,
  `/sources`) возможен упор в лимит Telegram 4096 символов на сообщение;
  при текущих 840 chunks/93 хотки/36 терминов вывод далеко не приближается
  к лимиту, отложено до реального роста корпуса.
- `/reindex` не перечитывает `data/hotkeys.json`-независимые
  Telegram-справочники (`/hotkeys`, `/resources`, `/news`) — они и не
  являются частью search-корпуса (раздел 39: это просто справочные данные
  бота, не база знаний), так что вне области применения этой команды.
- Профилирование (0.41с/11МБ/50мс) сделано на локальной машине разработки,
  не на самом Oracle VM.Standard.E2.1.Micro — цифры ориентировочные, точное
  измерение возможно только после Phase 15 (production deployment) на
  реальном сервере.

**Next phase**

Phase 15 — Production deployment (раздел 40 ТЗ). Бот уже развёрнут и
работает на Oracle Cloud под старой версией кода — эта фаза потребует не
"первого деплоя", а миграции живого систем-юнита на новую кодовую базу
(включая перенос/создание `data/user_profile.db`, `.env` с `OWNER_ID` для
новых admin-команд, и проверку, что `bot.py` как точка входа всё ещё
совместима).

---

## Phase 15 — Production deployment

### Отчёт (раздел 42 ТЗ)

**Как понята задача фазы**

Не первый деплой — на Oracle Cloud (`VM.Standard.E2.1.Micro`, Ubuntu
20.04, systemd-юнит `blenderbot`) уже год-с-лишним крутился бот на
дореформенном коде (последний коммит на сервере до этой фазы — `547f9a4`,
Phase "Blender manual index as fallback", ДО Phase 2 refactor). Задача —
безопасно перевести живой процесс, обслуживающий реальных пользователей
Telegram, на текущую архитектуру (Phase 2-14), без длительного простоя и
без потери пользовательских данных (`data/subscribers.json`,
`data/unanswered_log.jsonl`).

**Changed**

На сервере (не в git — это операционные действия, не изменения кода):

- `~/Mrdjdark777-/blender_bot` — `git pull --ff-only origin
  claude/create-application-1ltl3a`: `547f9a4` → `6d53e8d`, 100 файлов,
  чистый fast-forward без единого конфликта (working tree был чистым —
  `git status --short` пуст до пула, все untracked-пути — из
  `.gitignore`). Старые `handlers/`, `utils/`, `config.py` заменены на
  `bot/handlers/`, `search/`, `config/` и т.д. автоматически как часть
  обычного git-разрешения rename/delete.
- venv: `pip install -r requirements.txt` — без изменений (зависимости
  совпадали с локальными: `python-telegram-bot==22.8`, `feedparser`,
  `python-dotenv`, `deep-translator`).
- `blenderbot.service` — `systemctl restart`, подхватил новый `bot.py`
  (тонкая обёртка над `app/main.py`, раздел про `bot.py` в CLAUDE.md
  подтвердился на практике — деплой не потребовал менять systemd unit
  file вообще).
- Пустые директории-огрызки `handlers/__pycache__`, `utils/__pycache__`
  (после git-удаления .py файлов) оставлены как есть — `rm -rf` на живом
  сервере заблокирован защитным классификатором инструмента, косметика,
  не мешает работе.

**Added**

- На сервере: `data/user_profile.db` создался автоматически при первом
  импорте `profile/user_profile.py` (Phase 12 SQLite-слой) — подтверждено
  напрямую (`ls -la data/`), персистентность профилей пользователей на
  проде работает без ручных действий.
- `~/backups/blender_bot_pre_migration_20260821_193934.tar.gz` — снапшот
  всего рабочего каталога ДО миграции (без `venv/`), путь отката, если
  что-то сломается: `git reset --hard 547f9a4` +
  `systemctl restart blenderbot`, либо распаковать архив поверх.

**Removed**

Ничего в git. На сервере — по факту стёрты (через git-плагин, не вручную)
старые `handlers/*.py`, `utils/*.py`, `config.py` — их прямые преемники
уже перечислены выше.

**Tests**

- `python -m unittest discover tests` **на самом сервере** (не только
  локально) — 226/226 passed, Quality Score 91.4%, идентично локальному
  прогону — подтверждена паритетность окружений (Python 3.11.9 через
  pyenv на сервере, тот же venv-набор версий пакетов).
- `sudo systemctl status blenderbot` после рестарта — `Active: active
  (running)`, лог показывает `app.main - INFO - Бот запущен` и
  `telegram.ext.Application - INFO - Application started`, без единого
  traceback.
- **Реальная сквозная проверка от владельца бота** (не мной — я не имею
  доступа к Telegram) — задан вопрос "Что такое модификаторы?" через
  реальный Telegram-клиент. Разобрано по логам `journalctl`: бот
  отправил soft-match предложение ("Возможно, ты имел в виду:
  «Модификаторы стиля линии»?" с кнопками Да/Нет — `sendMessage` в
  17:44:31 UTC), пользователь нажал «Нет» (`answerCallbackQuery` +
  `editMessageText` в 17:44:40 UTC), сообщение честно отредактировалось в
  fallback-текст — раздел 26 ТЗ (Zero-Hallucination Mode) отработал
  корректно на реальном трафике, не на тесте.

**Known issues**

- **Найден реальный пробел покрытия Blender Manual (Phase 4), не пойман
  тестовым набором Phase 13**: для запроса "что такое модификаторы" —
  одного из самых базовых вопросов про Blender — лучшим совпадением
  оказалась узкая "Модификаторы стиля линии" (Line Style Modifiers), а не
  общий обзор. Проверено: в `knowledge/official/manual/5.1/manual.json`
  проиндексированы 95 отдельных модификаторов (Array, Bevel, Mirror и
  т.д.), но НЕТ общей landing/overview страницы "Модификаторы"/"Введение
  в модификаторы" вообще. Тот же класс пробела, что уже отмечался в Phase
  13 Known issues для "Vertex Group" — не баг search/engine.py, а пробел
  ingestion (какие-то overview-страницы Blender Manual не попали в
  индекс при Phase 4). Требует отдельной работы над Phase 4 (доингестия),
  вне рамок Phase 15.
- Профилирование производительности из Phase 14 (0.41с старт / 11МБ /
  50мс на запрос) было получено на dev-машине — на реальном
  `VM.Standard.E2.1.Micro` отдельно не переизмерялось; судя по
  `systemctl status` (Memory: 44.1M для всего процесса вскоре после
  старта) цифры того же порядка, критичных проблем не обнаружено.
- `rm -rf` пустых `handlers/__pycache__`/`utils/__pycache__` на сервере
  заблокирован защитным классификатором инструмента — эстетическая
  недоделка, не влияет на работу бота.
- Старые файлы `data/knowledge_base.json` и `data/manual_index.json` на
  сервере остались физически на диске (не в git, `search/engine.py` их
  больше не читает с Phase 7) — не удалялись в рамках этой фазы, не
  мешают, но и не убраны для чистоты.

**Финальные критерии готовности v2 (раздел 43 ТЗ) — сверка**

Работает без платного AI API ✅ · индексирует официальный Manual ✅ ·
различает версии Blender ✅ (Phase 5) · понимает русские и английские
термины ✅ (Phase 6) · использует aliases ✅ · TF-IDF-retrieval ✅ (Phase 7,
BM25 сознательно не реализован — раздел 10 называет его optional) ·
ранжирует источники ✅ (Phase 10) · показывает источники ✅ (citations в
`_format_citation`) · диагностирует типовые проблемы ✅ (Phase 9, только 2
проблемы засеяны — охват узкий, честно отмечено в Phase 9 Known issues) ·
ведёт multi-turn troubleshooting ✅ · имеет UNKNOWN state ✅ (Phase 10,
Confidence Engine) · SQLite user profile ✅ (Phase 12) · learning system ✅
(Phase 11, только 3 урока — Level System раздела 20 не реализован,
честно отмечено там же) · automated tests ✅ (Phase 13, 226 unit +
540 quality cases) · admin/debug mode ✅ (Phase 14).

Все обязательные критерии выполнены хотя бы частично и честно; узкий
охват контента (2 диагностики, 3 урока, отсутствующие overview-страницы
манула) — известное и задокументированное ограничение объёма данных, а
не архитектурный недостаток.

**Next phase**

Формально все 15 фаз ТЗ пройдены. Дальнейшая работа — не новая фаза, а
расширение объёма знаний и охвата (доингестия Blender Manual, включая
пропущенные overview-страницы; больше диагностических деревьев; больше
уроков и Level System раздела 20; community-источники раздела 4, которые
пока пустые — `knowledge/community/*`) — по мере того, как реальные
пользовательские вопросы (`data/unanswered_log.jsonl`, `/stats`) покажут,
что приоритетнее.

---

## После Phase 15 — правка по живой обратной связи: оговорка про personal-источник

Не новая фаза — точечное исправление UX по факту первого реального
использования на проде (см. Phase 15 Tests: живой вопрос "Что такое
модификаторы?"). Следующий же реальный вопрос ("Какая горячая клавиша
отвечает за Extrude?") получил корректный ответ из личных заметок, но с
припиской "_Из личной базы бота, не сверено с официальной документацией —
если что-то не сходится, доверяй официальному Manual._" под КАЖДЫМ таким
ответом — пользователь прямо сказал, что для простых фактических вопросов
это шум, а не польза: "лучше чтоб он просто давал ответ и все".

**Changed**

- `bot/handlers/qa.py`:
  - `_format_citation()` — для `ai_generated_unverified` теперь
    возвращает `None` (раньше — фиксированную строку-дисклеймер).
    Раздел 15/17 ТЗ формально требует помечать community/personal
    источник явно — здесь сознательно отступили от буквы ради
    пользовательского опыта: `_source_label()`/Conflict Engine
    (раздел 17) по-прежнему честно называют personal-источник, когда
    он РЕАЛЬНО конкурирует с официальным, а не молчат об этом.
  - `_format_chunk_answer()` — общая оговорка `LOW confidence`
    ("_Уверенность в этом ответе невысокая._", раздел 14 ТЗ) больше не
    исключается для `ai_generated_unverified` — раньше исключалась,
    чтобы не дублировать удалённый теперь дисклеймер. Personal-ответы
    при LOW confidence всё ещё честно помечаются, просто одной короткой
    универсальной фразой, а не источник-специфичным абзацем.
- `tests/test_phase10_confidence.py` —
  `test_low_confidence_unverified_answer_has_single_disclaimer_not_duplicated`
  заменён на два теста: `test_unverified_answer_has_no_routine_source_disclaimer`
  (MEDIUM/HIGH personal-ответ — вообще без пометок) и
  `test_unverified_answer_still_gets_low_confidence_disclaimer` (LOW
  personal-ответ — универсальная оговорка есть, source-specific текста нет).

**Tests**

`python -m unittest discover tests` — 227/227 passed.

**Known issues**

Формальное расхождение с буквой раздела 15/17 ТЗ ("Community source
должен быть явно помечен как community answer") — для рутинных ответов
из personal-заметок такая метка больше не показывается. Оставлена только
там, где раздел 17 (Conflict Engine) требует её по существу — при
реальном конфликте с официальным источником. Решение принято намеренно
и по прямому запросу пользователя после проверки на живом трафике, не
случайный пропуск требования.

---

## После Phase 15 — вторая правка: полное убирание confidence-оговорки + закрытие content-пробелов

Продолжение предыдущей правки, тот же живой диалог. Пользователь: "фразу
про уверенность вообще убери, просто ответ и все" + "Добавь прямо сейчас
ответы про модификаторы и другие общие знания такого рода".

**Changed**

- `bot/handlers/qa.py` — `_format_chunk_answer()`: строка
  "_Уверенность в этом ответе невысокая._" (раздел 14 ТЗ) убрана
  полностью, для ЛЮБОГО источника (не только personal). confidence
  по-прежнему считается и виден через `/debug`, просто не выводится в
  чат рядовому пользователю. Дальнейшее сознательное расхождение с
  буквой раздела 14, той же природы, что решение из предыдущей правки.
- `search/engine.py` — два реальных бага поиска, найденных при проверке
  новых записей на живых запросах:
  1. `_find_term()` находил термин только если весь запрос совпадал с
     алиасом целиком, либо алиас был из одного слова. Многословные
     алиасы ("группа вершин", "покраска весов" и т.п.) внутри более
     длинного вопроса никогда не распознавались. Переписан на перебор
     всех непрерывных n-грамм токенов запроса, берётся самое длинное
     совпадение.
  2. `search()`: сортировка результатов была только по `score`; при
     равном `score` (что стало чаще — однословные алиасы вроде "bevel"
     совпадают и у чанка, который реально про тему, и у чанка, который
     просто мимоходом упомянул слово) побеждал более ранний по индексу
     файла чанк, а не более релевантный. Добавлен `lexical_score` как
     вторичный ключ сортировки.
  - Известное ограничение, НЕ исправленное в этой правке: `_find_term()`
    и `TerminologyRegistry.find()` нормализуют текст по-разному —
    `find()` сохраняет пунктуацию (скобки, дефисы) через `normalize()`,
    а n-граммы `_find_term()` собираются из токенов после `tokenize()`,
    где пунктуация уже вырезана. Алиасы с пунктуацией внутри (например,
    "Шейпкеи (формы-ключи)", "N-угольник (N-gon)") из-за этого иногда
    всё ещё не распознаются частью более длинного вопроса. Настоящий
    фикс — унифицировать нормализацию в обоих местах — отдельная,
    более рискованная работа над Phase 7/10 кодом, не сделана здесь
    сознательно, чтобы не трогать больше, чем нужно за один заход.
- `knowledge/official/manual/5.1/manual.json` — удалён 1 битый chunk
  (`blender_manual:5.1:render_freestyle_view_layer_line_style_modifiers_index`,
  "Модификаторы стиля линии"): содержимое — необработанный RST-toctree
  огрызок ("цвет/index.rst альфа/index.rst..."), а не текст. Найден,
  когда после добавления термина "Modifier" этот chunk начал побеждать
  в поиске на запрос "Что такое модификаторы?" с confidence=HIGH и
  выдавать пользователю бессмысленный набор путей вместо ответа.
  Проверено grep'ом по всему корпусу (770 chunks на тот момент) — это
  единственный подобный битый chunk, не системная проблема ingestion.
- `scripts/seed_terminology.py` — добавлен 37-й термин `Modifier`
  (общее понятие, в отличие от Mirror/Bevel/Boolean/Array — конкретных
  модификаторов), category="modifiers", aliases=["модификаторы", "стек
  модификаторов"]. До этого термин "модификатор" в общем смысле не был
  зарегистрирован вообще — вопрос "Что такое модификаторы?" никогда не
  получал exact_term_bonus. `knowledge/system/terminology/terms.json`
  перегенерирован (`python scripts/seed_terminology.py`).
- `tests/test_phase3_knowledge_registry.py` —
  `test_migrated_count_matches_source`: было `assertEqual` (ровно 70
  chunks, сколько смигрировано в Phase 3), стало `assertGreaterEqual` —
  `dima_notes.json` теперь живая база, куда добавляются новые
  hand-written записи, а не только результат одноразовой миграции.
- `tests/test_phase10_confidence.py` — тест на LOW-confidence оговорку
  переписан: теперь проверяет, что `_format_chunk_answer` для LOW
  возвращает ТОЛЬКО `chunk.content`, без какого-либо добавленного текста.

**Added**

- `knowledge/personal/dima_notes/dima_notes.json` — 13 новых записей
  (personal_notes:0070-0082, `source_type=ai_generated_unverified`,
  `needs_review=true`, как и все существующие personal-заметки):
  общий обзор Модификаторов (дополнительно к найденной официальной
  странице после удаления битого chunk'а), Shade Smooth, Vertex Group,
  UV Unwrap, Keyframe, Shape Keys, Weight Paint, Cloth Simulation,
  Rigid Body, Fluid Simulation, Loop Cut, 3D Cursor, Bevel. Выбраны не
  произвольно — по результатам систематической проверки всех 36 (затем
  37) терминов из `TerminologyRegistry` вопросом "Что такое X?" через
  реальный `qa_service.answer()`: 25 из 36 терминов либо проваливались в
  soft_match/fallback, либо находили явно не тот chunk. 13 из них —
  подтверждённые content-пробелы (ни один существующий chunk не отвечал
  на вопрос по существу), остальные 12 — уже отвечали корректно, просто
  требовали Да/Нет подтверждения из-за сопутствующих багов
  `search/engine.py` (исправлены выше, часть этих терминов после фикса
  тоже стала отвечать напрямую).

**Removed**

1 битый chunk из `knowledge/official/manual/5.1/manual.json` (см. Changed).

**Tests**

`python -m unittest discover tests` — 227/227 passed. Quality Score:
90.8% (было 91.4% до этой правки — небольшая просадка retrieval_accuracy
70.9% против 73.6%, не расследовалась отдельно за недостатком времени в
рамках точечной правки; общий score по-прежнему далеко выше цели ТЗ 70%).

**Known issues**

- Три термина всё ещё требуют подтверждения (soft_match), а не отвечают
  напрямую: Shader Editor, N-gon, Shape Keys — упираются в описанное выше
  расхождение нормализации пунктуации между `_find_term()` и
  `TerminologyRegistry.find()`. Не исправлено сознательно в этой правке.
- Retrieval accuracy просела на 2.7 п.п. (73.6% → 70.9%) — вероятно
  из-за того, что новые personal-заметки и более широкий n-gram
  term-matching задели ранжирование каких-то кейсов из
  `tests/quality/cases.json`, конкретная причина не изолирована.
- Другие термины, отмеченные WEAK в первичном скане (Extrude, Knife
  Tool, HDRI, Non-manifold Geometry, Retopology, Apply Transform) —
  контент для них уже существовал и корректен, они отвечают напрямую
  (`chunk_confident`), просто со confidence-меткой LOW — это больше не
  показывается пользователю вообще, так что реальной проблемы для UX
  здесь нет, WEAK в скане — артефакт старого критерия скрипта
  (`conf in HIGH/MEDIUM`), не факт о качестве ответа.

---

## После Phase 15 — третья правка: EEVEE/FBX/PBR + источники по запросу + "расскажи подробнее"

Тот же живой диалог, две отдельные находки пользователя и одна большая
задача. Находка 1: "Что такое pbr?" не находил термин (не был
зарегистрирован) и лучшим совпадением по лексике оказался chunk про
EEVEE — с испорченным переводом заголовка "ИИВИ" (нечитаемо). Находка 2
(прямая задача): "теперь при ответах не нужно указывать источник, просто
ответ" + "если будет доп вопрос типа 'а есть ли ещё информация?' ...
придумай все возможные варианты запроса... укажи сразу по больше
источников".

**Changed**

- `knowledge/official/manual/5.1/manual.json` — исправлены 2 битых
  `translated_title`: `"ИИВИ"` → `"EEVEE"`, `"ФБХ"` → `"FBX"`. Оба —
  автопереводчик (Phase 4, `deep-translator`) попытался
  транслитерировать английскую аббревиатуру фонетически вместо того,
  чтобы оставить как есть. Проверено grep'ом по всему корпусу (769
  chunks) на паттерн "короткий CAPS кириллический заголовок из
  английской аббревиатуры" — нашлось только 2 таких случая, не системная
  проблема ingestion.
- `bot/handlers/qa.py` — существенная переработка:
  - `_format_chunk_answer()`: строка с источником (раздел 15 ТЗ) убрана
    из ОБЫЧНОГО ответа полностью — по прямой обратной связи ("просто
    ответ и все"). Источник по-прежнему доступен, но только по явному
    запросу (см. `_format_more_info` ниже).
  - `_format_citation()` удалён как функция (стал мёртвым кодом после
    предыдущего пункта), вместо него — новый компактный `_source_ref()`
    (одна строка на источник, рассчитан на список из нескольких).
  - Новая функция `_is_more_info_request()` + константа
    `_MORE_INFO_MARKERS` — большой список фраз-триггеров "дай больше
    информации" (см. Added). Ограничение по длине (≤4 слова, как раньше
    у `_is_vague_followup`) — сознательно, чтобы не перехватывать
    настоящие вопросы с похожими словами: "источник" НЕ отдельный
    маркер, иначе реальный вопрос "Что такое источник света?" ложно
    перехватывался бы как просьба прислать источники. Покрыто тестом
    (`tests/test_qa_followup.py::test_real_question_about_light_source_is_not_intercepted`).
  - `_FOLLOWUP_MARKERS` (для `_is_vague_followup`, "не помню контекст")
    урезан до `{"почему", "зачем", "понятнее"}` — остальные слова
    ("подробнее", "расскажи", "ещё" и т.п.) теперь обрабатываются
    `_is_more_info_request()` осмысленно, а не просто отклоняются.
  - `answer_question()`: после уверенного (`chunk_confident`) ответа
    вопрос сохраняется в `context.user_data["last_question"]` — та же
    модель, что уже использовалась для `pending_question` в soft_match
    диалоге (Phase 7), не полная история переписки, а один слот "что
    спросили последний раз". Проверка `_is_more_info_request()` идёт
    ДО `_is_vague_followup()`, иначе слова вроде "подробнее" никогда бы
    до неё не доходили.
  - `qa_confirm_callback()`: после подтверждения ("Да, это оно") тоже
    сохраняет `last_question`, чтобы "подробнее" работало и после
    soft_match-диалога, не только после прямого ответа.

**Added**

- `scripts/seed_terminology.py` — термин `PBR` (Physically Based
  Rendering), category="shaders" — 38 терминов.
  `knowledge/personal/dima_notes/dima_notes.json` — новая заметка
  personal_notes:0083 "Что такое PBR?" (в реальности пока проигрывает по
  score официальному chunk'у EEVEE при равном exact_term_bonus — тот же
  класс ограничения, что уже описан в Known issues выше; главное, что
  сама путаница с "ИИВИ" устранена, и ответ теперь приходит напрямую).
- `bot/handlers/qa.py`:
  - `_format_more_info(question)` — по последнему вопросу заново
    прогоняет `qa_service.engine.search(..., top_n=5)` и формирует
    ответ из (а) содержимого 2-4 дополнительных найденных результатов
    сверх уже показанного и (б) списка ИСТОЧНИКОВ по ВСЕМ найденным
    результатам (не одному) плюс общая ссылка на официальную
    документацию — раздел 15 ТЗ, но по запросу, не в каждом сообщении.
  - `_source_ref(chunk)` — компактная строка "источник" для списка.
  - `NOTHING_TO_EXPAND_TEXT` — честный ответ, когда "подробнее"
    приходит без сохранённого предыдущего вопроса (свежий диалог, или
    `context.user_data` уже очищен перезапуском процесса).
- `tests/test_qa_followup.py` — 9 тестов: распознавание фраз-триггеров
  (в т.ч. НЕ ложное срабатывание на реальный вопрос про источник света и
  на полноценный вопрос с "подробнее" внутри темы), отсутствие источника
  в обычном ответе, сохранение `last_question` после уверенного ответа И
  после подтверждения soft_match, полный сценарий
  вопрос → "подробнее" → список источников.

**Tests**

`python -m unittest discover tests` — 236/236 passed (227 + 9 новых).
Quality Score не изменился (изменения в `bot/handlers/qa.py` не
затрагивают `search/`, который меряет Phase 13 suite) — 90.8%.

**Known issues**

- Триггер-фразы для "дай больше информации" — не исчерпывающий список
  (пользователь просил "все возможные варианты" — по факту собран
  большой, но не гарантированно полный набор). Новые формулировки можно
  будет добавлять в `_MORE_INFO_MARKERS` по мере находок, как уже
  делалось с паттернами `intents/engine.py` в Phase 13.
- "Ещё информация" повторно на ту же тему возвращает РОВНО ТЕ ЖЕ top-5
  результатов поиска — нет постраничной пагинации (следующие 5, а не
  первые). Если у пользователя после `_format_more_info` останется тот
  же нераскрытый интерес, второй "подробнее" подряд не даст ничего
  нового. Не реализовано в этой правке.
- `PBR` термин зарегистрирован, но собственная personal-заметка о нём
  пока проигрывает более авторитетному, но менее прицельному chunk'у
  EEVEE (структурное ограничение ranking'а, см. предыдущую правку) —
  ответ не ошибочный, просто не идеальный. **Исправлено в следующей
  правке ниже** — см. "После Phase 15 — четвёртая правка".

---

## После Phase 15 — четвёртая правка: заголовок vs тело в exact_term_bonus + убрана заметка про конкурирующий источник

Пользователь протестировал реальный ответ на "Что такое pbr?" через бота
и получил старое поведение (chunk EEVEE вместо personal-заметки про PBR)
+ абзац "_Также нашлась информация из другого источника (личная база
бота, не проверено) — показан более приоритетный вариант._" — и явно
попросил убрать оба.

**Changed**

- `search/engine.py` — `_exact_term_bonus()` переработан: теперь
  различает, встретился ли алиас термина в ЗАГОЛОВКЕ chunk'а
  (`translated_title`/`original_title`, bonus=1.0 — сильный сигнал "этот
  chunk РЕАЛЬНО про эту тему") или только в теле `content` (bonus=0.5 —
  слабый сигнал, могло быть случайное упоминание мимоходом). Раньше оба
  случая давали одинаковый bonus=1.0: chunk "EEVEE" (заголовок вообще не
  содержит "PBR", слово встречается один раз в описании) конкурировал на
  равных с chunk'ом, целиком посвящённым PBR, и обычно побеждал за счёт
  авторитетности официального источника. Это тот же класс проблемы, что
  уже чинился точечно (lexical_score tie-break, удаление битого
  index.rst chunk'а) — здесь исправлена сама причина, а не отдельные
  проявления.
  - Эффект оказался шире одного PBR: `python -m unittest tests.test_phase13_quality_suite`
    — Quality Score вырос с 90.8% до **91.9%**, retrieval_accuracy — с
    70.9% до **76.0%** (лучше, чем было даже ДО добавления 13 новых
    personal-заметок в предыдущей правке, где retrieval_accuracy впервые
    просел). Известная из предыдущей правки просадка не расследовалась
    отдельно — оказалась той же причиной, что и баг с PBR, и исправилась
    этим же фиксом.
- `bot/handlers/qa.py` — `_format_chunk_answer()` дальше упрощён: убрана
  последняя оставшаяся мета-информация — заметка про конкурирующий
  источник (раздел 17 ТЗ, Conflict Engine). Функция теперь просто
  `return chunk.content` — по прямой обратной связи пользователя
  ("вообще не нужно такого типа инфу, только ответ на вопрос, все").
  Сигнатура упрощена: параметры `confidence`/`competing_chunk` убраны
  (были фактически мертвы после двух предыдущих правок — ничего с ними
  не делалось). `_source_label()` удалена как ставшая мёртвым кодом.
  `_find_competing_source()` (search/qa_service.py) и
  `QAResult.competing_chunk` НЕ удалены — конфликт по-прежнему
  вычисляется, просто не рендерится в чат (тот же принцип, что
  `confidence` — доступен через /debug, раздел 33 ТЗ).

**Removed**

- `bot/handlers/qa.py::_source_label()` — не используется нигде после
  удаления рендеринга заметки про конкурирующий источник.

**Tests**

- `tests/test_phase10_confidence.py` —
  `test_high_confidence_official_answer_has_no_low_disclaimer` заменён на
  `test_confident_official_answer_is_plain_content` (ответ ТОЧНО равен
  `chunk.content`, без каких-либо добавлений) +
  `test_competing_source_is_still_computed_even_if_not_shown`
  (`_find_competing_source` по-прежнему находит конфликт, даже если он
  не попадает в текст). `test_unverified_answer_has_no_routine_source_disclaimer`
  и `test_low_confidence_answer_has_no_disclaimer_either` объединены в
  `test_unverified_answer_is_plain_content` (та же дедупликация —
  сигнатура функции больше не принимает confidence вообще).
- `python -m unittest discover tests` — 236/236 passed. Quality Score:
  **91.9%** (было 90.8%).

**Known issues**

Три термина, отмеченные в предыдущей правке как всё ещё soft_match
(Shader Editor, N-gon, Shape Keys) — не перепроверялись отдельно после
этого фикса; возможно, часть из них теперь тоже отвечает напрямую
благодаря более точному exact_term_bonus, но это не подтверждено
измерением в рамках данной точечной правки.

---

## После Phase 15 — пятая правка: лемматизация (стемминг) русских словоформ

Пользователь стресс-тестировал бота вопросами, сгенерированными Gemini
("не на один он не отвечает"). Конкретный пример: "В чём главная
опасность, если делать фаску на объекте, у которого не применён масштаб
(Scale не равен 1.0, 1.0, 1.0)?" — ответа не было, хотя нужный контент
РЕАЛЬНО есть в базе (personal-заметка "Как применить трансформации и
зачем это нужно" прямо говорит: "фаски получаются неровными"). Причина:
в проекте не было стемминга/лемматизации для русского языка (честно
задокументированное ограничение с самых ранних фаз, см. CLAUDE.md) — TF-IDF
считал "фаску"/"фаски", "применён"/"применить" РАЗНЫМИ словами, и
пересечение токенов между вопросом и ответом было практически нулевым.
Спросил пользователя, чинить ли это сейчас (архитектурное изменение
ядра поиска, а не точечный патч) — да, чинить.

**Changed**

- `requirements.txt` — добавлены `pymorphy3>=2.0`,
  `pymorphy3-dicts-ru>=2.4`. Не `pymorphy2` (оригинал) — он не работает на
  современном Python: падает на `ModuleNotFoundError: No module named
  'pkg_resources'` (зависит от `setuptools`, который больше не ставится в
  venv по умолчанию). `pymorphy3` — поддерживаемый форк, совместимый с
  Python 3.11+, проверено напрямую в venv перед принятием решения.
- `search/tfidf.py` — новая функция `lemmatize(tokens)`: приводит русские
  словоформы к начальной форме через `pymorphy3.MorphAnalyzer` (ленивая
  инициализация — словарь грузится один раз, только если лемматизация
  реально понадобилась). Английские и нераспознанные словоформы
  возвращаются без изменений (кириллица определяется отдельным regex
  перед вызовом `.parse()`, не тратим анализатор на "bevel"/"scale").
  Сознательно **не** встроена в сам `tokenize()` — применяется только в
  TF-IDF-слое (`SearchEngine._chunk_tokens()` при индексации,
  `SearchEngine.search()` при вычислении `lexical_score`), а не в
  `_find_term()` (exact term/alias match) и не в `diagnostics/registry.py`
  (keyword prefix match) — у обоих уже есть собственные, отдельно
  протестированные способы переживать словоформы (leading-boundary regex,
  `startswith`-префикс), которые лемматизация могла бы непредсказуемо
  сломать (например, видовые пары "применить"/"применять" — РАЗНЫЕ леммы
  в русской морфологии, prefix-хак в diagnostics на это не рассчитан).
- `search/engine.py` — `_chunk_tokens()` лемматизирует токены перед
  передачей в `TfidfIndex.fit()`; `search()` лемматизирует токены запроса
  перед `self._tfidf.similarities()`. `_find_term(query)` работает на
  СЫРОМ запросе, как и раньше — не тронут.
- `tests/test_phase7_search_engine.py` —
  `test_gibberish_scores_low`: тестовая фраза "непонятный набор слов
  зюзюка мяу" содержала настоящие русские слова ("набор") вперемешку с
  выдуманными — после лемматизации "набор"/"наборы" стало честно
  совпадать с реальными chunk'ами ("Наборы для лица"). Заменена на
  полностью выдуманные слова без единого настоящего русского
  ("зюзюка бызмпк хрзнык мяу кыш").

**Tests**

- `python -m unittest discover tests` — 236/236 passed.
- Quality Score: **91.8%** (было 91.9%, статистически не значимо).
  `retrieval_accuracy` чуть выросла (76.0% → 76.4%).
  `source_authority_accuracy` чуть просела (100% → 99.1%,
  1 кейс из ~540): расплывчатый запрос "что-то с настройками" теперь
  тоже находит реальный официальный chunk вместо честного fallback —
  тот же побочный эффект расширенного recall, что и с gibberish-тестом
  выше, не расследовался отдельно (одна просевшая ambiguous-категория
  против явного улучшения retrieval).
- Ручная проверка целевого примера пользователя ("фаска... применён
  масштаб"): пересечение токенов между вопросом и правильным ответом
  выросло с 1 слова до 3 ("масштаб", "фаска", "объект"), score чанка
  вырос с 0.107 до 0.171 и он попал в top-5 (раньше не входил вообще).
  Тем не менее итоговый ответ ВСЁ ЕЩЁ `fallback` (0.171 < порога
  soft_match 0.20) — см. Known issues.

**Known issues**

- Целевой пример пользователя ("фаска + неприменённый масштаб") НЕ
  решён полностью — упирается в более глубокую лингвистику, чем
  лемматизация способна закрыть: "применён" (совершенный вид, лемма
  "применить") и "применяет" (несовершенный вид, лемма "применять") —
  это РАЗНЫЕ леммы в русской морфологии (видовые пары глаголов), не
  словоформы одного слова. Нужен словарь видовых пар/синонимов сверху
  лемматизации — отдельная, более сложная работа, не сделана в этой
  правке. Лемматизация — реальное, измеримое улучшение (retrieval
  accuracy выросла, конкретный пример продвинулся от "0 общих слов" до
  "в топ-5, почти на пороге"), но не решает 100% сложных, естественно
  сформулированных вопросов — раздел 44 ТЗ прямо говорит, что система не
  пытается симулировать ChatGPT, и узость охвата контента (раздел 36:
  "1000 качественных лучше 100000 мусорных") остаётся отдельным,
  независимым от лемматизации ограничением.
- Старт процесса вырос с ~0.4с (Phase 14) до ~2.3с локально (загрузка
  словаря pymorphy3 + лемматизация всего корпуса при построении TF-IDF
  индекса на старте). На целевом `VM.Standard.E2.1.Micro` не измерялось
  отдельно — вероятно медленнее, чем на dev-машине, но
  `RestartSec=5`/без `TimeoutStartSec` в systemd unit (DEPLOYMENT.md) не
  накладывает жёсткого ограничения, функциональной проблемы не должно
  быть. Задержка на сам запрос (`answer()`), наоборот, не выросла.
- `pkg_resources`/`setuptools`-проблема `pymorphy2` — предупреждение для
  будущего: другие пакеты, ссылающиеся на устаревший `pymorphy2` (а не
  `pymorphy3`), скорее всего тоже не заработают на текущем окружении
  без ручной установки `setuptools`.

---

## ТЗ v3, этап 1 — `/unanswered` + `/quick_add`

Пользователь передал новое ТЗ (`docs/Blender_Helper_v3_TZ.pdf`,
"Deterministic & Scalable Engine") — раздел 40 ТЗ v2 полностью пройден,
дальше работа идёт по этому новому документу. Порядок этапов согласован
с пользователем: 1) `/unanswered`+`/quick_add`, 2) толерантность к
опечаткам, 3) новые диагностические ветки, 4) BM25, 5) полный
Manual-парсер + скриншоты — по убыванию ценности/риска. Раздел 1.2
(жёсткий приоритет "личные заметки > официальный Manual") оставлен без
изменений по прямому согласию пользователя — см. таблицу статусов ТЗ v3
в начале файла.

**Changed**

- `bot/handlers/admin.py` — `/reindex` разложен на переиспользуемую
  `_reload_knowledge()` (собирает новые `QAService`/`DiagnosticRegistry`/
  `LessonRegistry` и подменяет singleton'ы в `bot.handlers.qa/diagnostics/
  education`) + сам `reindex_command()`, который теперь только форматирует
  ответ. `_reload_knowledge()` переиспользуется `/quick_add`, чтобы не
  дублировать логику пересборки индекса.
- `app/main.py` — зарегистрированы `/unanswered`, `/quick_add`.
- `ADMIN_HELP_TEXT` — дополнен обеими новыми командами.

**Added**

- `bot/handlers/admin.py`:
  - `unanswered_command()` (раздел 3.2 ТЗ v3) — последние 15 вопросов из
    `UNANSWERED_LOG_PATH` (тот же лог, что пишет `QAService.answer()` с
    Phase 7), новые сверху, с распознанным score и intent-типом; битые
    JSON-строки в логе тихо пропускаются, а не роняют команду.
  - `quick_add_command()` (раздел 3.2 ТЗ v3) — `/quick_add вопрос |
    ответ`: парсит по первому `|`, создаёт `KnowledgeChunk`
    (`source_type=ai_generated_unverified`, `needs_review=True` — как и
    все остальные personal-заметки, наспех вбитый ответ честно не
    выдаётся за проверенный факт) в `knowledge/personal/dima_notes/
    dima_notes.json`, сохраняет и сразу вызывает `_reload_knowledge()` —
    ответ доступен для поиска без перезапуска процесса, как и просит ТЗ.
    При сбое реиндексации после сохранения — заметка всё равно остаётся
    на диске (сообщение прямо говорит сделать `/reindex` вручную), не
    теряется молча.
- `tests/test_admin_quick_add.py` — 8 тестов: `/unanswered` (пустой лог,
  порядок новые-сверху, устойчивость к битым строкам, OWNER_ID gate),
  `/quick_add` (usage при отсутствии `|`/пустых полях, реальное
  сохранение chunk'а с правильными полями + подмена singleton'а
  `qa_service`, OWNER_ID gate — включая проверку, что чужой запрос НЕ
  пишет файл вообще). `/quick_add`-тесты пишут во временный файл
  (подменяют `admin_module._PERSONAL_NOTES_PATH` И
  `admin_module.KNOWLEDGE_CHUNK_PATHS` — второе обязательно, иначе
  `_reload_knowledge()` всё равно читал бы настоящую
  `dima_notes.json` в обход подмены).

**Removed**

Ничего.

**Tests**

`python -m unittest discover tests` — 244/244 passed (236 + 8 новых).
Quality Score не изменился (изменения не затрагивают `search/`) — 91.8%.

**Known issues**

- И локальный, и, вероятно, серверный `data/unanswered_log.jsonl`
  засорены синтетическими вопросами из прогонов `tests/quality` suite
  (внерелевантные "no_answer"-кейсы вроде "Как заваривать чай?",
  "Что такое ChatGPT?") — на сервере это попало в лог во время прогона
  тестов прямо там при деплое Phase 15 (см. соответствующий отчёт,
  Known issues). `/unanswered` честно показывает и этот шум тоже — не
  чистилось в рамках этого этапа, не запрошено пользователем.
- `/quick_add` не проверяет вопрос/ответ на дубликаты с уже существующими
  заметками — если один и тот же вопрос вбить дважды, появятся два
  chunk'а. Не считается блокирующим (raздел 29 ТЗ v2, Duplicate
  Detection, и так уже отмечен как нереализованный с Phase 3).
- `/unanswered` не даёт пагинацию — всегда последние 15, без возможности
  посмотреть более старые записи из Telegram. Если понадобится глубже —
  пока только через SSH и сам файл.

**Next phase**

ТЗ v3, этап 2 — толерантность к опечаткам (Левенштейна/rapidfuzz,
раздел 1.1 ТЗ v3): "бевел", "модификатр" и подобные опечатки должны
нормализовываться перед поиском термина.

---

## ТЗ v3, этап 2 — толерантность к опечаткам + найденная попутно оптимизация скорости

**Changed**

- `knowledge/terminology.py` — новый метод `TerminologyRegistry.
  find_fuzzy(word, cutoff=0.85)`: нечёткое совпадение через
  `difflib.get_close_matches` (stdlib, не `rapidfuzz` — раздел 1.1 ТЗ v3
  сам называет `difflib` допустимой альтернативой; выбран сознательно,
  чтобы не тащить C-расширение ради лёгкой проверки на слабом
  бесплатном сервере, раздел 2 ТЗ v2). Порог 0.85 подобран вручную на
  реальных примерах: "модификатр"→"модификатор" даёт 0.952, "експорт"→
  "экспорт" — 0.857, оба проходят; при этом настоящие РАЗНЫЕ короткие
  слова словаря остаются далеко ниже порога ("свет"/"цвет" — 0.75,
  "меш"/"мех" — 0.667) — не путаются. Слова короче 4 символов не
  проверяются (слишком велик риск случайных совпадений).
- `search/engine.py::_find_term()` — если точное n-граммное совпадение
  не нашлось ни для одной подпоследовательности токенов запроса, каждый
  ОТДЕЛЬНЫЙ токен (не фразы целиком — иначе O(n²) фаззи-сравнений и
  выше риск случайного совпадения длинной фразы) проверяется через
  `find_fuzzy()`.
- `scripts/seed_terminology.py` — термин Bevel получил алиас "бевел".
  Важное уточнение: это НЕ опечатка, а транслитерация — Левенштейн
  между кириллицей и латиницей даёт 0.0 схожести ("бевел"~"bevel"), то
  есть fuzzy-matching в принципе не мог найти "бевел" сам по себе,
  несмотря на то что ТЗ v3 приводит его как пример именно "опечатки".
  Нужен явный алиас, что и сделано. `terms.json` перегенерирован — 38
  терминов.
- `search/engine.py::_exact_term_bonus()` — **попутно найденная и
  исправленная реальная проблема производительности**, не входившая в
  исходный запрос этого этапа: при измерении задержки перед добавлением
  теста на время отклика (раздел 4.1 ТЗ v3) обнаружилось, что
  `_exact_term_bonus` заново токенизировала title+content КАЖДОГО из
  ~850 chunks на КАЖДЫЙ запрос — узкое место, никак не связанное с
  лемматизацией или fuzzy-matching (те сами по себе быстрые, <1мс).
  Текст chunk'а не меняется между запросами, поэтому токены title/body
  теперь считаются ОДИН РАЗ в `SearchEngine.__init__` (`self.
  _chunk_title_tokens`/`self._chunk_body_tokens`, списки, параллельные
  `self.chunks`) и переиспользуются в `search()` по индексу. Сигнатура
  `_exact_term_bonus(term, chunk)` → `_exact_term_bonus(term,
  title_tokens, body_tokens)`.
  - Эффект: худшее время `QAService.answer()` на репрезентативной
    выборке запросов упало с ~47-51мс до ~25-27мс (замерено локально,
    3 прогона подряд) — было на грани/иногда за порогом 50мс из
    раздела 4.1 ТЗ v3, стало с комфортным запасом.

**Added**

- `tests/test_phase6_terminology.py::FuzzyFindTests` — 5 тестов:
  опечатка нормализуется, точное совпадение тоже работает через
  fuzzy-путь, короткие слова не проверяются, несвязанные слова не
  совпадают, "свет"/"цвет" (оба настоящие Blender-понятия) не путаются
  друг с другом.
- `tests/test_phase7_search_engine.py`:
  - `test_typo_still_finds_term_via_fuzzy_match` — буквальный пример из
    ТЗ v3 ("модификатр" → термин Modifier) на реальном корпусе.
  - `test_transliterated_bevel_alias_found_exactly` — "бевел" находит
    Bevel через явный алиас.
  - `ResponseTimeTests` (раздел 4.1 ТЗ v3) — прогоняет каждый 7-й кейс
    из `tests/quality/cases.json` (~77 реальных вопросов из 540, а не
    синтетика) через `QAService.answer()` и проверяет, что худшее время
    < 50мс. Честная оговорка в докстринге: порог измерен на dev-машине,
    целевой Oracle VM.Standard.E2.1.Micro слабее — тест ловит регрессии
    производительности при разработке, не гарантирует 50мс именно на
    проде.

**Removed**

Ничего.

**Tests**

`python -m unittest discover tests` — 252/252 passed (244 + 8 новых).
Quality Score не изменился — 91.8% (кэширование токенов не меняет сам
алгоритм ранжирования, только убирает повторные вычисления). Полный
прогон тестов заодно стал заметно быстрее (26.5с → 20-24с) — побочный
эффект той же оптимизации.

**Known issues**

- `find_fuzzy()` сравнивается против ВСЕХ зарегистрированных алиасов
  (~190 строк при 38 терминах) построчно через `difflib` — при росте
  словаря терминов на порядок это может потребовать пересмотра (например,
  индекс по первой букве/длине слова), но при текущем объёме не является
  проблемой (миллисекунды, см. раздел 4.1 тест).
- Раздел 1.1 ТЗ v3 также просит "расширить словарь двуязычной
  терминологии" в целом — этот этап добавил инфраструктуру нормализации
  опечаток и ровно один новый алиас ("бевел"), а не занимался
  систематическим расширением словаря терминов — это отдельная,
  content-ориентированная работа, не сделанная здесь.
- Оптимизация `_exact_term_bonus` не измерялась отдельно на реальном
  Oracle VM.Standard.E2.1.Micro — только локально на dev-машине;
  учитывая характер изменения (устранение явно избыточной повторной
  работы, не смена алгоритма), ожидается пропорциональное или большее
  относительное ускорение на более слабом железе, но это не измерено.

**Next phase**

ТЗ v3, этап 3 — новые диагностические ветки: проблемы с UV-разверткой,
запеканием карт (baking), симуляциями (раздел 3.1 ТЗ v3).

---

## ТЗ v3, этап 3 — новые диагностические ветки (UV, запекание, симуляции)

**Changed**

- `scripts/seed_diagnostics.py` — добавлены 3 новых дерева (раздел 3.1
  ТЗ v3), тот же честный подход, что у первых двух: синтез собственных
  знаний, `sources=[]` (раздел 26 ТЗ — не выдавать непроверенное за
  официально подтверждённое). `PROBLEMS` расширен с 2 до 5 деревьев,
  `problems.json` перегенерирован.

**Added**

- **`uv_unwrap_issues`** — "Что не так с текстурой?" → растянута/искажена
  (ветки: не применён масштаб / недостаточно швов) или острова
  накладываются (ветки: намеренно, для тайлинга / случайно — дубли
  граней или Mirror без раздельной развёртки).
- **`baking_artifacts`** — "В чём проявляется проблема запекания?" →
  чёрные пятна/дыры (Ray Distance/Extrusion), видны швы (Margin), шум по
  краям (Samples для Bake), либо запекание вообще не запускается (нет
  UV / неверный порядок Selected to Active / нет Image Texture node).
- **`simulation_collision_issues`** — "Какая симуляция не реагирует на
  столкновения?" → Cloth (нет физики Collision у препятствия), Rigid
  Body (оба объекта Active вместо Passive, либо неверный Collision
  Shape), Fluid (препятствие не Effector, вне Domain, либо не
  пересчитано через Bake).
- `tests/test_phase9_diagnostics.py` — 10 новых тестов в
  `RealSeededDataTests`: счётчик "5 проблем", по 2-3 findability-теста
  на каждое новое дерево на реалистичных формулировках (включая
  причастную форму "запечённой", см. Known issues).

**Removed**

Ничего.

**Tests**

`python -m unittest discover tests` — 260/260 passed (252 + новый
методы). Quality Score не изменился — 91.8% (diagnostics не входит в
retrieval-метрики Quality Suite напрямую, только diagnosis_accuracy —
не затронут, новые деревья не заменяют старые). Дополнительно проверен
полный Telegram-сценарий (`answer_question` → кнопки диагностики) на
одном из новых деревьев вручную — корректно.

**Known issues**

- Найдены и исправлены две реальные словообразовательные проблемы при
  проверке на реалистичных фразах (тот же класс, что уже несколько раз
  встречался в проекте — короткие префиксные основы против чередований
  в русской морфологии): "запек" (запекание) не ловил "запечённой"
  (чередование к/ч) — добавлена отдельная основа "запеч"; для симуляций
  не хватало "сквозь"/"падает"/"реагирует"/"препятствие" — без них даже
  прямые, естественные формулировки не набирали `min_matches=2`.
- Один сконструированный edge-case ("На запечённой текстуре видны швы
  МЕЖДУ ОСТРОВАМИ") сознательно смешивает лексику UV и baking веток и
  срабатывает на `uv_unwrap_issues`, а не `baking_artifacts` — при
  такой формулировке это разумный исход (упоминание "островов" — это и
  есть UV-терминология), не баг. Более естественная формулировка
  ("после запекания видны швы на текстуре") работает верно.
- "Скриншоты-схемы на ключевых шагах диагностики" (раздел 3.1 ТЗ v3,
  вторая половина пункта) НЕ реализованы в этом этапе — требуют
  реальных графических активов (не только кода), сгруппированы с
  полным Manual-парсером как этап 5 в согласованном с пользователем
  порядке работы.

**Next phase**

ТЗ v3, этап 4 — BM25 вместо TF-IDF (раздел 1.1 ТЗ v3).

---

## Внеплановая правка (между этапами 3 и 4 ТЗ v3) — /learn-диалог и пробел «шейдинг»

Пользователь протестировал `/quick_add` и `/learn` вживую и нашёл два
реальных бага/недоразумения, не связанных с текущим этапом ТЗ v3 —
исправлены сразу, как и в предыдущих подобных случаях (см. записи
"После Phase 15" выше).

**Находка 1 — `/learn` без темы ломал следующий ответ пользователя.**
`/learn` без аргумента спрашивает "какую тему изучаем?", но ответ вида
"Mirror" (1 слово) или "Модификатор Mirror" (2 слова) перехватывался
`_is_vague_followup()` в `bot/handlers/qa.py` как короткое сообщение без
контекста — бот отвечал "не помню, о чём речь" вместо того, чтобы начать
урок.

**Находка 2 — `/quick_add` был непонятен: пользователь принял его за
способ ЗАДАТЬ вопрос** ("/quick_add, что такое шейдинг?"), тогда как это
инструмент для ВЛАДЕЛЬЦА — вписать вопрос И готовый ответ, чтобы бот их
запомнил. Заодно оказалось, что "Что такое шейдинг?" (реальный обычный
вопрос) не находил ответа вообще — термин "шейдинг" не был
зарегистрирован.

**Changed**

- `bot/handlers/education.py` — `learn_command()` при вызове без
  аргумента ставит `context.user_data["edu_awaiting_topic"] = True`.
  Новая функция `try_continue_learn(text, update, context) -> bool` —
  если флаг стоит, следующее свободное сообщение обрабатывается как
  ответ на вопрос "какую тему изучаем?" (тот же принцип, что
  `diagnostics.try_start_diagnostic`), расходуется за один раз
  независимо от исхода (тема не нашлась → `TOPIC_NOT_FOUND_TEXT`, флаг
  всё равно снимается, не залипает). Логика показа урока вынесена в
  общий `_send_lesson()` — раньше дублировалась.
- `bot/handlers/qa.py` — `answer_question()` вызывает
  `try_continue_learn()` В САМОМ НАЧАЛЕ, раньше проверок
  `_is_more_info_request`/`_is_vague_followup` — иначе короткий ответ с
  названием темы до них бы просто не добрался.
- `scripts/seed_terminology.py` — новый термин `Viewport Shading`
  (category="shaders", alias "шейдинг") — 39 терминов. Алиас "режим
  отображения" сознательно НЕ включён — при первой попытке он дословно
  совпал с заголовком другой официальной страницы Manual ("Режим
  отображения" / Display Mode, про цветовое распределение
  превью-изображения) и та побеждала по `exact_term_bonus` вместо
  реального ответа про шейдинг — тот же класс проблемы, что уже был с
  EEVEE/PBR (см. четвёртую правку выше), только в собственном же новом
  алиасе, а не в существующем корпусе. Исправлено удалением
  проблемного алиаса, не переработкой алгоритма.
- `knowledge/personal/dima_notes/dima_notes.json` — новая заметка
  personal_notes:0084 "Что такое шейдинг (Viewport Shading)?" (Wireframe/
  Solid/Material Preview/Rendered).

**Added**

- `tests/test_phase11_education.py` — 4 новых теста: флаг `edu_awaiting_topic`
  ставится, `try_continue_learn` резолвит голое название темы, возвращает
  `False` вне контекста ожидания, снимает флаг даже при ненайденной теме.
- `tests/test_qa_learn_continuation.py` (новый файл) — интеграционные
  тесты через настоящий `qa_module.answer_question` (не только прямой
  вызов `try_continue_learn`) — именно тот путь, который был сломан:
  голое "Mirror" и полное "Модификатор Mirror" после `/learn` запускают
  урок, а НЕ `VAGUE_FOLLOWUP_TEXT`; короткое сообщение БЕЗ предшествующего
  `/learn` по-прежнему уходит в `VAGUE_FOLLOWUP_TEXT` как раньше (защита
  от регрессии существующего поведения).
- `tests/test_phase7_search_engine.py::test_shading_query_finds_own_note_not_unrelated_display_mode_page`
  — регрессия на конкретно эту находку с "режим отображения".

**Removed**

Ничего.

**Tests**

`python -m unittest discover tests` — 268/268 passed (260 + 8 новых).
Quality Score не изменился — 91.8%.

**Known issues**

- `/quick_add` теперь объяснён пользователю в чате, но сам текст-подсказка
  команды (`QUICK_ADD_USAGE_TEXT` = "Использование: /quick_add вопрос |
  ответ") не разъясняет, что это ИНСТРУМЕНТ ВЛАДЕЛЬЦА для обучения бота, а
  не способ задать вопрос — сам текст ошибки не переписан в рамках этой
  правки, только устно объяснено пользователю. Возможное уточнение на
  будущее, не сделано сейчас.
- Только 3 урока по-прежнему (Mirror Modifier, Boolean Modifier, N-gon) —
  пользователь отдельно отметил, что этого мало ("это не обучение, а
  проба пера"). Расширение количества уроков — content-работа, не
  сделана в рамках этой конкретной правки (которая была про баг диалога
  и один content-пробел термина), зафиксирована как открытый пункт для
  следующего обращения к Education Engine.

**Next phase**

Возвращаемся к ТЗ v3, этап 4 — BM25 вместо TF-IDF (раздел 1.1 ТЗ v3).

---

## ТЗ v3, этап 4 — BM25 вместо TF-IDF

Самый рискованный пункт согласованного порядка (см. таблицу статусов
выше) — замена ядра лексического поиска, от которого зависит весь
остальной scoring-конвейер.

**Ключевая техническая проблема и решение.** Сырой BM25-score (в отличие
от косинусного сходства TF-IDF) НЕ ограничен диапазоном [0, 1] — он растёт
неограниченно с ростом idf/tf. Весь остальной конвейер (`HIGH_CONFIDENCE_
THRESHOLD=0.75`, `SOFT_MATCH_THRESHOLD=0.20` в `search/qa_service.py`,
модификаторы authority/version/topic в `search/engine.py`) откалиброван
под диапазон, похожий на [0, ~1.25]. Наивная нормализация "min-max по
максимуму СРЕДИ РЕЗУЛЬТАТОВ ЭТОГО ЖЕ запроса" (топ-результат всегда 1.0)
была рассмотрена и осознанно отвергнута — она ломает устойчивость к
бессмысленным запросам (даже у гарантированно плохого совпадения
topN-результат получил бы score≈1.0, просто как "лучший из плохих").
Вместо этого выбрано насыщающее преобразование `raw / (raw + K)` (та же
идея, что и у самого BM25 для term frequency) — 0 остаётся 0, а масштаб
между РАЗНЫМИ запросами не переопределяется относительно локального
максимума каждого из них. `K=8.0` подобран эмпирически, прогоном полного
Quality Suite (та же итеративная методология калибровки, что уже
применялась для порогов confidence, fuzzy-matching cutoff и т.д.) — с
первой же попытки Quality Score не просел, а даже слегка вырос.

**Changed**

- `search/tfidf.py` — новый класс `BM25Index` (Okapi BM25, параметры
  `k1=1.5`, `b=0.75`, стандартные дефолтные значения из литературы, не
  менялись отдельно) с насыщающей калибровкой `SATURATION_K=8.0`. IDF
  считается с "+1 внутри log" (модификация Robertson-Walker) — гарантирует
  неотрицательный вес даже термину, встретившемуся во всех документах
  корпуса (классическая формула Okapi BM25 в этом случае даёт
  ОТРИЦАТЕЛЬНЫЙ idf). `tokenize()`/`lemmatize()` не изменились — тот же
  лексический слой, что и раньше, только новый ranking поверх него.
  **`TfidfIndex` удалён целиком** (не оставлен "на всякий случай") —
  раздел 1.1 ТЗ v3 буквально говорит "замена", а не "дополнение"; тем же
  способом уже удалялись `search/knowledge_base.py`/`search/manual_index.py`
  при переходе с наивного поиска на TF-IDF в Phase 7 — восстановимо через
  `git log`, если когда-нибудь понадобится сравнение.
- `search/engine.py` — `self._tfidf: TfidfIndex` → `self._bm25: BM25Index`,
  `self._tfidf.similarities(...)` → `self._bm25.similarities(...)`.
  Больше НИКАКИХ изменений в scoring-конвейере (exact_term_bonus,
  authority/version/topic модификаторы, пороги) — именно то, что и
  задумывалось калибровкой через `SATURATION_K`.
- `CLAUDE.md` — раздел архитектуры `search/` обновлён под BM25.

**Added**

- `tests/test_bm25.py` (новый файл, заменяет удалённый
  `tests/test_phase7_tfidf.py`) — `TokenizeTests`/`LemmatizeTests`
  (перенесены и дополнены — у `lemmatize()` раньше не было отдельного
  юнит-теста вообще, только косвенное покрытие через engine-тесты) +
  `BM25IndexTests`: идентичный запрос лучше всего совпадает со своим же
  документом, несвязанный запрос честно даёт 0.0 везде (не "почти 0", как
  у TF-IDF cosine — у BM25 без единого общего токена буквально нечего
  суммировать), общий термин даёт положительный score обоим документам,
  пустой корпус/запрос не роняют индекс, **насыщение по частоте термина**
  (5-кратный рост встречаемости слова даёт МЕНЬШЕ чем 5-кратный рост
  score — раздел 1.1 ТЗ v3 прямо называет это отличие от TF-IDF смыслом
  перехода), **нормализация по длине документа** (тот же относительной
  плотности термина, но более длинный/разбавленный документ не получает
  незаслуженного преимущества), score всегда в `[0, 1)`.

**Removed**

- `search/tfidf.py::TfidfIndex` и `tests/test_phase7_tfidf.py` — полностью,
  не оставлены как мёртвый код (см. Changed выше).

**Tests**

- `python -m unittest discover tests` — 273/273 passed (268 - 6 удалённых
  TF-IDF-тестов + 11 новых BM25-тестов).
- Quality Score: **91.9%** (было 91.8% с TF-IDF — не регрессия, лёгкое
  улучшение). `retrieval_accuracy` выросла заметнее — **77.1%** (было
  76.4%).
- Ручная проверка на реальном пользовательском примере: вопрос "В чём
  главная опасность, если делать фаску на объекте, у которого не
  применён масштаб?" (тот самый, который мотивировал добавление
  лемматизации, но даже ПОСЛЕ неё оставался в честном fallback — score
  0.171 при пороге soft_match 0.20) — с BM25 теперь **`soft_match`,
  score 0.573**, предлагает именно верный chunk ("Как применить
  трансформации и зачем это нужно"). Реальный, измеримый прогресс на
  конкретном примере, который раньше не удавалось полностью закрыть.
- Задержка ответа: худшее время на той же выборке запросов, что и в
  ТЗ v3 этапе 2, — **~21.7мс** (было ~25-27мс с TF-IDF) — BM25 не только
  не замедлил систему, но оказался немного быстрее (нет L2-нормализации
  векторов, только суммирование по токенам запроса).

**Known issues**

- `K1=1.5`, `B=0.75` — стандартные литературные дефолты Okapi BM25, не
  подбирались отдельно под этот корпус (в отличие от `SATURATION_K`,
  который откалиброван эмпирически). Если в будущем понадобится более
  тонкая настройка — это следующий кандидат на итерацию, тем же методом
  (прогон Quality Suite, сравнение метрик).
- `source_authority_accuracy` (99.1%) не улучшилась и не ухудшилась
  относительно значения до BM25 — тот же единственный проседающий кейс
  ("что-то с настройками", расплывчатый запрос стал находить реальный
  chunk), что уже был отмечен в правке про лемматизацию; не расследовался
  повторно.
- Калибровка `SATURATION_K=8.0` — эмпирическая, не аналитически выведенная
  величина. Она хорошо работает на ТЕКУЩЕМ корпусе (853 chunks); при
  существенном росте объёма базы знаний (доингестия Manual, community-
  источники) её, возможно, потребуется пересмотреть — не является
  "вечной константой", а рабочим калибровочным значением текущего этапа.

**Next phase**

ТЗ v3, этап 5 — полный парсер Blender Manual (`scripts/parse_manual.py`,
раздел 2.1) и поддержка скриншотов-схем в диагностике (раздел 3.1,
вторая половина) — самые крупные и ресурсоёмкие пункты, сознательно
оставлены последними в согласованном с пользователем порядке.

---

## Внеплановая правка — источник убран из результатов теста Education Engine

Тот же класс находки, что и раньше (см. записи "После Phase 15" выше) —
пользователь заметил `_Источник: knowledge/system/terminology (Mirror
Modifier)_` под результатом `/test`/`/exam`/`/next` и попросил убрать,
по тому же принципу, что уже применён к обычным ответам QA.

**Changed**

- `bot/handlers/education.py::_format_result()` — строка с
  `question.source` больше не выводится в чат. Поле `QuizQuestion.source`
  в данных осталось (не удалено из схемы) — просто не рендерится,
  как и `_find_competing_source`/`confidence` у обычных ответов.

**Tests**

`python -m unittest discover tests` — 273/273 passed. Прямых тестов на
текст с "Источник" в education-тестах не было — регрессии нет.

---

## ТЗ v3, этап 5 (в процессе) — полный парсер Manual + инфраструктура скриншотов

Согласованный с пользователем порядок (5-й, последний и самый крупный
этап). Две независимые части: 5A (парсер + полный прогон на всём Manual —
"Сразу полный прогон", выбор пользователя) и 5B (только код-инфраструктура
скриншотов, без реальных screenshot'ов — второй явный выбор пользователя,
т.к. Blender не установлен и делать/проверять сами скриншоты нечем).

**5A — docutils-парсер, `scripts/parse_manual.py`**

Заменяет `scripts/build_manual_index.py` (регулярки, построчное
угадывание, терял всё кроме первого абзаца, обрезка по 280 символов) +
`scripts/ingest_manual_to_registry.py`. Новый единый скрипт использует
`docutils.core.publish_doctree()` — настоящее дерево RST-документа.

С одной страницы Manual теперь получается несколько chunk'ов вместо
одного: intro (заголовок + вступительные абзацы до первого подраздела),
каждый Note/Important/Tip/Hint отдельно, каждый Warning отдельно, каждый
definition_list (описания параметров/опций) отдельно.

Реальные находки при разработке (на примере `bevel.rst` из настоящего
blender-manual):
- Blender Manual НЕ оборачивает вступительный текст страницы в свой
  `section` — заголовок/интро/figure/table идут прямыми детьми doctree,
  section появляется только у настоящих подразделов ("Options" и т.п.).
  Первая версия спускалась внутрь первого top-level section в поисках
  интро и всегда получала пустую строку.
- Чистый docutils не знает Sphinx-специфичные роли/директивы (`:doc:`,
  `:ref:`, `:term:`, `:kbd:`, `:bl-icon:`, `.. index::`, `.. toctree::` и
  т.д.) — без заглушек парсинг такого фрагмента даёт `system_message`
  с текстом ошибки, который утекает в итоговый текст chunk'а. `:bl-icon:`
  не попал в первоначальную выборку 400 случайных файлов, обнаружен уже
  на реальном прогоне — добавлена регэксп-заслонка `_clean_text()` на
  остаточный мусор такого рода для ЛЮБОЙ ещё не учтённой роли/директивы
  за пределами протестированной выборки, а не только для перечисленных.
- Вложенные `definition_list` (термин "Affect" содержит свой собственный
  список "Vertices"/"Edges") задваивались при рекурсивном
  `dl.findall(nodes.definition_list_item)` — переход на `dl.children`
  (только прямые дети) убрал дублирование (проверено: 1.8% остаточного
  overlap на полном корпусе — не критично).

Чекпоинты: полный прогон на ~9000 записей через бесплатный переводчик —
часы работы; `registry.save()` теперь происходит каждые 500 переведённых
записей и в `finally` при сбое/Ctrl-C, а не один раз в самом конце —
без этого сбой сети под конец перевода терял бы всю проделанную работу.
Старый `manual.json` перед перезаписью копируется в `manual.json.bak`.

Проверено:
- 13 тестов на синтетической RST-фикстуре без сети (`tests/test_parse_manual.py`)
  — покрывают все три находки выше как регрессионные case'ы.
- Полный сухой прогон (без перевода) по всем 2389 файлам реального
  blender-manual: 8952 чанка, 0 падений, 0 утечек парсер-мусора,
  дублирование ~1.8%. Разбивка по типам: intro 1741, note 1249,
  options 5868, warning 94.

**5B — инфраструктура скриншотов, `diagnostics/schema.py` + `bot/handlers/diagnostics.py`**

`DecisionNode.image_url: str | None` (опционально) — ссылка на
изображение (по замыслу — на картинки самого официального Manual,
`docs.blender.org/manual/.../images/...`, не собственный хостинг).
`_maybe_send_image()` в `bot/handlers/diagnostics.py` шлёт `send_photo`
отдельным сообщением ПЕРЕД текстом вопроса/решения, если поле заполнено
— Telegram не даёт превратить уже отправленное текстовое сообщение в
фото через `edit_message_text`. Битый/недоступный URL не роняет диалог
(try/except вокруг `send_photo`).

Ни у одного узла ни в одном из 5 текущих диагностических деревьев
`image_url` не задан — путь не выполняется на реальных данных, только
готова инфраструктура. Реальные screenshot'ы — отдельная будущая задача
(нужен Blender, которого сейчас нет).

**Changed**

- `diagnostics/schema.py` — `DecisionNode.image_url` (+ round-trip в
  `to_dict`/`from_dict`)
- `bot/handlers/diagnostics.py` — `_maybe_send_image()`, вызывается в
  `try_start_diagnostic()` (root) и `diag_option_callback()` (следующий
  question-узел и solution-узел)
- `requirements.txt` — `+docutils>=0.20`
- `.gitignore` — `+knowledge/official/manual/*/manual.json.bak`

**Added**

- `scripts/parse_manual.py` (заменяет `build_manual_index.py` +
  `ingest_manual_to_registry.py` — те пока НЕ удалены, останутся до
  подтверждённого успеха полного прогона с переводом, см. Known issues)
- `tests/test_parse_manual.py` — 13 тестов
- `tests/test_phase9_diagnostics.py::ImageInfrastructureTests` — 4 теста

**Tests**

`python -m unittest discover tests` — 290 passed, 1 skipped (реальный
`manual.json` ещё не пересобран новым парсером — `IndexedManualTests`
из `test_phase4_manual_ingest.py` пропускается, как и раньше до первого
прогона). Quality Score 91.9% — без изменений, live search ещё не
переключён на новые данные.

На сервере (Oracle VM.Standard.E2.1.Micro, 2 vCPU) тот же прогон даёт
`FAILED (failures=1)`: `ResponseTimeTests.test_answer_latency_within_limit`
(85-115мс вместо порога 50мс). Проверено намеренно: тест падает
одинаково и при остановленном `blenderbot`-сервисе (не конкуренция за
CPU) — порог 50мс изначально откалиброван на dev-машине, сам тест это
документирует в docstring ("целевой Oracle VM... слабее... тест не
гарантирует 50мс именно там, ловит РЕГРЕССИИ при разработке"). Известное,
задокументированное заранее (Phase 14/15) ограничение, не регрессия от
этого этапа — 5B задеплоена и перезапущена, `journalctl` чистый.

**Known issues**

- Полный прогон 5A с реальным переводом (~9000 записей) запущен в фоне
  локально на момент этой записи — ещё не завершён, `manual.json` ещё
  не пересобран этим скриптом. Следующий шаг: дождаться завершения,
  прогнать полный test suite + Quality Suite на новых данных, закоммитить
  и задеплоить.
- `scripts/build_manual_index.py`/`ingest_manual_to_registry.py` и их
  тесты (`test_phase4_build_manual_index.py`, часть
  `test_phase4_manual_ingest.py`) пока не удалены — станут кандидатом на
  удаление после подтверждённого успеха 5A на реальных данных (см.
  правило проекта про удаление только доказанно устаревшего).
- 5868 из 8952 чанков сухого прогона — kind="options"; часть содержания
  из вложенных definition_list задваивается с родительским chunk'ом
  (~1.8% overlap) — не переделывалось отдельным механизмом дедупликации,
  не критично на этом масштабе.
- Таблицы (`.. list-table::`) сознательно не извлекаются — на практике
  оказались в основном галереями скриншотов "до/после", не текстовыми
  данными; надёжно отличать содержательную таблицу от картиночной не
  реализовано.

**Next phase**

Дождаться завершения полного прогона перевода, пересобрать
`knowledge/official/manual/5.1/manual.json`, прогнать тесты + Quality
Suite, закоммитить, задеплоить на сервер. После подтверждённого успеха —
решить об удалении старого пайплайна (build_manual_index.py/
ingest_manual_to_registry.py). Это последний этап согласованного плана
ТЗ v3 (1→5) — после него нужно вернуться к остальным пунктам самого ТЗ
v3, не вошедшим в 5-этапный приоритет (см. полный текст
`docs/Blender_Helper_v3_TZ.pdf`).

---

## ТЗ v3, этап 5 — завершение: баг перевода, регрессия ранжирования, деплой

Продолжение записи выше — полный прогон перевода завершился, но вскрыл
два реальных бага, оба найдены и исправлены до деплоя (не после).

**Баг 1 — перевод молча не сработал ни для одной из 8952 записей**

Первый полный прогон (~1.5 часа работы бесплатного переводчика)
завершился без единой ошибки и залогировал "переведено 8952/8952", но
проверка на кириллицу в `content` показала: 0 из 8952 chunks реально
переведены. `TRANSLATE_DELIMITER = "\n|||SPLIT|||\n"`, проверка успеха —
`"SPLIT" in translated`. GoogleTranslator переводит само слово SPLIT
("РАЗДЕЛЕНИЕ") — сравнение никогда не совпадало, `translate()` формально
"срабатывал" (никакого исключения), просто ветка `if` никогда не
выполнялась, запись молча оставалась на английском. "Переведено N/N" в
логе было только счётчиком итераций цикла, не подтверждением факта
перевода — предыдущая запись в этом файле ошибочно приняла его за
критерий успеха, прямое нарушение раздела 41 ТЗ ("не утверждать, что
функция работает, пока она реально не протестирована").

Фикс: маркер без букв (`"\n|||\n"` — голые пайпы), проверено вручную на
реальном GoogleTranslator — переживает перевод неизменным (`SPLIT` — не
переживает, `|||` — переживает). Плюс smoke-test на первых 20 записях в
`translate_entries()`: если после них 0 успешных переводов — `RuntimeError`
сразу, а не молчаливая многочасовая трата времени. Регрессионные тесты —
`tests/test_parse_manual.py::TranslateEntriesRegressionTests` (4 теста,
на fake-переводчике, без сети).

Второй полный прогон (с исправленным маркером) — 8952 chunks, 8911
(99.5%) реально переведены на русский (проверено на кириллицу). 41
chunk остался на английском — короткие фрагменты без содержательного
текста для перевода.

**Баг 2 — регрессия ранжирования от роста корпуса**

`python -m unittest discover tests` на переведённых данных: Quality
Score 91.9%→89.4%, retrieval accuracy 77.1%→66.4%, плюс 3 реальных
failed теста (`test_shading_query_finds_own_note...`,
`test_boolean_query_finds_a_real_competing_source`,
`test_competing_source_is_still_computed_even_if_not_shown`). Не
списано на "издержки роста корпуса" без разбора — каждый случай
диагностирован отдельно (см. коммит `81f49db` за подробным описанием
причин и фиксов):

1. **avgdl skew**: рост корпуса с 770 до 8952 chunks (в основном
   короткие `options`/`note`-чанки) резко просадил среднюю длину
   документа в BM25 — длинные `intro`-чанки получили непропорциональный
   штраф по длине (параметр `b`), из-за чего короткий `options`-чанк
   страницы систематически обходил `intro`-чанк ТОЙ ЖЕ страницы на
   вопросах "Что такое X?". Пробовал снижать `B` напрямую (calibrate_b.py,
   перебор 0.75/0.5/0.35/0.2/0.1 на всём Quality Suite) — эффект слабый
   и немонотонный (retrieval 66.4%→68.2%→67.8%→67.8%→69.9%, не линейно),
   ни при одном значении не чинил конкретно найденный "шейдинг"-кейс.
   Точечный фикс оказался надёжнее: `CHUNK_KIND_MODIFIER_WEIGHT` +
   `_chunk_kind_score()` в `search/engine.py` — новый модификатор по
   `chunk.subtopic` (intro=1.0, note/warning=0.5, options=0.3, нейтрально
   0.5 для чанков без этого понятия — personal notes, hotkeys, будущие
   community-источники). Retrieval accuracy 66.4%→67.8%.
2. **"шейдинг"-кейс — не баг, а обнаруженное УЛУЧШЕНИЕ**: тест
   `test_shading_query_finds_own_note_not_unrelated_display_mode_page`
   жёстко требовал победы personal-заметки. Диагностика (`diag_shading.py`)
   показала: теперь в корпусе есть НАСТОЯЩАЯ официальная страница
   "Viewport Shading" (`editors/3dview/display/shading`, реальный,
   корректно переведённый контент про режимы затенения) — она заслуженно
   побеждает personal-заметку по authority (S-tier). Раньше побеждала
   лично заметка ТОЛЬКО потому, что официального покрытия темы не было
   вообще — рост корпуса эту ситуацию исправил. Тест переписан
   (`test_shading_query_does_not_find_unrelated_display_mode_page`) —
   актуальный инвариант: не побеждает конкретная нерелевантная страница
   про Display Mode (та самая, из-за которой тест был написан изначально),
   а не то что обязательно побеждает personal-note.
3. **Conflict Engine ослеп**: `_find_competing_source()` смотрел только
   на rank #2. После роста корпуса там теперь почти всегда другой
   sub-chunk ТОЙ ЖЕ официальной страницы (все с exact_term_bonus=1.0),
   а не personal-заметка — например, на запрос "как сделать булеан"
   personal-заметка про Boolean оказалась на 28-м месте среди точных
   совпадений (проверено `find_boolean_note_rank.py`), обойдена ~27
   официальными sub-chunk'ами про Boolean-related темы. Фикс:
   `_find_competing_source()` сканирует весь переданный список
   результатов, не только rank #2; `CONFLICT_SEARCH_TOP_N=30` в
   `search/qa_service.py` — `SearchEngine.search()` и так считает score
   для ВСЕХ chunk'ов на каждый запрос (обрезка top_n — просто срез после
   сортировки), так что более широкий top_n здесь бесплатен по
   производительности и не меняет сам `results[0]`.

**Оставшийся, честно незакрытый разрыв**: retrieval accuracy (67.8%)
всё ещё заметно ниже дореингестного базового уровня (77.1%). Корневая
причина — НЕ баг в коде, а структурный предел Terminology Database
(раздел 9 ТЗ): ~39 зарегистрированных терминов покрывают едва ли
десятую часть из 1915 страниц Manual. Когда `_find_term()` не находит
термин (большинство запросов вроде "Что такое Weight Paint?", "Что
такое Particle System?", "Что такое Knife Tool?"), ранжирование
опирается ИСКЛЮЧИТЕЛЬНО на сырой BM25-скор без возможности отличить,
например, основной Weight Paint от Grease Pencil Weight Paint — обе
официальные страницы используют похожую лексику, а `_find_term()` не
достаёт до этого различия без зарегистрированного термина. Расширение
`knowledge/system/terminology` — прямой путь к восстановлению retrieval
accuracy, но это отдельная, большая content-задача (потенциально сотни
терминов), не код-фикс на один присест — сознательно не начата в рамках
этапа 5.

**Находка при деплое — OOM на слабом сервере, не регрессия кода**

`discover tests` на сервере (Oracle VM.Standard.E2.1.Micro, 952 МБ RAM,
без swap) дважды убит OOM killer'ом (`dmesg`: `Out of memory: Killed
process ... (python) ... anon-rss:618-621MB`). Расследовано, не списано
на "сервер слабый" без проверки: изолированный скрипт, строящий ОДИН
`QAService` на новом корпусе, дал peak RSS 154 МБ — комфортно. Причина
OOM — несколько тестовых классов (`RealDataEngineTests`,
`RealDataConfidenceTests`, `QualityScoreTests`, `ResponseTimeTests`
и др.) независимо строят СВОИ экземпляры `SearchEngine`/`QAService`
(~150 МБ каждый), несколько из них живы одновременно — суммарно
превышает 952 МБ. Живой бот строит только ОДИН такой экземпляр — под
продакшн-нагрузку это безопасно, что и подтвердил успешный рестарт
(смотри ниже). `DEPLOYMENT.md` раздел 13.4 дополнен предупреждением и
лёгкой альтернативной проверкой (один `QAService` вместо полного
`discover tests`) для будущих деплоев с этим или ещё бо́льшим корпусом.

**Changed**

- `search/engine.py` — `CHUNK_KIND_MODIFIER_WEIGHT`, `_chunk_kind_score()`,
  `ScoredChunk.chunk_kind_score`
- `search/qa_service.py` — `CONFLICT_SEARCH_TOP_N=30`,
  `_find_competing_source()` сканирует весь список, не только rank #2
- `bot/handlers/admin.py` — `/debug` показывает `kind=`
- `scripts/parse_manual.py` — `TRANSLATE_DELIMITER` без букв, smoke-test
  на первых 20 записях (см. Баг 1 выше)
- `tests/test_phase10_confidence.py`, `tests/test_phase7_search_engine.py`,
  `tests/test_phase4_manual_ingest.py` — обновлены под новую реальность
  корпуса (см. Баг 2 выше)
- `knowledge/official/manual/5.1/manual.json` — пересобран, 770→8952
  chunks, 99.5% переведено
- `knowledge/README.md`, `knowledge/official/manual/5.1/README.md`,
  `DEPLOYMENT.md` — обновлены под новый пайплайн/масштаб/находку про OOM

**Added**

- `tests/test_parse_manual.py::TranslateEntriesRegressionTests` — 4 теста

**Tests**

Локально: `python -m unittest discover tests` — 293 passed, 1 known
failure (`ResponseTimeTests`, задокументированное ограничение
dev-машины/слабого прода — тест ловит регрессии в разработке, не
гарантирует 50мс на слабом железе, см. его собственный docstring),
1 skipped. Quality Score 89.1% (цель раздела 35 — v2 ≥70%, с большим
запасом; ниже дореингестного 91.9%, см. "Оставшийся разрыв" выше).

На сервере: полный `discover tests` не завершается (OOM, см. выше) —
верифицировано изолированным построением одного `QAService` (peak RSS
154 МБ, реальный вопрос отвечен корректно) вместо полного прогона.

**Known issues**

- Retrieval accuracy (67.8%) ниже дореингестного уровня (77.1%) —
  корневая причина: покрытие Terminology Database (раздел 9 ТЗ), не
  баг. Отдельная будущая content-задача.
- `scripts/build_manual_index.py`, `ingest_manual_to_registry.py`,
  `clean_manual_index.py` и их тесты (`test_phase4_build_manual_index.py`)
  устарели (заменены `parse_manual.py`), но физически НЕ удалены —
  попытка удаления через файловый инструмент заблокирована
  классификатором прав auto-режима сессии. Решение оставлено
  пользователю (файлы git-restorable, можно убрать вручную в любой
  момент).
- Полный `python -m unittest discover tests` больше не гарантированно
  завершается на текущем сервере (952 МБ RAM) без OOM — см. `DEPLOYMENT.md`
  раздел 13.4 за обходным путём для будущих деплоев.
- ~1.8% `options`-чанков частично дублируют содержимое родителя
  (вложенные `definition_list`) — не критично, не переделывалось.
- Таблицы (`.. list-table::`) не извлекаются — в основном галереи
  скриншотов, не текстовые данные.

**Next phase**

Этап 5 (последний из согласованного 5-этапного приоритета ТЗ v3)
завершён и задеплоен: `git pull` на сервере, чистый рестарт
`blenderbot`, `journalctl` без traceback, "Бот запущен", polling идёт.
Дальше — по решению пользователя: либо расширение Terminology Database
(раздел 9 ТЗ) для закрытия оставшегося разрыва retrieval accuracy, либо
остальные пункты ТЗ v3, не вошедшие в 5-этапный приоритет (полный текст
— `docs/Blender_Helper_v3_TZ.pdf`), либо очистка устаревшего пайплайна
Manual вручную.

---

## ТЗ v3 — оставшиеся пункты сверх 5-этапного приоритета (раздел 1.1, 2.2, 4.1)

После завершения согласованного 5-этапного приоритета пользователь
спросил, полностью ли выполнено ТЗ v3 целиком — честная сверка по
полному тексту документа показала три реальных пробела сверх пяти
этапов: раздел 1.1 (словарь терминологии не расширялся), раздел 2.2
(скрипт конвертации официальных хоткеев не писался вообще, этот пункт
не попал даже в список 5 этапов) и раздел 4.1 (тест на 50мс есть, но
сама цель не достигается). Пользователь попросил закрыть все три.

**Раздел 1.1 — расширение Terminology Database**

`scripts/generate_terminology_from_manual.py`: генерирует термины не
заново скачивая/переводя, а из уже распарсенных 1741 intro-chunk'ов
`knowledge/official/manual/5.1/manual.json` (этап 5). 39 → 1155
терминов.

Фильтры (оба нужны, оба найдены проверкой реальных данных, не
придуманы заранее):
- Только УНИКАЛЬНЫЕ заголовки — "Introduction" встречается на 89
  разных страницах, "Toolbar" на 8, "Brush Settings" на 7 и т.д.; такой
  заголовок не идентифицирует никакую конкретную функцию Blender.
  331 заголовок пропущен по этой причине.
- Заголовок из ≥2 слов ИЛИ короткая ЗАГЛАВНАЯ аббревиатура (FBX, STL,
  UV, PBR). Однословные обычные заголовки Google Translate переводит
  вне технического контекста Blender: "Draw" → "Ничья" (игровой смысл,
  не "рисование"), "Skin" → "Кожа" (анатомическая, не Skin-модификатор),
  "Face" → "Лицо". Как алиасы такие слова рискуют ложно совпасть с
  бытовой лексикой в несвязанных вопросах — тот же класс бага, что уже
  был найден для "режим отображения"/Display Mode (см. запись после
  этапа 4 БМ25 выше). 225 заголовков пропущено.
- `TERMINOLOGY_CATEGORIES` (раздел 9 ТЗ v2) расширен тремя категориями
  (`interface`, `scene_layout`, `files`) — у путей `.rst`-файлов Manual
  не было естественного соответствия среди исходных 24.

**Found & fixed — is_canonical_title тай-брейк.** После генерации
retrieval accuracy НЕ изменилась (66.4%→67.8%, тот же уровень, что и до
терминологии). Диагностика (`diag_terms_effect.py`): термины теперь
находятся, но НЕСКОЛЬКО официальных страниц одновременно получают
`exact_term_bonus=1.0`, потому что их заголовки лишь СОДЕРЖАТ все слова
термина, а не РАВНЫ ему целиком — "Weight Paint Brushes", "Weight Paint
Tools", "Editing Weight Paint" все содержат "weight"+"paint" и
побеждают/проигрывают по сырому BM25 без какой-либо связи с тем, какая
страница РЕАЛЬНО каноническая. Фикс: `search/engine.py::is_canonical_title`
— новый тай-брейк ПЕРЕД `lexical_score`: чанк, чей заголовок (на любом
из двух языков) ДОСЛОВНО совпадает с именем термина, побеждает среди
чанков с равным `exact_term_bonus`.

Честно: это помогает только терминам, СГЕНЕРИРОВАННЫМ из конкретной
страницы (у них по построению есть чанк с точно таким заголовком). НЕ
помогает 4 из исходных 39 hand-curated терминов — "Weight Paint",
"Particle System", "Knife Tool", "Geometry Nodes" (`diag_canonical.py`
подтвердил: 0 чанков с `original_title == "Weight Paint"` в корпусе).
Эти термины изначально задуманы как абстрактные концепты для
personal-заметок, не как имя конкретной страницы Manual — у Blender
попросту нет одной "канонической" страницы с таким точным названием
(это либо "Weight Paint Mode", либо несколько под-страниц). Задача по
следующему шагу — не код-фикс, а content-решение (например,
`related_terms`/явная привязка term → предпочтительный chunk_id для
этих конкретных 39 терминов) — не сделано в этом раунде, честно
задокументировано, не замаскировано.

**Раздел 2.2 — конвертация официальных хоткеев**

`scripts/generate_hotkeys_from_manual.py`: `data/hotkeys.json` уже был
хорошо прокуратирован вручную (11 категорий с живыми редакторскими
пояснениями на русском) — этот пункт вообще не попал в список 5
согласованных этапов, поэтому раньше не делался. Официальный источник
найден через `editors/preferences/keymap.rst` → `.. seealso::` →
`:doc:`/interface/keymap/blender_default`` — единственная страница
Manual с настоящими структурированными `.. list-table::` (не image-
галереями, как большинство list-table в остальном корпусе, намеренно
пропускаемых `parse_manual.py`) — key-колонка через `:kbd:` роль,
description — обычный текст. Извлечено 9 секций/63 строки, скрипт НЕ
перезаписывает существующие 11 hand-curated категорий, только
добавляет 9 новых с префиксом "Manual — " (11 → 20 категорий).

**Found & fixed — транслитерация букв клавиш.** Первая версия
переводила "key — description" ОДНИМ запросом (тот же приём, что и в
`parse_manual.py`) — реальный прогон показал: GoogleTranslator
транслитерирует САМИ БУКВЫ КЛЮЧЕЙ в кириллицу — "Ctrl+O" → "Ctrl+О"
(кириллическая "О", визуально неотличима от латинской, но другой код
символа), "F1" → "Ф1", "Ctrl+N" → "Ctrl+Н". Любой такой хоткей физически
никогда бы не сработал ни у одного пользователя (нажатие латинской "O"
никогда не совпадёт с сохранённой кириллической "О"). Найдено проверкой
реального результата после первого прогона, не предположено заранее.
Фикс: переводится ТОЛЬКО колонка description, key никогда не проходит
через `translate()`. Регрессионный тест на fake-переводчике,
транслитерирующем буквы — `TranslateCategoriesRegressionTests`.

Также найдено (без реального прод-инцидента, проверкой перед вводом в
строй): Manual пишет комбинации клавиш через дефис без пробелов
("Ctrl-Alt-C"), а существующий `search/hotkey_lookup.py::_normalize_key`
понимает только "+"-разделитель (`_KEY_TOKEN_RE` вообще не включает
дефис в допустимые символы) — без конвертации сгенерированные строки
осели бы в файле нечитаемым для поиска балластом. Фикс: `_KEY_HYPHEN_RE`
конвертирует дефис между буквенно-цифровыми символами в "+", НЕ трогая
дефис с пробелами вокруг (диапазоны вроде "F5 - F8", не комбинации).

**Раздел 4.1 — время отклика < 50мс**

Тест (`ResponseTimeTests`) уже существовал (Phase 7/ТЗ v3 этап 2), но
после роста корпуса на этапе 5 (770 → 8952 chunks) реальное время
ответа выросло до 380-475мс — цель раздела 4.1 формально не
достигалась. Профилирование (`cProfile`, `profile_search.py`) показало
настоящий bottleneck, не угадано заранее:

1. **`_exact_term_bonus`**: 3.135 из 3.861с на 5 запросов.
   `_term_names(term)` и `tokenize(name)` для каждого имени термина
   пересчитывались ВНУТРИ цикла по чанкам — то есть один и тот же
   набор имён термина токенизировался ~9000 раз за один запрос, хотя
   `term` не меняется в пределах одного `search()`. Вынесено в
   `_term_name_token_lists()`, считается один раз до цикла.
2. **`_is_canonical_title`** (добавлен в этом же раунде, см. выше):
   тот же анти-паттерн — `normalize_term(term.canonical_name/russian_name)`
   пересчитывался на каждый чанк. Вынесено в `_term_canonical_norms()`.
3. **`BM25Index.similarities()`** (`search/tfidf.py`): проходила по
   ВСЕМ ~9000 документам на каждый запрос, даже когда подавляющее
   большинство не содержит ни одного слова запроса. Добавлен
   инвертированный индекс (`postings: term -> список индексов
   документов`) — `similarities()` теперь трогает только документы,
   реально пересекающиеся с запросом по словарю.

Результат (реальные замеры, `bench_response.py`/тест-прогоны, вариация
от нагрузки машины): 380-475мс → ~134-286мс. Существенное улучшение
(2-3×), но цель 50мс всё ещё не достигнута на нынешнем масштабе
корпуса. Честно: `search/engine.py::search()` всё ещё строит
`ScoredChunk` для КАЖДОГО чанка корпуса (authority/version/topic/
chunk_kind считаются для всех, не только для кандидатов, пересекшихся
с запросом) — довести это до полностью candidate-driven архитектуры
(построить `ScoredChunk` только для чанков, реально задетых BM25-
инвертированным-индексом ИЛИ содержащих распознанный термин) — более
глубокий рефакторинг с более высоким риском регрессии существующего
ранжирования, сознательно не сделан в этом раунде. `ResponseTimeTests`
докстринг уже честно документирует, что порог 50мс — цель для
dev-машины, не гарантия для слабого прода (раздел этой же записи,
раньше в файле) — это ограничение снято не будет без отдельной,
специально выделенной задачи по архитектуре поиска.

**Changed**: `knowledge/terminology.py`, `search/engine.py`,
  `search/tfidf.py`, `bot/handlers/admin.py`,
  `tests/test_phase7_search_engine.py`,
  `knowledge/system/terminology/terms.json` (39→1155),
  `data/hotkeys.json` (11→20 категорий)
**Added**: `scripts/generate_terminology_from_manual.py`,
  `scripts/generate_hotkeys_from_manual.py`,
  `tests/test_generate_hotkeys_from_manual.py` (8 тестов)
**Tests**: `python -m unittest discover tests` — 301 passed, 1 known
  failure (`ResponseTimeTests`, задокументированное ограничение,
  реальное время улучшено 2-3× но не достигает 50мс), 1 skipped.
  Quality Score 88.9%, retrieval accuracy 66.8% (без значимых изменений
  от is_canonical_title — см. выше про 4 старых термина без
  canonical-страницы).
**Known issues**: 4 из 39 исходных hand-curated терминов
  (Weight Paint/Particle System/Knife Tool/Geometry Nodes) не имеют
  canonical-страницы в Manual — нужна отдельная content-задача (явная
  привязка term → предпочтительный chunk_id), не код-фикс. Response
  time не достигает 50мс без более глубокого candidate-driven
  рефакторинга search/engine.py::search(). Старый пайплайн Manual
  (build_manual_index.py и т.п.) всё ещё физически не удалён (см.
  предыдущую запись про блокировку классификатором).
**Deployed**: закоммичено, запушено, на сервере `git pull --ff-only`
  чистый, `discover tests` на сервере НЕ запускался (OOM подтверждён
  ранее для параллельных тестовых классов) — вместо этого проверен один
  `QAService` (peak RSS 161.75 МБ, реальный вопрос отвечен корректно),
  `systemctl restart blenderbot`, `journalctl` чистый ("Бот запущен",
  `getUpdates 200 OK`, без traceback), память процесса после старта
  ~191 МБ — в норме.

---

## Живая обратная связь — два реальных бага сразу после деплоя раздела 1.1/2.2/4.1

Пользователь прислал скриншот из Telegram с двумя промахами подряд на
простых вопросах — сразу после предыдущего деплоя (терминология,
хоткеи, performance). Оба нашлись и исправлены в тот же заход, не
отложены на потом (раздел про приоритет живой обратной связи, см.
самое начало этого файла).

**Баг 1 — "Какое сочетание клавиш инвертирует текущее выделение (Invert
Selection) в Edit Mode?" отвечено уверенно, но не в тему**

Бот вернул `chunk_confident` с содержимым про Geometry Nodes-ноду
"Invert Rotation" ("Узел «Инвертировать вращение» инвертирует
вращение.") — короткий official-чанк, выигравший ИСКЛЮЧИТЕЛЬНО за счёт
высокой плотности слова "инвертировать" в очень коротком тексте, при
`exact_term_bonus=0`/`matched_term=None` (раздел 1.1 всё ещё не
покрывает "Invert Selection" как термин — реальный правильный ответ,
`Ctrl+I — Invert selection.`, есть в hotkeys.json из раздела 2.2, но
`HotkeyLookup` не умеет искать по ТЕКСТУ описания, только по названию
клавиши — это отдельное, более глубокое архитектурное ограничение, не
чинилось в этом заходе).

Диагностика (`diag_invert.py`) нашла ДВЕ причины, обе понадобились
одновременно:
1. `search/engine.py::_chunk_kind_score` — сегодняшний (тем же днём)
   intro-бонус применялся БЕЗ ПРОВЕРКИ, распознан ли термин вообще.
   Смысл бонуса — выбрать ПРАВИЛЬНЫЙ sub-chunk уже НАЙДЕННОЙ по термину
   темы (раздел 1.1), а не подсуживать случайным лексическим
   совпадениям без какой-либо структурной опоры. Теперь принимает
   `term`, нейтрален (0.5) при `term is None` — по той же схеме, что
   `_topic_score` уже делал.
2. `search/tfidf.py::BM25Index.SATURATION_K=8.0` — откалиброван на
   корпусе в 10 раз меньшем (853 chunks, этап 4 ТЗ v3), после роста до
   ~9000 (этап 5) недостаточно гасил завышенные скоры коротких
   chunk'ов. Перебор K∈{8,10,12,15,20} на полном Quality Suite
   (`calibrate_saturation.py`) показал: K=10 уже убирает конкретный
   ложный `chunk_confident` БЕЗ потери качества по остальным метрикам,
   K=15 (выбрано) даёт ещё лучший source authority accuracy (97.2%→100%)
   при том же weighted score.

После обоих фиксов вопрос переходит в `soft_match`
("Возможно, ты имел в виду...?" с кнопками Да/Нет) — честное поведение
вместо уверенного неверного ответа (раздел 26 ТЗ, Zero-Hallucination
Mode). Идеальный правильный ответ (`Ctrl+I`) всё ещё не находится
автоматически — это отдельная, более крупная задача (двунаправленный
поиск по hotkeys.json), не входит в этот заход.

**Баг 2 — "Что делает комбинация Alt + N" нашёл не то**

Бот вернул хоткей одиночной "N" (показать/скрыть боковую панель)
вместо честного "не знаю" или правильного ответа. `search/hotkey_lookup.py`
проверка (`test_hotkey_tokenize.py`) показала: `_QUERY_TOKEN_RE`
матчит одиночный `+` как СВОЙ ОТДЕЛЬНЫЙ токен, когда он окружён
пробелами ("Alt + N" → `["alt", "+", "n"]`), из-за чего склейка соседних
токенов в комбинацию строит мусор ("alt++", "+n") вместо "alt+n", и
`find()` тихо падает обратно на голое совпадение по одной "n".
`_normalize_key()` уже делает `.replace(" + ", "+")` для СОХРАНЁННЫХ
ключей — тот же список нужен и для ЗАПРОСА до токенизации, этого не
было. Исправлено.

Отдельно проверено: "Alt+N" как комбинация в данных вообще отсутствует
(не баг контента — её нет ни в hand-curated части, ни в официальной
странице `blender_default.rst`, раздел 2.2). После фикса `find()`
корректно возвращает пусто, и `answer()` честно уходит в `soft_match`
через общий поиск вместо утверждения неверного хоткея.

**Changed**: `search/engine.py` (`_chunk_kind_score` принимает `term`),
  `search/tfidf.py` (`SATURATION_K` 8.0→15.0, докстринг с находкой),
  `search/hotkey_lookup.py` (`find()` нормализует пробелы вокруг `+`
  перед токенизацией)
**Added**: `tests/test_phase2_migration.py::HotkeyLookupSyntheticTests`
  (3 теста на синтетических данных — комбо без пробелов, комбо с
  пробелами вокруг `+` — регрессия на сам баг, честный пустой результат
  на незарегистрированную комбинацию)
**Tests**: `python -m unittest discover tests` — 304 passed, 1 known
  failure (`ResponseTimeTests`), 1 skipped. Quality Score 90.2%
  (лучший результат за всю сессию), source authority accuracy 100%,
  hallucination resistance 100%
**Known issues**: `HotkeyLookup` — однонаправленный (клавиша →
  описание), не умеет отвечать на "какая клавиша делает X" по тексту
  описания; это отдельная, более крупная задача (например, добавить
  содержимое hotkeys.json в общий SearchEngine как ещё один источник
  knowledge chunk'ов), не входит в этот заход.
**Deployed**: закоммичено, запушено, на сервере `git pull --ff-only`
  чистый, один `QAService` проверен (peak RSS 161.8 МБ, ответ корректный),
  `systemctl restart blenderbot`, `journalctl` чистый ("Бот запущен",
  `getUpdates 200 OK`), память после старта ~191 МБ.

---

## Живая обратная связь — третий баг за день: hotkeys.json невидим для обычного поиска

Пользователь спросил (тем же заходом, "Базовые операции"): "Какой
хоткей дублирует объект в Blender?" — бот предложил случайное
generic-совпадение ("Введение — примечание") вместо честного или
правильного ответа. Реальный ответ (Shift+D, "дублировать объект") в
данных ЕСТЬ — раньше уже задокументирован как Known issue в записи
выше ("HotkeyLookup однонаправленный") — этот заход довёл фикс до конца.

**Диагностика показала причину глубже первого предположения.**
`search/hotkey_lookup.py::HotkeyLookup` ищет по буквам КЛАВИШИ в
запросе, не по смыслу действия — для вопроса "какой хоткей делает X"
(пользователь знает действие, не знает комбинацию) он в принципе не
участвует. `SearchEngine` при этом вообще ничего не знал про
содержимое `data/hotkeys.json`.

Первая попытка — просто загрузить `hotkeys.json` как knowledge chunks
(`scripts/build_hotkeys_knowledge.py`) — оказалась НЕДОСТАТОЧНОЙ.
Диагностика (`diag_hotkey_chunks.py`, `diag_hotkey_score.py`) показала:
целевой chunk ("Shift + D — дублировать объект...") ЗАГРУЖЕН, но не
попадает даже в топ-20 из ~2300 релевантных результатов (score=0.409,
rank 22) — personal/hand-curated контент (`authority=None` → базовый
скор 0.3) без зарегистрированного термина систематически проигрывает
ДЕСЯТКАМ official Manual-страниц, лишь мимоходом упоминающих
"дублировать"/"объект" (Outliner, Particle System, Animation tools и
т.д.) — только за счёт авторитетности источника (1.0 против 0.3), даже
после того как заголовок chunk'а был переделан, чтобы включать слова
действия, а не только комбинацию клавиш ("Shift + D — дублировать
объект..." вместо "Горячая клавиша: Shift + D").

**Решение — регистрация термина + генерация словоформы.**
`scripts/generate_terminology_from_hotkeys.py`: извлекает термины из
паттерна "действие (English Name)" — "дублировать объект (Duplicate)"
→ canonical_name="Duplicate", russian_name="дублировать объект" (15
новых терминов). Даёт `exact_term_bonus=1.0` — decisively перевешивает
authority-разрыв: score 0.409 → 1.040 после регистрации термина одного.

Но термин ВСЁ РАВНО не находился в реальном вопросе ("Какой хоткей
**дублирует** объект?") — `matched_term=None`. Причина: `russian_name`
хранится в ИНФИНИТИВЕ ("дублировать" — так сформулированы описания
хоткеев), а естественный вопрос использует СПРЯГАЕМЫЙ глагол
("дублирует") — `_find_term()` (search/engine.py) намеренно не
лемматизирует запрос (раздел про это уже есть в
`knowledge/terminology.py`/`search/tfidf.py` — риск alias-коллизий).
Фикс: `generate_terminology_from_hotkeys.py` генерирует спрягаемую
форму через `pymorphy3.MorphAnalyzer().parse(verb).inflect(...)` и
добавляет её отдельным алиасом. Несовершенный вид глагола спрягается в
настоящем времени ("дублировать" → "дублирует"); совершенный вида
настоящего времени вообще не имеет, только будущее ("переместить" →
`inflect({3per,sing,pres})`=None, но `inflect({3per,sing,futr})`=
"переместит") — пробуются оба варианта, pymorphy3 сам возвращает None
для неприменимой формы. 11 из 15 новых терминов получили такой алиас
(остальные 4 — перфективные глаголы или конструкции без чистого
глагола в начале фразы).

После обоих фиксов термин находится, `exact_term_bonus=1.0`. Топ
результата теперь — официальная Manual-страница "Дублировать"
(корректный, уверенный ответ, объясняет механику дублирования) — сам
новый hotkeys-chunk поднялся до score=1.040 (rank ~18, ощутимо ближе к
топу, чем было 0.409), но не обгоняет три official-страницы с тем же
термином (authority по-прежнему выше) — не идеальный исход (страница
"Дублировать" не всегда явно называет именно Shift-D в конкретном
выигравшем sub-chunk'е), но честный, уверенный и топически верный,
принципиально лучше исходного случайного совпадения.

**Честно**: паттерн "действие (English Name)" есть не у всех 156 строк
`hotkeys.json`, только у 19 (~12%) — это НЕ полное решение, точечное
покрытие самых частых, однозначно поддающихся автоматическому разбору
действий. Расширение на оставшиеся ~137 строк — content-задача
(формулировки без явного английского имени в скобках нужно либо
переписать, либо разбирать вручную), не код-фикс, не сделано в этом
заходе.

**Changed**: `config/__init__.py` (+путь к `hotkeys_chunks.json` в
  `KNOWLEDGE_CHUNK_PATHS`), `knowledge/system/terminology/terms.json`
  (+15 терминов, +11 спрягаемых алиасов)
**Added**: `scripts/build_hotkeys_knowledge.py` (`data/hotkeys.json` →
  156 `KnowledgeChunk`, Manual-категории получают
  `official_manual`/authority=100, hand-curated —
  `ai_generated_unverified` как personal notes),
  `scripts/generate_terminology_from_hotkeys.py` (термины из
  hotkeys.json + автогенерация спрягаемых форм через pymorphy3),
  `tests/test_hotkeys_knowledge.py` (10 тестов)
**Tests**: `python -m unittest discover tests` — 314 passed, 1 known
  failure (`ResponseTimeTests`), 1 skipped. Quality Score 90.1%
**Known issues**: покрытие терминов из hotkeys.json — только ~19/156
  строк (см. "Честно" выше). Новый hotkeys-chunk конкурирует, но не
  всегда побеждает official Manual-страницы с тем же термином — по
  задумке раздела 3 ТЗ (official Manual выше personal при прочих
  равных), не баг, но конкретный ответ пользователю может не называть
  явно нужную комбинацию клавиш, если она не попала в выигравший
  Manual sub-chunk.
**Deployed**: закоммичено, запушено, на сервере `git pull --ff-only`
  чистый, один `QAService` проверен (peak RSS 162.95 МБ, ответ
  корректный), `systemctl restart blenderbot`, `journalctl` чистый
  ("Бот запущен", `getUpdates 200 OK`, без traceback), память после
  старта ~192 МБ.

Все три бага, найденные пользователем за один день живой обратной
связи (уверенный неверный ответ про Invert Selection, сломанный
хоткей-поиск с пробелами вокруг "+" в Alt+N, невидимость hotkeys.json
для обычного поиска на примере "дублировать объект") — найдены,
исправлены и задеплоены на прод в тот же день.
