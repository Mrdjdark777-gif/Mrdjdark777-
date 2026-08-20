"""
Строит data/manual_index.json — указатель по официальному руководству Blender.

Клонирует github.com/blender/blender-manual (открытый исходник документации,
лицензия CC-BY-SA), парсит .rst-файлы в разделе manual/ и сохраняет заголовок,
краткое описание и ссылку на страницу docs.blender.org для каждой темы.

Требует интернет и git — запускать на сервере, а не в изолированной песочнице.
Использование:
    python scripts/build_manual_index.py
"""

import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_URL = "https://github.com/blender/blender-manual.git"
DOCS_BASE_URL = "https://docs.blender.org/manual/en/latest/"
OUTPUT_PATH = Path(__file__).resolve().parent.parent / "data" / "manual_index.json"

UNDERLINE_RE = re.compile(r"^([=\-~^\"'#*+:.,;!$%&()<>\[\]{}|@])\1{2,}\s*$")
DIRECTIVE_RE = re.compile(r"^\.\. ")
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
        if DIRECTIVE_RE.match(line) or line.startswith("|") or UNDERLINE_RE.match(line):
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


def main() -> None:
    tmp_dir = Path(tempfile.mkdtemp(prefix="blender_manual_"))
    print(f"Клонирую {REPO_URL} во временную папку {tmp_dir} ...")
    try:
        subprocess.run(
            ["git", "clone", "--depth", "1", REPO_URL, str(tmp_dir)],
            check=True,
        )
    except subprocess.CalledProcessError:
        print("Не получилось склонировать репозиторий. Проверь интернет-соединение.")
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
            }
        )

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(entries, f, ensure_ascii=False, indent=1)

    print(f"Готово: {len(entries)} страниц сохранено в {OUTPUT_PATH}")

    shutil.rmtree(tmp_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
