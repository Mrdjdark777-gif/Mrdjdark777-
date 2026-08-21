# Test Suite / Quality Score (Phase 13, разделы 34-35 ТЗ)

Это не юнит-тесты кода (это `tests/test_phase*.py` в родительской папке) —
это оценка КАЧЕСТВА живой системы отвечать на вопросы, прогнанная через
реальный `QAService` + `IntentEngine` + `DiagnosticRegistry`, без моков.

## Файлы

- `schema.py` — `TestCase` (input + expected_intent/topic/source_tier/
  answer_elements/confidence + опциональный `note`), список `CATEGORIES` и
  минимумы кейсов на категорию (раздел 34): basic 100, technical 100,
  troubleshooting 100, version 50, terminology 50, ambiguous 50,
  no_answer 50.
- `cases.json` — сгенерированные кейсы (540 штук). Регенерируется:
  `python scripts/build_quality_test_suite.py`.
- `metrics.py` — `evaluate_case()` прогоняет один кейс через реальный
  pipeline и считает per-dimension ok/not-ok; `compute_quality_score()`
  сводит в `QualityScore` по формуле раздела 35 (веса: intent 20%,
  retrieval 20%, source authority 20%, version 15%, diagnosis 15%,
  hallucination resistance 10%; "citation accuracy" из текста раздела 35
  не входит в формулу веса — в самом ТЗ 6 весов на 7 названных метрик,
  здесь не выдумывается вес, которого нет).
- `../test_phase13_quality_suite.py` — `TestSuiteStructureTests` (валидирует
  сам файл кейсов: минимумы, уникальные id) и `QualityScoreTests`
  (прогоняет все 540 кейсов и печатает отчёт; **не падает** на конкретном
  проценте — это отчёт для человека, порог из ТЗ v2 ≥ 70% зафиксирован как
  `V2_TARGET` для справки, а не как assert).

## Откуда берутся кейсы (`build_quality_test_suite.py`)

Программная генерация из уже существующих реальных данных, а не выдуманные
вручную вопросы:

- `basic`/`technical` — вопросы из `data/knowledge_base.json` (70 личных
  заметок Phase 3) + все 36 терминов `TerminologyRegistry` (Phase 6), в
  двух формулировках (`Что такое X?` / `Как использовать X?`).
- `terminology` — поиск по алиасам терминов (`term.aliases`,
  `term.english_aliases`).
- `troubleshooting` — 20 перефразировок двух засеянных диагностических
  проблем (`note="diagnostic:..."`, проверяется, что диалог реально
  запускается) + ~85 реалистичных Blender-проблем, НЕ покрытых деревьями
  диагностики (проверяется только intent, не запуск диалога).
- `version` — 10 тем × (одна известная версия 5.1, ожидается ответ; 4
  неизвестных версии 4.2/4.5/3.6/5.0, ожидается `LOW` из-за конфликта
  версий).
- `ambiguous`/`no_answer` — вручную составленные расплывчатые и
  нерелевантные Blender'у вопросы, ожидается `UNKNOWN`.

## Известное ограничение методологии

`retrieval_accuracy` (последний прогон — 73.6%) занижена не только
настоящими пробелами поиска, но и строгостью самого чекера:
`expected_answer_elements` для многих `terminology`-кейсов — английские
названия терминов (`origin`, `vertex group`), а официальный Manual в базе
переведён на русский почти без транслитерации — корректный русский ответ
не проходит проверку, потому что английское слово в переводе не
встречается. Это ограничение генератора тестов, не системы. Настоящие
найденные и исправленные баги поиска в этой фазе — в `PROJECT_PLAN.md`
(отчёт Phase 13): "N-gon"/"N-угольник" ложно ловили хоткей `N`, версии
вида "4.2" ложно ловили хоткей `1/2/3`.
