"""Confidence Engine (раздел 14 ТЗ): HIGH/MEDIUM/LOW/UNKNOWN поверх сигналов,
уже посчитанных SearchEngine (Phase 7) — authority, version_score,
exact_term_bonus. Не пересчитывает поиск заново, только классифицирует уже
найденный лучший результат.

Раздел 14: "LOW нельзя превращать в уверенное утверждение" — это не про
score (он и так уже определяет, показываем ли мы ответ вообще, порогами
Phase 7), а про то, ЧТО именно бот говорит пользователю при LOW: должна
быть явная оговорка, а не то же самое уверенное предложение, что и для HIGH.
"""

from __future__ import annotations

from search.engine import ScoredChunk

CONFIDENCE_LEVELS = ("HIGH", "MEDIUM", "LOW", "UNKNOWN")

# A/B-tier (community) — раздел 3 ТЗ. Пока в knowledge/community/* нет
# реальных данных (Phase 3 Known issues), этот порог ничего не находит на
# практике, но правило уже готово на будущее.
_COMMUNITY_TIER_MIN_AUTHORITY = 60


def classify_confidence(scored: ScoredChunk | None) -> str:
    """Предполагает, что вызывающий код уже отсеял нерелевантные результаты
    порогом score (Phase 7, HIGH_CONFIDENCE_THRESHOLD/SOFT_MATCH_THRESHOLD в
    search/qa_service.py) — эта функция классифицирует источник/версию УЖЕ
    отобранного результата, а не решает, релевантен ли он вообще. Вызов на
    сыром результате ниже порога (например, случайном совпадении по
    мусорному запросу) даст обманчиво уверенную метку."""
    if scored is None:
        return "UNKNOWN"

    chunk = scored.chunk

    # Реальный конфликт версий (раздел 7 ТЗ, knowledge/version.py) — сразу
    # LOW независимо от того, насколько официален источник: раздел 14
    # явно называет "старый источник" фактором понижения.
    if scored.version_score < 1.0:
        return "LOW"

    if chunk.source_type == "official_manual":
        # HIGH: официальный источник + точный термин (раздел 14: "точный
        # термин, однозначный факт"). Без точного совпадения термина —
        # официальный, но менее прицельный ответ, только MEDIUM.
        if scored.exact_term_bonus >= 1.0:
            return "HIGH"
        return "MEDIUM"

    if chunk.authority is not None and chunk.authority >= _COMMUNITY_TIER_MIN_AUTHORITY:
        return "MEDIUM"

    # ai_generated_unverified и всё остальное без подтверждённого authority.
    return "LOW"
