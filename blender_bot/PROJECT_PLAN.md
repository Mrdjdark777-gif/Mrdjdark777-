# Blender Expert System v2 — план и журнал фаз

Рабочий документ для реализации `Blender_Expert_System_v2_TZ_FIXED.pdf` поверх
существующего Blender-бота. Ведётся по фазам из раздела 40 ТЗ; после каждой
фазы — отчёт по формату из раздела 42 (Changed / Added / Removed / Tests /
Known issues / Next phase).

## Статус фаз

| Фаза | Название | Статус |
|---|---|---|
| 1 | Анализ репозитория и architecture map | ✅ готово |
| 2 | Refactor architecture | ⏳ следующая |
| 3 | Knowledge registry | ⬜ |
| 4 | Официальный Blender Manual | ⬜ (сырые данные уже есть, нужна интеграция) |
| 5 | Version engine | ⬜ |
| 6 | Terminology | ⬜ |
| 7 | Search engine | ⬜ |
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
