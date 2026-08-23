"""Search Engine (раздел 10 ТЗ v2; раздел 1.1 ТЗ v3): многосигнальный
поиск по knowledge/ registry.

Порядок по ТЗ: exact term match → normalized text match → alias match →
BM25 → metadata filtering. Финальный score учитывает lexical_score,
semantic_similarity, authority_score, version_score, topic_score и
exact_term_bonus.

Честная архитектурная заметка: "semantic_similarity" в этой реализации —
то же самое значение BM25, что и lexical_score. Полноценная семантика
потребовала бы embedding-модели, а раздел 2 ТЗ прямо запрещает делать
внешнюю LLM/тяжёлую ML-зависимость фундаментом системы.

С ТЗ v3 (раздел 1.1, "Переход на BM25 — замена базовому TF-IDF") лексический
слой — `BM25Index` (search/tfidf.py); прежний `TfidfIndex` удалён целиком
(восстановим через git log, см. PROJECT_PLAN.md).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from knowledge.registry import ChunkRegistry
from knowledge.schema import KnowledgeChunk
from knowledge.terminology import Term, TerminologyRegistry, normalize as normalize_term
from knowledge.version import compatible_with_request, detect_conflict, parse_version
from search.tfidf import BM25Index, lemmatize, tokenize

# Раздел 10 ТЗ: "Повышать score при совпадении версии, официального
# источника, точного термина, категории... Понижать при старой версии,
# отсутствии версии и низком authority." Прочитано буквально: authority/
# version/topic — МОДИФИКАТОРЫ поверх релевантности, а не независимые
# слагаемые. Первая версия этого движка складывала их аддитивно с
# lexical_score — из-за этого совершенно бессмысленный запрос получал
# score≈0.41 только за счёт того, что попадал в official-чанк с высоким
# authority, почти не уступая реальному совпадению (см. ручную проверку в
# PROJECT_PLAN.md, Phase 7). Здесь relevance (lexical ИЛИ точное совпадение
# термина) — обязательный множитель: без неё score = 0, сколько бы ни было
# authority. Конкретные числа ниже — инженерное решение этой фазы, не
# значения из самого ТЗ (там формула не задана дословно) — открыто для
# пересмотра в Phase 10 (Source ranking).
AUTHORITY_MODIFIER_WEIGHT = 0.3
VERSION_MODIFIER_WEIGHT = 0.6
TOPIC_MODIFIER_WEIGHT = 0.2
CHUNK_KIND_MODIFIER_WEIGHT = 0.2
# BB-004 (hardening ТЗ): проверено эмпирически 2026-08-23 на 540-кейсовом
# Quality Suite (tests/quality/), не подкручено вслепую — обнуление ЭТОГО
# веса (при том же корпусе, 10470 chunks после reingest'а с reference-
# блоками) роняет Quality Score с 91.60% до 90.78% (-0.82 п.п.), целиком
# за счёт retrieval accuracy (74.7% -> 70.5%), и меняет реально найденный
# контент в 68 из 540 кейсов (12.6%) — механизм не балласт, реально решает
# исход заметной доли запросов. Вывод: оставить как есть, второй
# параллельный механизм ранжирования по типу chunk'а не нужен.
HOTKEY_INTENT_MODIFIER_WEIGHT = 1.0
MODIFIER_FLOOR = 0.1  # модификатор не должен обнулить уже найденную релевантность

# ТЗ Natural Language, раздел 5 (Query Understanding, Phase 2 — см.
# NATURAL_LANGUAGE_IMPLEMENTATION_REPORT.md): порог overlap-based
# concept-detection по user_phrases (раздел 3-4 того же ТЗ). Порог по
# ДОЛЕ токенов фразы (не запроса) — user_phrases описывают полный
# симптом/задачу ("у зеркала щель по центру"), запрос пользователя часто
# длиннее и содержит обвязку ("привет, подскажите, пожалуйста, ..."),
# поэтому доля от запроса была бы систематически заниженной; доля от
# ФРАЗЫ отвечает на осмысленный вопрос "встретилась ли в запросе бОльшая
# часть того, что описывает эта формулировка". MIN_OVERLAP_TOKENS=2 —
# та же защита от однословных случайных совпадений, что и решение НЕ
# подключать user_phrases к find()/_find_term() посимвольно (см. Term
# docstring в knowledge/terminology.py): одно случайно совпавшее слово
# уже один раз создавало ложные срабатывания в этом проекте (голый алиас
# "материал", Phase 1 отчёт) — здесь та же ошибка была бы куда тише и
# незаметнее, так как concept-detection не участвует в relevance
# напрямую, а тихо подмешивается в topic_score/chunk_kind_score.
CONCEPT_MIN_OVERLAP_TOKENS = 2
CONCEPT_MIN_OVERLAP_FRACTION = 0.66

# Живая обратная связь: "Какой хоткей дублирует объект в Blender?" даже
# после регистрации термина "Duplicate" и появления hotkeys-чанков в
# корпусе (scripts/build_hotkeys_knowledge.py) отвечался official
# Manual-страницей "Дублировать", которая объясняет МЕХАНИКУ операции,
# но ни разу не называет саму комбинацию Shift-D в выигравшем sub-
# chunk'е — авторитетность официального источника (1.0) перевешивала
# hotkeys-чанк (authority=0.3) даже при равном exact_term_bonus. Для
# вопроса, СПЕЦИФИЧЕСКИ спрашивающего "какая клавиша"/"какой хоткей",
# правильный ответ ПО ОПРЕДЕЛЕНИЮ содержит комбинацию клавиш — обычная
# authority-иерархия (раздел 3 ТЗ: официальный Manual выше personal)
# здесь неприменима, потому что hotkeys-чанк — единственный источник,
# который вообще может ответить на ВОПРОС ИМЕННО ПРО КЛАВИШУ. Вместо
# дальнейшей тонкой подстройки score — прямое распознавание намерения:
# если запрос явно спрашивает про хоткей, chunk.source=="hotkeys"
# получает решающий приоритет.
_HOTKEY_INTENT_RE = re.compile(
    r"хот[ -]?кей|горяч\w*\s+клавиш|какая?\s+клавиш|какое\s+сочетание\s+клавиш|"
    r"комбинаци[яю]\s+клавиш|что\s+нажать|каким?\s+клавиш",
    re.IGNORECASE,
)


def _is_hotkey_intent(query: str) -> bool:
    return bool(_HOTKEY_INTENT_RE.search(query))

# ТЗ v3, этап 5: умное чанкирование Manual (scripts/parse_manual.py) режет
# одну страницу на intro/note/warning/options — все с БЛИЗКИМ или равным
# exact_term_bonus/lexical_score по тому же термину. Без этого сигнала
# короткий "options"-чанк ("Affect — Vertices: ...") систематически
# обходил "intro"-чанк той же страницы на генерических вопросах "Что
# такое X?" — сам intro почти всегда ДЛИННЕЕ options-фрагмента, а раз
# корпус вырос с ~770 до ~9000 chunks (в основном за счёт КОРОТКИХ
# options/note-чанков), средняя длина документа в BM25 (avgdl,
# search/tfidf.py) резко упала, и более длинные intro-чанки получили
# непропорциональный штраф по длине (параметр `b`). Пробовал снижать `b`
# напрямую (PROJECT_PLAN.md, ТЗ v3 этап 5) — эффект слабый и
# непоследовательный, точечный модификатор по chunk.subtopic оказался
# надёжнее. get(chunk.subtopic, 0.5) — нейтрально (0.5, как будто сигнала
# нет вообще) для chunk'ов без этого понятия (personal notes, hotkeys,
# будущие community-источники), не только для Manual.
#
# "reference" (hardening ТЗ, живой баг 2026-08-22): новый kind из
# scripts/parse_manual.py — блок Mode/Menu/Shortcut, раньше отбрасывался
# парсером целиком. Ранг = intro (1.0), не выше и не ниже: это короткий
# чанк, и без этого сигнала он проигрывал бы intro на длине точно так же,
# как раньше проигрывал options — но по содержанию (реальная горячая
# клавиша инструмента) он для HOW_TO-вопросов зачастую даже полезнее intro.
_CHUNK_KIND_RANK = {"intro": 1.0, "reference": 1.0, "note": 0.5, "warning": 0.5, "options": 0.3}

# Personal/непроверенный контент не имеет числового authority (раздел 3 ТЗ
# не даёт Custom tier числа) — расчётный базовый вес, примерно на уровне
# C-tier (30/100), не выше и не ниже официально прописанных тиров.
UNVERIFIED_AUTHORITY_BASELINE = 0.3

# BB-010 (hardening ТЗ): раньше был просто r"\b\d+\.\d+(?:\.\d+)?\b" —
# ЛЮБОЕ "число.число" в вопросе считалось версией Blender, включая
# "2.5 метра", "масштаб 1.25", "соотношение 16.9" и т.п. Теперь номер
# засчитывается версией, только если ему предшествует "blender"/
# "блендер..." (с любым русским окончанием — "блендере", "блендера") или
# "верси..." ("версия", "версии", "версией"), опционально с "v" между
# словом и числом ("Blender v5.1"). "в Blender 4.2" точно так же
# находится, потому что search() ищет совпадение где угодно в тексте, не
# только в начале строки.
_VERSION_HINT_RE = re.compile(
    r"\b(?:blender|блендер[а-яё]*|верси[а-яё]*)\s*v?(\d+\.\d+(?:\.\d+)?)\b",
    re.IGNORECASE,
)


def extract_version_hint(text: str) -> str | None:
    """Достаёт из текста версию Blender ("4.2", "5.1.1"), только если она
    названа в явном контексте ("Blender 5.1", "версия 4.2", "в блендере
    4.2") — см. комментарий у _VERSION_HINT_RE выше про BB-010."""
    match = _VERSION_HINT_RE.search(text)
    return match.group(1) if match else None


@dataclass
class ScoredChunk:
    chunk: KnowledgeChunk
    score: float
    relevance: float
    lexical_score: float
    authority_score: float
    exact_term_bonus: float
    version_score: float
    topic_score: float
    chunk_kind_score: float
    is_canonical_title: bool = False
    hotkey_intent_score: float = 0.5
    matched_term: str | None = None


class SearchEngine:
    def __init__(self, chunk_paths: list[Path], terminology_path: Path):
        self.chunks: list[KnowledgeChunk] = []
        for path in chunk_paths:
            self.chunks.extend(ChunkRegistry.load(path).chunks)
        self._by_id = {c.id: c for c in self.chunks}

        # Hardening ТЗ, живой баг (Loop Cut, 2026-08-23): "reference" kind
        # (Mode/Menu/Shortcut, scripts/parse_manual.py) и "intro" — РАЗНЫЕ
        # chunk'и одной страницы с одинаковым CHUNK_KIND_RANK (1.0). При
        # равном ранге is_canonical_title почти всегда решает исход в
        # пользу intro (его заголовок дословно совпадает с термином,
        # заголовок reference — с суффиксом "— быстрая справка") — то есть
        # даже после починки парсера обычный "как сделать X" вопрос мог
        # по-прежнему отвечать intro-текстом БЕЗ горячей клавиши, хотя она
        # объективно есть в базе, просто в другом chunk'е той же страницы.
        # Индекс "базовый путь страницы -> её reference chunk" даёт
        # find_reference_sibling() ниже быстро найти этот sibling и
        # приложить его к ответу, не трогая сам ranking.
        self._reference_by_section_base: dict[str, KnowledgeChunk] = {}
        for c in self.chunks:
            if c.subtopic == "reference" and c.section_path:
                base = c.section_path.rsplit(":", 1)[0]
                self._reference_by_section_base.setdefault(base, c)

        self.terminology = TerminologyRegistry.load(terminology_path)

        # ТЗ Natural Language, раздел 5 (Phase 2): user_phrases каждого
        # термина лемматизированы и токенизированы ОДИН раз здесь, а не на
        # каждый запрос — тот же принцип производительности, что и у
        # term_name_token_lists ниже (раздел 4.1 ТЗ v3, время отклика
        # <50мс). lemmatize() применён здесь так же, как и к самому
        # запросу в search() ("фаску"/"фаски" — та же проблема словоформ,
        # см. docstring lemmatize() в search/tfidf.py), а не только
        # tokenize() — иначе реальная формулировка пользователя почти
        # никогда не совпала бы с фразой один-в-один по словоформам.
        # set() — оверлап считается по УНИКАЛЬНЫМ токенам фразы, повтор
        # слова внутри одной фразы не должен искусственно завышать долю.
        self._concept_phrase_tokens: list[tuple[Term, frozenset[str]]] = []
        for term in self.terminology.terms:
            for phrase in term.user_phrases:
                phrase_tokens = frozenset(lemmatize(tokenize(phrase)))
                if phrase_tokens:
                    self._concept_phrase_tokens.append((term, phrase_tokens))

        # Раздел 4.1 ТЗ v3 (время отклика < 50мс): _exact_term_bonus раньше
        # заново токенизировала title+content КАЖДОГО chunk'а на КАЖДЫЙ
        # запрос — при ~850 chunks это и было настоящим узким местом
        # (обнаружено профилированием при добавлении fuzzy-matching, не
        # сама лемматизация/fuzzy тому виной). Текст chunk'а не меняется
        # между запросами, поэтому токенизируется один раз здесь и
        # переиспользуется в search() по индексу.
        self._chunk_title_tokens = [
            set(tokenize(f"{c.translated_title} {c.original_title}")) for c in self.chunks
        ]
        self._chunk_body_tokens = [set(tokenize(c.content)) for c in self.chunks]
        # Раздел 1.1 ТЗ v3 (расширение Terminology Database): normalize_term()
        # сохраняет порядок слов (в отличие от _chunk_title_tokens выше,
        # который теряет его в set()) — нужно для точного сравнения "это
        # ЗАГОЛОВОК chunk'а СОВПАДАЕТ с термином целиком", не просто
        # "содержит все его слова". Без этого различия при нескольких
        # official-страницах, чьи заголовки лишь СОДЕРЖАТ слова термина
        # ("Weight Paint Brushes", "Weight Paint Tools", "Weight Paint Mode"
        # — все содержат "weight"+"paint"), все получают exact_term_bonus=1.0
        # поровну, и тай-брейк на сырой BM25 не отдаёт предпочтение
        # странице, которая ЕСТЬ канонический "Weight Paint" — найдено при
        # проверке автосгенерированных терминов (PROJECT_PLAN.md).
        self._chunk_title_normalized = [
            (normalize_term(c.original_title), normalize_term(c.translated_title))
            for c in self.chunks
        ]

        self._bm25 = BM25Index()
        self._bm25.fit([self._chunk_tokens(c) for c in self.chunks])

    @staticmethod
    def _chunk_tokens(chunk: KnowledgeChunk) -> list[str]:
        # Заголовок весит больше содержимого — совпадение в названии темы
        # обычно значимее случайного слова в середине длинного summary.
        # lemmatize() — словоформы приводятся к начальной форме ДО того, как
        # попасть в BM25 индекс (раздел про естественно сформулированные
        # вопросы, PROJECT_PLAN.md, после Phase 15).
        tokens = tokenize(chunk.translated_title) * 2 + tokenize(chunk.original_title) + tokenize(chunk.content)
        return lemmatize(tokens)

    def get_chunk(self, chunk_id: str) -> KnowledgeChunk | None:
        return self._by_id.get(chunk_id)

    def find_reference_sibling(self, chunk: KnowledgeChunk) -> KnowledgeChunk | None:
        """Reference-chunk (Mode/Menu/Shortcut) той же страницы Manual, что
        и переданный chunk — None, если chunk сам уже reference, у него нет
        section_path (не-Manual источник), или у его страницы такого
        chunk'а просто нет (не каждая страница использует `.. reference::`).
        См. комментарий у self._reference_by_section_base в __init__."""
        if chunk.subtopic == "reference" or not chunk.section_path:
            return None
        base = chunk.section_path.rsplit(":", 1)[0]
        return self._reference_by_section_base.get(base)

    def _find_term(self, query: str) -> Term | None:
        """Exact term match / alias match (раздел 10 ТЗ).

        Перебирает все непрерывные подпоследовательности токенов запроса
        (n-граммы) и берёт САМОЕ ДЛИННОЕ совпадение с полным алиасом
        термина. Раньше проверялись только весь запрос целиком или
        отдельные однословные токены — многословные алиасы вроде "группа
        вершин", "покраска весов" внутри более длинного вопроса ("Что
        такое группа вершин?") никогда не находились, потому что "группа"
        и "вершин" по отдельности не зарегистрированы как алиасы, а весь
        вопрос целиком, конечно, не совпадал ни с одним алиасом. Найдено
        при добавлении новых personal-заметок (PROJECT_PLAN.md, после
        Phase 15). Более длинное совпадение предпочтительнее короткого:
        точное совпадение целой многословной фразы — более сильный сигнал,
        чем случайное совпадение одного общего слова где-то в вопросе."""
        tokens = tokenize(query)
        best: Term | None = None
        best_len = 0
        for i in range(len(tokens)):
            for j in range(i + 1, len(tokens) + 1):
                if j - i <= best_len:
                    continue
                candidate = self.terminology.find(" ".join(tokens[i:j]))
                if candidate:
                    best = candidate
                    best_len = j - i
        if best is not None:
            return best

        # Опечатки (раздел 1.1 ТЗ v3): точного n-граммного совпадения нет
        # ни для одной подпоследовательности — пробуем КАЖДЫЙ токен по
        # отдельности через нечёткое совпадение (TerminologyRegistry.
        # find_fuzzy). Только отдельные токены, не n-граммы фраз — иначе
        # O(n²) фаззи-сравнений на запрос, и риск случайного совпадения
        # длинной фразы был бы куда выше, чем у одного слова.
        for token in tokens:
            fuzzy = self.terminology.find_fuzzy(token)
            if fuzzy:
                return fuzzy
        return None

    def _find_term_by_concept(self, query_lemmas: set[str]) -> Term | None:
        """ТЗ Natural Language, раздел 5 (Query Understanding, Phase 2):
        последний, самый слабый уровень распознавания термина — когда
        запрос вообще не называет ни одно официальное/жаргонное имя
        термина (_find_term вернул None), но по смыслу описывает готовую
        user_phrases-формулировку задачи/симптома ("как сделать чтобы
        одна половина повторяла другую" -> Mirror Modifier, ни разу не
        упомянув слово "зеркало").

        Overlap-based (ТЗ прямо называет этот метод допустимым, раздел 5):
        доля УНИКАЛЬНЫХ токенов конкретной user_phrase, встретившихся в
        запросе (query_lemmas должны быть уже лемматизированы тем же
        способом, что и self._concept_phrase_tokens — см. __init__ и
        search()). Порог — CONCEPT_MIN_OVERLAP_TOKENS/_FRACTION выше.

        Побеждает фраза с наибольшей долей (при равенстве — с бОльшим
        абсолютным числом совпавших токенов) — длинная точная фраза
        предпочтительнее короткой случайно зацепившей два общих слова."""
        best_term: Term | None = None
        best_key = (0.0, 0)
        for term, phrase_tokens in self._concept_phrase_tokens:
            overlap = len(query_lemmas & phrase_tokens)
            if overlap < CONCEPT_MIN_OVERLAP_TOKENS:
                continue
            fraction = overlap / len(phrase_tokens)
            if fraction < CONCEPT_MIN_OVERLAP_FRACTION:
                continue
            key = (fraction, overlap)
            if key > best_key:
                best_key = key
                best_term = term
        return best_term

    def _term_names(self, term: Term) -> set[str]:
        names = {term.canonical_name, term.russian_name, *term.aliases, *term.english_aliases}
        if term.ui_label:
            names.add(term.ui_label)
        return {normalize_term(n) for n in names}

    def _term_name_token_lists(self, term: Term | None) -> list[list[str]]:
        """tokenize() каждого имени термина — раньше пересчитывалось
        ВНУТРИ _exact_term_bonus на КАЖДЫЙ chunk (term при этом один и тот
        же для всего запроса), т.е. одна и та же токенизация повторялась
        ~9000 раз за запрос. Профилирование после этапа 5 (раздел 4.1 ТЗ
        v3, время отклика < 50мс) показало: именно это, а не сам BM25 —
        реальный узкий бутылочное горлышко (3.1 из 3.9с на 5 запросов,
        cProfile). Считается ОДИН раз в search() до цикла по чанкам,
        передаётся в _exact_term_bonus готовым."""
        if term is None:
            return []
        return [tokens for name in self._term_names(term) if (tokens := tokenize(name))]

    def _exact_term_bonus(
        self, term_name_token_lists: list[list[str]], title_tokens: set[str], body_tokens: set[str]
    ) -> float:
        """Токенизированное сравнение, НЕ substring: короткий алиас вроде
        "риг" при поиске подстрокой ложно совпадал внутри "ориг[риг]инал".
        Все токены алиаса (для многословных вроде "шейдер материала")
        должны присутствовать среди токенов чанка.

        title_tokens/body_tokens приходят готовыми из
        self._chunk_title_tokens/self._chunk_body_tokens (посчитаны один
        раз в __init__, а не на каждый запрос — раздел 4.1 ТЗ v3).
        term_name_token_lists приходит из self._term_name_token_lists(term)
        — тоже посчитан один раз на весь запрос, не на каждый чанк (см. её
        докстринг).

        Заголовок и содержимое различаются по силе сигнала: термин в
        ЗАГОЛОВКЕ означает, что chunk реально ПРО эту тему; термин,
        встретившийся только в теле текста, может быть случайным
        упоминанием мимоходом. Раньше оба случая давали одинаковый
        bonus=1.0, из-за чего chunk "EEVEE" (который лишь мимоходом
        упоминает "PBR" в описании) конкурировал на равных с
        chunk'ом, который целиком ПРО PBR, и обычно побеждал за счёт
        авторитетности официального источника — найдено по обратной
        связи пользователя после реального использования на проде
        (PROJECT_PLAN.md, после Phase 15)."""
        if not term_name_token_lists:
            return 0.0
        found_in_body_only = False
        for name_tokens in term_name_token_lists:
            if all(t in title_tokens for t in name_tokens):
                return 1.0
            if all(t in title_tokens or t in body_tokens for t in name_tokens):
                found_in_body_only = True
        if found_in_body_only:
            return 0.5
        return 0.3  # термин распознан в запросе, но не встречается в этом конкретном чанке

    def _authority_score(self, chunk: KnowledgeChunk) -> float:
        if chunk.authority is None:
            return UNVERIFIED_AUTHORITY_BASELINE
        return chunk.authority / 100

    def _version_score(self, chunk: KnowledgeChunk, requested_version: str | None) -> float:
        if requested_version is None:
            return 1.0
        conflict = detect_conflict(parse_version(chunk.version), parse_version(requested_version))
        if conflict is not None:
            return 0.2  # реальный конфликт версий — сильный штраф, но не обнуление
        return 1.0  # совместимо или версия чанка неизвестна (раздел 7: не наказывать за неизвестность)

    def _topic_score(self, chunk: KnowledgeChunk, term: Term | None) -> float:
        if term is None:
            return 0.5  # нет сигнала по теме вообще — нейтрально
        return 1.0 if chunk.topic == term.category else 0.4

    def _term_canonical_norms(self, term: Term | None) -> tuple[str, str] | None:
        """normalize_term(canonical_name/russian_name) — раньше пересчитывалось
        ВНУТРИ _is_canonical_title на каждый chunk (тот же анти-паттерн,
        что и у _term_name_token_lists, см. её докстринг и профилирование
        раздела 4.1 ТЗ v3). Считается один раз в search() до цикла."""
        if term is None:
            return None
        return normalize_term(term.canonical_name), normalize_term(term.russian_name)

    def _is_canonical_title(self, term_norms: tuple[str, str] | None, chunk_index: int) -> bool:
        """Заголовок chunk'а (на любом из двух языков) ДОСЛОВНО совпадает
        с именем термина — не просто содержит все его слова где-то внутри
        более длинного заголовка. См. комментарий у
        self._chunk_title_normalized в __init__."""
        if term_norms is None:
            return False
        canonical_norm, russian_norm = term_norms
        original_norm, translated_norm = self._chunk_title_normalized[chunk_index]
        return original_norm == canonical_norm or translated_norm == russian_norm

    def _chunk_kind_score(self, chunk: KnowledgeChunk, term: Term | None) -> float:
        """Нейтрально (0.5), если термин вообще не распознан в запросе —
        см. docstring CHUNK_KIND_MODIFIER_WEIGHT: смысл сигнала —
        выбрать ПРАВИЛЬНЫЙ sub-chunk УЖЕ НАЙДЕННОЙ по термину страницы
        (intro лучше options для "Что такое X?"), а не отдавать
        предпочтение intro-чанкам вообще любых, в том числе случайных,
        совпадений по голому BM25.

        Found & fixed на живой обратной связи (не догадка заранее):
        запрос "Какое сочетание клавиш инвертирует текущее выделение
        (Invert Selection) в Edit Mode?" не распознал никакого термина
        (raздел 1.1 всё ещё не покрывает "Invert Selection"), но
        chunk_kind_score БЕЗ этой проверки всё равно давал бонус
        intro-чанку совершенно не в тему ("Инвертировать узел вращения" —
        Geometry Nodes нода), который выиграл ТОЛЬКО за счёт короткого
        текста, где слово "инвертировать" встречается несколько раз (BM25
        закономерно завышает плотность термина в коротких chunk'ах) —
        этого одного intro-бонуса хватило, чтобы протолкнуть заведомо
        нерелевантный ответ выше HIGH_CONFIDENCE_THRESHOLD."""
        if term is None:
            return 0.5
        return _CHUNK_KIND_RANK.get(chunk.subtopic, 0.5)

    def _hotkey_intent_score(self, chunk: KnowledgeChunk, query_is_hotkey_intent: bool) -> float:
        if not query_is_hotkey_intent:
            return 0.5  # нейтрально — сигнал вообще не участвует в этом запросе
        return 1.0 if chunk.source == "hotkeys" else 0.2

    def search(
        self, query: str, requested_version: str | None = None, top_n: int = 5
    ) -> list[ScoredChunk]:
        if not self.chunks:
            return []

        # lemmatize() только для BM25 (lexical_score) — чанки в индексе
        # тоже лемматизированы (_chunk_tokens). _find_term() ниже намеренно
        # использует term = self._find_term(query) — работает НА СЫРОМ
        # запросе, свою логику словоформ не трогаем (см. lemmatize()).
        query_tokens = lemmatize(tokenize(query))
        lexical_scores = self._bm25.similarities(query_tokens)
        # ТЗ Natural Language, раздел 5 (Phase 2): concept-detection по
        # user_phrases — только когда явное имя/алиас термина в запросе
        # не найдено вообще (_find_term уже возвращает None и для
        # опечаток через find_fuzzy). Явное упоминание термина — сигнал
        # сильнее и точнее overlap-эвристики, приоритет за ним.
        term = self._find_term(query) or self._find_term_by_concept(set(query_tokens))
        term_name_token_lists = self._term_name_token_lists(term)
        term_norms = self._term_canonical_norms(term)
        query_is_hotkey_intent = _is_hotkey_intent(query)

        results = []
        for i, (chunk, lexical_score) in enumerate(zip(self.chunks, lexical_scores)):
            exact_term_bonus = self._exact_term_bonus(
                term_name_token_lists, self._chunk_title_tokens[i], self._chunk_body_tokens[i]
            )

            # relevance — единственный сигнал, отвечающий на вопрос "вообще
            # относится ли этот chunk к запросу". Считаем термин найденным
            # для целей relevance, только если exact_term_bonus == 1.0 —
            # т.е. термин реально встречается в ЭТОМ чанке, а не просто
            # распознан где-то в запросе (0.3 — слишком слабый сигнал,
            # чтобы поднимать нерелевантный чанк с нуля).
            relevance = max(lexical_score, 1.0 if exact_term_bonus >= 1.0 else 0.0)

            chunk_kind_score = self._chunk_kind_score(chunk, term)
            hotkey_intent_score = self._hotkey_intent_score(chunk, query_is_hotkey_intent)

            if relevance <= 0:
                score = 0.0
                authority_score = self._authority_score(chunk)
                version_score = self._version_score(chunk, requested_version)
                topic_score = self._topic_score(chunk, term)
            else:
                authority_score = self._authority_score(chunk)
                version_score = self._version_score(chunk, requested_version)
                topic_score = self._topic_score(chunk, term)
                modifier = (
                    1.0
                    + AUTHORITY_MODIFIER_WEIGHT * (authority_score - 0.5)
                    + VERSION_MODIFIER_WEIGHT * (version_score - 1.0)
                    + TOPIC_MODIFIER_WEIGHT * (topic_score - 0.5)
                    + CHUNK_KIND_MODIFIER_WEIGHT * (chunk_kind_score - 0.5)
                    + HOTKEY_INTENT_MODIFIER_WEIGHT * (hotkey_intent_score - 0.5)
                )
                score = relevance * max(modifier, MODIFIER_FLOOR)

            results.append(
                ScoredChunk(
                    chunk=chunk,
                    score=score,
                    relevance=relevance,
                    lexical_score=lexical_score,
                    authority_score=authority_score,
                    exact_term_bonus=exact_term_bonus,
                    version_score=version_score,
                    topic_score=topic_score,
                    chunk_kind_score=chunk_kind_score,
                    is_canonical_title=self._is_canonical_title(term_norms, i),
                    hotkey_intent_score=hotkey_intent_score,
                    matched_term=term.canonical_name if term else None,
                )
            )

        # is_canonical_title — первый вторичный ключ сортировки (раздел 1.1
        # ТЗ v3, расширенная Terminology Database): при нескольких chunk'ах
        # с ОДИНАКОВЫМ exact_term_bonus=1.0 (заголовок каждого лишь СОДЕРЖИТ
        # все слова термина, не обязательно РАВЕН ему целиком — "Weight
        # Paint Brushes", "Weight Paint Tools" и "Weight Paint Mode" все
        # содержат "weight"+"paint") побеждать должен chunk, чей заголовок
        # ДОСЛОВНО совпадает с самим термином ("Weight Paint"), а не
        # случайный из нескольких более узких sub-страниц с тем же набором
        # слов — найдено при проверке автосгенерированных терминов
        # (PROJECT_PLAN.md, ТЗ v3, расширение терминологии).
        #
        # lexical_score — второй вторичный ключ: несколько chunk'ов часто
        # получают ОДИНАКОВЫЙ exact_term_bonus=1.0 (однословный алиас вроде
        # "фаска" или "bevel" совпадает и у chunk'а, который реально ПРО эту
        # тему, и у чанка, который просто упомянул слово мимоходом — см.
        # _exact_term_bonus). Без вторичного ключа сортировка была
        # стабильной по порядку файла, и при равном score побеждал более
        # ранний по индексу chunk, а не более релевантный — найдено при
        # добавлении новых personal-заметок (PROJECT_PLAN.md, после Phase
        # 15): "Что такое фаска (Bevel)?" содержательно точнее отвечает на
        # вопрос про Bevel, чем случайное упоминание слова "bevel" в
        # заметке про Apply Transform, но лексически совпадает с запросом
        # намного сильнее — это и должно решать исход при равном bonus.
        results.sort(key=lambda r: (r.score, r.is_canonical_title, r.lexical_score), reverse=True)

        # BB-003 (hardening ТЗ): search-time collapse дублей по
        # content_hash — 328 групп байт-в-байт одинакового контента нашёл
        # scripts/parse_manual.py при последнем прогоне (одна и та же
        # опция/параметр буквально дословно повторяется на нескольких
        # страницах Manual, например "Correct UVs — ..."). Раньше это
        # означало, что top_n мог оказаться забит несколькими КОПИЯМИ
        # одного и того же текста под разными заголовками — не удаляем
        # дубли из knowledge/ (раздел 21 hardening ТЗ: без воспроизводимого
        # ingestion pipeline), просто не показываем один и тот же контент
        # дважды в одном ответе. Не трогает results[0]: первый элемент
        # никогда не может совпасть с уже увиденным хэшем (хэшей увидено
        # ноль до него), так что все места, полагающиеся на top[0] (см.
        # search/qa_service.py, комментарий у CONFLICT_SEARCH_TOP_N),
        # ведут себя как раньше.
        seen_hashes: set[str] = set()
        deduped: list[ScoredChunk] = []
        for r in results:
            if r.score <= 0:
                continue
            if r.chunk.content_hash in seen_hashes:
                continue
            seen_hashes.add(r.chunk.content_hash)
            deduped.append(r)
            if len(deduped) >= top_n:
                break
        return deduped
