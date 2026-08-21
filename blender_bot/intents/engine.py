"""Intent Engine (раздел 11 ТЗ): классификация вопроса по keywords/aliases/
question patterns, без LLM.

Раздел 11 перечисляет один плоский список из 28 меток, фактически смешивая
два разных измерения — ТИП вопроса (WHAT_IS, HOW_TO, WHY, ERROR,
TROUBLESHOOTING, COMPARISON, WORKFLOW, BEST_PRACTICE, LEARNING, EXAM,
TERMINOLOGY, VERSION — 12 меток) и ТЕМУ вопроса (PYTHON, GEOMETRY_NODES,
MODELING, MATERIALS, LIGHTING, RENDERING, ANIMATION, RIGGING, COMPOSITING,
VSE, UV, SCULPT, EXPORT, IMPORT, ADDON, PERFORMANCE — 16 меток, 12+16=28).
ТЗ явно их не разделяет, но реализованы как два независимых набора правил:
вопрос может получить один или несколько типов и одну или несколько тем
одновременно — жёсткой классификации "один вопрос — одна метка" раздел 11
не требует.

НЕ реализовано: "контекст и предыдущие сообщения" (раздел 11). Бот
принципиально не хранит историю переписки между сообщениями
(bot/handlers/qa.py, VAGUE_FOLLOWUP_TEXT) — многошаговый диалог с
состоянием это Diagnostic Engine (Phase 9, раздел 12 ТЗ), не Intent Engine.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from search.engine import extract_version_hint

QUESTION_TYPE_INTENTS = (
    "WHAT_IS", "HOW_TO", "WHY", "ERROR", "TROUBLESHOOTING", "COMPARISON",
    "WORKFLOW", "BEST_PRACTICE", "LEARNING", "EXAM", "TERMINOLOGY", "VERSION",
)

TOPIC_INTENTS = (
    "PYTHON", "GEOMETRY_NODES", "MODELING", "MATERIALS", "LIGHTING",
    "RENDERING", "ANIMATION", "RIGGING", "COMPOSITING", "VSE", "UV",
    "SCULPT", "EXPORT", "IMPORT", "ADDON", "PERFORMANCE",
)

# Порядок важен только для читаемости — классификация не exclusive-choice,
# каждое правило проверяется независимо, вопрос может получить несколько
# типов сразу (например TROUBLESHOOTING + ERROR).
_QUESTION_TYPE_PATTERNS: dict[str, tuple[str, ...]] = {
    "ERROR": (
        "ошибка", "error", "traceback", "exception", "не запускается",
        "краш", "crash", "вылетает", "вылетел",
    ),
    "TROUBLESHOOTING": (
        # короткие основы вместо полной словоформы — ловят и "не работает",
        # и "не работал", и "не работала" и т.п. (без стемминга это
        # ближайшая замена; полноценная лемматизация — вне рамок фазы)
        "не работа", "не получа", "проблема", "не вид", "пропал", "сломал",
        "странно выглядит", "не двига", "черн", "чёрн", "не отобража",
        "ломае", "искажа", "деформир",
        # найдено Phase 13 (build_quality_test_suite.py): реальные
        # troubleshooting-формулировки, не покрытые исходным набором.
        "темн", "тёмн", "поплы", "порти", "неправильно",
        "не устанавлива", "не проигрыва", "не появля", "не показыва",
        "провалива", "не освеща", "сломан", "артефакт", "не назнача",
        "не применя", "не воспроизвод", "растянут",
    ),
    "COMPARISON": (
        "разница", "отличие", "чем отличается", "отличается от", "лучше",
        "сравнение", "vs",
        # НЕ "или" — слишком общее слово, ложно ловит любое перечисление
        # вариантов ("грань или ребро"), не только сравнение.
    ),
    "EXAM": (
        "тест", "экзамен", "проверь меня", "quiz", "задание",
    ),
    "LEARNING": (
        "научи", "хочу изучить", "с чего начать", "как научиться",
        "туториал", "урок", "обучение", "изучение",
    ),
    "BEST_PRACTICE": (
        "best practice", "правильно ли", "хорошая практика", "стоит ли",
        "рекомендуется", "правильный подход",
    ),
    "WORKFLOW": (
        "как лучше организовать", "порядок действий", "workflow",
        "пайплайн", "последовательность действий",
    ),
    "WHY": (
        "почему", "зачем", "для чего нужен", "для чего нужна", "для чего нужно",
    ),
    "HOW_TO": (
        "как сделать", "как настроить", "как создать", "как включить",
        "как использовать", "как применить", "как добавить",
        # найдено Phase 13 (build_quality_test_suite.py): реальные HOW_TO
        # вопросы из dima_notes не покрывались исходным узким списком
        # глаголов — "как развернуть UV", "как установить аддон" и т.п.
        # получали пустой intent. НЕ добавлен общий "как " без глагола —
        # это столкнулось бы с "как работает"/"как делает" (WHAT_IS, см.
        # ниже) на каждом вопросе сразу.
        "как развернуть", "как импортировать", "как экспортировать",
        "как рендерить", "как ускорить", "как анимировать", "как установить",
        "как красить", "как запечь", "как пересчитать", "как объединить",
        "как разделить", "как закрепить", "как посчитать", "как вставить",
        "как удалить", "как выделить", "как переместить", "как повернуть",
        "как скопировать", "как экструдировать", "как перевести",
    ),
    "WHAT_IS": (
        "что такое", "что за", "что означает", "what is", "из чего состоит",
        "как работает",
        # найдено Phase 13: "Что делает X?" ("Что делает Loop Cut?") и
        # "Какие бывают/есть X?" — тот же explanatory-тип вопроса, что и
        # "что такое", исходный список их не ловил.
        "что делает", "какие бывают", "какие есть",
    ),
}

_TOPIC_PATTERNS: dict[str, tuple[str, ...]] = {
    "PYTHON": ("python", "питон", "скрипт", "bpy", "api"),
    "GEOMETRY_NODES": ("geometry nodes", "геонод", "геометрические ноды", "геометрия нод"),
    "MODELING": (
        "моделирование", "меш", "полигон", "топология", "экструд",
        "фаска", "bevel", "ретопол",
    ),
    "MATERIALS": ("материал", "шейдер", "текстур", "bsdf"),
    "LIGHTING": ("освещение", "лампа", "hdri", "свет в сцен"),
    "RENDERING": ("рендер", "cycles", "eevee", "семпл"),
    "ANIMATION": ("анимаци", "ключевой кадр", "keyframe", "таймлайн"),
    "RIGGING": ("риг", "кости", "арматур", "скелет", "weight paint", "вес вершин"),
    "COMPOSITING": ("композит", "compositor", "постобработк"),
    "VSE": ("монтаж", "видеоредактор", "sequencer", "видеоряд"),
    "UV": ("uv", "юв", "развертк", "развёртк"),
    "SCULPT": ("скульпт", "dyntopo", "multires", "динтопо"),
    "EXPORT": ("экспорт", "export"),
    "IMPORT": ("импорт", "import"),
    "ADDON": ("аддон", "плагин", "add-on", "addon"),
    "PERFORMANCE": (
        "производительность", "тормозит", "лагает", "медленно рендерит",
        "оптимизац", "ускорить рендер",
    ),
}


@dataclass
class IntentResult:
    question_types: list[str] = field(default_factory=list)
    topics: list[str] = field(default_factory=list)
    version_hint: str | None = None

    @property
    def is_terminology(self) -> bool:
        """TERMINOLOGY (раздел 11) — не отдельный набор keywords, а WHAT_IS
        по вопросу, где дополнительно распознан конкретный термин. Само
        распознавание термина — работа search.engine._find_term, вызывающий
        код (не этот класс) решает, считать ли это TERMINOLOGY."""
        return "WHAT_IS" in self.question_types


def _compile_patterns(groups: dict[str, tuple[str, ...]]) -> dict[str, re.Pattern]:
    """Каждый паттерн — с границей слова ТОЛЬКО в начале (\\bpattern, не
    \\bpattern\\b), а не просто substring.

    Регрессия, найденная при проверке на реальных вопросах (см.
    PROJECT_PLAN.md, Phase 8): "кости" (алиас RIGGING) ложно совпадал
    внутри "жид[кости]" (Fluid) — тот же класс бага, что exact_term_bonus
    в Phase 7 (search/engine.py). Первая попытка — граница с обеих сторон
    (\\bpattern\\b) — убрала и это ложное срабатывание, и заодно легитимные
    словоформы: "рендер" переставал совпадать внутри "рендерить"/
    "рендеринг" (в русском языке нет стемминга/лемматизации в проекте, а
    добавлять для этого библиотеку вроде pymorphy2 — решение за рамками
    этой фазы). Граница только слева — компромисс: "кости" по-прежнему не
    совпадёт в середине "жидкости" (там нет границы слова вообще), но
    "рендер" совпадёт и в "рендерить", и в "рендеринге".
    """
    return {
        intent: re.compile(
            "|".join(rf"\b{re.escape(p)}" for p in patterns), re.IGNORECASE
        )
        for intent, patterns in groups.items()
    }


_QUESTION_TYPE_REGEX = _compile_patterns(_QUESTION_TYPE_PATTERNS)
_TOPIC_REGEX = _compile_patterns(_TOPIC_PATTERNS)


def _matches_any(text: str, compiled: re.Pattern) -> bool:
    return compiled.search(text) is not None


class IntentEngine:
    def classify(self, question: str) -> IntentResult:
        text = question.lower().strip()

        question_types = [
            intent for intent, pattern in _QUESTION_TYPE_REGEX.items()
            if _matches_any(text, pattern)
        ]

        version_hint = extract_version_hint(question)
        if version_hint:
            question_types.append("VERSION")

        topics = [
            intent for intent, pattern in _TOPIC_REGEX.items()
            if _matches_any(text, pattern)
        ]

        return IntentResult(question_types=question_types, topics=topics, version_hint=version_hint)
