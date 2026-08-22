"""Terminology Database (разделы 8-9 ТЗ): двуязычные термины с алиасами.

Не подключено к поиску — используется как источник alias-match слоя в
Phase 7 (search engine, раздел 10 ТЗ: "exact term match → normalized text
match → alias match → TF-IDF..."). Здесь только структура данных и
lookup-индекс.
"""

from __future__ import annotations

import difflib
import json
import re
from dataclasses import asdict, dataclass, field
from pathlib import Path

# Раздел 9 ТЗ — фиксированный список категорий терминов. Три категории в
# конце добавлены при автогенерации словаря из Manual (ТЗ v3, раздел 1.1,
# scripts/generate_terminology_from_manual.py) — у путей .rst-файлов
# Manual (editors/, scene_layout/, interface/, files/) не было
# естественного соответствия среди исходных 24 категорий Phase 6.
TERMINOLOGY_CATEGORIES = (
    "modeling", "mesh", "topology", "modifiers", "materials", "shaders",
    "rendering", "lighting", "camera", "animation", "rigging",
    "geometry_nodes", "physics", "compositing", "vse", "uv", "texturing",
    "sculpting", "grease_pencil", "python", "addons", "assets",
    "color_management", "motion_tracking",
    "interface", "scene_layout", "files",
)

_WS_RE = re.compile(r"\s+")


def normalize(text: str) -> str:
    return _WS_RE.sub(" ", text.strip().lower())


@dataclass
class Term:
    """Один термин Terminology Database (раздел 9 ТЗ).

    canonical_name/russian_name — обязательные "официальные" названия
    (раздел 8: "не удалять английские названия"). aliases — русские
    синонимы/сленг, english_aliases — английские сокращения/варианты.
    ui_label — как термин реально называется в интерфейсе Blender, если
    отличается от canonical_name (раздел 8 явно требует хранить UI label).
    """

    canonical_name: str
    russian_name: str
    category: str
    aliases: list[str] = field(default_factory=list)
    english_aliases: list[str] = field(default_factory=list)
    ui_label: str | None = None
    related_terms: list[str] = field(default_factory=list)
    common_mistakes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


class TermValidationError(ValueError):
    pass


def validate_term(term: Term) -> None:
    problems = []
    if not term.canonical_name:
        problems.append("canonical_name")
    if not term.russian_name:
        problems.append("russian_name")
    if term.category not in TERMINOLOGY_CATEGORIES:
        problems.append(f"category={term.category!r} not in TERMINOLOGY_CATEGORIES")
    if problems:
        raise TermValidationError(
            f"term {term.canonical_name!r}: некорректные поля {problems} (раздел 9 ТЗ)"
        )


class TerminologyRegistry:
    """Набор терминов + lookup-индекс по всем написаниям каждого термина."""

    def __init__(self) -> None:
        self.terms: list[Term] = []
        self._by_alias: dict[str, Term] = {}

    def add(self, term: Term) -> Term:
        validate_term(term)
        self.terms.append(term)
        self._index(term)
        return term

    def _index(self, term: Term) -> None:
        names = [term.canonical_name, term.russian_name, *term.aliases, *term.english_aliases]
        if term.ui_label:
            names.append(term.ui_label)
        for name in names:
            key = normalize(name)
            if key:
                # Первый термин, зарегистрировавший алиас, выигрывает — при
                # реальном конфликте aliases между терминами это станет
                # заметно через тесты, а не потеряется молча.
                self._by_alias.setdefault(key, term)

    def find(self, word: str) -> Term | None:
        """Найти термин по любому написанию — русскому, английскому,
        алиасу или UI label, независимо от регистра (раздел 8 ТЗ)."""
        return self._by_alias.get(normalize(word))

    def find_fuzzy(self, word: str, cutoff: float = 0.85) -> Term | None:
        """Раздел 1.1 ТЗ v3: нормализация опечаток пользователя
        (расстояние Левенштейна через difflib — раздел прямо называет
        difflib допустимой альтернативой rapidfuzz; выбран difflib, чтобы
        не тащить C-расширение ради лёгкой проверки на слабом бесплатном
        сервере, раздел 2 ТЗ v2).

        Порог 0.85 подобран вручную на реальных примерах: "модификатр" →
        "модификатор" даёт 0.952, "експорт" → "экспорт" — 0.857, оба
        проходят; при этом действительно РАЗНЫЕ короткие слова Blender-
        словаря остаются далеко ниже порога ("свет"/"цвет" — 0.75,
        "меш"/"мех" — 0.667) — 0.85 разделяет их надёжно.

        Слова короче 4 символов не проверяются — на них Левенштейн даёт
        слишком много случайных близких совпадений (см. `_QUERY_MIN_LEN`
        в других частях проекта, тот же принцип, что уже применялся для
        однословных алиасов в search/engine.py)."""
        normalized = normalize(word)
        if len(normalized) < 4:
            return None
        matches = difflib.get_close_matches(normalized, self._by_alias.keys(), n=1, cutoff=cutoff)
        if not matches:
            return None
        return self._by_alias[matches[0]]

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump([t.to_dict() for t in self.terms], f, ensure_ascii=False, indent=1)

    @classmethod
    def load(cls, path: Path) -> "TerminologyRegistry":
        registry = cls()
        if not path.exists():
            return registry
        with open(path, encoding="utf-8") as f:
            raw = json.load(f)
        for item in raw:
            registry.add(Term(**item))
        return registry
