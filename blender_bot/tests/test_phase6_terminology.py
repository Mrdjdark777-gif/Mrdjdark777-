"""Тесты Phase 6 (Terminology, разделы 8-9 ТЗ)."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from knowledge.terminology import (
    TERMINOLOGY_CATEGORIES,
    Term,
    TerminologyRegistry,
    TermValidationError,
    normalize,
    validate_term,
)

TERMS_JSON_PATH = (
    Path(__file__).resolve().parent.parent
    / "knowledge" / "system" / "terminology" / "terms.json"
)


def _make_term(**overrides) -> Term:
    defaults = dict(
        canonical_name="Mirror Modifier",
        russian_name="Модификатор Зеркало",
        category="modifiers",
        aliases=["зеркало"],
        english_aliases=["mirror"],
    )
    defaults.update(overrides)
    return Term(**defaults)


class NormalizeTests(unittest.TestCase):
    def test_lowercases_and_collapses_whitespace(self):
        self.assertEqual(normalize("  Mirror   Modifier \n"), "mirror modifier")

    def test_cyrillic_case_insensitive(self):
        self.assertEqual(normalize("БУЛЕАН"), "булеан")


class ValidateTermTests(unittest.TestCase):
    def test_valid_term_passes(self):
        validate_term(_make_term())

    def test_missing_canonical_name_raises(self):
        with self.assertRaises(TermValidationError):
            validate_term(_make_term(canonical_name=""))

    def test_missing_russian_name_raises(self):
        with self.assertRaises(TermValidationError):
            validate_term(_make_term(russian_name=""))

    def test_bad_category_raises(self):
        with self.assertRaises(TermValidationError):
            validate_term(_make_term(category="not_a_real_category"))

    def test_all_tz_section_9_categories_are_valid(self):
        for category in TERMINOLOGY_CATEGORIES:
            validate_term(_make_term(category=category))


class TerminologyRegistryTests(unittest.TestCase):
    def setUp(self):
        self.registry = TerminologyRegistry()
        self.registry.add(_make_term())

    def test_find_by_russian_name(self):
        self.assertEqual(self.registry.find("Модификатор Зеркало").canonical_name, "Mirror Modifier")

    def test_find_by_english_alias_case_insensitive(self):
        self.assertEqual(self.registry.find("MIRROR").canonical_name, "Mirror Modifier")

    def test_find_by_alias(self):
        self.assertEqual(self.registry.find("зеркало").canonical_name, "Mirror Modifier")

    def test_find_by_ui_label(self):
        term = _make_term(canonical_name="Array Modifier", russian_name="Массив", ui_label="Array")
        registry = TerminologyRegistry()
        registry.add(term)
        self.assertEqual(registry.find("Array").canonical_name, "Array Modifier")

    def test_unknown_word_returns_none(self):
        self.assertIsNone(self.registry.find("совершенно незнакомое слово"))

    def test_save_load_roundtrip(self):
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "sub" / "terms.json"
            self.registry.save(path)
            loaded = TerminologyRegistry.load(path)
            self.assertEqual(len(loaded.terms), 1)
            self.assertEqual(loaded.find("mirror").canonical_name, "Mirror Modifier")

    def test_load_missing_file_returns_empty_registry(self):
        registry = TerminologyRegistry.load(Path("does/not/exist.json"))
        self.assertEqual(registry.terms, [])

    def test_user_phrases_roundtrip_through_save_load(self):
        # ТЗ Natural Language, раздел 3: user_phrases — новое поле,
        # проверяем, что оно не теряется при сериализации.
        import tempfile

        registry = TerminologyRegistry()
        registry.add(_make_term(user_phrases=["как сделать вторую половину модели"]))
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "terms.json"
            registry.save(path)
            loaded = TerminologyRegistry.load(path)
            self.assertEqual(
                loaded.terms[0].user_phrases, ["как сделать вторую половину модели"]
            )

    def test_user_phrases_not_findable_via_exact_lookup(self):
        # Осознанное решение (см. докстринг Term в knowledge/terminology.py):
        # user_phrases — полные фразы для будущего overlap-based concept
        # detection (ТЗ Natural Language, Phase 2), не короткие алиасы —
        # find() ищет ТОЧНОЕ совпадение всей строки, что для целого
        # предложения почти никогда не происходит на реальных вопросах, и
        # индексировать их как обычные алиасы означало бы полагаться на
        # это редкое совпадение вместо специально спроектированного
        # механизма. Явно фиксируем, что find() их пока не видит.
        registry = TerminologyRegistry()
        registry.add(_make_term(user_phrases=["как сделать вторую половину модели"]))
        self.assertIsNone(registry.find("как сделать вторую половину модели"))


class FuzzyFindTests(unittest.TestCase):
    """Раздел 1.1 ТЗ v3: нормализация опечаток (Левенштейн через difflib)."""

    def setUp(self):
        self.registry = TerminologyRegistry()
        self.registry.add(_make_term())

    def test_typo_normalizes_to_correct_term(self):
        self.assertEqual(self.registry.find_fuzzy("зеркал").canonical_name, "Mirror Modifier")

    def test_exact_match_also_works_via_fuzzy(self):
        self.assertEqual(self.registry.find_fuzzy("зеркало").canonical_name, "Mirror Modifier")

    def test_short_word_never_fuzzy_matched(self):
        # длина < 4 — слишком велик риск случайных совпадений
        self.assertIsNone(self.registry.find_fuzzy("зер"))

    def test_unrelated_word_not_matched(self):
        self.assertIsNone(self.registry.find_fuzzy("совершенно другое"))

    def test_different_real_word_not_confused_with_similar_looking_term(self):
        # "свет"/"цвет" — оба настоящие разные Blender-понятия, ratio 0.75,
        # ниже порога 0.85 — не должны путаться друг с другом.
        registry = TerminologyRegistry()
        registry.add(_make_term(canonical_name="Light", russian_name="Свет", aliases=["лампа"]))
        self.assertIsNone(registry.find_fuzzy("цвет"))


class SeededTerminologyTests(unittest.TestCase):
    """Проверки на реально засеянные knowledge/system/terminology/terms.json."""

    @classmethod
    def setUpClass(cls):
        if not TERMS_JSON_PATH.exists():
            raise unittest.SkipTest(
                f"{TERMS_JSON_PATH} не найден — запусти scripts/seed_terminology.py"
            )
        cls.registry = TerminologyRegistry.load(TERMS_JSON_PATH)

    def test_has_a_meaningful_number_of_terms(self):
        self.assertGreaterEqual(len(self.registry.terms), 30)

    def test_every_term_is_valid(self):
        for term in self.registry.terms:
            validate_term(term)

    def test_every_category_is_from_tz_section_9(self):
        for term in self.registry.terms:
            self.assertIn(term.category, TERMINOLOGY_CATEGORIES)

    def test_related_terms_reference_existing_canonical_names(self):
        # Проверка целостности ссылок: related_terms не должны указывать на
        # термины, которых нет в базе (иначе это тихо сломанные связи).
        known = {t.canonical_name for t in self.registry.terms}
        for term in self.registry.terms:
            for related in term.related_terms:
                self.assertIn(
                    related, known,
                    f"{term.canonical_name}: related_term {related!r} не существует в базе",
                )

    def test_no_alias_collisions_between_different_terms(self):
        # Если два РАЗНЫХ термина регистрируют один и тот же нормализованный
        # алиас, TerminologyRegistry.find() тихо вернёт только первый —
        # это баг данных, который стоит ловить явно, а не молчать о нём.
        seen: dict[str, str] = {}
        collisions = []
        for term in self.registry.terms:
            names = [term.canonical_name, term.russian_name, *term.aliases, *term.english_aliases]
            if term.ui_label:
                names.append(term.ui_label)
            for name in names:
                key = normalize(name)
                if key in seen and seen[key] != term.canonical_name:
                    collisions.append((key, seen[key], term.canonical_name))
                seen.setdefault(key, term.canonical_name)
        self.assertEqual(collisions, [])

    def test_user_phrases_are_unique_within_each_term(self):
        # ТЗ Natural Language, раздел 4: "не создавать тысячи почти
        # одинаковых предложений только ради количества" — минимальная,
        # дешёвая проверка на этот счёт: хотя бы буквальных дублей внутри
        # одного термина быть не должно.
        for term in self.registry.terms:
            if not term.user_phrases:
                continue
            self.assertEqual(
                len(term.user_phrases), len(set(term.user_phrases)),
                f"{term.canonical_name}: повторяющиеся user_phrases",
            )

    def test_known_lookups(self):
        self.assertEqual(self.registry.find("булеан").canonical_name, "Boolean Modifier")
        self.assertEqual(self.registry.find("boolean").canonical_name, "Boolean Modifier")
        self.assertEqual(self.registry.find("MIRROR").canonical_name, "Mirror Modifier")
        self.assertEqual(self.registry.find("сабдив").canonical_name, "Subdivision Surface Modifier")
        self.assertIsNone(self.registry.find("совсем не blender термин xyz"))


if __name__ == "__main__":
    unittest.main()
