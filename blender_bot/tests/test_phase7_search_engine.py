"""Тесты Phase 7 (Search engine, раздел 10 ТЗ): SearchEngine на синтетике и
на реальных knowledge/ данных.
"""

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import KNOWLEDGE_CHUNK_PATHS, TERMINOLOGY_PATH
from knowledge.registry import ChunkRegistry
from knowledge.schema import KnowledgeChunk
from knowledge.terminology import Term, TerminologyRegistry
from search.engine import SearchEngine, _is_hotkey_intent, extract_version_hint


def _chunk(**overrides) -> KnowledgeChunk:
    defaults = dict(
        id="test:0001", source="test", source_type="official_manual",
        authority=100, version="5.1", language="ru", topic="modifiers",
        subtopic=None, date=None, url="https://example.invalid/x",
        original_title="Mirror Modifier", translated_title="Модификатор Зеркало",
        content="Отражает меш по выбранной оси относительно точки Origin.",
    )
    defaults.update(overrides)
    return KnowledgeChunk(**defaults)


class SyntheticEngineTests(unittest.TestCase):
    """Небольшой контролируемый корпус — проверяем сами правила движка, а не
    качество реальных данных (для этого отдельный класс ниже)."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        tmp_path = Path(self.tmp.name)

        chunks_registry = ChunkRegistry()
        chunks_registry.add(_chunk(
            id="official:mirror", source_type="official_manual", authority=100,
            version="5.1", topic="modifiers",
            original_title="Mirror Modifier", translated_title="Модификатор Зеркало",
            content="Официальное описание модификатора Mirror: отражает меш по оси.",
        ))
        chunks_registry.add(_chunk(
            id="personal:mirror", source_type="ai_generated_unverified", authority=None,
            version=None, topic="general",
            original_title="Mirror", translated_title="Как использовать Mirror?",
            content="Личная заметка про модификатор Mirror и типичные ошибки.",
        ))
        chunks_registry.add(_chunk(
            id="official:unrelated", source_type="official_manual", authority=100,
            version="5.1", topic="rendering",
            original_title="Cycles", translated_title="Введение в Cycles",
            content="Path-tracing движок рендеринга с глобальным освещением.",
        ))
        chunk_path = tmp_path / "chunks.json"
        chunks_registry.save(chunk_path)

        term_registry = TerminologyRegistry()
        term_registry.add(Term(
            canonical_name="Mirror Modifier", russian_name="Модификатор Зеркало",
            category="modifiers", aliases=["зеркало"], english_aliases=["mirror"],
        ))
        term_path = tmp_path / "terms.json"
        term_registry.save(term_path)

        self.engine = SearchEngine([chunk_path], term_path)

    def tearDown(self):
        self.tmp.cleanup()

    def test_relevant_query_outranks_unrelated_chunk(self):
        results = self.engine.search("модификатор зеркало")
        ids = [r.chunk.id for r in results]
        self.assertIn("official:mirror", ids[:2])
        self.assertNotIn("official:unrelated", ids)

    def test_official_outranks_personal_when_both_match_equally_well(self):
        results = self.engine.search("mirror")
        by_id = {r.chunk.id: r for r in results}
        self.assertIn("official:mirror", by_id)
        self.assertIn("personal:mirror", by_id)
        self.assertGreater(by_id["official:mirror"].score, by_id["personal:mirror"].score)

    def test_nonsense_query_scores_near_zero(self):
        results = self.engine.search("совершенно бессмысленный набор слов зюзюка")
        self.assertTrue(all(r.score < 0.2 for r in results))

    def test_gibberish_below_relevant_match(self):
        relevant = self.engine.search("зеркало")[0].score
        gibberish_results = self.engine.search("зюзюка мяу абракадабра")
        gibberish_score = gibberish_results[0].score if gibberish_results else 0.0
        self.assertLess(gibberish_score, relevant)

    def test_alias_word_boundary_no_false_positive(self):
        # "риг" не должен ложно совпасть внутри "оригинал"
        term_registry = TerminologyRegistry.load(
            Path(self.tmp.name) / "terms.json"
        )
        term_registry.add(Term(
            canonical_name="Armature", russian_name="Арматура",
            category="rigging", aliases=["риг"],
        ))
        term_path = Path(self.tmp.name) / "terms2.json"
        term_registry.save(term_path)

        chunks_registry = ChunkRegistry()
        chunks_registry.add(_chunk(
            id="decoy:original", topic="rendering",
            original_title="Оригинальные настройки", translated_title="Оригинальные настройки",
            content="Здесь просто оригинал файла, без темы риггинга вообще.",
        ))
        chunk_path = Path(self.tmp.name) / "chunks2.json"
        chunks_registry.save(chunk_path)

        engine = SearchEngine([chunk_path], term_path)
        term = engine._find_term("риг")
        self.assertIsNotNone(term)
        term_tokens = engine._term_name_token_lists(term)
        bonus = engine._exact_term_bonus(term_tokens, engine._chunk_title_tokens[0], engine._chunk_body_tokens[0])
        self.assertLess(bonus, 1.0)  # не должно ложно сработать на "оригинал"

    def test_version_conflict_demotes_score(self):
        neutral = self.engine.search("mirror", requested_version=None)
        same_version = self.engine.search("mirror", requested_version="5.1")
        conflicting = self.engine.search("mirror", requested_version="3.6")

        official_neutral = next(r for r in neutral if r.chunk.id == "official:mirror")
        official_same = next(r for r in same_version if r.chunk.id == "official:mirror")
        official_conflict = next(r for r in conflicting if r.chunk.id == "official:mirror")

        self.assertEqual(official_neutral.score, official_same.score)
        self.assertLess(official_conflict.score, official_same.score)

    def test_unknown_chunk_version_not_penalized(self):
        results = self.engine.search("mirror", requested_version="3.6")
        personal = next(r for r in results if r.chunk.id == "personal:mirror")
        self.assertEqual(personal.version_score, 1.0)

    def test_get_chunk_by_id(self):
        chunk = self.engine.get_chunk("official:mirror")
        self.assertIsNotNone(chunk)
        self.assertEqual(chunk.id, "official:mirror")
        self.assertIsNone(self.engine.get_chunk("does-not-exist"))

    def test_empty_query_returns_no_results(self):
        self.assertEqual(self.engine.search(""), [])


class DuplicateContentCollapseTests(unittest.TestCase):
    """BB-003 (hardening ТЗ): search-time collapse дублей по content_hash —
    несколько chunk'ов с байт-в-байт одинаковым содержимым (найдено на
    реальном корпусе после Manual reingest: одна и та же формулировка
    параметра дословно повторяется на нескольких страницах) не должны
    занимать несколько слотов в top_n одним и тем же текстом."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        tmp_path = Path(self.tmp.name)

        same_content = "Correct UVs — исправляет соответствующие UV-координаты, если они есть."
        registry = ChunkRegistry()
        registry.add(_chunk(
            id="page_a:options0", topic="modifiers",
            original_title="Loop Cut — Options", translated_title="Loop Cut — параметры",
            content=same_content,
        ))
        registry.add(_chunk(
            id="page_b:options0", topic="modifiers",
            original_title="Bevel — Options", translated_title="Bevel — параметры",
            content=same_content,
        ))
        registry.add(_chunk(
            id="page_c:options0", topic="modifiers",
            original_title="Subdivide — Options", translated_title="Subdivide — параметры",
            content="Совершенно другой, уникальный текст про Subdivide.",
        ))
        chunk_path = tmp_path / "chunks.json"
        registry.save(chunk_path)

        term_path = tmp_path / "terms.json"
        TerminologyRegistry().save(term_path)
        self.engine = SearchEngine([chunk_path], term_path)

    def tearDown(self):
        self.tmp.cleanup()

    def test_identical_content_returned_only_once(self):
        results = self.engine.search("параметры", top_n=10)
        content_hashes = [r.chunk.content_hash for r in results]
        self.assertEqual(len(content_hashes), len(set(content_hashes)))

    def test_unique_chunk_still_included_despite_duplicates_ahead(self):
        results = self.engine.search("параметры", top_n=2)
        ids = {r.chunk.id for r in results}
        # top_n=2 не должен оказаться забит ДВУМЯ копиями одного и того же
        # текста (page_a/page_b) — раз один из дублей уже занял слот,
        # второй слот должен достаться уникальному page_c, а не второй
        # копии того же контента.
        self.assertLessEqual(len({"page_a:options0", "page_b:options0"} & ids), 1)


class FindReferenceSiblingTests(unittest.TestCase):
    """Hardening ТЗ, живой баг (Loop Cut): reference chunk (Mode/Menu/
    Shortcut) стоит В РАВНОМ ранге с intro (CHUNK_KIND_RANK), поэтому даже
    после починки парсера обычный "как сделать X" мог отвечать intro-
    текстом без горячей клавиши, хотя она есть в базе. find_reference_sibling
    находит этот sibling по общему базовому section_path страницы."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        tmp_path = Path(self.tmp.name)
        registry = ChunkRegistry()
        registry.add(_chunk(
            id="blender_manual:5.1:tools_loop", subtopic="intro",
            section_path="modeling/tools/loop:intro",
            original_title="Loop Cut", translated_title="Петлевой вырез",
            content="Инструмент разбивает цикл граней.",
        ))
        registry.add(_chunk(
            id="blender_manual:5.1:tools_loop_reference0", subtopic="reference",
            section_path="modeling/tools/loop:reference",
            original_title="Loop Cut", translated_title="Loop Cut — быстрая справка",
            content="Режим: Режим редактирования · Ярлык: Ctrl-R",
        ))
        registry.add(_chunk(
            id="blender_manual:5.1:tools_bevel", subtopic="intro",
            section_path="modeling/tools/bevel:intro",
            original_title="Bevel", translated_title="Фаска",
            content="Скашивает края.",
        ))
        chunk_path = tmp_path / "chunks.json"
        registry.save(chunk_path)
        term_path = tmp_path / "terms.json"
        TerminologyRegistry().save(term_path)
        self.engine = SearchEngine([chunk_path], term_path)

    def tearDown(self):
        self.tmp.cleanup()

    def test_finds_sibling_reference_for_intro(self):
        intro = self.engine.get_chunk("blender_manual:5.1:tools_loop")
        sibling = self.engine.find_reference_sibling(intro)
        self.assertIsNotNone(sibling)
        self.assertEqual(sibling.id, "blender_manual:5.1:tools_loop_reference0")
        self.assertIn("Ctrl-R", sibling.content)

    def test_reference_chunk_itself_has_no_sibling(self):
        reference = self.engine.get_chunk("blender_manual:5.1:tools_loop_reference0")
        self.assertIsNone(self.engine.find_reference_sibling(reference))

    def test_page_without_reference_block_returns_none(self):
        bevel_intro = self.engine.get_chunk("blender_manual:5.1:tools_bevel")
        self.assertIsNone(self.engine.find_reference_sibling(bevel_intro))

    def test_non_manual_chunk_without_section_path_returns_none(self):
        personal = _chunk(id="personal:x", section_path=None)
        self.assertIsNone(self.engine.find_reference_sibling(personal))


class HotkeyIntentTests(unittest.TestCase):
    """Живая обратная связь: "Какой хоткей дублирует объект в Blender?"
    отвечался official Manual-страницей, объясняющей механику операции,
    но ни разу не называющей саму комбинацию клавиш — авторитетность
    официального источника перевешивала hotkeys-чанк с ТЕМ ЖЕ термином.
    См. PROJECT_PLAN.md."""

    def test_regex_matches_hotkey_questions(self):
        for q in (
            "Какой хоткей дублирует объект в Blender?",
            "Какое сочетание клавиш инвертирует выделение?",
            "Какая клавиша открывает меню добавления объекта?",
            "Горячие клавиши для выделения",
        ):
            self.assertTrue(_is_hotkey_intent(q), q)

    def test_regex_does_not_match_generic_questions(self):
        for q in (
            "Что такое модификатор Bevel?",
            "Как сделать риг персонажа?",
            "В чем разница между Cycles и EEVEE?",
        ):
            self.assertFalse(_is_hotkey_intent(q), q)

    def test_hotkey_chunk_outranks_official_chunk_on_hotkey_question(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            chunks_registry = ChunkRegistry()
            chunks_registry.add(_chunk(
                id="hotkeys:duplicate", source="hotkeys", source_type="ai_generated_unverified",
                authority=None, topic="interface",
                original_title="Shift+D — дублировать объект (Duplicate)",
                translated_title="Shift+D — дублировать объект (Duplicate)",
                content="Shift+D — дублировать объект (Duplicate); копия двигается за курсором.",
            ))
            chunks_registry.add(_chunk(
                id="official:duplicate", source_type="official_manual", authority=100,
                topic="scene_layout",
                original_title="Duplicate", translated_title="Дублировать",
                content="Это создаст визуально идентичную копию выбранных объектов.",
            ))
            chunk_path = tmp_path / "chunks.json"
            chunks_registry.save(chunk_path)

            term_registry = TerminologyRegistry()
            term_registry.add(Term(
                canonical_name="Duplicate", russian_name="дублировать объект",
                category="interface", aliases=["дублирует"],
            ))
            term_path = tmp_path / "terms.json"
            term_registry.save(term_path)

            engine = SearchEngine([chunk_path], term_path)
            results = engine.search("Какой хоткей дублирует объект в Blender?")
            self.assertEqual(results[0].chunk.id, "hotkeys:duplicate")

    def test_non_hotkey_question_keeps_neutral_hotkey_intent_score(self):
        # На обычный вопрос (без hotkey-намерения) hotkey_intent_score
        # должен быть нейтральным (0.5) и не менять порядок вообще.
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            chunks_registry = ChunkRegistry()
            chunks_registry.add(_chunk(id="a", content="Отражает меш по оси."))
            chunk_path = tmp_path / "chunks.json"
            chunks_registry.save(chunk_path)
            term_path = tmp_path / "terms.json"
            TerminologyRegistry().save(term_path)

            engine = SearchEngine([chunk_path], term_path)
            results = engine.search("mirror modifier")
            self.assertTrue(all(r.hotkey_intent_score == 0.5 for r in results))


class ExtractVersionHintTests(unittest.TestCase):
    def test_finds_major_minor(self):
        self.assertEqual(extract_version_hint("в блендере 4.2 как сделать риг"), "4.2")

    def test_finds_major_minor_patch(self):
        self.assertEqual(extract_version_hint("версия 5.1.1"), "5.1.1")

    def test_no_version_returns_none(self):
        self.assertIsNone(extract_version_hint("как сделать булеан"))

    # BB-010 (hardening ТЗ): раньше ЛЮБОЕ "число.число" в вопросе
    # считалось версией Blender — "2.5 метра"/"масштаб 1.25" ложно
    # трактовались как version hint. Теперь номер засчитывается только
    # рядом со словом "Blender"/"блендер.../версия...".
    def test_latin_blender_word(self):
        self.assertEqual(extract_version_hint("Blender 5.1 что нового"), "5.1")

    def test_latin_blender_with_v_prefix(self):
        self.assertEqual(extract_version_hint("Обновись до Blender v5.1"), "5.1")

    def test_generic_decimal_in_meters_not_treated_as_version(self):
        self.assertIsNone(extract_version_hint("как сделать стену 2.5 метра высотой"))

    def test_generic_decimal_scale_not_treated_as_version(self):
        self.assertIsNone(extract_version_hint("масштаб объекта 1.25 в трансформе"))

    def test_generic_decimal_ratio_not_treated_as_version(self):
        self.assertIsNone(extract_version_hint("какое соотношение сторон 16.9 выбрать"))


class RealDataEngineTests(unittest.TestCase):
    """Регрессионные проверки на реальном корпусе (840 chunks на момент
    Phase 7) — фиксируют находки из ручной проверки в PROJECT_PLAN.md."""

    @classmethod
    def setUpClass(cls):
        missing = [p for p in KNOWLEDGE_CHUNK_PATHS if not p.exists()]
        if missing:
            raise unittest.SkipTest(f"нет данных: {missing}")
        cls.engine = SearchEngine(KNOWLEDGE_CHUNK_PATHS, TERMINOLOGY_PATH)

    def test_loads_full_corpus(self):
        self.assertGreater(len(self.engine.chunks), 800)

    def test_gibberish_scores_low(self):
        # Раньше здесь были настоящие русские слова ("непонятный", "набор",
        # "слов") вперемешку с выдуманными — после добавления lemmatize()
        # (PROJECT_PLAN.md, после Phase 15) "набор"/"наборы" стало ложно
        # совпадать с реальными chunk'ами ("Наборы для лица" и т.п.):
        # лемматизация в принципе расширяет число совпадений по смыслу
        # слова, а не только по буквальной словоформе. Фраза заменена на
        # полностью выдуманные слова без единого настоящего русского.
        results = self.engine.search("зюзюка бызмпк хрзнык мяу кыш")
        self.assertTrue(all(r.score < 0.3 for r in results))

    def test_boolean_query_finds_boolean_content(self):
        results = self.engine.search("как сделать булеан")
        self.assertTrue(results)
        self.assertEqual(results[0].matched_term, "Boolean Modifier")
        self.assertGreater(results[0].score, 0.5)

    def test_generic_word_alias_does_not_hijack_unrelated_query(self):
        # Регрессия: "материал" как отдельный алиас Principled BSDF раньше
        # давал ложный exact_term_bonus=1.0 на совершенно не по теме
        # страницах ("Введение" и т.п.) — раздел про это в PROJECT_PLAN.md.
        results = self.engine.search("материал не виден на объекте")
        self.assertTrue(results)
        for r in results[:3]:
            self.assertLess(r.score, 0.8, r.chunk.translated_title)

    def test_typo_still_finds_term_via_fuzzy_match(self):
        # Раздел 1.1 ТЗ v3, буквальный пример из документа: "модификатр"
        # (пропущена "о") должен нормализоваться в "модификатор".
        term = self.engine._find_term("Что такое модификатр?")
        self.assertIsNotNone(term)
        self.assertEqual(term.canonical_name, "Modifier")

    def test_transliterated_bevel_alias_found_exactly(self):
        # "бевел" — не опечатка, а транслитерация; зарегистрирована явным
        # алиасом (Левенштейн кириллица/латиница не работает), не через fuzzy.
        term = self.engine._find_term("Что такое бевел?")
        self.assertIsNotNone(term)
        self.assertEqual(term.canonical_name, "Bevel")

    def test_official_manual_present_in_top_results_for_common_query(self):
        results = self.engine.search("geometry nodes", top_n=10)
        self.assertTrue(any(r.chunk.source_type == "official_manual" for r in results))

    def test_shading_query_does_not_find_unrelated_display_mode_page(self):
        # Регрессия: алиас термина Viewport Shading изначально включал
        # "режим отображения" — фраза дословно совпадала с заголовком
        # НЕСВЯЗАННОЙ официальной страницы ("Режим отображения" / Display
        # Mode, про цветовое распределение превью-изображения), из-за чего
        # exact_term_bonus=1.0 доставался и ей тоже, и она побеждала как
        # официальный источник. Найдено по обратной связи пользователя.
        #
        # После ТЗ v3 этапа 5 (полный парсер Manual) в корпусе появилась
        # НАСТОЯЩАЯ официальная страница "Viewport Shading"
        # (editors/3dview/display/shading) — она теперь заслуженно
        # побеждает личную заметку по authority (S-tier), и это правильно,
        # не регрессия. Раньше тест жёстко требовал победы personal-note —
        # это предположение устарело вместе с ростом корпуса; актуальный
        # инвариант — что НЕ побеждает та самая, конкретная нерелевантная
        # страница, независимо от того, кто в итоге побеждает.
        results = self.engine.search("Что такое шейдинг?", top_n=5)
        self.assertTrue(results)
        self.assertNotIn(
            "editors_video_sequencer_preview_display_display_mode", results[0].chunk.id
        )
        # Победивший chunk должен быть реально ПРО шейдинг/затенение, а не
        # просто высоко проавторитеченным текстом мимо темы.
        haystack = f"{results[0].chunk.translated_title} {results[0].chunk.content}".lower()
        self.assertTrue("шейдинг" in haystack or "затенен" in haystack)


class ResponseTimeTests(unittest.TestCase):
    """Раздел 4.1 ТЗ v3: "автоматический тест, проверяющий, что время
    отклика на любой запрос не превышает 50 миллисекунд". Проверить
    буквально "любой" запрос невозможно — тестируется репрезентативная
    выборка реальных вопросов из tests/quality/cases.json (не синтетика).

    Порог измерен на dev-машине; целевой Oracle VM.Standard.E2.1.Micro
    слабее (см. PROJECT_PLAN.md, Phase 14/15) — тест не гарантирует 50мс
    именно там, но ловит РЕГРЕССИИ производительности при разработке,
    что и есть его смысл здесь (раздел 4.1 не уточняет, на каком именно
    железе мерить)."""

    RESPONSE_TIME_LIMIT_MS = 50

    @classmethod
    def setUpClass(cls):
        from config import HOTKEYS_PATH, UNANSWERED_LOG_PATH
        from search.qa_service import QAService
        from tests.quality.schema import load_cases

        missing = [p for p in KNOWLEDGE_CHUNK_PATHS if not p.exists()]
        if missing:
            raise unittest.SkipTest(f"нет данных: {missing}")

        cases_path = Path(__file__).resolve().parent / "quality" / "cases.json"
        if not cases_path.exists():
            raise unittest.SkipTest(f"нет данных: {cases_path}")

        cls.qa_service = QAService(HOTKEYS_PATH, UNANSWERED_LOG_PATH, KNOWLEDGE_CHUNK_PATHS, TERMINOLOGY_PATH)
        all_cases = load_cases(cases_path)
        # каждый 7-й кейс — широкая, но не избыточно медленная выборка
        # (~77 запросов из 540, все 7 категорий представлены за счёт shuffle).
        cls.sample = all_cases[::7]

    def test_answer_latency_within_limit(self):
        import time

        worst_ms = 0.0
        worst_question = None
        for case in self.sample:
            t0 = time.perf_counter()
            self.qa_service.answer(case.input)
            dt_ms = (time.perf_counter() - t0) * 1000
            if dt_ms > worst_ms:
                worst_ms = dt_ms
                worst_question = case.input

        self.assertLess(
            worst_ms, self.RESPONSE_TIME_LIMIT_MS,
            f"самый медленный запрос из выборки — {worst_ms:.1f}мс: {worst_question!r}",
        )


if __name__ == "__main__":
    unittest.main()
