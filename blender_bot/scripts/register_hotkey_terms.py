"""Дополнение к scripts/generate_terminology_from_hotkeys.py.

Тот генератор извлекает термин из data/hotkeys.json только если строка
буквально заканчивается на "русское описание (EnglishName)" сразу после
тире — работает не для всех формулировок (например, если в скобках
условие режима, а не название операции: "Ctrl + P (Object Mode) — ...",
или английское слово стоит в начале описания без скобок вообще: "V — Rip,
разрывает..."). Проактивный проход по базовым хоткеям (2026-08-23) нашёл
несколько таких случаев — этот скрипт регистрирует термины для них явным
списком, тем же способом (Term + спрягаемый алиас через pymorphy3,
category="interface"), а не правкой knowledge/system/terminology/terms.json
руками (раздел 21 hardening ТЗ: воспроизводимый pipeline, не ручные правки).

Идемпотентен: повторный запуск не создаёт дублей (registry.find() проверяет
и по canonical_name, и по russian_name перед добавлением).

Запуск:
    python scripts/register_hotkey_terms.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pymorphy3  # noqa: E402

from config import TERMINOLOGY_PATH  # noqa: E402
from knowledge.terminology import Term, TerminologyRegistry  # noqa: E402

_morph = pymorphy3.MorphAnalyzer()


def _conjugated_alias(russian_name: str) -> str | None:
    """Та же логика, что в generate_terminology_from_hotkeys.py — ТОЛЬКО
    первое слово russian_name (обычно инфинитив глагола) спрягается в
    3-е лицо ед.ч. настоящего времени, для перфективных глаголов без
    настоящего времени — будущее; остаток фразы НЕ дописывается (значит
    конъюгаты у терминов с общим первым словом могут буквально совпасть
    — см. collision-guard в вызывающем коде ниже)."""
    first_word = russian_name.split()[0]
    parsed = _morph.parse(first_word)[0]
    verb = parsed.inflect({"3per", "sing", "pres"}) or parsed.inflect({"3per", "sing", "futr"})
    if not verb or verb.word == first_word:
        return None
    return verb.word


# Явный список — не полное покрытие всех хоткеев без term'а (это и не
# было целью generate_terminology_from_hotkeys.py, см. его докстринг),
# только те, что нашлись пропущенными при проактивном проходе.
NEW_TERMS = [
    dict(canonical_name="Parent", russian_name="назначить родителя",
         aliases=["родитель", "родительский объект", "parenting"]),
    dict(canonical_name="Clear Parent", russian_name="снять родительскую связь",
         aliases=["отвязать от родителя", "убрать родителя"]),
    dict(canonical_name="Rip", russian_name="разорвать вершину",
         aliases=["rip", "разрыв вершины"]),
    dict(canonical_name="Wireframe", russian_name="каркасный режим отображения",
         aliases=["wireframe", "каркас", "режим каркаса"]),
]


def main() -> None:
    registry = TerminologyRegistry.load(TERMINOLOGY_PATH)
    added = 0
    aliased = 0
    for data in NEW_TERMS:
        existing = registry.find(data["canonical_name"]) or registry.find(data["russian_name"])
        conjugated = _conjugated_alias(data["russian_name"])
        if existing:
            if conjugated and conjugated not in existing.aliases:
                collision = registry.find(conjugated)
                if collision is None or collision is existing:
                    existing.aliases.append(conjugated)
                    registry._index(existing)
                    aliased += 1
            continue

        aliases = list(data["aliases"])
        if conjugated and conjugated not in aliases:
            aliases.append(conjugated)
        term = Term(
            canonical_name=data["canonical_name"], russian_name=data["russian_name"],
            category="interface", aliases=aliases,
        )
        registry.add(term)
        added += 1

    registry.save(TERMINOLOGY_PATH)
    print(f"Добавлено новых терминов: {added}")
    print(f"Добавлено спрягаемых алиасов к уже существующим: {aliased}")
    print(f"Итого терминов в реестре: {len(registry.terms)}")


if __name__ == "__main__":
    main()
