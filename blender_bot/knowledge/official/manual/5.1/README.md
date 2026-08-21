# knowledge/official/manual/5.1

Blender Manual 5.1, authority S-tier (100). Phase 4 — готово.

`manual.json` — **770 chunks** (по одному на страницу Manual с непустым
summary), ~838 КБ.

## Пайплайн

1. `scripts/build_manual_index.py` — клонирует
   `projects.blender.org/blender/blender-manual` (ветка latest, ТЗ раздел 4
   требует 5.1 — версия не проверяется автоматически против реального
   релиза, см. `MANUAL_VERSION_LABEL` в скрипте), парсит `.rst`-файлы,
   переводит title/summary на русский. Сохраняет **и** оригинал
   (`title_en`/`summary_en`), **и** перевод (`title`/`summary`) — раздел 8 ТЗ
   запрещает терять английские названия. Результат: `data/manual_index.json`
   (не в git — большой, перегенерируется). Нужен интернет и git, до 15-30
   минут из-за перевода ~1700+ страниц.
2. `scripts/ingest_manual_to_registry.py` — читает `data/manual_index.json`,
   строит `KnowledgeChunk` на каждую страницу (раздел 6 ТЗ: id, source,
   source_type="official_manual", authority=100, version, language="ru",
   topic/subtopic — из структуры путей `.rst`-файлов, original_title,
   translated_title, content) и сохраняет сюда, в `manual.json`.

## Найденный и исправленный баг парсера

Первый прогон дал 1748 сырых записей, из которых **978 (56%) оказались
мусором**: RST-опции картинок (`:align: right`, `:alt: ...` — атрибуты
директивы `.. figure::`) не распознавались как разметка и утекали в summary
как обычный текст. `parse_rst_file()` в `build_manual_index.py` исправлен
(`FIELD_LIST_RE`, раздел "опции директив"); `scripts/clean_manual_index.py` —
разовый скрипт, вычистивший уже собранные данные без повторного 20-минутного
сбора. После чистки осталось 770 настоящих страниц. Регрессионный тест —
`tests/test_phase4_build_manual_index.py`.

## Известное ограничение

`content` каждого chunk'а — переведённый **summary** страницы (первый
абзац/вводный текст), а не полный текст. `section_path` заканчивается на
`:summary`, чтобы это было явно видно, а не скрыто за общим полем content.
Полное постраничное чанкование с учётом заголовков/таблиц/примеров (раздел
28 ТЗ, Structural Chunking) — отдельная будущая задача, не входит в Phase 4.

Также 10 групп чанков делят дословно одинаковый вводный абзац (например,
страницы установки под Linux/macOS/Windows) — это не баг, страницы Manual
действительно так написаны в источнике. Настоящая Duplicate Detection
(раздел 29 ТЗ) — будущая фаза.
