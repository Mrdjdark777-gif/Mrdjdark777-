"""Разово наполняет knowledge/system/terminology/terms.json стартовым
набором терминов (Phase 6, разделы 8-9 ТЗ).

36 терминов, выбранных не случайно, а по вопросам, которые уже реально есть
в knowledge/personal/dima_notes/ (см. data/knowledge_base.json) — это даёт
проверяемое обоснование выбора вместо произвольного списка «100 терминов
Blender». Раздел 36 ТЗ: «1000 качественных chunks лучше 100000 мусорных» —
тот же принцип применён здесь к терминам: 36 точных лучше 200 угаданных.

Запуск (идемпотентно, перезаписывает файл):
    python scripts/seed_terminology.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from knowledge.terminology import Term, TerminologyRegistry  # noqa: E402

OUTPUT_PATH = (
    Path(__file__).resolve().parent.parent
    / "knowledge" / "system" / "terminology" / "terms.json"
)

TERMS = [
    Term(
        canonical_name="Extrude", russian_name="Экструдирование (выдавливание)",
        category="mesh", aliases=["экструд", "выдавить", "выдавливание"],
        english_aliases=["extrude"], ui_label="Extrude Region",
        related_terms=["Bevel"],
    ),
    Term(
        canonical_name="Boolean Modifier", russian_name="Модификатор Булеан",
        category="modifiers", aliases=["булеан", "вычитание", "объединение объектов"],
        english_aliases=["boolean"], ui_label="Boolean",
        related_terms=["Apply Transform"],
        common_mistakes=["Забыть скрыть или удалить второй объект после применения — он остаётся в сцене и рендере."],
    ),
    Term(
        canonical_name="Subdivision Surface Modifier", russian_name="Модификатор Подразделения поверхности",
        category="modifiers", aliases=["сабдив", "сглаживание", "подразделение"],
        english_aliases=["subdivision surface", "subsurf"], ui_label="Subdivision Surface",
        related_terms=["N-gon", "Shade Smooth"],
        common_mistakes=["Применять к сетке с N-gon'ами — сглаживание стягивает геометрию в хаотичный узел."],
    ),
    Term(
        canonical_name="UV Unwrap", russian_name="Развёртка UV",
        category="uv", aliases=["развертка", "развернуть", "юви"],
        english_aliases=["unwrap", "uv unwrap"], ui_label="Unwrap",
    ),
    Term(
        canonical_name="Knife Tool", russian_name="Инструмент Нож",
        category="mesh", aliases=["нож", "разрез"],
        english_aliases=["knife"], ui_label="Knife",
        related_terms=["Loop Cut"],
    ),
    Term(
        canonical_name="Cycles", russian_name="Cycles",
        category="rendering", aliases=["циклес"],
        english_aliases=["cycles"], related_terms=["EEVEE"],
    ),
    Term(
        canonical_name="EEVEE", russian_name="EEVEE",
        category="rendering", aliases=["иви"],
        english_aliases=["eevee"], related_terms=["Cycles"],
    ),
    Term(
        canonical_name="Principled BSDF", russian_name="Principled BSDF (универсальный шейдер)",
        category="shaders", aliases=["шейдер материала", "универсальный шейдер"],
        english_aliases=["principled bsdf", "bsdf"], related_terms=["Shader Editor"],
    ),
    Term(
        # Найдено по обратной связи пользователя: "Что такое pbr?" не
        # находил термин вообще (не зарегистрирован), а лучшее совпадение
        # по лексике оказалось chunk про EEVEE с испорченным переводом
        # заголовка "ИИВИ" (см. Changed в PROJECT_PLAN.md — заодно
        # исправлен и сам баг перевода в manual.json).
        canonical_name="PBR", russian_name="Физически корректный рендеринг (PBR)",
        category="shaders", aliases=["физически корректный рендеринг", "пбр"],
        english_aliases=["pbr", "physically based rendering"],
        related_terms=["Principled BSDF", "Cycles", "EEVEE"],
    ),
    Term(
        # Общее понятие "модификатор" (в отличие от Mirror Modifier, Bevel
        # и т.д. — конкретных модификаторов) не имело собственного термина
        # до сих пор — раньше вопрос "Что такое модификаторы?" вообще не
        # распознавал термин, exact_term_bonus всегда был 0. Найдено по
        # прямой обратной связи пользователя после реального использования
        # на проде (PROJECT_PLAN.md, после Phase 15).
        canonical_name="Modifier", russian_name="Модификатор",
        category="modifiers", aliases=["модификаторы", "стек модификаторов"],
        english_aliases=["modifier", "modifiers"],
        related_terms=["Mirror Modifier", "Bevel", "Boolean Modifier", "Array Modifier"],
    ),
    Term(
        canonical_name="Mirror Modifier", russian_name="Модификатор Зеркало",
        category="modifiers", aliases=["зеркало", "симметрия модификатор"],
        english_aliases=["mirror"], ui_label="Mirror",
        related_terms=["Apply Transform", "Origin Point"],
        common_mistakes=[
            "Неприменённый масштаб (scale) перед Mirror искажает копию.",
            "Неправильный порядок модификаторов в стеке — фаска по шву получается неровной, если Bevel стоит раньше Mirror.",
        ],
    ),
    Term(
        canonical_name="Armature", russian_name="Арматура (риг)",
        category="rigging", aliases=["риг", "кости", "скелет"],
        english_aliases=["armature", "rig"], related_terms=["Weight Paint", "Vertex Group"],
    ),
    Term(
        canonical_name="Weight Paint", russian_name="Покраска весов",
        category="rigging", aliases=["вес вершин", "покраска весов"],
        english_aliases=["weight paint"], related_terms=["Armature", "Vertex Group"],
    ),
    Term(
        canonical_name="Particle System", russian_name="Система частиц",
        category="physics", aliases=["частицы", "трава", "волосы"],
        english_aliases=["particle system", "particles"],
    ),
    Term(
        canonical_name="Environment Texture (HDRI)", russian_name="HDRI-освещение",
        category="lighting", aliases=["освещение окружением", "окружение"],
        english_aliases=["hdri", "environment texture", "world lighting"],
    ),
    Term(
        canonical_name="Shader Editor", russian_name="Редактор шейдеров (нод)",
        category="shaders", aliases=["ноды", "редактор нод"],
        english_aliases=["shader editor", "node editor"],
        related_terms=["Principled BSDF", "Geometry Nodes"],
    ),
    Term(
        canonical_name="Geometry Nodes", russian_name="Геометрические ноды",
        category="geometry_nodes", aliases=["геонода", "геометрические ноды"],
        english_aliases=["geometry nodes", "geonodes"], related_terms=["Shader Editor"],
    ),
    Term(
        canonical_name="Keyframe", russian_name="Ключевой кадр",
        category="animation", aliases=["ключ анимации", "кейфрейм"],
        english_aliases=["keyframe"], related_terms=["Shape Keys"],
    ),
    Term(
        canonical_name="Cloth Simulation", russian_name="Симуляция ткани",
        category="physics", aliases=["ткань", "физика ткани"],
        english_aliases=["cloth", "cloth simulation"],
    ),
    Term(
        canonical_name="Rigid Body", russian_name="Твёрдое тело",
        category="physics", aliases=["физика столкновений"],
        english_aliases=["rigid body"],
    ),
    Term(
        canonical_name="Fluid Simulation", russian_name="Симуляция жидкости",
        category="physics", aliases=["жидкость", "вода симуляция"],
        english_aliases=["fluid", "fluid simulation"],
    ),
    Term(
        canonical_name="Motion Tracking", russian_name="Трекинг движения (камеры)",
        category="motion_tracking", aliases=["трекинг", "трекинг камеры"],
        english_aliases=["motion tracking", "camera tracking"],
    ),
    Term(
        canonical_name="Add-on", russian_name="Аддон (дополнение)",
        category="addons", aliases=["аддон", "плагин", "дополнение"],
        english_aliases=["addon", "add-on", "plugin"],
    ),
    Term(
        canonical_name="Grease Pencil", russian_name="Grease Pencil (2D-рисование)",
        category="grease_pencil", aliases=["гризпенсил", "2d рисование"],
        english_aliases=["grease pencil"],
    ),
    Term(
        canonical_name="Non-manifold Geometry", russian_name="Неманифолдная геометрия",
        category="topology", aliases=["неманифолд", "проблемы геометрии"],
        english_aliases=["non-manifold"], related_terms=["N-gon"],
    ),
    Term(
        canonical_name="Retopology", russian_name="Ретопология",
        category="topology", aliases=["ретопо"],
        english_aliases=["retopology", "retopo"], related_terms=["N-gon"],
    ),
    Term(
        canonical_name="N-gon", russian_name="N-угольник (N-gon)",
        category="mesh", aliases=["нгон", "полигон 5+"],
        english_aliases=["n-gon", "ngon"],
        related_terms=["Subdivision Surface Modifier", "Non-manifold Geometry"],
        common_mistakes=["Оставлять N-gon на изогнутых поверхностях — деформируется непредсказуемо при анимации."],
    ),
    Term(
        canonical_name="Apply Transform", russian_name="Применить трансформации",
        category="modeling", aliases=["применить трансформации", "сбросить масштаб"],
        english_aliases=["apply transform"],
        related_terms=["Origin Point", "Mirror Modifier"],
        common_mistakes=["Не применять масштаб перед Bevel/Mirror — форма получается неровной."],
    ),
    Term(
        canonical_name="Origin Point", russian_name="Точка Origin (центр объекта)",
        category="modeling", aliases=["точка центра", "пивот"],
        english_aliases=["origin", "origin point"],
        related_terms=["Apply Transform", "3D Cursor"],
    ),
    Term(
        canonical_name="Vertex Group", russian_name="Группа вершин",
        category="rigging", aliases=["группа вершин"],
        english_aliases=["vertex group", "vertex groups"],
        related_terms=["Weight Paint", "Armature"],
    ),
    Term(
        canonical_name="Shape Keys", russian_name="Шейпкеи (формы-ключи)",
        category="animation", aliases=["шейпкей", "морфинг"],
        english_aliases=["shape keys"], related_terms=["Keyframe"],
    ),
    Term(
        canonical_name="Bevel", russian_name="Фаска (скос)",
        # "бевел" — русская транслитерация, не опечатка (раздел 1.1 ТЗ v3
        # приводит её как пример нормализации, но Левенштейн между
        # кириллицей и латиницей не работает — "бевел"/"bevel" даёт 0.0
        # схожести; нужен явный алиас, не фаззи-матчинг).
        category="mesh", aliases=["фаска", "срезать угол", "бевел"],
        english_aliases=["bevel"], related_terms=["Extrude"],
    ),
    Term(
        canonical_name="Loop Cut", russian_name="Петлевой разрез",
        category="mesh", aliases=["петлевой разрез"],
        english_aliases=["loop cut"], related_terms=["Knife Tool"],
    ),
    Term(
        canonical_name="Array Modifier", russian_name="Модификатор Массив",
        category="modifiers", aliases=["массив копий"],
        english_aliases=["array"], ui_label="Array",
    ),
    Term(
        canonical_name="Displace Modifier", russian_name="Модификатор Смещение",
        category="modifiers", aliases=["процедурный рельеф"],
        english_aliases=["displace"], ui_label="Displace",
        related_terms=["Subdivision Surface Modifier"],
    ),
    Term(
        canonical_name="3D Cursor", russian_name="3D-курсор",
        category="modeling", aliases=["3д курсор", "курсор"],
        english_aliases=["3d cursor"], related_terms=["Origin Point"],
    ),
    Term(
        canonical_name="Snapping", russian_name="Привязка (снап)",
        category="modeling", aliases=["снап", "примагничивание"],
        english_aliases=["snap", "snapping"],
    ),
    Term(
        canonical_name="Shade Smooth", russian_name="Плавное затенение",
        category="rendering", aliases=["сглаживание шейдинг"],
        english_aliases=["shade smooth", "shade auto smooth"],
        related_terms=["Subdivision Surface Modifier"],
    ),
]


def main() -> None:
    registry = TerminologyRegistry()
    for term in TERMS:
        registry.add(term)

    registry.save(OUTPUT_PATH)
    print(f"Сохранено {len(registry.terms)} терминов -> {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
