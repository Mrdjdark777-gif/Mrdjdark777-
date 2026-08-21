"""Version engine (раздел 7 ТЗ): парсинг, сравнение версий Blender и
обнаружение конфликтов между чанками разных release family.

Не форматирует текст для пользователя и не участвует в поиске — это
интеграция для Phase 7 (search engine) и позже Response Format (раздел 25).
Здесь только чистая логика поверх поля KnowledgeChunk.version.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# Раздел 4 ТЗ — официальные версии, которые проект обязан поддерживать.
# "5.1" — текущая целевая, уже проиндексирована (Phase 4). Остальные —
# исторические, ещё не собраны (см. knowledge/official/*/README.md) — их
# перечисление здесь не означает наличие данных, только то, что версия
# считается известной/легитимной меткой, а не мусором.
KNOWN_RELEASE_FAMILIES = (
    "5.1", "5.0", "4.5", "4.4", "4.3", "4.2", "4.1", "4.0", "3.6",
)

_VERSION_RE = re.compile(r"^(\d+)\.(\d+)(?:\.(\d+))?$")


@dataclass(frozen=True)
class ParsedVersion:
    major: int
    minor: int
    patch: int | None  # None значит "версия без патча", не "патч 0"

    @property
    def release_family(self) -> str:
        """"major.minor" — по разделу 7 ТЗ патч-версии вроде 5.1.1/5.1.2
        считаются тем же release family, что 5.1 (багфиксы, не новый
        функционал); реальный конфликт версий — это разница major.minor."""
        return f"{self.major}.{self.minor}"

    def __str__(self) -> str:
        if self.patch is None:
            return self.release_family
        return f"{self.major}.{self.minor}.{self.patch}"


def parse_version(raw: str | None) -> ParsedVersion | None:
    """Возвращает ParsedVersion или None, если версия неизвестна/не распознана.

    None — не ошибка, а честный случай «версия неизвестна» (раздел 7 ТЗ):
    вызывающий код обязан не утверждать привязку ответа к конкретной
    версии, а не молча подставлять версию по умолчанию.
    """
    if not raw:
        return None
    match = _VERSION_RE.match(raw.strip())
    if not match:
        return None
    major, minor, patch = match.groups()
    return ParsedVersion(int(major), int(minor), int(patch) if patch else None)


def is_known_release(version: ParsedVersion) -> bool:
    """Входит ли release family версии в список раздела 4 ТЗ."""
    return version.release_family in KNOWN_RELEASE_FAMILIES


def same_release_family(a: ParsedVersion, b: ParsedVersion) -> bool:
    """5.1 и 5.1.2 — один release family (патч внутри того же minor).
    5.1 и 4.2 — разные."""
    return a.release_family == b.release_family


def _sort_key(v: ParsedVersion) -> tuple[int, int, int]:
    return (v.major, v.minor, v.patch or 0)


@dataclass(frozen=True)
class VersionConflict:
    """Обнаруженное расхождение release family между двумя источниками по
    одной теме.

    Раздел 7 ТЗ: «При конфликте версий явно показывать различия» и «Никогда
    не смешивать старую и новую документацию без явной маркировки». Это
    структурный сигнал (какие версии участвуют, какая новее) для будущего
    вызывающего кода (Response Format, раздел 25). Формулировку самого
    расхождения по содержанию (что именно изменилось между версиями) эта
    функция не делает — для этого нужен смысловой diff содержимого двух
    чанков, что выходит за рамки Version Engine.
    """

    older: ParsedVersion
    newer: ParsedVersion

    def describe(self) -> str:
        return f"{self.older} vs {self.newer}"


def detect_conflict(a: ParsedVersion | None, b: ParsedVersion | None) -> VersionConflict | None:
    """Конфликт версий между a и b, если они из разных release family.

    Если хотя бы одна версия неизвестна (None) — конфликт не определяем:
    раздел 7 запрещает утверждать конфликт версий, когда одна из сторон
    сама по себе не привязана ни к какой версии — это не «конфликт», а
    «недостаточно данных».
    """
    if a is None or b is None:
        return None
    if same_release_family(a, b):
        return None
    lo, hi = sorted((a, b), key=_sort_key)
    return VersionConflict(older=lo, newer=hi)


def compatible_with_request(chunk_version: str | None, requested_version: str | None) -> bool:
    """Может ли chunk с данной версией участвовать в ответе на вопрос про
    requested_version, не смешивая версии без маркировки (раздел 7 ТЗ).

    - Если версия chunk'а или запроса неизвестна (None) — формально
      совместимы (нечего сравнивать); честная пометка «версия неизвестна»
      в самом ответе — забота вызывающего кода (Response Format), не этой
      функции.
    - Если обе версии известны — совместимы только при совпадении
      release family.
    """
    chunk_v = parse_version(chunk_version)
    requested_v = parse_version(requested_version)
    if chunk_v is None or requested_v is None:
        return True
    return same_release_family(chunk_v, requested_v)
