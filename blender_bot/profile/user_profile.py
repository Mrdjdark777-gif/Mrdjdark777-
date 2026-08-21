"""User Profile (раздел 19 ТЗ): SQLite-хранилище прогресса пользователя.

Раздел 19 перечисляет поля профиля как единый список (user_id,
blender_version, level, topics, completed_topics, weak_topics,
test_results, mistakes, last_questions, learning_goal), но не требует по
физической таблице на каждое поле. weak_topics/completed_topics/mistakes —
производные от test_results (агрегирующий запрос, а не отдельная
денормализованная таблица) — раздел 19 прямо просит «хранить только
данные, необходимые для работы системы», дублирующее хранилище одного и
того же факта в это не укладывается.

Разблокирует персистентную версию /progress и /weaknesses (Phase 11,
которая честно ограничивалась context.user_data — раздел 40 ТЗ ставит эту
фазу после Education Engine специально).
"""

from __future__ import annotations

import sqlite3
import time
from dataclasses import dataclass, field
from pathlib import Path

_SCHEMA = """
CREATE TABLE IF NOT EXISTS user_profile (
    user_id INTEGER PRIMARY KEY,
    blender_version TEXT,
    level TEXT,
    learning_goal TEXT
);

CREATE TABLE IF NOT EXISTS user_topics (
    user_id INTEGER NOT NULL,
    topic_id TEXT NOT NULL,
    PRIMARY KEY (user_id, topic_id)
);

CREATE TABLE IF NOT EXISTS test_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    topic_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    correct INTEGER NOT NULL,
    timestamp TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS last_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    question TEXT NOT NULL,
    timestamp TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_test_results_user ON test_results(user_id);
CREATE INDEX IF NOT EXISTS idx_last_questions_user ON last_questions(user_id);
"""

# Сколько последних вопросов хранить на пользователя (раздел 19: "хранить
# только данные, необходимые для работы системы" — не безлимитный лог).
LAST_QUESTIONS_LIMIT = 20


@dataclass
class UserProfile:
    user_id: int
    blender_version: str | None = None
    level: str | None = None
    learning_goal: str | None = None
    topics: list[str] = field(default_factory=list)
    completed_topics: list[str] = field(default_factory=list)
    weak_topics: dict[str, int] = field(default_factory=dict)
    test_results: list[dict] = field(default_factory=list)
    mistakes: list[dict] = field(default_factory=list)
    last_questions: list[str] = field(default_factory=list)


class UserProfileStore:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(path, check_same_thread=False)
        self._conn.executescript(_SCHEMA)
        self._conn.commit()

    def _ensure_user(self, user_id: int) -> None:
        self._conn.execute(
            "INSERT OR IGNORE INTO user_profile (user_id) VALUES (?)", (user_id,)
        )

    def set_blender_version(self, user_id: int, version: str) -> None:
        self._ensure_user(user_id)
        self._conn.execute(
            "UPDATE user_profile SET blender_version = ? WHERE user_id = ?",
            (version, user_id),
        )
        self._conn.commit()

    def set_learning_goal(self, user_id: int, goal: str) -> None:
        self._ensure_user(user_id)
        self._conn.execute(
            "UPDATE user_profile SET learning_goal = ? WHERE user_id = ?",
            (goal, user_id),
        )
        self._conn.commit()

    def touch_topic(self, user_id: int, topic_id: str) -> None:
        """Отмечает, что пользователь взаимодействовал с темой (/learn)."""
        self._ensure_user(user_id)
        self._conn.execute(
            "INSERT OR IGNORE INTO user_topics (user_id, topic_id) VALUES (?, ?)",
            (user_id, topic_id),
        )
        self._conn.commit()

    def record_quiz_answer(self, user_id: int, topic_id: str, question_id: str, correct: bool) -> None:
        self._ensure_user(user_id)
        self._conn.execute(
            "INSERT INTO test_results (user_id, topic_id, question_id, correct, timestamp) "
            "VALUES (?, ?, ?, ?, ?)",
            (user_id, topic_id, question_id, int(correct), time.strftime("%Y-%m-%d %H:%M:%S")),
        )
        self._conn.commit()

    def record_question(self, user_id: int, question: str) -> None:
        self._ensure_user(user_id)
        self._conn.execute(
            "INSERT INTO last_questions (user_id, question, timestamp) VALUES (?, ?, ?)",
            (user_id, question, time.strftime("%Y-%m-%d %H:%M:%S")),
        )
        # Раздел 19: "хранить только данные, необходимые для работы системы" —
        # не даём таблице расти бесконечно на одного пользователя.
        self._conn.execute(
            "DELETE FROM last_questions WHERE user_id = ? AND id NOT IN ("
            "  SELECT id FROM last_questions WHERE user_id = ? "
            "  ORDER BY id DESC LIMIT ?"
            ")",
            (user_id, user_id, LAST_QUESTIONS_LIMIT),
        )
        self._conn.commit()

    def weak_topics(self, user_id: int) -> dict[str, int]:
        rows = self._conn.execute(
            "SELECT topic_id, COUNT(*) FROM test_results "
            "WHERE user_id = ? AND correct = 0 GROUP BY topic_id",
            (user_id,),
        ).fetchall()
        return dict(rows)

    def completed_topics(self, user_id: int, lesson_question_ids: dict[str, set[str]]) -> list[str]:
        """Тема считается пройденной, если пользователь хотя бы раз ответил
        верно на КАЖДЫЙ вопрос этой темы (когда-либо, не обязательно подряд).

        lesson_question_ids: {topic_id: {question_id, ...}} — правильный
        набор вопросов на тему передаёт вызывающий код (education/registry.py),
        а не эта функция — здесь нет доступа к содержимому уроков.
        """
        rows = self._conn.execute(
            "SELECT topic_id, question_id FROM test_results "
            "WHERE user_id = ? AND correct = 1",
            (user_id,),
        ).fetchall()
        correctly_answered: dict[str, set[str]] = {}
        for topic_id, question_id in rows:
            correctly_answered.setdefault(topic_id, set()).add(question_id)

        completed = []
        for topic_id, required_questions in lesson_question_ids.items():
            if required_questions and required_questions <= correctly_answered.get(topic_id, set()):
                completed.append(topic_id)
        return completed

    def engaged_topics(self, user_id: int) -> list[str]:
        explicit = {
            row[0] for row in self._conn.execute(
                "SELECT topic_id FROM user_topics WHERE user_id = ?", (user_id,)
            ).fetchall()
        }
        from_tests = {
            row[0] for row in self._conn.execute(
                "SELECT DISTINCT topic_id FROM test_results WHERE user_id = ?", (user_id,)
            ).fetchall()
        }
        return sorted(explicit | from_tests)

    def progress_summary(self, user_id: int) -> dict:
        row = self._conn.execute(
            "SELECT COUNT(*), COALESCE(SUM(correct), 0) FROM test_results WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        total, correct = row
        return {"total": total, "correct": correct, "topics": self.engaged_topics(user_id)}

    def get_profile(self, user_id: int, lesson_question_ids: dict[str, set[str]] | None = None) -> UserProfile:
        row = self._conn.execute(
            "SELECT blender_version, level, learning_goal FROM user_profile WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        blender_version, level, learning_goal = row if row else (None, None, None)

        test_results = [
            {"topic_id": t, "question_id": q, "correct": bool(c), "timestamp": ts}
            for t, q, c, ts in self._conn.execute(
                "SELECT topic_id, question_id, correct, timestamp FROM test_results "
                "WHERE user_id = ? ORDER BY id", (user_id,),
            ).fetchall()
        ]
        mistakes = [r for r in test_results if not r["correct"]]
        last_questions = [
            row[0] for row in self._conn.execute(
                "SELECT question FROM last_questions WHERE user_id = ? ORDER BY id DESC",
                (user_id,),
            ).fetchall()
        ]

        return UserProfile(
            user_id=user_id,
            blender_version=blender_version,
            level=level,
            learning_goal=learning_goal,
            topics=self.engaged_topics(user_id),
            completed_topics=self.completed_topics(user_id, lesson_question_ids or {}),
            weak_topics=self.weak_topics(user_id),
            test_results=test_results,
            mistakes=mistakes,
            last_questions=last_questions,
        )

    def total_users(self) -> int:
        row = self._conn.execute("SELECT COUNT(*) FROM user_profile").fetchone()
        return row[0]

    def close(self) -> None:
        self._conn.close()
