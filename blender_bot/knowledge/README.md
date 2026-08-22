# knowledge/

Knowledge registry по разделам 5-6 ТЗ (`docs/Blender_Expert_System_v2_TZ.pdf`).

## Код (Phase 3, готово)

- `schema.py` — `KnowledgeChunk` (обязательные + желательные поля раздела 6)
  и `AUTHORITY_TIERS` (S/A/B/C/D из раздела 3).
- `registry.py` — `ChunkRegistry`: валидация обязательных полей, save/load
  JSON, черновая проверка дублей по `content_hash`.
- `version.py` (Phase 5, раздел 7 ТЗ) — парсинг/сравнение версий Blender,
  `detect_conflict()`, `compatible_with_request()`.
- `terminology.py` (Phase 6, разделы 8-9 ТЗ) — `Term`/`TerminologyRegistry`,
  двуязычный lookup по canonical/russian name, aliases, UI label.

**С Phase 7 всё это подключено к живому поиску.** `search/engine.py`
(`SearchEngine`) читает чанки отсюда через `ChunkRegistry`, использует
`terminology.py` для exact/alias term match и `version.py` для
version_score. `search/qa_service.py` — единственная точка входа для
`bot/handlers/qa.py` и `bot/handlers/inline.py`. `data/knowledge_base.json`
остался только как СЫРЬЁ для скрипта миграции
(`scripts/migrate_knowledge_base_to_registry.py`), живой поиск его больше
не читает. Manual (`knowledge/official/manual/5.1`) с ТЗ v3 этапа 5
собирается напрямую через `scripts/parse_manual.py` (docutils-парсер,
клонирует и переводит без промежуточного `data/manual_index.json`) — см.
README внутри `knowledge/official/manual/5.1/`.

## Данные

```
knowledge/official/manual/5.1          — 8952 chunks (ТЗ v3, этап 5, готово)
knowledge/official/python_api/5.1      — пока пусто
knowledge/official/release_notes       — пока пусто
knowledge/official/developer_docs      — пока пусто
knowledge/community/stackoverflow_ru   — пока пусто
knowledge/community/blender_stackexchange — пока пусто
knowledge/community/forumblender       — пока пусто
knowledge/personal/dima_notes/dima_notes.json — 70 chunks, мигрировано из
                                                 data/knowledge_base.json
                                                 (scripts/migrate_knowledge_base_to_registry.py)
knowledge/system/synonyms              — зарезервировано, см. README внутри
knowledge/system/terminology           — 36 терминов (Phase 6, готово)
knowledge/system/intents               — Phase 8, пока пусто
knowledge/system/diagnostics           — Phase 9, пока пусто
knowledge/system/rules                 — пока пусто
```

## Известное ограничение — dima_notes не проверен на достоверность

Пользователь подтвердил (Phase 3): часть или весь `data/knowledge_base.json`
сгенерирован ассистентом при заполнении базы, а не является личными
заметками в смысле раздела 5 ТЗ. Это **не** доверенный Custom tier
(Приложение A) — все 70 чанков честно помечены
`source_type="ai_generated_unverified"`, `authority=None`, `needs_review=true`,
`author=None` (конкретное авторство построчно не установлено). До сверки с
официальным Manual (естественно ложится на Phase 4) бот не должен
представлять содержимое этих чанков как проверенный факт. Также
`topic="general"` для всех — точная категоризация по разделу 9 ТЗ
(Terminology Database categories) относится к Phase 6, не к Phase 3.
