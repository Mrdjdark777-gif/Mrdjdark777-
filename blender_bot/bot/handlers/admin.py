"""Admin Commands + Debug Mode (разделы 32-33 ТЗ).

Все команды здесь доступны только OWNER_ID (раздел 32: "Все
административные команды доступны только OWNER_ID") — тот же паттерн
проверки, что уже был в bot/handlers/broadcast.py. Раздел 33 отдельно
требует: "В production пользователю debug-данные не показывать" — эти
команды физически недоступны никому, кроме владельца, а не просто скрыты
из /help.

Модули-владельцы singleton'ов (bot.handlers.qa/diagnostics/education)
импортируются как МОДУЛИ, а не через `from ... import qa_service` — это
единственный способ, которым /reindex может заменить объект и чтобы
остальной код (например, bot/handlers/qa.py:answer_question) увидел новый
экземпляр: он обращается к имени `qa_service` в своём модуле на момент
вызова, а не к копии, захваченной при импорте.
"""

from __future__ import annotations

import json
import time

from telegram import Update
from telegram.ext import ContextTypes

import bot.handlers.diagnostics as diagnostics_module
import bot.handlers.education as education_module
import bot.handlers.qa as qa_module
from bot.handlers.hotkeys import HOTKEYS
from config import (
    DIAGNOSTICS_PATH,
    HOTKEYS_PATH,
    KNOWLEDGE_CHUNK_PATHS,
    LESSONS_PATH,
    OWNER_ID,
    SUBSCRIBERS_PATH,
    TERMINOLOGY_PATH,
    UNANSWERED_LOG_PATH,
)
from diagnostics.registry import DiagnosticRegistry
from education.registry import LessonRegistry
from knowledge.registry import ChunkRegistry
from knowledge.schema import KnowledgeChunk, AUTHORITY_TIERS
from profile.subscribers import get_subscribers
from search.engine import extract_version_hint
from search.qa_service import QAService

# personal_notes.json — единственный knowledge-путь, куда /quick_add вправе
# дописывать (см. config.KNOWLEDGE_CHUNK_PATHS): личные заметки, а не
# официальный Manual — раздел 5 ТЗ прямо требует хранить их отдельно.
_PERSONAL_NOTES_PATH = next(
    p for p in KNOWLEDGE_CHUNK_PATHS if "personal" in p.parts
)

_TIER_BY_AUTHORITY = {v: k for k, v in AUTHORITY_TIERS.items()}
_START_TIME = time.monotonic()

NOT_OWNER_TEXT = "Эта команда доступна только владельцу бота."
NO_OWNER_CONFIGURED_TEXT = (
    "OWNER_ID не задан в .env — админ-команды отключены. "
    "Узнай свой Telegram ID у @userinfobot и добавь его в .env."
)

ADMIN_HELP_TEXT = (
    "Админ-команды (раздел 32 ТЗ):\n\n"
    "/health — жива ли база знаний\n"
    "/stats — статистика базы знаний и пользователей\n"
    "/sources — какие источники знаний подключены\n"
    "/version — какие версии Blender покрыты базой\n"
    "/search <запрос> — сырые результаты поиска со score (раздел 10)\n"
    "/debug <вопрос> — полный разбор ответа: intent, термины, версия, "
    "confidence (раздел 33)\n"
    "/unanswered — последние вопросы, на которые не нашлось уверенного ответа\n"
    "/quick_add <вопрос> | <ответ> — добавить личную заметку прямо из "
    "Telegram и переиндексировать\n"
    "/reindex — перечитать базу знаний с диска без перезапуска процесса"
)


async def _guard(update: Update) -> bool:
    if not OWNER_ID:
        await update.message.reply_text(NO_OWNER_CONFIGURED_TEXT)
        return False
    if update.effective_user.id != OWNER_ID:
        await update.message.reply_text(NOT_OWNER_TEXT)
        return False
    return True


async def admin_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await _guard(update):
        return
    await update.message.reply_text(ADMIN_HELP_TEXT)


async def health_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await _guard(update):
        return
    chunk_count = len(qa_module.qa_service.engine.chunks)
    uptime_min = (time.monotonic() - _START_TIME) / 60
    status = "OK" if chunk_count > 0 else "ПРОБЛЕМА: поисковый индекс пуст"
    lines = [
        status,
        f"Аптайм процесса: {uptime_min:.1f} мин",
        f"Chunks в индексе: {chunk_count}",
        f"Терминов: {len(qa_module.qa_service.engine.terminology.terms)}",
        f"Диагностических проблем: {len(diagnostics_module.diagnostic_registry.problems)}",
        f"Уроков: {len(education_module.lesson_registry.lessons)}",
    ]
    await update.message.reply_text("\n".join(lines))


def _count_jsonl_lines(path) -> int:
    if not path.exists():
        return 0
    with open(path, encoding="utf-8") as f:
        return sum(1 for line in f if line.strip())


async def stats_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await _guard(update):
        return
    engine = qa_module.qa_service.engine
    chunks = engine.chunks

    by_source_type: dict[str, int] = {}
    by_tier: dict[str, int] = {}
    for c in chunks:
        by_source_type[c.source_type] = by_source_type.get(c.source_type, 0) + 1
        tier = _TIER_BY_AUTHORITY.get(c.authority, "custom/не проверено")
        by_tier[tier] = by_tier.get(tier, 0) + 1

    lines = ["Статистика базы знаний (раздел 32 ТЗ: /stats)", ""]
    lines.append(f"Всего knowledge chunks: {len(chunks)}")
    lines.append("По типу источника:")
    for k, v in sorted(by_source_type.items(), key=lambda kv: -kv[1]):
        lines.append(f"  {k}: {v}")
    lines.append("По authority tier:")
    for k, v in sorted(by_tier.items(), key=lambda kv: -kv[1]):
        lines.append(f"  {k}: {v}")
    lines.append("")
    lines.append(f"Терминов: {len(engine.terminology.terms)}")
    lines.append(f"Диагностических проблем: {len(diagnostics_module.diagnostic_registry.problems)}")
    lines.append(f"Хоткеев: {sum(len(v) for v in HOTKEYS.values())}")
    lines.append(f"Уроков: {len(education_module.lesson_registry.lessons)}")
    lines.append("")
    lines.append(f"Подписчиков рассылки: {len(get_subscribers(SUBSCRIBERS_PATH))}")
    lines.append(f"Профилей пользователей: {education_module.profile_store.total_users()}")
    lines.append(f"Незнакомых вопросов в логе: {_count_jsonl_lines(UNANSWERED_LOG_PATH)}")

    await update.message.reply_text("\n".join(lines))


async def sources_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await _guard(update):
        return
    engine = qa_module.qa_service.engine
    counts: dict[str, int] = {}
    for c in engine.chunks:
        counts[c.source] = counts.get(c.source, 0) + 1

    lines = ["Подключённые источники знаний (config.KNOWLEDGE_CHUNK_PATHS):", ""]
    for path in KNOWLEDGE_CHUNK_PATHS:
        lines.append(f"  {path}")
    lines.append("")
    lines.append("По полю source (chunk.source), chunks в индексе:")
    for source, count in sorted(counts.items(), key=lambda kv: -kv[1]):
        lines.append(f"  {source}: {count}")
    lines.append("")
    lines.append("Приоритет источников (раздел 3 ТЗ): S=100, A=80, B=60, C=30, D=10.")

    await update.message.reply_text("\n".join(lines))


async def version_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await _guard(update):
        return
    versions = sorted(
        {c.version for c in qa_module.qa_service.engine.chunks if c.version},
        reverse=True,
    )
    unknown_count = sum(1 for c in qa_module.qa_service.engine.chunks if not c.version)
    lines = ["Версии Blender, покрытые базой знаний (раздел 7 ТЗ):", ""]
    lines.append(", ".join(versions) if versions else "(нет chunks с указанной версией)")
    lines.append(f"\nChunks без указанной версии: {unknown_count}")
    await update.message.reply_text("\n".join(lines))


def _format_scored(scored, index: int) -> str:
    c = scored.chunk
    return (
        f"{index}. [{scored.score:.3f}] {c.translated_title} "
        f"({c.source_type}, v={c.version or '?'})\n"
        f"   lexical={scored.lexical_score:.3f} authority={scored.authority_score:.3f} "
        f"version={scored.version_score:.3f} topic={scored.topic_score:.3f} "
        f"kind={scored.chunk_kind_score:.2f} exact_term={scored.exact_term_bonus:.2f} "
        f"canonical={scored.is_canonical_title}"
    )


async def search_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await _guard(update):
        return
    query = update.message.text.partition(" ")[2].strip()
    if not query:
        await update.message.reply_text("Использование: /search запрос")
        return

    requested_version = extract_version_hint(query)
    results = qa_module.qa_service.engine.search(query, requested_version=requested_version, top_n=5)
    if not results:
        await update.message.reply_text("Ничего не найдено (score=0 для всех chunks).")
        return

    lines = [f"Сырые результаты поиска для: {query!r}", ""]
    lines.extend(_format_scored(r, i + 1) for i, r in enumerate(results))
    await update.message.reply_text("\n".join(lines))


async def debug_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Раздел 33 ТЗ: intent, detected terms, version, search results, scores,
    selected source и confidence — полный разбор одного вопроса."""
    if not await _guard(update):
        return
    question = update.message.text.partition(" ")[2].strip()
    if not question:
        await update.message.reply_text("Использование: /debug вопрос")
        return

    qa_service = qa_module.qa_service
    intent = qa_service.intent_engine.classify(question)
    diagnostic_hit = (
        {"TROUBLESHOOTING", "ERROR"} & set(intent.question_types)
        and diagnostics_module.diagnostic_registry.find_problem(question)
    )
    results = qa_service.engine.search(question, requested_version=intent.version_hint, top_n=3)
    result = qa_service.answer(question)

    lines = [f"Debug: {question!r}", ""]
    lines.append(f"question_types: {intent.question_types}")
    lines.append(f"topics: {intent.topics}")
    lines.append(f"version_hint: {intent.version_hint}")
    lines.append(f"diagnostic_triggered: {bool(diagnostic_hit)}"
                 + (f" ({diagnostic_hit.problem_id})" if diagnostic_hit else ""))
    lines.append("")
    lines.append(f"QAResult.kind: {result.kind}")
    lines.append(f"QAResult.confidence: {result.confidence}")
    if result.chunk:
        lines.append(f"selected: {result.chunk.translated_title} ({result.chunk.source_type})")
    lines.append("")
    lines.append("top raw search results:")
    if results:
        lines.extend(_format_scored(r, i + 1) for i, r in enumerate(results))
    else:
        lines.append("  (пусто)")

    await update.message.reply_text("\n".join(lines))


def _reload_knowledge() -> QAService:
    """Пересобирает QAService/DiagnosticRegistry/LessonRegistry с диска и
    ПОДМЕНЯЕТ singleton'ы в bot.handlers.qa/diagnostics/education — общая
    часть /reindex и /quick_add (раздел 27 ТЗ: ingestion должен быть
    повторяемым). Объекты собираются ДО подмены старых — если файл на
    диске битый, исключение всплывает раньше подмены, и бот продолжает
    отвечать по старому, ещё исправному состоянию, а не остаётся без
    индекса вообще. Бросает исключение вызывающему коду при неудаче,
    ничего не подменяя."""
    new_qa_service = QAService(HOTKEYS_PATH, UNANSWERED_LOG_PATH, KNOWLEDGE_CHUNK_PATHS, TERMINOLOGY_PATH)
    new_diagnostic_registry = DiagnosticRegistry.load(DIAGNOSTICS_PATH)
    new_lesson_registry = LessonRegistry.load(LESSONS_PATH)

    qa_module.qa_service = new_qa_service
    diagnostics_module.diagnostic_registry = new_diagnostic_registry
    education_module.lesson_registry = new_lesson_registry
    return new_qa_service


async def reindex_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Перечитывает knowledge/ и связанные JSON с диска без перезапуска процесса."""
    if not await _guard(update):
        return
    try:
        new_qa_service = _reload_knowledge()
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        await update.message.reply_text(f"Реиндексация не удалась, старое состояние сохранено: {exc}")
        return

    await update.message.reply_text(
        "Реиндексация завершена.\n"
        f"Chunks: {len(new_qa_service.engine.chunks)}, "
        f"терминов: {len(new_qa_service.engine.terminology.terms)}, "
        f"диагностических проблем: {len(diagnostics_module.diagnostic_registry.problems)}, "
        f"уроков: {len(education_module.lesson_registry.lessons)}"
    )


def _read_unanswered_records(path, limit: int) -> list[dict]:
    if not path.exists():
        return []
    records = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return records[-limit:]


async def unanswered_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Раздел 3.2 ТЗ v3: список реальных вопросов, на которые поиск дал
    confidence ниже порога (записываются в UNANSWERED_LOG_PATH — тот же
    механизм с Phase 7, см. search/qa_service.py:log_unanswered) — чтобы
    было видно, чего не хватает базе знаний, не заглядывая в файл руками."""
    if not await _guard(update):
        return
    records = _read_unanswered_records(UNANSWERED_LOG_PATH, limit=15)
    if not records:
        await update.message.reply_text("Лог пуст — нет вопросов без уверенного ответа.")
        return

    lines = [f"Последние {len(records)} вопросов без уверенного ответа:", ""]
    for r in reversed(records):
        types = ",".join(r.get("question_types") or []) or "?"
        lines.append(f"• [{r.get('best_score', 0):.2f}] {r.get('question', '?')} ({types})")
    lines.append("")
    lines.append("Ответить прямо сейчас: /quick_add вопрос | ответ")
    await update.message.reply_text("\n".join(lines))


QUICK_ADD_USAGE_TEXT = "Использование: /quick_add вопрос | ответ"


async def quick_add_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Раздел 3.2 ТЗ v3: добавить ответ на неизвестный вопрос прямо из
    Telegram, без ручного редактирования JSON на сервере. Пишет в личную
    базу (knowledge/personal/, source_type=ai_generated_unverified,
    needs_review=True — как и все остальные personal-заметки, честно не
    выдаёт наспех вбитый ответ за официально проверенный факт), затем
    сразу переиндексирует — раздел прямо просит "без перезапуска сервиса"."""
    if not await _guard(update):
        return
    raw = update.message.text.partition(" ")[2]
    if "|" not in raw:
        await update.message.reply_text(QUICK_ADD_USAGE_TEXT)
        return

    question, _, answer = raw.partition("|")
    question = question.strip()
    answer = answer.strip()
    if not question or not answer:
        await update.message.reply_text(QUICK_ADD_USAGE_TEXT)
        return

    registry = ChunkRegistry.load(_PERSONAL_NOTES_PATH)
    chunk_id = f"personal_notes:{len(registry.chunks):04d}"
    registry.add(KnowledgeChunk(
        id=chunk_id,
        source="personal_notes",
        source_type="ai_generated_unverified",
        authority=None,
        version=None,
        language="ru",
        topic="general",
        subtopic=None,
        date=None,
        url=None,
        original_title=question,
        translated_title=question,
        content=answer,
        needs_review=True,
    ))
    registry.save(_PERSONAL_NOTES_PATH)

    try:
        new_qa_service = _reload_knowledge()
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        await update.message.reply_text(
            f"Заметка сохранена ({chunk_id}), но реиндексация не удалась: {exc}\n"
            f"Попробуй /reindex вручную после исправления."
        )
        return

    await update.message.reply_text(
        f"Добавлено и переиндексировано ({chunk_id}), chunks теперь: "
        f"{len(new_qa_service.engine.chunks)}.\n\nВопрос: {question}\nОтвет: {answer}"
    )
