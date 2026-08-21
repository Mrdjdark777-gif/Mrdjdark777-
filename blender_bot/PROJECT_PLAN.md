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
| 12 | User profile | ⏳ следующая |
| 13 | Test suite | ⬜ |
| 14 | Optimization | ⬜ |
| 15 | Production deployment | ⬜ (бот уже развёрнут — потребуется миграция) |

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
