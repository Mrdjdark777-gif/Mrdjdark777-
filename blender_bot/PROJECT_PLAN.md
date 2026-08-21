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
| 7 | Search engine | ⏳ следующая |
| 8 | Intent engine | ⬜ |
| 9 | Diagnostic engine | ⬜ |
| 10 | Source ranking | ⬜ |
| 11 | Education engine | ⬜ |
| 12 | User profile | ⬜ |
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

- Ничего не удалено безвозвратно. `handlers/`, `utils/`, старый `config.py`
  перемещены (не удалены) в `_phase1_backup/` — **в репозитории нет git**
  (`git`/`git init` недоступны в этой среде), поэтому обычное удаление было
  бы необратимым; политика `CLAUDE.md` явно требует в этом случае
  переносить, а не удалять. Проверено `grep` по всему репозиторию — на
  `handlers/`/`utils/` больше никто не ссылается. `_phase1_backup/` можно
  удалить вручную после того, как Phase 2 подтверждена в проде (или как
  только в репозитории появится git-история).

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

- `_phase1_backup/` физически остаётся в рабочей копии — не мусор для
  раннера, но и не часть структуры по разделу 39; нужно удалить вручную
  (или через `git rm` после `git init`) после подтверждения, что прод не
  сломан.
- Репозиторий по-прежнему без git — любой следующий рефакторинг несёт тот же
  риск необратимости. Рекомендация: `git init` + первый коммit до Phase 3.
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
