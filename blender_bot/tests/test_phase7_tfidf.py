"""Тесты Phase 7 (Search engine): TfidfIndex."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from search.tfidf import TfidfIndex, tokenize


class TokenizeTests(unittest.TestCase):
    def test_lowercases_and_strips_stopwords(self):
        self.assertEqual(tokenize("Как сделать Boolean?"), ["сделать", "boolean"])

    def test_empty_text(self):
        self.assertEqual(tokenize(""), [])


class TfidfIndexTests(unittest.TestCase):
    def setUp(self):
        self.index = TfidfIndex()
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

    def test_unrelated_query_scores_near_zero_everywhere(self):
        sims = self.index.similarities(tokenize("совершенно другая тема микроскоп"))
        self.assertTrue(all(s < 0.05 for s in sims))

    def test_empty_query_returns_all_zeros(self):
        sims = self.index.similarities([])
        self.assertEqual(sims, [0.0] * len(self.docs))

    def test_shared_term_gives_partial_similarity(self):
        # "модификатор" встречается и в doc[1], и в doc[2]
        sims = self.index.similarities(tokenize("модификатор"))
        self.assertGreater(sims[1], 0.0)
        self.assertGreater(sims[2], 0.0)
        self.assertEqual(sims[0], 0.0)
        self.assertEqual(sims[3], 0.0)

    def test_cosine_of_identical_vectors_is_one(self):
        vec = self.index._vectorize(tokenize(self.docs[0]))
        self.assertAlmostEqual(TfidfIndex.cosine(vec, vec), 1.0, places=6)

    def test_fit_on_empty_corpus_does_not_crash(self):
        index = TfidfIndex()
        index.fit([])
        self.assertEqual(index.similarities(["query"]), [])


if __name__ == "__main__":
    unittest.main()
