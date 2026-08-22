"""Живая обратная связь после раздела 2.2 (ТЗ v3): "Какой хоткей
дублирует объект в Blender?" не находил Shift+D-чанк
(scripts/build_hotkeys_knowledge.py) даже после того, как заголовок
стал включать слова действия — реальная причина оказалась глубже:
personal/hand-curated контент (authority=None → 0.3 базовый скор) без
зарегистрированного термина систематически проигрывает official Manual
chunk'ам (authority=1.0), которые лишь МИМОХОДОМ упоминают "дублировать"/
"объект" (десятки таких страниц в корпусе). Без exact_term_bonus=1.0
авторитетность официального источника решает исход даже при более
слабом лексическом совпадении — та же динамика, что раздел 1.1 уже
чинил для Manual-терминов, но personal/hotkeys-контент раздел 1.1 не
затрагивал вообще.

Извлекает термины из data/hotkeys.json там, где русское описание
сопровождается английским названием в скобках — "дублировать объект
(Duplicate)" → canonical_name="Duplicate", russian_name="дублировать
объект". Такой паттерн есть не у всех 156 строк (только у ~19, там, где
формулировка это позволяла) — это НЕ полное решение (полное потребовало
бы content-работы над всеми 156 описаниями), а точечное покрытие самых
частых, однозначно поддающихся автоматическому разбору действий.

Запуск:
    python scripts/generate_terminology_from_hotkeys.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import json  # noqa: E402

import pymorphy3  # noqa: E402

from config import HOTKEYS_PATH, TERMINOLOGY_PATH  # noqa: E402
from knowledge.terminology import Term, TerminologyRegistry  # noqa: E402

_ACTION_RE = re.compile(r"^(.+?)\s*\(([A-Za-z][A-Za-z /\-]+)\)")
_FIRST_WORD_RE = re.compile(r"^[а-яёА-ЯЁ]+")

_morph = pymorphy3.MorphAnalyzer()


def _conjugated_alias(russian_name: str) -> str | None:
    """"дублировать объект" -> "дублирует" (алиас в спрягаемой форме).

    Раздел 1.1 хранит термины в инфинитиве ("дублировать") — как их
    формулируют сами описания хоткеев — но естественный вопрос
    "Что делает X?" использует спрягаемый глагол ("дублирует"), а
    _find_term() (search/engine.py) намеренно НЕ лемматизирует запрос
    (в отличие от лексического BM25-слоя, раздел про это в
    knowledge/terminology.py/search/tfidf.py) — точное совпадение по
    словарю синонимов останется нерабочим для любого вопроса в
    естественной форме, если не зарегистрировать спрягаемую форму
    отдельным алиасом. Найдено на живом вопросе "Какой хоткей дублирует
    объект в Blender?" (PROJECT_PLAN.md) — сгенерированный термин
    "Duplicate"/"дублировать объект" не находился вообще, exact_term_bonus
    оставался 0 для всех chunk'ов, personal/hotkeys-контент проигрывал
    официальным Manual-страницам с мимоходным упоминанием тех же слов
    только по авторитетности источника.

    Совершенный и несовершенный вид глагола спрягаются по-разному
    (несовершенный — настоящее время: "дублирует"; совершенный вида
    настоящего времени не имеет вообще, только будущее: "переместит",
    не "перемещает") — пробуем оба, pymorphy3 сам вернёт None для
    неприменимой формы."""
    match = _FIRST_WORD_RE.match(russian_name.strip())
    if not match:
        return None
    verb = match.group(0)
    parsed = _morph.parse(verb)[0]
    for grammemes in ({"3per", "sing", "pres"}, {"3per", "sing", "futr"}):
        inflected = parsed.inflect(grammemes)
        if inflected and inflected.word != verb:
            return inflected.word
    return None


def main() -> None:
    with open(HOTKEYS_PATH, encoding="utf-8") as f:
        data: dict[str, list[str]] = json.load(f)

    registry = TerminologyRegistry.load(TERMINOLOGY_PATH)
    added = 0
    aliased = 0

    for lines in data.values():
        for line in lines:
            if " — " not in line:
                continue
            _key, desc = line.split(" — ", 1)
            match = _ACTION_RE.search(desc)
            if not match:
                continue
            russian_name = match.group(1).strip(" ,;:")
            canonical_name = match.group(2).strip()
            if not russian_name or not canonical_name:
                continue

            conjugated = _conjugated_alias(russian_name)

            existing = registry.find(canonical_name) or registry.find(russian_name)
            if existing:
                # Повторный запуск (идемпотентно, см. докстринг модуля):
                # термин уже есть — только добавляем спрягаемую форму как
                # алиас, если её там ещё нет, а не пропускаем целиком.
                if conjugated and conjugated not in existing.aliases:
                    existing.aliases.append(conjugated)
                    registry._index(existing)
                    aliased += 1
                continue

            term = Term(
                canonical_name=canonical_name,
                russian_name=russian_name,
                category="interface",
                aliases=[conjugated] if conjugated else [],
            )
            registry.add(term)
            added += 1

    registry.save(TERMINOLOGY_PATH)
    print(f"Добавлено новых терминов: {added}")
    print(f"Добавлено спрягаемых алиасов к уже существующим: {aliased}")
    print(f"Итого терминов в реестре: {len(registry.terms)}")


if __name__ == "__main__":
    main()
