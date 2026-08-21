# knowledge/system/terminology

Terminology Database (раздел 9 ТЗ). Phase 6 — готово.

`terms.json` — **36 терминов** с полями canonical_name, russian_name,
category, aliases, english_aliases, ui_label, related_terms, common_mistakes
(раздел 9 ТЗ). Код — `knowledge/terminology.py` (`Term`,
`TerminologyRegistry`). Сидинг — `scripts/seed_terminology.py`.

Термины отобраны не случайно: все 36 — понятия, которые уже реально
встречаются в вопросах `knowledge/personal/dima_notes/` (см.
`data/knowledge_base.json`), а не произвольный список «100 терминов
Blender» — раздел 36 ТЗ («1000 качественных лучше 100000 мусорных»)
применён здесь к терминам.

## Известное ограничение

Пока нигде не подключено к поиску — `TerminologyRegistry.find()` не
вызывается ни из `search/`, ни из `bot/handlers/qa.py`. Это alias-match
слой для будущего Phase 7 (search engine, раздел 10 ТЗ: «exact term match →
normalized text match → alias match → TF-IDF...»).
