import re

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ContextTypes

from config import (
    HOTKEYS_PATH,
    KNOWLEDGE_CHUNK_PATHS,
    TERMINOLOGY_PATH,
    UNANSWERED_LOG_PATH,
)
from bot.handlers.diagnostics import clear_session, try_start_diagnostic
from bot.handlers.education import profile_store, try_continue_learn
from knowledge.schema import KnowledgeChunk
from search.engine import extract_version_hint
from search.qa_service import QAService

# Единственный экземпляр на процесс — TF-IDF индекс и данные грузятся один
# раз при старте, а не при каждом сообщении; bot/handlers/inline.py
# переиспользует его же.
qa_service = QAService(HOTKEYS_PATH, UNANSWERED_LOG_PATH, KNOWLEDGE_CHUNK_PATHS, TERMINOLOGY_PATH)

FALLBACK_TEXT = (
    "Не нашел точного ответа на этот вопрос в своей базе знаний.\n\n"
    "Попробуй переформулировать вопрос покороче (например: «как сделать риг» "
    "или «разница cycles eevee»), либо посмотри:\n"
    "• /hotkeys — горячие клавиши\n"
    "• /resources — сайты с моделями, текстурами и обучением\n"
    "• Официальная документация: https://docs.blender.org/manual/ru/latest/"
)

VAGUE_FOLLOWUP_TEXT = (
    "Похоже, это уточнение к предыдущему сообщению, а не отдельный вопрос.\n\n"
    "Я не запоминаю историю переписки и разбираю каждое сообщение отдельно, "
    "поэтому не понимаю, к чему это относится.\n\n"
    "Напиши вопрос целиком, с темой — например: «расскажи подробнее про "
    "модификатор Boolean»."
)

NOTHING_TO_EXPAND_TEXT = (
    "Похоже, это просьба рассказать подробнее, но я не помню, о чём был "
    "предыдущий вопрос (история переписки не хранится дольше одного "
    "ответа).\n\nНапиши вопрос целиком — например: «расскажи подробнее "
    "про модификатор Boolean»."
)

_WORD_RE = re.compile(r"[a-zа-яё0-9]+", re.IGNORECASE)

# Раздел про "более расширенный ответ" (см. PROJECT_PLAN.md, после Phase
# 15) — фразы, которыми пользователь обычно просит больше информации по
# ТОЛЬКО ЧТО заданному вопросу, а не задаёт новый вопрос. Раньше многие из
# этих же слов ("подробнее", "расскажи", "ещё") просто попадали в
# VAGUE_FOLLOWUP_TEXT ("я не помню, о чём речь") — теперь для них есть
# осмысленное действие: context.user_data["last_question"] хранит текст
# последнего вопроса, получившего уверенный ответ (тот же принцип, что
# pending_question для soft_match — см. qa_confirm_callback), и по этим
# фразам он используется, чтобы найти дополнительные материалы и источники.
#
# Ограничение длины (не длиннее 4 слов, как и раньше у _is_vague_followup)
# — сознательно, чтобы не перехватывать настоящие вопросы, где похожее
# слово — часть темы, а не просьба "расскажи ещё": "Что такое источник
# света?" — реальный вопрос про Light, а не просьба прислать источники,
# поэтому одиночное "источник" НЕ в списке маркеров, только явные фразы
# запроса вроде "дай источники"/"покажи источники".
_MORE_INFO_MARKERS = (
    "ещё", "еще", "далее", "продолжи", "продолжение",
    "ещё информац", "еще информац", "больше информац", "больше инфы",
    "подробнее", "поподробнее", "более подробно", "детальнее", "детальн",
    "расширенн", "расширить ответ", "полный ответ", "покажи полностью",
    "весь текст", "хочу больше", "дай больше",
    "дай источник", "покажи источник", "нужны источник", "нужен источник",
    "хочу источник", "укажи источник", "какие источники", "все источники",
    "дай ссылк", "покажи ссылк", "нужны ссылк", "нужна ссылк", "хочу ссылк",
    "укажи ссылк", "дай линк", "покажи линк",
    "где почитать", "где можно почитать", "где прочитать", "где подробнее",
    "more info", "more information", "tell me more", "read more",
    "give me sources", "give sources", "share sources", "share links",
)
_MORE_INFO_RE = re.compile(
    "|".join(rf"\b{re.escape(p)}" for p in _MORE_INFO_MARKERS), re.IGNORECASE
)

_FOLLOWUP_MARKERS = {"почему", "зачем", "понятнее"}


def _is_more_info_request(question: str) -> bool:
    words = _WORD_RE.findall(question.lower().strip())
    if not words or len(words) > 4:
        return False
    return bool(_MORE_INFO_RE.search(question.lower()))


def _is_vague_followup(question: str) -> bool:
    words = _WORD_RE.findall(question.lower())
    if not words:
        return False
    if len(words) <= 2:
        return True
    return len(words) <= 4 and any(w in _FOLLOWUP_MARKERS for w in words)


def _format_hotkey_matches(matches: list[tuple[str, str]]) -> str:
    lines = ["Нашел в списке горячих клавиш:", ""]
    for desc, category in matches:
        lines.append(f"• {desc}\n  _(раздел: {category})_")
    return "\n".join(lines)


def _source_ref(chunk: KnowledgeChunk) -> str:
    """Одна строка-ссылка на источник — раздел 15 ТЗ (citations), но не в
    обычном ответе (см. `_format_chunk_answer`), а только в расширенном
    по явному запросу ("дай источники", см. `_format_more_info`), и сразу
    для НЕСКОЛЬКИХ найденных источников, а не одного. По прямой обратной
    связи пользователя после реального использования на проде (Phase 15):
    сначала убрали source-специфичную оговорку для personal-заметок,
    затем — и саму строку с источником из обычного ответа целиком ("теперь
    при ответах не нужно указывать источник, просто ответ")."""
    if chunk.source_type == "official_manual":
        version_note = f" ({chunk.version})" if chunk.version else ""
        url_part = f" — {chunk.url}" if chunk.url else ""
        return f"{chunk.translated_title}, официальный Blender Manual{version_note}{url_part}"
    if chunk.source_type == "ai_generated_unverified":
        return f"{chunk.translated_title} — личная база бота, не сверено с официальной документацией"
    url_part = f" — {chunk.url}" if chunk.url else ""
    return f"{chunk.translated_title}, {chunk.source}{url_part}"


def _format_chunk_answer(chunk: KnowledgeChunk) -> str:
    """Обычный ответ — только текст, без метаинформации.

    Раздел 15 ТЗ (citations), раздел 14 ("LOW нельзя выдавать за
    уверенное утверждение" — явная оговорка) и раздел 17 (Conflict Engine
    — упоминание конкурирующего источника) раньше добавляли сюда
    источник, confidence-оговорку и заметку про второй найденный
    источник под каждым ответом. Все три убраны по прямой обратной связи
    пользователя после реального использования на проде: "просто ответ
    и все", "вообще не нужно такого типа инфу". Источник и confidence
    по-прежнему ВЫЧИСЛЯЮТСЯ (`QAResult.confidence`,
    `_find_competing_source` в search/qa_service.py) и доступны — через
    явный запрос "дай источники"/"подробнее" (`_format_more_info`, ниже,
    хотя и она конкурирующий источник отдельно не выделяет) или через
    /debug (раздел 33 ТЗ) для владельца. Отступление от буквы разделов
    14-15-17 зафиксировано в PROJECT_PLAN.md."""
    return chunk.content


def _format_more_info(question: str) -> str:
    """Ответ на "расскажи подробнее"/"дай источники" и т.п. про ПОСЛЕДНИЙ
    заданный вопрос (см. `_is_more_info_request`, `answer_question`).

    Не хранит отдельное "расширенное содержимое" — chunk.content и так
    уже полный текст ответа (раздел 28 ТЗ: chunking по смысловым
    единицам, не обрезается). "Больше информации" здесь означает: (1)
    другие релевантные результаты того же поиска, которые не попали в
    основной ответ, и (2) список источников — специально НЕСКОЛЬКО, а не
    один, по прямому запросу пользователя."""
    requested_version = extract_version_hint(question)
    results = qa_service.engine.search(question, requested_version=requested_version, top_n=5)

    if not results:
        return (
            "Больше конкретного текста по этому вопросу в базе знаний нет.\n\n"
            "Официальная документация: https://docs.blender.org/manual/ru/latest/"
        )

    lines = []
    extra = results[1:4]
    if extra:
        lines.append("Вот что ещё нашлось по теме:\n")
        for r in extra:
            lines.append(f"• {r.chunk.translated_title}")
            lines.append(r.chunk.content)
            lines.append("")
    else:
        lines.append("Больше материалов по теме в базе знаний нет — вот источники для дальнейшего чтения.\n")

    lines.append("Источники:")
    seen: set[str] = set()
    for r in results:
        ref = _source_ref(r.chunk)
        if ref not in seen:
            seen.add(ref)
            lines.append(f"• {ref}")
    lines.append("• Официальная документация: https://docs.blender.org/manual/ru/latest/")

    return "\n".join(lines)


async def answer_question(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    question = update.message.text

    # Свободный текст всегда означает новый вопрос, а не ответ на кнопку
    # диагностики — если пользователь был в середине decision-tree диалога
    # (bot/handlers/diagnostics.py) и написал что-то текстом вместо клика
    # по кнопке, эта сессия считается брошенной.
    clear_session(context)

    # "/learn" без темы спросил "какую тему изучаем?" — следующее
    # сообщение это ответ на ПРЯМОЙ вопрос бота, а не новый вопрос или
    # "подробнее"/"не помню контекст" (см. education.py:try_continue_learn).
    # Проверяется раньше всего остального в этой функции.
    if await try_continue_learn(question, update, context):
        return

    # "Расскажи подробнее"/"дай источники" и т.п. про последний уверенно
    # отвеченный вопрос — проверяется ДО общей проверки расплывчатости
    # (_is_vague_followup), иначе эти же слова ("подробнее", "ещё")
    # перехватывались бы ей раньше. context.user_data["last_question"]
    # ставится ниже (после chunk_confident-ответа) и в qa_confirm_callback
    # (после подтверждения soft_match) — то же ограниченное, однослотовое
    # "помню только последний вопрос", что уже применяется для
    # pending_question в soft_match-диалоге, не полная история переписки.
    if _is_more_info_request(question):
        last_question = context.user_data.get("last_question")
        if last_question:
            await update.message.reply_text(_format_more_info(last_question), parse_mode="Markdown")
        else:
            await update.message.reply_text(NOTHING_TO_EXPAND_TEXT)
        return

    # Проверяем расплывчатость ДО поиска: короткое слово вроде «почему»
    # может случайно совпасть с чем-то в корпусе, и тогда бот уверенно
    # ответит не по теме.
    if _is_vague_followup(question):
        await update.message.reply_text(VAGUE_FOLLOWUP_TEXT)
        return

    # User Profile (Phase 12, раздел 19 ТЗ): last_questions и
    # blender_version — реальный, а не выдуманный источник данных
    # (версия, которую пользователь сам назвал в вопросе).
    user_id = update.effective_user.id
    profile_store.record_question(user_id, question)
    version_hint = extract_version_hint(question)
    if version_hint:
        profile_store.set_blender_version(user_id, version_hint)

    # Diagnostic Engine (раздел 12 ТЗ) — для TROUBLESHOOTING/ERROR вопросов,
    # похожих на известный сценарий, запускаем decision-tree диалог вместо
    # того, чтобы сразу вываливать один ответ.
    intent = qa_service.intent_engine.classify(question)
    if await try_start_diagnostic(question, intent.question_types, update, context):
        return

    result = qa_service.answer(question)

    if result.kind == "chunk_confident":
        context.user_data["last_question"] = question
        await update.message.reply_text(
            _format_chunk_answer(result.chunk),
            parse_mode="Markdown",
        )
        return

    if result.kind == "hotkeys":
        await update.message.reply_text(
            _format_hotkey_matches(result.hotkey_matches), parse_mode="Markdown"
        )
        return

    if result.kind == "soft_match":
        context.user_data["pending_question"] = question
        context.user_data["pending_score"] = result.score
        context.user_data["pending_chunk_id"] = result.chunk.id
        keyboard = InlineKeyboardMarkup(
            [
                [
                    InlineKeyboardButton("Да, это оно", callback_data="qa_yes"),
                    InlineKeyboardButton("Нет", callback_data="qa_no"),
                ]
            ]
        )
        await update.message.reply_text(
            f"Возможно, ты имел в виду:\n«{result.chunk.translated_title}»?",
            reply_markup=keyboard,
        )
        return

    await update.message.reply_text(FALLBACK_TEXT)


async def qa_confirm_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    pending_question = context.user_data.pop("pending_question", None)
    context.user_data.pop("pending_score", None)
    chunk_id = context.user_data.pop("pending_chunk_id", None)
    if pending_question:
        context.user_data["last_question"] = pending_question

    chunk = qa_service.get_chunk(chunk_id) if chunk_id else None
    if chunk:
        # soft_match по построению ниже HIGH_CONFIDENCE_THRESHOLD (Phase 7) —
        # confidence="LOW" здесь всегда честна, пересчитывать не нужно.
        await query.edit_message_text(
            _format_chunk_answer(chunk), parse_mode="Markdown"
        )
    else:
        await query.edit_message_text(FALLBACK_TEXT)


async def qa_decline_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()

    question = context.user_data.pop("pending_question", None)
    score = context.user_data.pop("pending_score", 0.0)
    context.user_data.pop("pending_chunk_id", None)
    if question:
        qa_service.log_unanswered(question, score)

    await query.edit_message_text(FALLBACK_TEXT)
