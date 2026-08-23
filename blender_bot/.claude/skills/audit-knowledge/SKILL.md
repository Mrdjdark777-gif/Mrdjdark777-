---
description: Audit the knowledge corpus for duplicate content, broken metadata, missing sources/versions, and suspicious chunks. Read-only -- never deletes or mass-edits knowledge JSON (section 21 hardening TZ forbids that without a reproducible pipeline). Use before scaling the knowledge base or when something in search results looks off.
---

## Инструкции

Раздел 21 hardening ТЗ проекта прямо запрещает "массовые изменения
knowledge JSON вручную без воспроизводимого ingestion/script pipeline" —
эта skill только СОБИРАЕТ данные для решения человеком, ничего не
удаляет и не переписывает сама.

**Важно про cwd.** Сессия запущена из корня репозитория (`TG BOT/`), а
не из `blender_bot/` — сначала `cd blender_bot` (Bash) / `Set-Location
blender_bot` (PowerShell), только потом команды ниже.

1. **Дубли по content_hash** — уже есть готовый скрипт, просто запусти
   его (ничего не удаляет, только пишет отчёт):
   ```
   venv\Scripts\python.exe scripts\audit_duplicate_content.py
   ```
   Результат: `duplicate_content_report.md` (в .gitignore, не коммитить).
   На момент последнего прогона в проекте было 328 групп дублей — если
   число сильно выросло, стоит разобраться, не пошёл ли новый ingestion
   вразнос.

2. **Битые метаданные** — прогони по каждому источнику из
   `config.KNOWLEDGE_CHUNK_PATHS` через `knowledge/registry.py`:
   ```python
   from config import KNOWLEDGE_CHUNK_PATHS
   from knowledge.registry import ChunkRegistry, validate_chunk
   for path in KNOWLEDGE_CHUNK_PATHS:
       registry = ChunkRegistry.load(path)
       for chunk in registry.chunks:
           validate_chunk(chunk)  # бросает ChunkValidationError на пропущенные обязательные поля
   ```

3. **Версии** — сколько chunks с `version=None` (раздел 7 ТЗ: честно, не
   выдумывая версию) vs с реальной версией; резкий перекос в сторону
   `None` после нового источника — сигнал проверить ingestion-скрипт.

4. **Terminology-коллизии** (если правка касалась
   `knowledge/terminology.py`/`terms.json`) — тот же паттерн, что уже
   есть в `tests/test_phase6_terminology.py::
   test_no_alias_collisions_between_different_terms`: один и тот же
   нормализованный alias/user_phrase не должен принадлежать двум разным
   терминам одновременно.

5. **Подозрительные chunks** — content короче ~10 символов, content
   идентичен original_title/translated_title (признак неудачного
   парсинга), authority вне допустимых значений `AUTHORITY_TIERS`.

## Результат

Сводка по каждому пункту с числами (не просто "выглядит нормально"),
явный список конкретных id chunk'ов/терминов, если что-то найдено, и
рекомендация — что стоит почистить руками, а не автоматическое
исправление.
