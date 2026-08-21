import json
import time
from pathlib import Path


def log_unanswered(path: Path, question: str, best_score: float = 0.0) -> None:
    """Дописывает вопрос, на который бот не ответил уверенно, в JSONL-файл.

    Файл потом можно открыть и посмотреть, какие вопросы люди задают чаще
    всего, а базе знаний не хватает — это самый надёжный способ понять,
    что добавлять в data/knowledge_base.json дальше.
    """
    record = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "question": question,
        "best_score": round(best_score, 3),
    }
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")
