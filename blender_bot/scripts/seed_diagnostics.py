"""Разово наполняет knowledge/system/diagnostics/problems.json (Phase 9,
раздел 12 ТЗ). Две проблемы, обе — синтез собственных знаний о Blender,
не выгружены из конкретной страницы официальной документации (честно, без
sources — раздел 26 ТЗ, Zero-Hallucination Mode, запрещает выдавать
непроверенное за официально подтверждённое).

1. "После Subdivision модель ломается" — буквально пример раздела 13 ТЗ
   (тот же первый вопрос: "Где именно появляется проблема? 1) На углах
   2) На отверстиях 3) На плоских поверхностях 4) По всей модели").
2. "Материал/рендер выглядит чёрным" — часто всплывавший в проверках
   Phase 7 запрос.

Запуск (идемпотентно):
    python scripts/seed_diagnostics.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from diagnostics.registry import DiagnosticRegistry  # noqa: E402
from diagnostics.schema import DecisionNode, DiagnosticOption, DiagnosticProblem  # noqa: E402

OUTPUT_PATH = (
    Path(__file__).resolve().parent.parent
    / "knowledge" / "system" / "diagnostics" / "problems.json"
)


def _q(node_id: str, text: str, options: list[tuple[str, str]]) -> DecisionNode:
    return DecisionNode(
        node_id=node_id, kind="question", question_text=text,
        options=[DiagnosticOption(label=label, next_node_id=next_id) for label, next_id in options],
    )


def _solution(node_id: str, cause: str, fix: str) -> DecisionNode:
    return DecisionNode(node_id=node_id, kind="solution", cause=cause, fix=fix)


SUBDIVISION_BREAKS = DiagnosticProblem(
    problem_id="subdivision_breaks_model",
    title="После Subdivision Surface модель ломается или деформируется",
    symptoms="Модификатор Subdivision Surface искажает форму вместо плавного сглаживания",
    keywords=[
        # короткие основы, а не полные словоформы — DiagnosticRegistry.find_problem()
        # сравнивает их как префикс (см. diagnostics/registry.py)
        "subdivision", "сабдив", "сглажива", "поплы", "ломае",
        "деформир", "искажа", "модель", "surface",
    ],
    possible_causes=[
        "N-gon на плоском участке — пинч в центре",
        "Нет поддерживающих edge loop у острых углов",
        "N-gon/non-manifold геометрия вокруг отверстий",
        "Неприменённый масштаб (Apply Scale)",
        "Общая грязная топология (N-gon'ы/треугольники по всей модели)",
    ],
    root_node_id="root",
    version=None,
    sources=[],
    severity="medium",
    nodes={
        "root": _q(
            "root", "Где именно появляется проблема после Subdivision?",
            [
                ("На углах", "corners"),
                ("На отверстиях", "holes"),
                ("На плоских поверхностях", "flat"),
                ("По всей модели", "everywhere"),
            ],
        ),
        "corners": _solution(
            "corners",
            "Острые углы «съезжают» и теряют форму, потому что рядом с ними нет "
            "дополнительных edge loop, которые удерживали бы геометрию — "
            "Subdivision Surface сглаживает всё равномерно, если её не ограничить.",
            "Добавь Loop Cut (Ctrl+R) рядом с острыми рёбрами, чтобы создать "
            "поддерживающую петлю, либо закрепи ребро через Edge Crease "
            "(Ctrl+E → Edge Crease или Shift+E, потянуть до 1.0) — это не даёт "
            "Subdivision сглаживать именно это ребро.",
        ),
        "holes": _solution(
            "holes",
            "Вокруг отверстия, скорее всего, есть N-gon или неманифолдная "
            "геометрия (грани сходятся некорректно) — Subdivision Surface плохо "
            "обрабатывает такие места и создаёт складки или провалы.",
            "Выдели область вокруг отверстия и проверь через Select → Select "
            "All by Trait → Non Manifold, замени N-gon на явные quad'ы вручную "
            "(Knife или Make Edge/Face).",
        ),
        "flat": _solution(
            "flat",
            "Плоский участок, скорее всего, построен как один N-gon (5+ сторон) "
            "вместо нескольких quad'ов — Subdivision Surface обрабатывает N-gon "
            "особым образом и может создать «звезду»/пинч в его центре вместо "
            "ровной плоскости.",
            "Раздели N-gon на quad'ы вручную (Face → Grid Fill, либо Loop Cut "
            "через центр), чтобы на этом участке была чистая сетка из "
            "четырёхугольников.",
        ),
        "everywhere": _q(
            "everywhere",
            "Ты уже применял масштаб объекта (Ctrl+A → Scale) перед добавлением модификатора?",
            [
                ("Нет, не применял", "everywhere_scale"),
                ("Да, применял", "everywhere_topology"),
            ],
        ),
        "everywhere_scale": _solution(
            "everywhere_scale",
            "Неприменённый (особенно неоднородный) масштаб объекта искажает то, "
            "как Subdivision Surface распределяет сглаживание по геометрии — "
            "модификатор считает форму по «сырым», непримененным координатам.",
            "Object → Apply → All Transforms (или Ctrl+A → All Transforms) до "
            "того, как добавлять Subdivision Surface. Если модификатор уже "
            "добавлен — примени трансформации, эффект должен исправиться сразу.",
        ),
        "everywhere_topology": _solution(
            "everywhere_topology",
            "Если масштаб уже применён, а деформация всё равно по всей модели — "
            "почти наверняка широко распространённая грязная топология: много "
            "N-gon'ов, треугольников или неманифолдных мест сразу в нескольких местах.",
            "Включи оверлеи Statistics и Face Orientation, пройди по модели и "
            "замени N-gon'ы на quad'ы; Select All by Trait → Non Manifold "
            "поможет найти проблемные места по всей модели, а не только в одном.",
        ),
    },
)

BLACK_MATERIAL_OR_RENDER = DiagnosticProblem(
    problem_id="black_material_or_render",
    title="Материал или рендер выглядит чёрным",
    symptoms="Объект или вся сцена выглядит/рендерится чёрным, хотя материал настроен",
    keywords=[
        # короткие основы (см. комментарий у SUBDIVISION_BREAKS выше) —
        # "вид" специально короткое, чтобы поймать и "виден", и "видно"
        "черн", "чёрн", "рендер", "материал", "вид", "темн", "тёмн", "экран",
    ],
    possible_causes=[
        "Viewport Shading не в Material Preview/Rendered",
        "Нет источника света в сцене",
        "Перевёрнутые нормали",
        "Principled BSDF не подключён к Material Output",
    ],
    root_node_id="root",
    version=None,
    sources=[],
    severity="medium",
    nodes={
        "root": _q(
            "root",
            "Чёрный — это весь вьюпорт/рендер целиком, или только конкретный объект?",
            [
                ("Весь вьюпорт или рендер целиком", "whole_scene"),
                ("Только один объект", "single_object"),
            ],
        ),
        "whole_scene": _q(
            "whole_scene",
            "Ты сейчас в режиме просмотра Material Preview или Rendered (не Solid)?",
            [
                ("Нет, я в Solid Mode", "solid_mode_fix"),
                ("Да, уже в Material Preview/Rendered", "no_light"),
            ],
        ),
        "solid_mode_fix": _solution(
            "solid_mode_fix",
            "Solid Mode показывает упрощённое затенение без реального света "
            "сцены — материалы и освещение в нём не учитываются, поэтому "
            "тёмный вид здесь ожидаем, а не баг.",
            "Переключи Viewport Shading (иконки в правом верхнем углу вьюпорта "
            "или клавиша Z) на Material Preview или Rendered, чтобы увидеть "
            "настоящий результат с материалами и светом.",
        ),
        "no_light": _solution(
            "no_light",
            "Если сцена всё равно чёрная в Material Preview/Rendered, скорее "
            "всего в ней нет источника света вообще (либо он выключен или "
            "направлен не туда).",
            "Add → Light, добавь источник (Point/Sun/Area), проверь его "
            "мощность (Power); для проверки можно временно включить HDRI через "
            "World Properties → Color → Environment Texture.",
        ),
        "single_object": _q(
            "single_object",
            "У этого объекта нормали смотрят в правильную сторону (не перевёрнуты)?",
            [
                ("Не проверял / не уверен", "check_normals"),
                ("Проверил, нормали в порядке", "check_material_output"),
            ],
        ),
        "check_normals": _solution(
            "check_normals",
            "Развёрнутые внутрь нормали — самая частая причина, когда именно "
            "один объект выглядит чёрным на фоне нормально освещённых.",
            "В Edit Mode включи оверлей Face Orientation (синий = наружу, "
            "красный = внутрь), выдели всё (A) и нажми Shift+N (Recalculate "
            "Outside), чтобы развернуть нормали наружу.",
        ),
        "check_material_output": _solution(
            "check_material_output",
            "Если нормали в порядке, но материал всё равно чёрный — скорее "
            "всего в Shader Editor нода материала физически не подключена к "
            "входу Surface ноды Material Output.",
            "Открой Shading Workspace, проверь, что провод от Principled BSDF "
            "реально идёт в сокет Surface ноды Material Output — если Output "
            "отсутствует вовсе, добавь его через Add → Shader → Output → "
            "Material Output.",
        ),
    },
)

PROBLEMS = [SUBDIVISION_BREAKS, BLACK_MATERIAL_OR_RENDER]


def main() -> None:
    registry = DiagnosticRegistry()
    for problem in PROBLEMS:
        registry.add(problem)
    registry.save(OUTPUT_PATH)
    print(f"Сохранено {len(registry.problems)} диагностических проблем -> {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
