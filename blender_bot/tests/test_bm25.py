"""Тесты ТЗ v3, этап 4 (раздел 1.1): BM25Index — замена TfidfIndex
(search/tfidf.py). Заменяет tests/test_phase7_tfidf.py, удалённый вместе
с самим TfidfIndex (см. PROJECT_PLAN.md — код восстановим через git log,
если когда-нибудь понадобится сравнение)."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from search.tfidf import BM25Index, lemmatize, tokenize


class TokenizeTests(unittest.TestCase):
    def test_lowercases_and_strips_stopwords(self):
        self.assertEqual(tokenize("Как сделать Boolean?"), ["сделать", "boolean"])

    def test_empty_text(self):
        self.assertEqual(tokenize(""), [])


class LemmatizeTests(unittest.TestCase):
    def test_normalizes_russian_word_forms_to_common_lemma(self):
        self.assertEqual(lemmatize(["фаску"]), lemmatize(["фаски"]))
        self.assertEqual(lemmatize(["модификаторы"]), lemmatize(["модификатор"]))

    def test_leaves_english_tokens_unchanged(self):
        self.assertEqual(lemmatize(["bevel", "modifier"]), ["bevel", "modifier"])

    def test_empty_list(self):
        self.assertEqual(lemmatize([]), [])


class BM25IndexTests(unittest.TestCase):
    def setUp(self):
        self.index = BM25Index()
        self.docs = [
            "экструдировать грань выдавить",
            "модификатор булеан вычитание объединение",
            "модификатор зеркало симметрия",
            "рендер cycles eevee сравнение",
        ]
        self.index.fit([tokenize(d) for d in self.docs])

    def test_identical_query_scores_highest_for_its_own_document(self):
        sims = self.index.similarities(tokenize(self.docs[1]))
        self.assertEqual(sims.index(max(sims)), 1)

    def test_unrelated_query_scores_zero_everywhere(self):
        # В отличие от TF-IDF cosine (которое могло дать крошечное >0 из-за
        # общих служебных весов), BM25 без единого общего токена честно 0.
        sims = self.index.similarities(tokenize("совершенно другая тема микроскоп"))
        self.assertTrue(all(s == 0.0 for s in sims))

    def test_empty_query_returns_all_zeros(self):
        sims = self.index.similarities([])
        self.assertEqual(sims, [0.0] * len(self.docs))

    def test_shared_term_gives_positive_score_to_both_matching_docs(self):
        # "модификатор" встречается и в doc[1], и в doc[2]
        sims = self.index.similarities(tokenize("модификатор"))
        self.assertGreater(sims[1], 0.0)
        self.assertGreater(sims[2], 0.0)
        self.assertEqual(sims[0], 0.0)
        self.assertEqual(sims[3], 0.0)

    def test_fit_on_empty_corpus_does_not_crash(self):
        index = BM25Index()
        index.fit([])
        self.assertEqual(index.similarities(["query"]), [])

    def test_scores_are_bounded_between_zero_and_one(self):
        # Насыщающая нормализация raw/(raw+K) — никогда не достигает 1.0
        # ровно, но и никогда не превышает его (раздел про калибровку в
        # PROJECT_PLAN.md, ТЗ v3 этап 4).
        for query in self.docs + ["модификатор", "рендер cycles"]:
            for s in self.index.similarities(tokenize(query)):
                self.assertGreaterEqual(s, 0.0)
                self.assertLess(s, 1.0)

    def test_term_frequency_has_diminishing_returns(self):
        # BM25 (в отличие от чистого TF) насыщается: документ, где термин
        # встречается 10 раз, не должен получать впятеро больший score,
        # чем документ, где термин встречается 2 раза — раздел 1.1 ТЗ v3
        # прямо называет это отличие от TF-IDF смыслом перехода на BM25.
        index = BM25Index()
        docs = [
            (["риг"] * 2 + ["арматура"] * 5),
            (["риг"] * 10 + ["арматура"] * 5),
        ]
        index.fit(docs)
        sims = index.similarities(["риг"])
        self.assertGreater(sims[1], sims[0])
        # 5-кратное увеличение частоты термина даёт МЕНЬШЕ, чем 5-кратный
        # рост score — насыщение, а не линейный рост.
        self.assertLess(sims[1] / sims[0], 5.0)

    def test_longer_document_with_same_term_density_not_unfairly_boosted(self):
        # Параметр b (длина документа) — документ той же ОТНОСИТЕЛЬНОЙ
        # плотности термина, но длиннее (больше "разбавляющих" слов),
        # получает не более высокий score только за счёт объёма текста.
        index = BM25Index()
        short_doc = ["риг"] + ["слово"] * 3
        long_doc = ["риг"] + ["слово"] * 30
        index.fit([short_doc, long_doc])
        sims = index.similarities(["риг"])
        self.assertGreaterEqual(sims[0], sims[1])


if __name__ == "__main__":
    unittest.main()
