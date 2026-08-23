---
description: Run the natural-language/search quality suite, compare metrics against the last known baseline, and surface regressions. Use before merging any change to search/engine.py ranking, search/qa_service.py thresholds, intents/engine.py, or knowledge/terminology.py concept matching.
---

## Инструкции

Раздел 16 hardening ТЗ этого проекта: "Коэффициенты не подбирать на
глаз. Для каждого изменения запускать quality-suite и targeted
natural-language cases." Эта skill — практическая реализация того
правила, не просто пожелание.

1. **Прогони quality-suite** (реальный `QAService`, не моки, 540
   кейсов):
   ```
   venv\Scripts\python.exe -m unittest tests.test_phase13_quality_suite -v
   ```
   Из вывода возьми: Quality Score, и разбивку по метрикам (Intent
   accuracy, Retrieval accuracy, Source authority, Version, Diagnosis,
   Hallucination resistance).

2. **Сравни с последним зафиксированным baseline.** Смотри
   `IMPLEMENTATION_REPORT.md` (BB-004: пример измерения до/после для
   `CHUNK_KIND_MODIFIER_WEIGHT`) и, если существует,
   `NATURAL_LANGUAGE_IMPLEMENTATION_REPORT.md` за более свежими числами
   и метриками natural-language слоя (Concept Accuracy, Intent Accuracy,
   Top-1 Accuracy, Natural Query Success Rate, Fallback Rate, **Wrong
   Confident Answer Rate**, Follow-up Resolution Rate — если этот слой
   уже реализован).

3. **Если изменение — это weight/threshold в search/engine.py или
   search/qa_service.py**, сделай измерение "было/стало" тем же
   способом, что уже задокументирован для BB-004: временно откати
   значение (например через monkey-patch в ad hoc скрипте, НЕ правь код
   в git), прогони quality-suite повторно, сравни, верни значение
   обратно. Отчитайся числами, не интуицией.

4. **Проверь на регрессию по сегментам**, не только по общему Score —
   рост в одном сегменте (например technical) ценой другого (например
   hallucination resistance) должен быть явно назван, не спрятан за
   средним числом.

5. Если что-то из этого недоступно (natural-language слой ещё не
   реализован, нет старого baseline) — скажи об этом прямо, не
   выдумывай сравнение.

## Результат

Таблица метрик до/после (или "baseline снят впервые, сравнивать не с
чем"), явный вердикт: регрессия есть / нет, и что именно изменилось по
сегментам, если есть.
