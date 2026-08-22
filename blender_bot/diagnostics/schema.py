"""Diagnostic Engine — схема (раздел 12 ТЗ).

Каждая проблема: problem_id, title, symptoms, keywords, possible_causes,
questions, decision_tree, solutions, version, sources, severity. "questions"
и "decision_tree" из раздела 12 объединены здесь в один плоский словарь
узлов (DecisionNode) — вопросы и решения это узлы одного дерева, а не два
отдельных списка, которые пришлось бы синхронизировать вручную.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field

SEVERITY_LEVELS = ("low", "medium", "high")


@dataclass
class DiagnosticOption:
    """Один вариант ответа на узел-вопрос."""

    label: str
    next_node_id: str


@dataclass
class DecisionNode:
    """Узел дерева: либо вопрос (kind="question", есть options), либо
    решение-лист (kind="solution", есть cause/fix)."""

    node_id: str
    kind: str  # "question" | "solution"
    question_text: str | None = None
    options: list[DiagnosticOption] = field(default_factory=list)
    cause: str | None = None
    fix: str | None = None
    # ТЗ v3, раздел 2.2: иллюстрация к шагу диагностики. URL, не файл —
    # намеренно ссылаемся на картинки самого официального Manual
    # (docs.blender.org/manual/.../images/...) вместо хостинга своих
    # скриншотов, т.к. ни один шаг ни в одном из 5 текущих деревьев такой
    # URL пока не заполняет (нет Blender под рукой, чтобы такие скриншоты
    # сделать/проверить, см. PROJECT_PLAN.md) — только инфраструктура.
    image_url: str | None = None

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "DecisionNode":
        options = [DiagnosticOption(**o) for o in data.get("options", [])]
        return cls(
            node_id=data["node_id"],
            kind=data["kind"],
            question_text=data.get("question_text"),
            options=options,
            cause=data.get("cause"),
            fix=data.get("fix"),
            image_url=data.get("image_url"),
        )


@dataclass
class DiagnosticProblem:
    problem_id: str
    title: str
    symptoms: str
    keywords: list[str]
    possible_causes: list[str]
    root_node_id: str
    nodes: dict[str, DecisionNode]
    version: str | None = None
    sources: list[str] = field(default_factory=list)
    severity: str = "medium"

    def get_node(self, node_id: str) -> DecisionNode | None:
        return self.nodes.get(node_id)

    @property
    def root(self) -> DecisionNode:
        return self.nodes[self.root_node_id]

    def to_dict(self) -> dict:
        return {
            "problem_id": self.problem_id,
            "title": self.title,
            "symptoms": self.symptoms,
            "keywords": self.keywords,
            "possible_causes": self.possible_causes,
            "root_node_id": self.root_node_id,
            "nodes": {node_id: node.to_dict() for node_id, node in self.nodes.items()},
            "version": self.version,
            "sources": self.sources,
            "severity": self.severity,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "DiagnosticProblem":
        nodes = {
            node_id: DecisionNode.from_dict(node_data)
            for node_id, node_data in data["nodes"].items()
        }
        return cls(
            problem_id=data["problem_id"],
            title=data["title"],
            symptoms=data["symptoms"],
            keywords=data["keywords"],
            possible_causes=data["possible_causes"],
            root_node_id=data["root_node_id"],
            nodes=nodes,
            version=data.get("version"),
            sources=data.get("sources", []),
            severity=data.get("severity", "medium"),
        )


class DiagnosticValidationError(ValueError):
    pass


def validate_problem(problem: DiagnosticProblem) -> None:
    errors = []
    if not problem.problem_id:
        errors.append("problem_id")
    if not problem.title:
        errors.append("title")
    if not problem.keywords:
        errors.append("keywords (пусто — проблему никогда не найдут)")
    if problem.severity not in SEVERITY_LEVELS:
        errors.append(f"severity={problem.severity!r} not in {SEVERITY_LEVELS}")
    if problem.root_node_id not in problem.nodes:
        errors.append(f"root_node_id={problem.root_node_id!r} отсутствует в nodes")

    for node_id, node in problem.nodes.items():
        if node.node_id != node_id:
            errors.append(f"node {node_id!r}: node.node_id={node.node_id!r} не совпадает с ключом")
        if node.kind == "question":
            if not node.question_text:
                errors.append(f"node {node_id!r}: question без question_text")
            if not node.options:
                errors.append(f"node {node_id!r}: question без options — тупик")
            for option in node.options:
                if option.next_node_id not in problem.nodes:
                    errors.append(
                        f"node {node_id!r}: option {option.label!r} -> "
                        f"{option.next_node_id!r} не существует"
                    )
        elif node.kind == "solution":
            if not node.cause or not node.fix:
                errors.append(f"node {node_id!r}: solution без cause/fix")
        else:
            errors.append(f"node {node_id!r}: неизвестный kind={node.kind!r}")

    if errors:
        raise DiagnosticValidationError(
            f"problem {problem.problem_id!r}: {errors} (раздел 12 ТЗ)"
        )
