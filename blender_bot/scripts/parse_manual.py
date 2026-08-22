"""ТЗ v3, раздел 2.1: "Полноценный парсер Blender Manual" — заменяет
двухшаговый пайплайн Phase 4 (`build_manual_index.py` +
`ingest_manual_to_registry.py`, оба удалены вместе с этим скриптом,
восстановимы через git log).

Старый пайплайн брал только ПЕРВЫЙ абзац каждой страницы (обрезка по 280
символам, простыми регулярками) и терял Note/Warning-блоки, таблицы
параметров и весь текст после первого пустого перевода строки — регулярки
не умеют отслеживать вложенность RST (какой текст относится к какой
директиве), из-за чего в summary попадал мусор вроде подписей к картинкам.

Здесь вместо регулярок — `docutils`, эталонный парсер reStructuredText
(на нём построен сам Sphinx): реальное дерево документа, а не
построчное угадывание. Blender Manual использует Sphinx-специфичные
роли/директивы (:doc:, :ref:, .. index::, .. toctree:: и т.д.), которых
чистый docutils не знает — без регистрации заглушек парсер завершается
system_message-ошибками и может терять текст вокруг них; заглушки ниже
не пытаются красиво ОТРЕНДЕРИТЬ эти конструкции (незачем — раздел 2.1
просит текстовые знания, не HTML), только не дают им ломать дерево.

Умное чанкирование (раздел 2.1): с одной RST-страницы получается
НЕСКОЛЬКО chunk'ов, а не один:
    - intro   — заголовок + все абзацы до первого подраздела
    - note    — каждый блок Note/Important/Tip/Hint отдельно
    - warning — каждый блок Warning отдельно
    - options — каждый definition list («Affect: Vertices — ...») одним
                chunk'ом на список, term/definition через " — "

Таблицы (raздел 2.1: "таблицы параметров") сознательно НЕ извлекаются в
этой версии — на практике большинство `.. list-table::` в Manual
оказались галереями скриншотов ("до/после"), а не текстовыми данными;
надёжно отличать содержательную таблицу от картиночной без специального
эвристического анализа — отдельная задача, не сделанная здесь (см.
PROJECT_PLAN.md, Known issues).

Запуск (нужен интернет и git; на ~2400 файлах перевод — самая долгая
часть, легко час и больше — обязательно внутри screen, см. DEPLOYMENT.md):
    python scripts/parse_manual.py
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import docutils.nodes as nodes  # noqa: E402
from docutils.core import publish_doctree  # noqa: E402
from docutils.parsers.rst import Directive, directives, roles  # noqa: E402
from deep_translator import GoogleTranslator  # noqa: E402

from config import KNOWLEDGE_DIR  # noqa: E402
from knowledge.registry import ChunkRegistry  # noqa: E402
from knowledge.schema import AUTHORITY_TIERS, KnowledgeChunk  # noqa: E402

REPO_URL = "https://projects.blender.org/blender/blender-manual.git"
DOCS_BASE_URL = "https://docs.blender.org/manual/en/latest/"
# Раздел 4 ТЗ требует Manual 5.1; клонируем ветку по умолчанию репозитория
# (см. main()) и ПРЕДПОЛАГАЕМ соответствие 5.1 на момент запуска — то же
# допущение, что было и в старом build_manual_index.py, не проверяется
# автоматически против реального номера релиза (раздел 7 ТЗ, version
# engine — отдельная задача).
MANUAL_VERSION_LABEL = "5.1"
MANUAL_LICENSE = "CC-BY-SA"
OUTPUT_PATH = KNOWLEDGE_DIR / "official" / "manual" / MANUAL_VERSION_LABEL / "manual.json"

# Раньше был "\n|||SPLIT|||\n" — Google Translate переводит само слово
# SPLIT ("РАЗДЕЛЕНИЕ"), из-за чего "SPLIT" in translated никогда не
# совпадало, и КАЖДАЯ запись молча оставалась на английском (полный
# прогон на ~9000 записей это не поймал — ошибка гасится в except
# Exception на строке ниже, никакого исключения не бросается вообще).
# Голые пайпы без слов переживают перевод неизменными — проверено
# отдельно на реальном GoogleTranslator перед этим фиксом.
TRANSLATE_DELIMITER = "\n|||\n"
TRANSLATE_DELAY_SECONDS = 0.15
MIN_TITLE_LEN = 2
MAX_CHUNK_CHARS = 1200  # длиннее — обрезается на границе предложения, см. _truncate


# --- Заглушки для Sphinx-специфичных ролей/директив, которых нет в чистом
# docutils (найдены выборкой по ~400 случайным .rst-файлам корпуса) ---

def _plain_text_role(name, rawtext, text, lineno, inliner, options=None, content=None):
    # :doc:`Bevel Operation </modeling/.../bevel>`, :ref:`...`, :kbd:`Ctrl-R`
    # и т.п. — просто оставляем видимый текст роли, без ссылки/разметки.
    label = text.split("<", 1)[0].strip() if "<" in text else text
    return [nodes.Text(label)], []


def _empty_role(name, rawtext, text, lineno, inliner, options=None, content=None):
    # :bl-icon:`arrow_leftright` и подобные значковые роли — у иконки нет
    # текстового смысла для базы знаний, просто убираем её из текста.
    return [], []


for _role_name in ("doc", "ref", "term", "abbr", "kbd", "menuselection", "guilabel", "mod", "sup"):
    roles.register_local_role(_role_name, _plain_text_role)
for _role_name in ("bl-icon", "icon"):
    roles.register_local_role(_role_name, _empty_role)

# Полный список Sphinx-ролей корпуса заранее неизвестен (обзор по 400
# случайным файлам нашёл 10 штук, реальный прогон уже нашёл 11-ю —
# :bl-icon:, не попавшую в выборку) — сообщения об ошибке "Unknown
# interpreted text role"/"No role entry" для любых ещё не учтённых ролей
# как защитная сетка вырезаются регуляркой в _clean_text() ниже, чтобы
# такой мусор не просочился в текст chunk'а, даже если сама роль не дала
# осмысленной замены.
_DOCUTILS_NOISE_RE = re.compile(
    r'(?:<string>:\d+: \((?:INFO|ERROR|WARNING|SEVERE)/\d+\) [^\n]*\n?'
    r'|Trying "[^"]*" as canonical role name\.\n?'
    r'|No (?:role|directive) entry for "[^"]*"[^\n]*\n?'
    r'|Unknown (?:interpreted text role|directive type) "[^"]*"\.?\n?)'
)


def _clean_text(text: str) -> str:
    text = _DOCUTILS_NOISE_RE.sub(" ", text)
    return re.sub(r"[ \t]+", " ", text).strip()


class _IgnoreDirective(Directive):
    """Директивы Sphinx без содержательного текстового смысла для базы
    знаний (index/toctree/highlight/peertube/todo и т.п.) — тело
    директивы отбрасывается целиком, не пытаемся его парсить."""

    has_content = True
    optional_arguments = 1
    final_argument_whitespace = True
    option_spec = {}  # принимает любые опции директивы, не проверяя их

    def run(self):
        return []


for _directive_name in (
    "index", "toctree", "seealso", "hlist", "highlight", "peertube",
    "todo", "function", "code-block", "reference", "youtube",
):
    directives.register_directive(_directive_name, _IgnoreDirective)


def _truncate(text: str, limit: int = MAX_CHUNK_CHARS) -> str:
    text = _clean_text(text)
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(". ", 1)
    return (cut[0] + ".") if len(cut) > 1 else text[:limit].rsplit(" ", 1)[0] + "..."


def parse_rst_file(path: Path) -> dict | None:
    """Возвращает {"title": str, "intro": str, "notes": [str], "warnings":
    [str], "options": [str]} или None, если в файле нет валидного title
    (обычно index-страницы toctree без собственного контента)."""
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return None

    settings_overrides = {"report_level": 5, "halt_level": 5, "syntax_highlight": "none"}
    try:
        doctree = publish_doctree(text, settings_overrides=settings_overrides)
    except Exception:
        return None

    title_nodes = list(doctree.findall(nodes.title))
    if not title_nodes:
        return None
    title = _clean_text(title_nodes[0].astext())
    if len(title) < MIN_TITLE_LEN:
        return None

    # Интро: прямые дети doctree до первого вложенного раздела. Blender
    # Manual НЕ оборачивает вступительный текст страницы в свой собственный
    # section — заголовок, вступительные абзацы, figure/table идут прямыми
    # детьми doctree, и только настоящие подразделы ("Options" и т.п.)
    # становятся nodes.section (проверено эмпирически на реальном файле —
    # спуск внутрь первого section, как раньше, находил не intro, а первый
    # подраздел, и всегда возвращал пусто).
    intro_parts = []
    for child in doctree.children:
        if isinstance(child, nodes.section):
            break
        if isinstance(child, nodes.paragraph):
            intro_parts.append(child.astext())
    intro = _truncate(" ".join(intro_parts))

    notes, warnings = [], []
    for cls, bucket in ((nodes.note, notes), (nodes.important, notes), (nodes.tip, notes),
                        (nodes.hint, notes), (nodes.warning, warnings)):
        for block in doctree.findall(cls):
            block_text = _truncate(block.astext())
            if block_text:
                bucket.append(block_text)

    options = []
    for dl in doctree.findall(nodes.definition_list):
        # Опции Blender часто вложенные (термин "Affect" содержит СВОЙ
        # definition_list с "Vertices"/"Edges") — findall(...) на dl
        # рекурсивно нашёл бы и вложенные definition_list_item тоже,
        # задваивая их и здесь, и в отдельном проходе для вложенного dl.
        # Прямые дети (dl.children) берут только термины этого уровня;
        # содержимое вложенного списка всё равно попадёт в текст через
        # definition.astext(), просто не как отдельная пара term/def.
        pairs = []
        for item in dl.children:
            if not isinstance(item, nodes.definition_list_item):
                continue
            term_nodes = [c for c in item.children if isinstance(c, nodes.term)]
            def_nodes = [c for c in item.children if isinstance(c, nodes.definition)]
            if not term_nodes or not def_nodes:
                continue
            term_text = term_nodes[0].astext().strip()
            def_text = def_nodes[0].astext().strip()
            if term_text and def_text:
                pairs.append(f"{term_text} — {def_text}")
        if pairs:
            options.append(_truncate(" ".join(pairs)))

    return {"title": title, "intro": intro, "notes": notes, "warnings": warnings, "options": options}


def build_url(rst_path: Path, manual_root: Path) -> str:
    rel = rst_path.relative_to(manual_root).with_suffix("")
    return DOCS_BASE_URL + rel.as_posix() + ".html"


def category_from_section_path(section_path: str) -> str:
    parts = [p for p in section_path.split("/") if p]
    return parts[0] if parts else "general"


def collect_raw_entries(manual_root: Path) -> list[dict]:
    """Клонированный репозиторий → список сырых записей (ещё на английском,
    ещё не KnowledgeChunk) — раздельно от перевода/сборки реестра, чтобы
    можно было протестировать на маленькой выборке файлов без реального
    похода в сеть за переводом (см. tests/test_parse_manual.py)."""
    entries = []
    rst_files = sorted(manual_root.rglob("*.rst"))
    print(f"Найдено {len(rst_files)} .rst-файлов, парсим через docutils...")

    for idx, rst_path in enumerate(rst_files, start=1):
        parsed = parse_rst_file(rst_path)
        if not parsed:
            continue
        section_path = rst_path.relative_to(manual_root).with_suffix("").as_posix()
        url = build_url(rst_path, manual_root)
        category = category_from_section_path(section_path)
        base = {"section_path": section_path, "url": url, "category": category}

        if parsed["intro"]:
            entries.append({**base, "kind": "intro", "title": parsed["title"], "content": parsed["intro"]})
        for i, note in enumerate(parsed["notes"]):
            entries.append({**base, "kind": "note", "title": f"{parsed['title']} — примечание",
                             "content": note, "seq": i})
        for i, warn in enumerate(parsed["warnings"]):
            entries.append({**base, "kind": "warning", "title": f"{parsed['title']} — предупреждение",
                             "content": warn, "seq": i})
        for i, opt in enumerate(parsed["options"]):
            entries.append({**base, "kind": "options", "title": f"{parsed['title']} — параметры",
                             "content": opt, "seq": i})

        if idx % 200 == 0:
            print(f"  обработано {idx}/{len(rst_files)} файлов, {len(entries)} чанков собрано")

    return entries


CHECKPOINT_EVERY = 500  # раздел 2.1: полный прогон — часы работы бесплатного
# переводчика на ~9000 записей; без чекпоинтов сбой сети/сервиса под конец
# теряет всю проделанную работу, т.к. registry.save() раньше происходил
# только один раз в самом конце main().


def translate_entries(entries: list[dict], on_checkpoint=None) -> None:
    """Тот же приём, что в старом build_manual_index.py: title+content
    одним запросом через разделитель, чтобы не удваивать число обращений
    к бесплатному сервису перевода — их и так тысячи. Английский
    оригинал сохраняется в title_en/content_en ДО перевода (раздел 8 ТЗ:
    не терять английские названия).

    on_checkpoint(entries), если передан, вызывается каждые
    CHECKPOINT_EVERY записей — даёт main() возможность сохранить
    промежуточный результат на диск, не теряя часы работы при сбое."""
    translator = GoogleTranslator(source="auto", target="ru")
    total = len(entries)
    print(f"Перевожу {total} записей на русский (долго, не прерывать)...")

    marker = TRANSLATE_DELIMITER.strip()
    smoke_test_size = min(20, total)
    smoke_test_successes = 0

    for i, entry in enumerate(entries, start=1):
        entry["title_en"] = entry["title"]
        entry["content_en"] = entry["content"]
        combined = f"{entry['title']}{TRANSLATE_DELIMITER}{entry['content']}"
        try:
            translated = translator.translate(combined)
            if translated and marker in translated:
                title_ru, content_ru = translated.split(marker, 1)
                entry["title"] = title_ru.strip(" |\n")
                entry["content"] = content_ru.strip(" |\n")
                if i <= smoke_test_size:
                    smoke_test_successes += 1
        except Exception:
            pass  # запись остаётся на английском (title_en/content_en тоже английские — честно)

        # Раньше молчаливый сбой перевода (см. комментарий у TRANSLATE_DELIMITER
        # выше) не давал знать о себе часами — first-N smoke test ловит такой
        # класс проблем за секунды вместо часов впустую потраченного времени.
        if i == smoke_test_size and smoke_test_successes == 0:
            raise RuntimeError(
                f"Перевод не сработал ни для одной из первых {smoke_test_size} записей — "
                f"похоже, сломался маркер-разделитель или сам переводчик. "
                f"Прерываю прогон сейчас, а не через часы."
            )

        time.sleep(TRANSLATE_DELAY_SECONDS)
        if i % 100 == 0 or i == total:
            print(f"  переведено {i}/{total}")
        if on_checkpoint and i % CHECKPOINT_EVERY == 0:
            # Весь список, не только переведённый префикс: непереведённый
            # хвост просто остаётся на английском в чекпоинте, а не
            # пропадает из файла целиком.
            on_checkpoint(entries)


_ID_SAFE_RE = re.compile(r"[^a-zA-Z0-9_.-]+")


def build_registry(entries: list[dict]) -> ChunkRegistry:
    registry = ChunkRegistry()
    for idx, entry in enumerate(entries):
        slug_base = entry["section_path"]
        if entry["kind"] != "intro":
            slug_base = f"{slug_base}_{entry['kind']}{entry.get('seq', 0)}"
        slug = _ID_SAFE_RE.sub("_", slug_base).strip("_") or f"page{idx:05d}"

        chunk = KnowledgeChunk(
            id=f"blender_manual:{MANUAL_VERSION_LABEL}:{slug}",
            source="blender_manual",
            source_type="official_manual",
            authority=AUTHORITY_TIERS["S"],
            version=MANUAL_VERSION_LABEL,
            language="ru",
            topic=entry["category"],
            subtopic=entry["kind"],
            date=None,
            url=entry["url"],
            original_title=entry.get("title_en") or entry["title"],
            translated_title=entry["title"],
            content=entry.get("content") or "",
            license=MANUAL_LICENSE,
            author=None,
            parent_document=None,
            section_path=f"{entry['section_path']}:{entry['kind']}",
        )
        registry.add(chunk)
    return registry


def main() -> None:
    tmp_dir = Path(tempfile.mkdtemp(prefix="blender_manual_"))
    print(f"Клонирую {REPO_URL} во временную папку {tmp_dir} ...")
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
    try:
        subprocess.run(["git", "clone", "--depth", "1", REPO_URL, str(tmp_dir)], check=True, env=env)
    except subprocess.CalledProcessError:
        print(f"Не получилось склонировать репозиторий {REPO_URL}. Проверь интернет-соединение.")
        sys.exit(1)

    manual_root = tmp_dir / "manual"
    if not manual_root.is_dir():
        print(f"Не найдена папка manual/ в {tmp_dir} — возможно, изменилась структура репозитория.")
        sys.exit(1)

    entries = collect_raw_entries(manual_root)
    print(f"Собрано {len(entries)} чанков с {len(set(e['section_path'] for e in entries))} страниц.")

    if OUTPUT_PATH.exists():
        backup_path = OUTPUT_PATH.with_suffix(".json.bak")
        shutil.copy2(OUTPUT_PATH, backup_path)
        print(f"Старый {OUTPUT_PATH.name} сохранён как {backup_path.name}")

    def _checkpoint(entries_so_far: list[dict]) -> None:
        registry = build_registry(entries_so_far)
        registry.save(OUTPUT_PATH)
        print(f"  [чекпоинт] {len(registry.chunks)} chunks сохранено в {OUTPUT_PATH}")

    try:
        translate_entries(entries, on_checkpoint=_checkpoint)
    finally:
        # Сохраняем даже при Ctrl-C/сбое сети посреди перевода — часть
        # записей останется на английском, но ничего не потеряется.
        registry = build_registry(entries)
        registry.save(OUTPUT_PATH)
        print(f"Готово: {len(registry.chunks)} chunks сохранено в {OUTPUT_PATH}")

        dupes = registry.duplicate_content_hashes()
        if dupes:
            print(f"Внимание: {len(dupes)} групп дублей по content_hash")

    shutil.rmtree(tmp_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
