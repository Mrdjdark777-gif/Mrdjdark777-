"""Diagnostic Engine — реестр проблем и поиск подходящей (раздел 12 ТЗ)."""

from __future__ import annotations

import json
from pathlib import Path

from diagnostics.schema import DiagnosticProblem, validate_problem
from search.tfidf import tokenize


class DiagnosticRegistry:
    def __init__(self) -> None:
        self.problems: list[DiagnosticProblem] = []

    def add(self, problem: DiagnosticProblem) -> DiagnosticProblem:
        validate_problem(problem)
        self.problems.append(problem)
        return problem

    def get(self, problem_id: str) -> DiagnosticProblem | None:
        for problem in self.problems:
            if problem.problem_id == problem_id:
                return problem
        return None

    def find_problem(self, question: str, min_matches: int = 2) -> DiagnosticProblem | None:
        """Ищет проблему по пересечению токенов вопроса с её keywords.

        min_matches=2 — сознательно строже, чем одно слово: раздел 12 ТЗ
        описывает decision tree как альтернативу «сразу выдать длинный
        список причин», а не триггер по первому попавшемуся слову. Ложное
        срабатывание диагностики на обычный вопрос дороже, чем пропущенное
        совпадение (вызывающий код может использовать обычный поиск как
        запасной вариант).

        Сравнение — по ПРЕФИКСУ (первое слово keyword'а как основа против
        токенов вопроса), не точное совпадение токенов: точное совпадение
        не находило "виден"/"видно" по keyword'у "видно" — разные
        словоформы без стемминга. Тот же приём, что в intents/engine.py
        (Phase 8) — keyword короче полной словоформы специально, чтобы
        matches.startswith() ловил склонения/спряжения.
        """
        if not self.problems:
            return None

        query_tokens = tokenize(question)
        if not query_tokens:
            return None

        best_problem = None
        best_overlap = 0
        for problem in self.problems:
            overlap = 0
            for kw in problem.keywords:
                kw_tokens = tokenize(kw)
                if not kw_tokens:
                    continue
                stem = kw_tokens[0]
                if any(token.startswith(stem) for token in query_tokens):
                    overlap += 1
            if overlap > best_overlap:
                best_overlap = overlap
                best_problem = problem

        if best_overlap >= min_matches:
            return best_problem
        return None

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump([p.to_dict() for p in self.problems], f, ensure_ascii=False, indent=1)

    @classmethod
    def load(cls, path: Path) -> "DiagnosticRegistry":
        registry = cls()
        if not path.exists():
            return registry
        with open(path, encoding="utf-8") as f:
            raw = json.load(f)
        for item in raw:
            registry.add(DiagnosticProblem.from_dict(item))
        return registry
