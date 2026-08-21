# knowledge/system/diagnostics

Diagnostic Engine (раздел 12 ТЗ). Phase 9 — готово.

`problems.json` — **2 диагностические проблемы** с decision tree:
1. `subdivision_breaks_model` — «После Subdivision модель ломается»
   (буквальный пример раздела 13 ТЗ, включая точный первый вопрос и все
   4 варианта ответа).
2. `black_material_or_render` — «Материал/рендер выглядит чёрным».

Код — `diagnostics/schema.py` (`DecisionNode`, `DiagnosticProblem`,
`validate_problem`) и `diagnostics/registry.py` (`DiagnosticRegistry`,
`find_problem()`). Telegram-слой и состояние диалога между сообщениями —
`bot/handlers/diagnostics.py`. Сидинг — `scripts/seed_diagnostics.py`.

## Честно про источники

Обе проблемы — синтез собственных знаний о поведении Blender, не выгружены
дословно со страницы официальной документации, поэтому `sources: []` у
обеих (раздел 26 ТЗ, Zero-Hallucination Mode — не выдавать непроверенное за
официально подтверждённое). Причины и решения технически обоснованы, но не
привязаны к конкретному URL — в отличие от `knowledge/official/manual/`.

## Известное ограничение

Только 2 проблемы — раздел 36 ТЗ («1000 качественных лучше 100000
мусорных») применён и здесь: расширение набора — по мере необходимости, а
не за один присест. `find_problem()` требует минимум 2 совпадения по
keywords (осознанно строже одного слова) — вопрос, который не наберёт двух
совпадений, просто уйдёт в обычный поиск через `search/qa_service.py`.
