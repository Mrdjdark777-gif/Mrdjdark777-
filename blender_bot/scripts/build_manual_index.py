"""
Строит data/manual_index.json — указатель по официальному руководству Blender.

Клонирует projects.blender.org/blender/blender-manual (открытый исходник
документации, лицензия CC-BY-SA; это собственный self-hosted git Blender
Foundation — старое зеркало на github.com/blender/blender-manual больше не
существует), парсит .rst-файлы в разделе manual/ и сохраняет заголовок,
краткое описание и ссылку на страницу docs.blender.org для каждой темы.
Заголовок и описание переводятся на русский (сама документация англоязычная,
ссылка ведёт на английскую страницу) — из-за перевода сборка занимает заметно
больше времени, чем просто скачивание.

Требует интернет и git — запускать на сервере, а не в изолированной песочнице.
Из-за долгого перевода рекомендуется запускать внутри screen, чтобы обрыв
SSH-соединения не прервал процесс. Использование:
    python scripts/build_manual_index.py
"""

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from deep_translator import GoogleTranslator

REPO_URL = "https://projects.blender.org/blender/blender-manual.git"
DOCS_BASE_URL = "https://docs.blender.org/manual/en/latest/"
# ТЗ (раздел 4) явно требует Manual 5.1. Клонируем ветку "latest" репозитория
# (см. main()) и ПРЕДПОЛАГАЕМ, что на момент запуска она соответствует 5.1 —
# это не проверяется автоматически против реального номера релиза Blender.
# Точное версионирование (раздел 7 ТЗ) — задача Phase 5 (version engine).
MANUAL_VERSION_LABEL = "5.1"
OUTPUT_PATH = Path(__file__).resolve().parent.parent / "data" / "manual_index.json"
TRANSLATE_DELIMITER = " ||| "
TRANSLATE_DELAY_SECONDS = 0.15

UNDERLINE_RE = re.compile(r"^([=\-~^\"'#*+:.,;!$%&()<>\[\]{}|@])\1{2,}\s*$")
DIRECTIVE_RE = re.compile(r"^\.\. ")
# Опции директив (например ":align: right" / ":alt: текст" под ".. figure::")
# не начинаются с ".. " и раньше просачивались в summary как обычный текст.
FIELD_LIST_RE = re.compile(r"^:[\w-]+:")
INLINE_REF_RE = re.compile(r":(?:ref|doc|term|abbr|kbd|menuselection):`([^`<]+?)(?:\s*<[^>]+>)?`")
INLINE_LITERAL_RE = re.compile(r"``([^`]+)``")
INLINE_EMPH_RE = re.compile(r"\*\*([^*]+)\*\*|\*([^*]+)\*")
MIN_SUMMARY_LEN = 25
MIN_TITLE_LEN = 2


def clean_rst_inline(text: str) -> str:
    text = INLINE_REF_RE.sub(r"\1", text)
    text = INLINE_LITERAL_RE.sub(r"\1", text)
    text = INLINE_EMPH_RE.sub(lambda m: m.group(1) or m.group(2), text)
    text = re.sub(r"[|_`]", "", text)
    return text.strip()


def parse_rst_file(path: Path) -> dict | None:
    try:
        lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    except OSError:
        return None

    title = None
    title_idx = None
    i = 0
    while i < len(lines) - 1:
        line = lines[i].strip()
        nxt = lines[i + 1].strip()
        if line and not DIRECTIVE_RE.match(line) and UNDERLINE_RE.match(nxt) and len(nxt) >= len(line) * 0.6:
            title = clean_rst_inline(line)
            title_idx = i + 2
            break
        i += 1

    if not title or len(title) < MIN_TITLE_LEN:
        return None

    summary_lines = []
    j = title_idx
    while j < len(lines):
        line = lines[j].strip()
        if not line:
            if summary_lines:
                break
            j += 1
            continue
        if DIRECTIVE_RE.match(line) or FIELD_LIST_RE.match(line) or line.startswith("|") or UNDERLINE_RE.match(line):
            j += 1
            continue
        summary_lines.append(line)
        j += 1
        if len(" ".join(summary_lines)) > 280:
            break

    summary = clean_rst_inline(" ".join(summary_lines))
    if len(summary) < MIN_SUMMARY_LEN:
        summary = ""
    if len(summary) > 280:
        summary = summary[:277].rsplit(" ", 1)[0] + "..."

    return {"title": title, "summary": summary}


def build_url(rst_path: Path, manual_root: Path) -> str:
    rel = rst_path.relative_to(manual_root).with_suffix("")
    return DOCS_BASE_URL + rel.as_posix() + ".html"


def translate_entries(entries: list[dict]) -> None:
    """Переводит title и summary на русский прямо в списке entries, по месту.

    Титул и описание переводятся одним запросом (через разделитель), чтобы
    не удваивать число обращений к сервису перевода — их и так много.
    При ошибке перевода конкретная запись остаётся на английском, вместо
    того чтобы прерывать сборку всего индекса целиком.

    Оригинальный английский title/summary сохраняется в title_en/summary_en
    ДО перевода — раздел 8 ТЗ прямо запрещает терять английские названия;
    раньше они затирались переводом безвозвратно, и knowledge-registry
    (Phase 3) не мог бы честно заполнить original_title/translated_title.
    """
    translator = GoogleTranslator(source="auto", target="ru")
    total = len(entries)
    print(f"Перевожу {total} записей на русский (это займёт время, не прерывайте)...")

    for i, entry in enumerate(entries, start=1):
        entry["title_en"] = entry["title"]
        entry["summary_en"] = entry["summary"]

        combined = f"{entry['title']}{TRANSLATE_DELIMITER}{entry['summary']}"
        try:
            translated = translator.translate(combined)
            if translated and TRANSLATE_DELIMITER.strip() in translated:
                title_ru, summary_ru = translated.split(TRANSLATE_DELIMITER.strip(), 1)
                entry["title"] = title_ru.strip(" |")
                entry["summary"] = summary_ru.strip(" |")
        except Exception:
            pass  # оставляем оригинал на английском для этой записи (title_en/summary_en тоже английские — честно)

        time.sleep(TRANSLATE_DELAY_SECONDS)
        if i % 50 == 0 or i == total:
            print(f"  переведено {i}/{total}")


def main() -> None:
    tmp_dir = Path(tempfile.mkdtemp(prefix="blender_manual_"))
    print(f"Клонирую {REPO_URL} во временную папку {tmp_dir} ...")
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
    try:
        subprocess.run(
            ["git", "clone", "--depth", "1", REPO_URL, str(tmp_dir)],
            check=True,
            env=env,
        )
    except subprocess.CalledProcessError:
        print(
            "Не получилось склонировать репозиторий. Проверь интернет-соединение "
            f"и что адрес {REPO_URL} доступен (открой его в браузере)."
        )
        sys.exit(1)

    manual_root = tmp_dir / "manual"
    if not manual_root.is_dir():
        print(f"Не найдена папка manual/ в {tmp_dir} — возможно, изменилась структура репозитория.")
        sys.exit(1)

    entries = []
    rst_files = sorted(manual_root.rglob("*.rst"))
    print(f"Найдено {len(rst_files)} .rst-файлов, парсим...")

    for rst_path in rst_files:
        parsed = parse_rst_file(rst_path)
        if not parsed or not parsed["summary"]:
            continue
        entries.append(
            {
                "title": parsed["title"],
                "summary": parsed["summary"],
                "url": build_url(rst_path, manual_root),
                "version": MANUAL_VERSION_LABEL,
                "section_path": rst_path.relative_to(manual_root).with_suffix("").as_posix(),
            }
        )

    translate_entries(entries)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(entries, f, ensure_ascii=False, indent=1)

    print(f"Готово: {len(entries)} страниц сохранено в {OUTPUT_PATH}")

    shutil.rmtree(tmp_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
