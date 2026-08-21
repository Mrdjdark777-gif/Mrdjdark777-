"""Строит tests/quality/cases.json (раздел 34 ТЗ, Phase 13).

Минимум 400 случаев по 7 категориям: 100 basic, 100 technical,
100 troubleshooting, 50 version, 50 terminology, 50 deliberately ambiguous,
50 без ответа в базе.

Часть случаев (basic/technical/terminology) выведена программно из уже
накопленных реальных данных — вопросов knowledge/personal/dima_notes и
терминов knowledge/system/terminology (проверяемые факты, не догадки).
Остальное (troubleshooting/version/ambiguous/no_answer) написано вручную
с опорой на знание Blender и структуру уже построенных движков —
подробное обоснование каждой группы см. в комментариях ниже и в
PROJECT_PLAN.md, Phase 13.

Запуск (идемпотентно):
    python scripts/build_quality_test_suite.py
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import KNOWLEDGE_BASE_PATH, TERMINOLOGY_PATH  # noqa: E402
from knowledge.terminology import TerminologyRegistry  # noqa: E402
from tests.quality.schema import TestCase, save_cases  # noqa: E402

OUTPUT_PATH = Path(__file__).resolve().parent.parent / "tests" / "quality" / "cases.json"

cases: list[TestCase] = []
_case_counter = 0


def _next_id(category: str) -> str:
    global _case_counter
    _case_counter += 1
    return f"{category}:{_case_counter:04d}"


# ---------------------------------------------------------------------------
# basic + technical: программно из data/knowledge_base.json (dima_notes)
# ---------------------------------------------------------------------------

with open(KNOWLEDGE_BASE_PATH, encoding="utf-8") as f:
    dima_entries = json.load(f)

_WHAT_IS_PREFIXES = ("что такое", "что делает", "что за", "из чего", "какие")
_HOW_TO_PREFIX = "как "
# "Как работает X?" / "Как делает X?" — explanatory-вопрос (WHAT_IS в
# intents/engine.py, раздел про находку Phase 8/13), а не инструкция
# (HOW_TO), даже несмотря на "как" в начале — генератор не должен
# противоречить собственному дизайну IntentEngine.
_HOW_TO_BUT_ACTUALLY_WHAT_IS = ("как работает", "как делает")


def _keywords_for(entry: dict) -> list[str]:
    """Все keywords вопроса как ВЗАИМОЗАМЕНЯЕМЫЕ варианты (любое совпадение
    в ответе — успех), а не одно узкое слово. Правильный ответ может прийти
    и из official Manual (по-английски, "boolean"), и из personal note
    (по-русски, "булеан") — оба должны засчитываться, retrieval проверяет
    факт нахождения релевантного контента, а не то, ЧЕЙ источник победил
    (это отдельно проверяет source_authority метрика на других кейсах).

    Многословные keywords ("симметрия скульпт", "x symmetry") — теговые
    словосочетания из исходных данных, не обязаны встречаться в ответе
    дословно как фраза (найдено Phase 13: даже верный ответ их не
    содержал). Разбиваем на отдельные слова — каждое слово само по себе
    остаётся отдельным приемлемым вариантом совпадения.
    """
    keywords = entry.get("keywords") or []
    if not keywords:
        return [entry["question"].split()[-1].strip("?")]
    words: list[str] = []
    for kw in keywords:
        words.append(kw)
        words.extend(w for w in kw.split() if len(w) > 2)
    return list(dict.fromkeys(words))


basic_count = 0
technical_count = 0
for entry in dima_entries:
    q_lower = entry["question"].lower()
    keywords = _keywords_for(entry)
    if q_lower.startswith(_WHAT_IS_PREFIXES) and basic_count < 60:
        cases.append(TestCase(
            case_id=_next_id("basic"), category="basic", input=entry["question"],
            expected_intent=["WHAT_IS"], expected_answer_elements=keywords,
            note="из data/knowledge_base.json (dima_notes) — источник неизвестен заранее (official Manual или personal), проверяется только факт нахождения релевантного ответа",
        ))
        basic_count += 1
    elif q_lower.startswith(_HOW_TO_PREFIX) and technical_count < 60:
        is_explanatory = q_lower.startswith(_HOW_TO_BUT_ACTUALLY_WHAT_IS)
        cases.append(TestCase(
            case_id=_next_id("technical"), category="technical", input=entry["question"],
            expected_intent=["WHAT_IS"] if is_explanatory else ["HOW_TO"],
            expected_answer_elements=keywords,
            note="из data/knowledge_base.json (dima_notes)" + (" — 'как работает/делает' классифицируется как WHAT_IS" if is_explanatory else ""),
        ))
        technical_count += 1

# ---------------------------------------------------------------------------
# basic + technical: программно из knowledge/system/terminology (36 терминов)
# ---------------------------------------------------------------------------

terminology = TerminologyRegistry.load(TERMINOLOGY_PATH)


def _term_answer_elements(term) -> list[str]:
    """canonical_name + english_aliases + russian_name — любой из них может
    легитимно оказаться в ответе, в зависимости от того, official Manual
    или personal note победили в поиске (см. _keywords_for выше)."""
    elements = [term.canonical_name, term.russian_name, *term.english_aliases]
    return [e for e in dict.fromkeys(elements) if e]  # без дублей, сохраняя порядок


for term in terminology.terms:
    elements = _term_answer_elements(term)
    cases.append(TestCase(
        case_id=_next_id("basic"), category="basic",
        input=f"Что такое {term.canonical_name}?",
        expected_intent=["WHAT_IS"], expected_answer_elements=elements,
        note="из knowledge/system/terminology — canonical_name как ключевое слово",
    ))
    if term.russian_name and term.russian_name != term.canonical_name:
        cases.append(TestCase(
            case_id=_next_id("basic"), category="basic",
            input=f"Что такое {term.russian_name}?",
            expected_intent=["WHAT_IS"], expected_answer_elements=elements,
            note="из knowledge/system/terminology — вопрос по-русски (проверяет bilingual lookup, раздел 8 ТЗ)",
        ))
    cases.append(TestCase(
        case_id=_next_id("technical"), category="technical",
        input=f"Как использовать {term.canonical_name}?",
        expected_intent=["HOW_TO"], expected_answer_elements=elements,
        note="из knowledge/system/terminology",
    ))
    cases.append(TestCase(
        case_id=_next_id("technical"), category="technical",
        input=f"Как настроить {term.canonical_name}?",
        expected_intent=["HOW_TO"], expected_answer_elements=elements,
        note="из knowledge/system/terminology — вторая формулировка HOW_TO на тот же термин",
    ))

# ---------------------------------------------------------------------------
# terminology: прямой alias/bilingual lookup (раздел 8-9 ТЗ)
# ---------------------------------------------------------------------------

for term in terminology.terms:
    elements = _term_answer_elements(term)
    for alias in (term.aliases[:1] + term.english_aliases[:1]):
        if not alias:
            continue
        cases.append(TestCase(
            case_id=_next_id("terminology"), category="terminology",
            input=alias, expected_answer_elements=elements,
            note=f"алиас термина {term.canonical_name!r} должен резолвиться через TerminologyRegistry.find()",
        ))

# ---------------------------------------------------------------------------
# troubleshooting: 2 известных диагностических сценария (разные формулировки)
# ---------------------------------------------------------------------------

SUBDIVISION_PHRASINGS = [
    "После Subdivision модель ломается",
    "Модель ломается после Subdivision Surface",
    "Subdivision Surface искажает модель",
    "После сглаживания модель поплыла",
    "Модификатор Subdivision деформирует меш",
    "Почему модель ломается после сглаживания",
    "Subsurf портит форму объекта",
    "После сабдива модель выглядит неправильно",
    "Модель искажается при добавлении Subdivision Surface",
    "Проблема с Subdivision Surface — модель ломается",
]
BLACK_MATERIAL_PHRASINGS = [
    "Материал выглядит черным",
    "Рендер получается черным",
    "Почему объект черный в рендере",
    "Материал не виден, все черное",
    "Текстура рендерится черной",
    "Объект стал черным после назначения материала",
    "Рендер полностью черный, в чем проблема",
    "Материал черный, хотя настроен правильно",
    "Модель выглядит темной в рендере",
    "Почему все черное в Cycles",
]

for phrasing in SUBDIVISION_PHRASINGS:
    cases.append(TestCase(
        case_id=_next_id("troubleshooting"), category="troubleshooting", input=phrasing,
        expected_intent=["TROUBLESHOOTING"],
        note="diagnostic:subdivision_breaks_model",
    ))
for phrasing in BLACK_MATERIAL_PHRASINGS:
    cases.append(TestCase(
        case_id=_next_id("troubleshooting"), category="troubleshooting", input=phrasing,
        expected_intent=["TROUBLESHOOTING"],
        note="diagnostic:black_material_or_render",
    ))

# Остальные troubleshooting-вопросы: реальные Blender-проблемы, НЕ входящие
# в 2 диагностических дерева (Phase 9) — система должна распознать
# TROUBLESHOOTING intent, но НЕ запустить diagnostic dialog (его для них
# просто нет), а уйти в обычный поиск/soft-match/fallback.
OTHER_TROUBLESHOOTING = [
    "Текстура не отображается на объекте",
    "Объект не двигается при перетаскивании",
    "Blender вылетает при экспорте в FBX",
    "Аддон не устанавливается",
    "Рендер очень медленный в Cycles",
    "UV развертка выглядит растянутой",
    "Анимация не проигрывается в вьюпорте",
    "Кости не двигают меш при риге",
    "Частицы не появляются в рендере",
    "Физика ткани не работает как надо",
    "Geometry Nodes не показывают результат",
    "Модификатор Mirror работает неправильно",
    "Объект проваливается сквозь пол в симуляции",
    "Свет не освещает сцену",
    "HDRI не отображается в рендере",
    "Экспорт в glTF ломает материалы",
    "Импорт OBJ даёт сломанную геометрию",
    "Bevel создаёт странные артефакты",
    "Boolean модификатор не работает",
    "Weight Paint не назначает веса правильно",
    "Grease Pencil штрихи не видны в рендере",
    "Compositor не применяет ноды",
    "Видео в VSE не воспроизводится",
    "Скульптинг лагает на большом объекте",
    "Camera Tracking не находит маркеры",
    "Драйвер не обновляет значение",
    "Shape Keys не анимируются",
    "Snapping не работает при перемещении",
    "Материал Principled BSDF выглядит пластиковым",
    "Тени рендерятся неправильно",
    "Denoising размывает детали",
    "Объект дублируется сам по себе",
    "Курсор 3D не перемещается",
    "N-панель пропала из вьюпорта",
    "Outliner не показывает объекты",
    "Undo не работает после определённого действия",
    "Файл Blender не открывается",
    "Текст в 3D не отображается в рендере",
    "Constraint не ограничивает объект",
    "Particle Hair выглядит неестественно",
    "Fluid симуляция взрывается",
    "Rigid Body проваливается сквозь коллизию",
    "Арматура деформирует меш неправильно",
    "Автосохранение не работает",
    "Vertex Group не влияет на модификатор",
    "Camera не видит объект в рендере",
    "World background остаётся серым",
    "Смещение UV после экспорта",
    "Толщина Solidify выглядит неровной",
    "Array модификатор создаёт зазоры",
    "Displace модификатор даёт шум вместо рельефа",
    "Curve modifier искривляет объект неправильно",
    "Lattice не деформирует меш",
    "Mirror показывает копию не с той стороны",
    "Edge Split создаёт лишние разрывы",
    "Decimate портит топологию",
    "Remesh теряет детали модели",
    "Cloth simulation проходит сквозь коллайдер",
    "Smoke симуляция не видна в рендере",
    "Add-on Node Wrangler не появляется в меню",
    "Render region не сбрасывается",
    "Color Management делает рендер тусклым",
    "Freestyle не рисует контуры",
    "Motion Blur размывает статичные объекты",
    "Depth of field не работает в EEVEE",
    "Ambient Occlusion не виден в Cycles",
    "Subsurface Scattering выглядит неестественно",
    "Normal Map инвертирован",
    "Displacement map не создаёт рельеф",
    "Bake текстур даёт пустое изображение",
    "UDIM текстуры не подгружаются",
    "Linked библиотека не обновляется",
    "Collection instance не отображается",
    "Proxy объект работает некорректно",
    "Python скрипт выдаёт ошибку в консоли",
    "Retopology инструмент не прилипает к поверхности",
    "Dyntopo создаёт слишком плотную сетку",
    "Multires modifier ломает форму при sculpting",
    "Curve object не следует по направляющей",
    "Empty object пропал из вьюпорта",
]
for phrasing in OTHER_TROUBLESHOOTING:
    # "вылетает"/"крашится" — формулировка ближе к ERROR (раздел 11 ТЗ), чем
    # к общему TROUBLESHOOTING; система корректно даёт ERROR-only, тест
    # принимает любой из двух вместо жёсткого единственного варианта.
    is_crash = "вылетает" in phrasing.lower() or "крашится" in phrasing.lower()
    cases.append(TestCase(
        case_id=_next_id("troubleshooting"), category="troubleshooting", input=phrasing,
        expected_intent=["TROUBLESHOOTING", "ERROR"] if is_crash else ["TROUBLESHOOTING"],
        note="реальная Blender-проблема вне 2 засеянных диагностических деревьев — diagnostic НЕ должен сработать",
    ))

# ---------------------------------------------------------------------------
# version: явная версия + тема, проверяет version_score/confidence (Phase 5,7,10)
# ---------------------------------------------------------------------------

VERSION_TOPICS = [
    ("как сделать булеан", "Boolean Modifier"),
    ("модификатор mirror", "Mirror Modifier"),
    ("subdivision surface", "Subdivision Surface Modifier"),
    ("geometry nodes", "Geometry Nodes"),
    ("как создать риг", "Armature"),
    ("uv развертка", "UV Unwrap"),
    ("cycles рендер", "Cycles"),
    ("n-gon топология", "N-gon"),
    ("weight paint", "Weight Paint"),
    ("shape keys", "Shape Keys"),
]
KNOWN_VERSIONS = ["5.1", "5.1.1"]  # реально проиндексированная release family (Phase 4)
UNKNOWN_VERSIONS = ["4.2", "4.5", "3.6", "5.0", "4.0"]  # не проиндексированы (Phase 4 Known issues)

for topic_query, keyword in VERSION_TOPICS:
    for version in KNOWN_VERSIONS[:1]:
        cases.append(TestCase(
            case_id=_next_id("version"), category="version",
            input=f"в блендере {version} {topic_query}",
            expected_answer_elements=[keyword],
            note="версия совпадает с проиндексированной 5.1 release family — конфликта версий быть не должно",
        ))
    for version in UNKNOWN_VERSIONS[:4]:
        cases.append(TestCase(
            case_id=_next_id("version"), category="version",
            input=f"в блендере {version} {topic_query}",
            expected_confidence="LOW",
            note="версия не совпадает с проиндексированной 5.1 — knowledge.version.detect_conflict() должен сработать, confidence принудительно LOW (раздел 14 ТЗ)",
        ))

# ---------------------------------------------------------------------------
# ambiguous: намеренно расплывчатые/бессмысленные запросы
# ---------------------------------------------------------------------------

AMBIGUOUS_INPUTS = [
    "подробнее", "почему", "зачем", "как это", "что", "объясни", "расскажи ещё",
    "непонятно", "а если по-другому", "и что дальше", "ну как бы объяснить",
    "в общем это как", "такое дело", "штука для этого", "та функция",
    "как в том видео", "тот инструмент", "функция такая", "как раньше делал",
    "сделай красиво", "почему не так", "что-то не то", "оно не то",
    "хочу как у них", "версия получше", "самое лучшее", "любой способ",
    "что-нибудь про это", "разное", "штуки всякие", "смотри сам",
    "зюзюка мяу абракадабра", "фывапролджэ", "qwertyuiop",
    "12345 test test", "лол кек чебурек", "бла бла бла",
    "не знаю как спросить", "ну ты понял", "как обычно",
    "туда-сюда", "вот это вот всё", "как его там", "забыл название",
    "что-то с настройками", "там кнопка какая-то", "не работает в общем",
    "плохо получается", "не очень получилось", "как-то не так",
    "хочу лучше", "нужна помощь", "подскажи что-нибудь",
    "есть вопрос", "у меня проблема", "помоги пожалуйста",
    "как сделать хорошо", "сделай нормально",
]
for text in AMBIGUOUS_INPUTS:
    cases.append(TestCase(
        case_id=_next_id("ambiguous"), category="ambiguous", input=text,
        expected_confidence="UNKNOWN",
        note="намеренно расплывчатый запрос — раздел 26 ТЗ требует честно не отвечать уверенно",
    ))

# ---------------------------------------------------------------------------
# no_answer: точно не про Blender, ответа в базе нет и быть не может
# ---------------------------------------------------------------------------

NO_ANSWER_INPUTS = [
    "Сколько будет 2+2?", "Какая погода в Москве?", "Расскажи анекдот",
    "Как приготовить борщ?", "Кто был первым президентом США?",
    "Что такое Photoshop?", "Как установить Windows 11?",
    "Какой сегодня день недели?", "Сколько лет Пушкину?",
    "Как выучить английский язык?", "Что такое биткоин?",
    "Как приготовить пасту карбонара?", "Расскажи про футбол",
    "Что такое Cinema 4D?", "Как работает нейросеть?",
    "Какая столица Франции?", "Как завязать галстук?",
    "Что такое квантовый компьютер?", "Расскажи про динозавров",
    "Как играть в шахматы?", "Что такое машинное обучение?",
    "Какая самая высокая гора в мире?", "Как правильно медитировать?",
    "Что такое ChatGPT?", "Как выбрать ноутбук?",
    "Расскажи про историю Рима", "Что такое йога?",
    "Как накачать пресс?", "Какие книги почитать?",
    "Что такое блокчейн?", "Как заваривать чай?",
    "Расскажи про космос", "Что такое ИИ?",
    "Как научиться рисовать карандашом?", "Какой лучший язык программирования?",
    "Что такое Docker?", "Как настроить VPN?",
    "Расскажи про Марс", "Что такое Unreal Engine 5 Nanite конкретно на аппаратном уровне видеокарты?",
    "Какая разница между Maya и 3ds Max в лицензировании?",
    "Сколько стоит подписка Adobe Creative Cloud?",
    "Как настроить освещение в реальной фотостудии?",
    "Что показывают на выставке SIGGRAPH в этом году?",
    "Какая зарплата у 3D-художника в Калифорнии?",
    "Как получить визу для работы в игровой индустрии?",
    "Что такое NFT и как их продавать?",
    "Расскажи про историю анимации Disney",
    "Как настроить студийный свет для съёмки продукта?",
    "Какой самый быстрый суперкомпьютер в мире?",
    "Как открыть счёт в банке?",
]
for text in NO_ANSWER_INPUTS:
    cases.append(TestCase(
        case_id=_next_id("no_answer"), category="no_answer", input=text,
        expected_confidence="UNKNOWN",
        note="не про Blender / за пределами корпуса — раздел 26 ТЗ, честный UNKNOWN",
    ))


# Ручной запас на случай, если программная генерация basic/no_answer не
# дотягивает ровно до минимума раздела 34 (например, если у термина
# russian_name совпадает с canonical_name и вторая basic-формулировка не
# создаётся) — несколько дополнительных грамотных случаев про реальные
# темы Blender, не дублирующие уже сгенерированные выше.
EXTRA_BASIC = [
    ("Что такое Viewport Shading?", "Viewport"),
    ("Что такое Outliner в Blender?", "Outliner"),
    ("Что такое коллекция объектов (Collection)?", "Collection"),
    ("Что такое Timeline в Blender?", "Timeline"),
    ("Что такое World Properties?", "World"),
]
for question, keyword in EXTRA_BASIC:
    cases.append(TestCase(
        case_id=_next_id("basic"), category="basic", input=question,
        expected_intent=["WHAT_IS"], expected_answer_elements=[keyword],
        note="ручной запас на случай нехватки после программной генерации",
    ))


def main() -> None:
    save_cases(cases, OUTPUT_PATH)
    from collections import Counter
    counts = Counter(c.category for c in cases)
    print(f"Сохранено {len(cases)} тестовых случаев -> {OUTPUT_PATH}")
    for category, count in sorted(counts.items()):
        print(f"  {category}: {count}")


if __name__ == "__main__":
    main()
