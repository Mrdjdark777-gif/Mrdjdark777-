"""ТЗ v3, раздел 2.2: "Написать скрипт конвертации официальных таблиц
горячих клавиш Blender в формат data/hotkeys.json".

Официальная сводная таблица дефолтных хоткеев в Blender Manual — ровно
одна страница, `interface/keymap/blender_default.rst` ("Default Keymap",
найдена через `editors/preferences/keymap.rst` → `.. seealso::`
→ `:doc:`/interface/keymap/blender_default``). Реальные `.. list-table::`
с `:kbd:`...`` ролями на ключи и обычным текстом на описание — то самое
"официальные таблицы" из ТЗ, не общие RST-таблицы (list-table в
scripts/parse_manual.py сознательно НЕ извлекаются везде — там это в
основном галереи скриншотов "до/после"; здесь — намеренно другой,
целевой парсер под ОДНУ конкретную страницу с реальными табличными
данными).

`data/hotkeys.json` уже существует и хорошо прокуратирован вручную (11
категорий, живые редакторские пояснения на русском, не буквальный
перевод) — этот скрипт НЕ перезаписывает существующие категории, только
ДОБАВЛЯЕТ те, которых там ещё нет (по совпадению точного имени секции),
с префиксом "Manual — ", чтобы источник был виден в самом файле.
HotkeyLookup индексирует по отдельным ключам, а не по категориям, так
что даже частичное пересечение по факту (тот же Ctrl-Z и в старом, и в
новом) не ломает поиск — просто чуть избыточно, как и ~1.8% overlap в
знаниях Manual (см. PROJECT_PLAN.md, ТЗ v3 этап 5).

Запуск:
    python scripts/generate_hotkeys_from_manual.py
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import docutils.nodes as nodes  # noqa: E402
from docutils.core import publish_doctree  # noqa: E402
from deep_translator import GoogleTranslator  # noqa: E402

# Заглушки ролей/директив те же, что в parse_manual.py — регистрация
# происходит один раз при импорте того модуля, здесь достаточно
# импортировать сам модуль ради побочного эффекта регистрации.
import scripts.parse_manual as _parse_manual  # noqa: E402,F401

from config import HOTKEYS_PATH  # noqa: E402

REPO_URL = "https://projects.blender.org/blender/blender-manual.git"
KEYMAP_RST_RELATIVE = Path("interface") / "keymap" / "blender_default.rst"


_WS_RE = re.compile(r"\s+")
# Manual пишет комбинации клавиш через дефис без пробелов ("Ctrl-Alt-C"),
# а существующий search/hotkey_lookup.py._normalize_key понимает только
# "+"-разделитель (его _KEY_TOKEN_RE вообще не включает дефис в допустимые
# символы — раз проверено на реальном "Ctrl-S": без этой замены строка
# осела бы в hotkeys.json нечитаемым для поиска мусором, найдено
# тест-прогоном перед первым реальным использованием скрипта).
# Дефис между двумя буквенно-цифровыми символами без пробелов — часть
# комбинации; дефис с пробелом вокруг (" - ", как в "F5 - F8", диапазон
# зарезервированных клавиш, не комбинация) — не трогаем.
_KEY_HYPHEN_RE = re.compile(r"(?<=\w)-(?=\w)")


def _table_rows(table: nodes.table) -> list[tuple[str, str]]:
    rows: list[tuple[str, str]] = []
    for row in table.findall(nodes.row):
        cells = [_WS_RE.sub(" ", entry.astext()).strip() for entry in row.findall(nodes.entry)]
        if len(cells) >= 2 and cells[0] and cells[1]:
            key_cell = _KEY_HYPHEN_RE.sub("+", cells[0])
            rows.append((key_cell, cells[1]))
    return rows


def _nearest_section_title(node: nodes.Node) -> str:
    parent = node.parent
    while parent is not None:
        if isinstance(parent, nodes.section):
            title_nodes = [c for c in parent.children if isinstance(c, nodes.title)]
            if title_nodes:
                return title_nodes[0].astext().strip()
        parent = parent.parent
    return "Общее"


def extract_categories(rst_path: Path) -> dict[str, list[tuple[str, str]]]:
    text = rst_path.read_text(encoding="utf-8", errors="ignore")
    settings_overrides = {"report_level": 5, "halt_level": 5, "syntax_highlight": "none"}
    doctree = publish_doctree(text, settings_overrides=settings_overrides)

    categories: dict[str, list[tuple[str, str]]] = {}
    for table in doctree.findall(nodes.table):
        category = _nearest_section_title(table)
        rows = _table_rows(table)
        if rows:
            categories.setdefault(category, []).extend(rows)
    return categories


def translate_categories(categories: dict[str, list[tuple[str, str]]]) -> dict[str, list[str]]:
    """Переводит ТОЛЬКО описание, никогда не трогая колонку клавиш.

    Первая версия переводила "key — description" ОДНИМ запросом — на
    реальном прогоне GoogleTranslator транслитерировал сами буквы клавиш
    в кириллицу (визуально похожие, но другие символы: "Ctrl+O" ->
    "Ctrl+О" с кириллической "О", "F1" -> "Ф1"), что физически ломает
    хоткей — ни один шорткат с такими "буквами" никогда не сработает.
    Найдено проверкой реального результата перед принятием скрипта, не
    предположено заранее. Раздельный перевод (только description) —
    единственный надёжный способ, не идентичность-маркер тут не спасает,
    т.к. дело не в потере разделителя, а в переводе содержимого САМОГО
    ключа."""
    translator = GoogleTranslator(source="auto", target="ru")
    translated: dict[str, list[str]] = {}
    for category, rows in categories.items():
        try:
            category_ru = translator.translate(category) or category
        except Exception:
            category_ru = category

        translated_lines = []
        for key, desc in rows:
            try:
                desc_ru = translator.translate(desc) or desc
            except Exception:
                desc_ru = desc
            translated_lines.append(f"{key} — {desc_ru.strip()}")
        translated[f"Manual — {category_ru}"] = translated_lines
    return translated


def main() -> None:
    tmp_dir = Path(tempfile.mkdtemp(prefix="blender_manual_hotkeys_"))
    print(f"Клонирую {REPO_URL} во временную папку {tmp_dir} ...")
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
    try:
        subprocess.run(["git", "clone", "--depth", "1", REPO_URL, str(tmp_dir)], check=True, env=env)
    except subprocess.CalledProcessError:
        print(f"Не получилось склонировать репозиторий {REPO_URL}. Проверь интернет-соединение.")
        sys.exit(1)

    rst_path = tmp_dir / "manual" / KEYMAP_RST_RELATIVE
    if not rst_path.is_file():
        print(f"Не найден {rst_path} — возможно, страница переехала в новой версии Manual.")
        shutil.rmtree(tmp_dir, ignore_errors=True)
        sys.exit(1)

    categories_en = extract_categories(rst_path)
    print(f"Найдено секций с таблицами: {len(categories_en)}")
    for name, lines in categories_en.items():
        print(f"  {name}: {len(lines)} строк")

    print("Перевожу на русский...")
    categories_ru = translate_categories(categories_en)

    existing: dict[str, list[str]] = {}
    if HOTKEYS_PATH.exists():
        with open(HOTKEYS_PATH, encoding="utf-8") as f:
            existing = json.load(f)

    added = 0
    for category, lines in categories_ru.items():
        if category in existing:
            continue  # не перезаписываем — раздел про "не удалять ручную работу"
        existing[category] = lines
        added += 1

    HOTKEYS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(HOTKEYS_PATH, "w", encoding="utf-8") as f:
        json.dump(existing, f, ensure_ascii=False, indent=2)

    print(f"Добавлено новых категорий: {added} (существующие не тронуты)")
    print(f"Сохранено в {HOTKEYS_PATH}")

    shutil.rmtree(tmp_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
