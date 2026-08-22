"""BB-003 (hardening ТЗ, раздел 6 ТЗ v2 "Duplicate Detection"): отчёт по
группам chunk'ов с байт-в-байт одинаковым content_hash во всей базе
знаний (все config.KNOWLEDGE_CHUNK_PATHS вместе, не один файл за раз).

Намеренно НЕ удаляет и не меняет ни одного chunk'а — только пишет отчёт
для ручного разбора. Раздел 21 hardening ТЗ прямо запрещает массовые
изменения knowledge JSON без воспроизводимого ingestion/script pipeline;
причина дубля бывает разной (одна и та же формулировка параметра дословно
повторяется на нескольких страницах официального Manual — это ожидаемо и
нормально для reference-документации, а не мусор) — решение, что с этим
делать, требует человека, а не автоматического удаления.

search/engine.py уже схлопывает такие дубли НА ЭТАПЕ ПОИСКА (не показывает
одинаковый контент дважды в одном ответе, см. SearchEngine.search()) — этот
скрипт для другого: показать масштаб и содержимое дублей, чтобы решить,
стоит ли что-то реально чистить в data pipeline позже.

Запуск:
    python scripts/audit_duplicate_content.py
    python scripts/audit_duplicate_content.py --out путь/к/отчёту.md
"""

from __future__ import annotations

import argparse
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import KNOWLEDGE_CHUNK_PATHS  # noqa: E402
from knowledge.registry import ChunkRegistry  # noqa: E402
from knowledge.schema import KnowledgeChunk  # noqa: E402

DEFAULT_OUT_PATH = Path(__file__).resolve().parent.parent / "duplicate_content_report.md"


def load_all_chunks(paths: list[Path]) -> list[KnowledgeChunk]:
    chunks: list[KnowledgeChunk] = []
    for path in paths:
        chunks.extend(ChunkRegistry.load(path).chunks)
    return chunks


def group_by_content_hash(chunks: list[KnowledgeChunk]) -> dict[str, list[KnowledgeChunk]]:
    by_hash: dict[str, list[KnowledgeChunk]] = defaultdict(list)
    for chunk in chunks:
        by_hash[chunk.content_hash].append(chunk)
    return {h: group for h, group in by_hash.items() if len(group) > 1}


def build_report(chunks: list[KnowledgeChunk], duplicate_groups: dict[str, list[KnowledgeChunk]]) -> str:
    total_chunks = len(chunks)
    total_groups = len(duplicate_groups)
    total_redundant = sum(len(g) - 1 for g in duplicate_groups.values())

    lines = [
        "# Отчёт по дублям content_hash (BB-003, hardening ТЗ)",
        "",
        f"Всего chunks в базе: {total_chunks}",
        f"Групп дублей (2+ chunk'а с одинаковым content_hash): {total_groups}",
        f"\"Лишних\" chunk'ов (группа минус один оригинал): {total_redundant}",
        "",
        "Ничего не удалено — это только отчёт. Поиск уже схлопывает такие "
        "дубли на этапе выдачи (search/engine.py), так что пользователь "
        "никогда не увидит два одинаковых ответа подряд, даже если сами "
        "chunks остаются в data-файлах.",
        "",
        "## Группы, отсортированные по размеру (самые крупные — первыми)",
        "",
    ]

    sorted_groups = sorted(duplicate_groups.items(), key=lambda kv: -len(kv[1]))
    for content_hash, group in sorted_groups:
        lines.append(f"### {len(group)} chunks — hash `{content_hash[:12]}...`")
        lines.append("")
        lines.append(f"Текст ({len(group[0].content)} симв.): {group[0].content[:200]!r}")
        lines.append("")
        for chunk in group:
            lines.append(f"- `{chunk.id}` — {chunk.source} / {chunk.subtopic or '-'} — {chunk.translated_title!r}")
        lines.append("")

    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT_PATH)
    args = parser.parse_args()

    chunks = load_all_chunks(KNOWLEDGE_CHUNK_PATHS)
    duplicate_groups = group_by_content_hash(chunks)
    report = build_report(chunks, duplicate_groups)

    args.out.write_text(report, encoding="utf-8")
    print(f"Всего chunks: {len(chunks)}")
    print(f"Групп дублей: {len(duplicate_groups)}")
    print(f"Отчёт сохранён: {args.out}")


if __name__ == "__main__":
    main()
