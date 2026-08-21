"""Разово наполняет knowledge/system/diagnostics/problems.json (Phase 9,
раздел 12 ТЗ; далее ТЗ v3, этап 3, раздел 3.1). Все проблемы — синтез
собственных знаний о Blender, не выгружены из конкретной страницы
официальной документации (честно, без sources — раздел 26 ТЗ,
Zero-Hallucination Mode, запрещает выдавать непроверенное за официально
подтверждённое).

1. "После Subdivision модель ломается" — буквально пример раздела 13 ТЗ
   (тот же первый вопрос: "Где именно появляется проблема? 1) На углах
   2) На отверстиях 3) На плоских поверхностях 4) По всей модели").
2. "Материал/рендер выглядит чёрным" — часто всплывавший в проверках
   Phase 7 запрос.
3. "Проблемы с UV-разверткой" (потяги текстур, наложение UV-островов) —
   ТЗ v3, раздел 3.1.
4. "Проблемы с запеканием карт" (Baking artifacts / cage issues) —
   ТЗ v3, раздел 3.1.
5. "Симуляции не реагируют на коллизии" (ткань, физика, жидкость) —
   ТЗ v3, раздел 3.1.

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
        # "вид" специально короткое, чтобы поймать и "виден", и "видно".
        # cycles/eevee добавлены по находке Phase 13: "Почему все черное в
        # Cycles" давал только 1 совпадение ("черн") — ниже min_matches=2.
        "черн", "чёрн", "рендер", "материал", "вид", "темн", "тёмн", "экран",
        "cycles", "eevee",
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

UV_UNWRAP_ISSUES = DiagnosticProblem(
    problem_id="uv_unwrap_issues",
    title="Проблемы с UV-разверткой (потяги текстур, наложение островов)",
    symptoms="Текстура выглядит растянутой/искажённой, либо UV-острова накладываются друг на друга",
    keywords=[
        "uv", "развертк", "развёртк", "текстур", "растян", "потяг",
        "остров", "island", "наклад", "перекрыв",
    ],
    possible_causes=[
        "Неприменённый масштаб объекта перед разверткой",
        "Недостаточно швов (seams) на сложных изгибах",
        "Намеренное наложение островов для тайлинга",
        "Дублирующиеся грани или Mirror без раздельной развёртки",
    ],
    root_node_id="root",
    version=None,
    sources=[],
    severity="low",
    nodes={
        "root": _q(
            "root", "Что не так с текстурой на объекте?",
            [
                ("Текстура растянута или выглядит искажённой", "stretch"),
                ("UV-острова накладываются друг на друга", "overlap"),
            ],
        ),
        "stretch": _q(
            "stretch", "Масштаб объекта уже применён (Ctrl+A → Scale)?",
            [
                ("Нет, не применял", "stretch_scale"),
                ("Да, применял", "stretch_seams"),
            ],
        ),
        "stretch_scale": _solution(
            "stretch_scale",
            "Неприменённый (особенно неравномерный) масштаб искажает пропорции "
            "при развёртке — Unwrap считает форму по «сырым» координатам, из-за "
            "чего текстура растягивается неравномерно по осям.",
            "Object → Apply → Scale (или Ctrl+A → Scale) до развёртки. Если "
            "развёртка уже сделана — примени масштаб и переразверни (выдели всё "
            "в Edit Mode, U → Unwrap).",
        ),
        "stretch_seams": _solution(
            "stretch_seams",
            "Скорее всего, недостаточно швов (seams) на изогнутых участках — "
            "автоматическая развёртка (например, Smart UV Project без ручных "
            "швов) сжимает сложную геометрию в UV-пространство неравномерно.",
            "Включи оверлей UV Editor → N-панель → Display → Stretching, чтобы "
            "увидеть растянутые области красным. Добавь Mark Seam (Ctrl+E) на "
            "изгибах в этих местах и переразверни (U → Unwrap).",
        ),
        "overlap": _q(
            "overlap",
            "Наложение островов сделано специально (например, для тайлинга "
            "текстуры), или это не то, что ты ожидал?",
            [
                ("Специально, для повторения текстуры", "overlap_intentional"),
                ("Нет, вышло случайно", "overlap_accidental"),
            ],
        ),
        "overlap_intentional": _solution(
            "overlap_intentional",
            "Это нормальное и частое поведение — намеренное наложение островов "
            "экономит текстурное пространство для повторяющихся деталей "
            "(например, одинаковые кирпичи или листья).",
            "Если наложение всё же мешает в конкретном месте, используй UV "
            "Editor → Select → Overlap, чтобы найти именно эти острова, и "
            "вручную сдвинь те, что не должны повторяться.",
        ),
        "overlap_accidental": _solution(
            "overlap_accidental",
            "Чаще всего это дублирующиеся грани (после неаккуратного Duplicate) "
            "или модификатор Mirror без раздельной UV-развёртки половин.",
            "Проверь на дубли граней: выдели всё (A), Mesh → Clean Up → Merge "
            "by Distance (или M → By Distance). Если дело в Mirror — разверни "
            "половины по отдельности либо используй опцию Mirror U/V в самом "
            "модификаторе.",
        ),
    },
)

BAKING_ARTIFACTS = DiagnosticProblem(
    problem_id="baking_artifacts",
    title="Артефакты при запекании карт (Baking / cage issues)",
    symptoms="На запечённой карте видны чёрные пятна, швы, шум, либо запекание не запускается",
    keywords=[
        # "запек" (запекание/запекать) и "запеч" (запечь/запечённой) —
        # разные основы одного глагола из-за чередования к/ч в русском
        # (как пеку/печёшь) — префиксным сравнением без лемматизации
        # (см. diagnostics/registry.py) нужны оба варианта отдельно.
        "запек", "запеч", "bake", "cage", "артефакт", "пятна", "шов",
        "текстур", "карт", "extrusion", "margin",
    ],
    possible_causes=[
        "Слишком маленький Ray Distance/Extrusion между high-poly и low-poly",
        "Слишком маленький Margin вокруг UV-островов",
        "Недостаточно Samples для запекания в Cycles",
        "Нет UV-развёртки, либо неверный порядок выделения при Selected to Active",
    ],
    root_node_id="root",
    version=None,
    sources=[],
    severity="medium",
    nodes={
        "root": _q(
            "root", "В чём именно проявляется проблема запекания?",
            [
                ("Чёрные пятна или дыры на карте", "black_spots"),
                ("Видны швы UV на текстуре", "visible_seams"),
                ("Шум/артефакты по краям", "noise_edges"),
                ("Запекание вообще не запускается (ошибка)", "bake_fails"),
            ],
        ),
        "black_spots": _solution(
            "black_spots",
            "Чаще всего дистанция луча (Ray Distance/Extrusion) в настройках "
            "Bake слишком маленькая — high-poly объект недостаточно «накрывает» "
            "low-poly, и часть лучей не находит поверхность.",
            "В Bake Settings увеличь Extrusion (Cage Extrusion), либо создай "
            "явный Cage object чуть большего размера, чем high-poly, и укажи "
            "его в поле Cage.",
        ),
        "visible_seams": _solution(
            "visible_seams",
            "Margin (отступ вокруг UV-островов) слишком маленький — при сжатии "
            "текстуры или мип-мапировании соседние острова «просачиваются» друг "
            "в друга по шву.",
            "Увеличь Margin в настройках запекания (Render Properties → Bake → "
            "Margin) — обычно 8-16 px достаточно для большинства текстур.",
        ),
        "noise_edges": _solution(
            "noise_edges",
            "Недостаточно Samples для запекания в Cycles — шум, который в "
            "обычном рендере сглаживается за счёт движения камеры/объектов, в "
            "статичной запечённой карте виден отчётливо.",
            "Увеличь Samples именно для Bake (Render Properties → Sampling → "
            "Bake), либо включи Denoising для итогового изображения после "
            "запекания.",
        ),
        "bake_fails": _solution(
            "bake_fails",
            "Три частые причины сразу: (1) у объекта нет UV-развёртки вообще, "
            "(2) при Selected to Active low-poly объект выбран не последним "
            "(не активный), (3) в Shader Editor не создана/не выделена Image "
            "Texture node, куда должен писаться результат.",
            "Проверь по порядку: есть ли UV map (Object Data Properties → UV "
            "Maps); при Selected to Active клик по low-poly должен быть "
            "ПОСЛЕДНИМ с зажатым Shift; в Shader Editor должна быть выделена "
            "нужная Image Texture node перед нажатием Bake.",
        ),
    },
)

SIMULATION_COLLISION_ISSUES = DiagnosticProblem(
    problem_id="simulation_collision_issues",
    title="Симуляция не реагирует на столкновения (ткань, физика, жидкость)",
    symptoms="Объект симуляции проходит сквозь препятствия вместо того, чтобы с ними взаимодействовать",
    keywords=[
        "симуляц", "физик", "коллизи", "collision", "ткан", "cloth",
        "жидкост", "fluid", "твёрд", "rigid", "провалива", "проходит",
        # найдено при проверке реалистичных фраз ("падает сквозь пол",
        # "не реагирует на препятствие") — без этих слов min_matches=2
        # не набирался даже на прямых, естественных формулировках.
        "сквозь", "пад", "реагир", "препятств",
    ],
    possible_causes=[
        "У объекта-препятствия не включена физика Collision",
        "Оба Rigid Body объекта назначены Active вместо Passive",
        "Объект-препятствие не назначен Effector в физике жидкости",
        "Симуляция не пересчитана (Bake) после изменения сцены",
    ],
    root_node_id="root",
    version=None,
    sources=[],
    severity="medium",
    nodes={
        "root": _q(
            "root", "Какая именно симуляция не реагирует на столкновения?",
            [
                ("Ткань (Cloth)", "cloth"),
                ("Твёрдое тело (Rigid Body)", "rigid"),
                ("Жидкость (Fluid)", "fluid"),
            ],
        ),
        "cloth": _solution(
            "cloth",
            "Cloth реагирует ТОЛЬКО на объекты, у которых явно включена физика "
            "Collision — сам факт того, что объект просто «стоит на пути», "
            "ничего не даёт.",
            "Выдели объект-препятствие → Physics Properties → Collision "
            "(добавить). Если ткань всё равно проваливается в тонких местах — "
            "увеличь Collision → Distance у препятствия или уменьши Quality "
            "Steps у самой ткани.",
        ),
        "rigid": _solution(
            "rigid",
            "Либо объект-препятствие вообще не назначен Rigid Body, либо оба "
            "объекта назначены Active (один из них — например, пол или "
            "стена — должен быть Passive), либо Collision Shape не "
            "соответствует реальной форме объекта.",
            "Physics Properties → Rigid Body → Type: неподвижные препятствия "
            "должны быть Passive, падающие/двигающиеся — Active. Для сложной "
            "формы выбери Shape → Convex Hull или Mesh вместо Box/Sphere по "
            "умолчанию.",
        ),
        "fluid": _solution(
            "fluid",
            "Объект-препятствие не назначен типом Effector в физике жидкости, "
            "либо он физически находится за пределами объёма Domain, либо "
            "симуляция не пересчитана (Bake) после изменения сцены.",
            "Выдели препятствие → Physics Properties → Fluid → Type: Effector. "
            "Проверь, что оно целиком внутри границ Domain, и после любых "
            "изменений сцены нажми Bake заново (Physics Properties → Domain → "
            "Cache → Bake).",
        ),
    },
)

PROBLEMS = [
    SUBDIVISION_BREAKS, BLACK_MATERIAL_OR_RENDER,
    UV_UNWRAP_ISSUES, BAKING_ARTIFACTS, SIMULATION_COLLISION_ISSUES,
]


def main() -> None:
    registry = DiagnosticRegistry()
    for problem in PROBLEMS:
        registry.add(problem)
    registry.save(OUTPUT_PATH)
    print(f"Сохранено {len(registry.problems)} диагностических проблем -> {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
