/**
 * Переворот страницы: настоящая поверхность бумаги с перспективой.
 *
 * Здесь только поверхность: два холста со страницами и доля оборота от нуля до
 * единицы. Ни жестов, ни загрузки страниц, ни кнопок — их ведёт сама читалка,
 * и отдавать их сюда значило бы держать управление в двух местах.
 *
 * Нет WebGL — createCurl возвращает null, и читалка остаётся на прежнем обороте
 * из полос. Это не запас на всякий случай: на части устройств WebGL в WebView
 * выключен, и молча чёрный экран вместо страницы там недопустим.
 *
 * Путь сюда был длинным, и каждый поворот стоит помнить.
 *
 * Сначала стоял готовый шейдер InvertedPageCurl из gl-transitions. Он гнёт лист
 * вокруг наклонной оси, и строки на бумаге вставали наискосок.
 *
 * Потом лист считался прямо в пиксельном шейдере: экранная координата
 * переводилась обратно в бумажную. Строки выпрямились — и это оказалось не
 * достижением, а второй ошибкой. Высота в счёте не участвовала вовсе, бумага
 * сжималась только по горизонтали. На записи Play Книг видно обратное: строки
 * на поднятом листе заметно изгибаются, потому что ближний край бумаги крупнее
 * дальнего. Прямые строки означали, что перспективы нет.
 *
 * Теперь лист — настоящая поверхность: сетка из сотни столбцов, натянутая на
 * профиль бумаги, с перспективной проекцией. Текстура закреплена за материалом:
 * буквы едут вместе с бумагой, их никто не растягивает отдельно. Вёрстка на
 * бумаге неподвижна, а на экране она гнётся вместе с листом — строка у ближнего
 * края идёт выше и крупнее, у дальнего ниже и мельче.
 *
 * Профиль бумаги — наклон вдоль листа:
 *
 *   θ(u) = a + b · g(u),   g — сглаженная ступенька.
 *
 * У самого корешка и у свободного края g почти не меняется, значит бумага там
 * плоская; вся кривизна собрана в середине. Это и есть широкая дуга с фотографий,
 * а не равномерно закрученный рулон: постоянная кривизна такого профиля дать не
 * может, и это была третья ошибка.
 *
 * Длина листа не меняется ни в одном кадре: x и z — интегралы косинуса и синуса
 * наклона по длине бумаги.
 */

/** Столбцов в сетке листа. Сотня — дуга без заметных граней даже на планшете. */
const COLUMNS = 112;
/**
 * Расстояние до глаза в ширинах страницы.
 *
 * При двух с половиной поднятый лист вырастал за края экрана почти в полтора
 * раза — на снимке было видно, что бумага стала больше страницы. У книги в
 * руках поднятый лист заметно крупнее, но не настолько.
 */
const CAMERA = 5.5;
/** Наибольший выгиб листа, в радианах на всю его длину. */
const BEND = 2.0;
/** Шагов в счёте формы при подборе стадии: для подбора хватает грубой сетки. */
const ROUGH = 16;

/**
 * Сглаженная ступенька. Её производная равна нулю на обоих концах, поэтому у
 * корешка и у свободного края бумага выходит плоской, а гнётся середина.
 */
const ease = (u: number) => u * u * (3 - 2 * u);

/** Наклон бумаги у корешка и полный выгиб для стадии оборота. */
const stage = (phase: number) => ({
 a: Math.PI * phase,
 b: -BEND * Math.sin(Math.PI * phase),
});

/**
 * Где окажется свободный край листа при такой стадии. Считается тем же
 * интегралом, что и сама форма, только по грубой сетке: подбору этого хватает.
 */
const tipOf = (a: number, b: number) => {
 let x = 0;
 for (let i = 0; i < ROUGH; i++) x += Math.cos(a + b * ease((i + 0.5) / ROUGH)) / ROUGH;
 return x;
};

/** Готовая форма листа: точки профиля, наклон в них и две сводные величины. */
type Shape = {
 x: Float32Array;
 z: Float32Array;
 tilt: Float32Array;
 /** Насколько высоко лист поднимается над страницей. Ноль — лист лежит. */
 lift: number;
 /** Докуда лист достаёт по экрану. За этой чертой лежит его тень. */
 edge: number;
};

/**
 * Форма листа для доли оборота.
 *
 * Палец ведёт свободный край листа за собой; стадия оборота подбирается под то
 * место, куда край должен прийти. Сам по себе выгибающийся лист движется иначе —
 * почти стоит, а потом перебрасывается разом, — и под пальцем это читалось бы
 * как «тяну, а ничего не происходит».
 */
const shapeOf = (turn: number): Shape => {
 const want = 1 - 2 * Math.min(1, Math.max(0, turn));
 let low = 0, high = 1;
 for (let step = 0; step < 18; step++) {
  const mid = (low + high) / 2;
  const at = stage(mid);
  if (tipOf(at.a, at.b) > want) low = mid; else high = mid;
 }
 const {a, b} = stage((low + high) / 2);

 const x = new Float32Array(COLUMNS + 1);
 const z = new Float32Array(COLUMNS + 1);
 const tilt = new Float32Array(COLUMNS + 1);
 let px = 0, pz = 0, lift = 0, edge = 0;
 tilt[0] = a;
 for (let i = 1; i <= COLUMNS; i++) {
  // Наклон берётся посреди шага: так ломаная ложится на дугу без перекоса.
  const mid = a + b * ease((i - 0.5) / COLUMNS);
  px += Math.cos(mid) / COLUMNS;
  pz += Math.sin(mid) / COLUMNS;
  x[i] = px; z[i] = pz;
  tilt[i] = a + b * ease(i / COLUMNS);
  if (pz > lift) lift = pz;
 }
 // Докуда лист достаёт на экране — уже с перспективой: поднятая бумага кажется
 // шире, и тень обязана начинаться там, где её видно, а не где она в плоскости.
 for (let i = 0; i <= COLUMNS; i++) {
  const scale = CAMERA / (CAMERA - z[i]);
  const seen = 0.5 + (x[i] - 0.5) * scale;
  if (seen > edge) edge = seen;
 }
 return {x, z, tilt, lift, edge: Math.max(0, edge)};
};

const SHEET_VERTEX = `
attribute vec2 place;
attribute vec2 paper;
attribute float tilt;
varying vec2 vPaper;
varying float vTilt;
void main(){
 vPaper = paper;
 vTilt = tilt;
 gl_Position = vec4(place.x * 2.0 - 1.0, place.y * 2.0 - 1.0, 0.0, 1.0);
}`;

const SHEET_FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vPaper;
varying float vTilt;
uniform sampler2D fromTexture;
uniform vec3 paperColor;
uniform vec3 backColor;
void main(){
 vec4 c = texture2D(fromTexture, vPaper);
 vec3 ink = mix(paperColor, c.rgb, c.a);
 // Куда повёрнута бумага в этом месте: к нам лицом или изнанкой. Изнанка —
 // бумага своего оформления, текст на ней проступает еле-еле.
 float face = cos(vTilt);
 vec3 base = face >= 0.0 ? ink : mix(backColor, ink, 0.10);
 // Свет падает спереди: чем круче бумага стоит, тем она темнее.
 gl_FragColor = vec4(base * (0.42 + 0.58 * abs(face)), 1.0);
}`;

const PAGE_VERTEX = `
attribute vec2 position;
varying vec2 vUV;
void main(){ vUV = position * 0.5 + 0.5; gl_Position = vec4(position, 0.0, 1.0); }`;

const PAGE_FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUV;
uniform sampler2D toTexture;
uniform vec3 paperColor;
/** 1 — корешок справа: листаем назад. */
uniform float flip;
/** Докуда достаёт лист и насколько он поднят. */
uniform float edgeX;
uniform float lift;
void main(){
 vec4 c = texture2D(toTexture, vUV);
 vec3 ink = mix(paperColor, c.rgb, c.a);
 // Тень идёт за листом: её ширина и густота растут вместе с его высотой. Когда
 // лист лёг или ушёл, высота нулевая — и тени не остаётся ни полосы. Раньше
 // здесь стояла полоса неизменной ширины, и на открытой странице она висела.
 float side = flip > 0.5 ? 1.0 - vUV.x : vUV.x;
 float band = max(0.015, 0.30 * lift);
 float away = clamp((side - edgeX) / band, 0.0, 1.0);
 gl_FragColor = vec4(ink * mix(1.0 - 0.55 * lift, 1.0, away), 1.0);
}`;

/** Цвет бумаги: просвет между страницами и поля берут его, а не чёрный. */
export type Paper = [number, number, number];

export type Curl = {
 /** Подогнать холст под окно. Зовётся при смене размера и оформления. */
 resize: () => void;
 /** Какие две страницы участвуют в обороте: та, что уходит, и та, что приходит. */
 pages: (from: TexImageSource, to: TexImageSource) => void;
 /** Нарисовать кадр. Вперёд — лист уходит влево. */
 draw: (progress: number, forward: boolean) => void;
 destroy: () => void;
};

/**
 * Собирает поверхность оборота на готовом холсте.
 *
 * Возвращает null, если WebGL недоступен или шейдер не собрался. Молчать об
 * этом нельзя, но и падать тоже: читалка обязана открыться и без оборота.
 */
export function createCurl(canvas: HTMLCanvasElement, paper: Paper): Curl | null {
 const gl = canvas.getContext('webgl', {alpha: false, antialias: true, depth: true, stencil: false});
 if (!gl) return null;

 const compile = (type: number, source: string) => {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  gl.deleteShader(shader);
  return null;
 };
 const link = (vertexSource: string, fragmentSource: string) => {
  const vertex = compile(gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertex || !fragment) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program;
  gl.deleteProgram(program);
  return null;
 };

 const sheet = link(SHEET_VERTEX, SHEET_FRAGMENT);
 const page = link(PAGE_VERTEX, PAGE_FRAGMENT);
 if (!sheet || !page) return null;

 // Изнанка листа. На тёмной бумаге она светлее бумаги, на светлой — темнее:
 // перевёрнутый лист ловит свет иначе, чем лежащая страница, и без этого
 // разворот в ночном оформлении выглядел чёрной прорехой.
 const lit = paper[0] * 0.3 + paper[1] * 0.6 + paper[2] * 0.1;
 const shift = lit < 0.5 ? 0.17 : -0.12;
 const back = paper.map(v => Math.min(1, Math.max(0, v + shift))) as unknown as Float32List;

 const quad = gl.createBuffer();
 gl.bindBuffer(gl.ARRAY_BUFFER, quad);
 gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

 // Сетка листа переписывается каждый кадр: пять чисел на точку, две точки на
 // столбец. Это несколько килобайт — против перевода экранной точки обратно в
 // бумажную для каждого пикселя ничтожно мало.
 const STRIDE = 5;
 const mesh = new Float32Array((COLUMNS + 1) * 2 * STRIDE);
 const meshBuffer = gl.createBuffer();

 const sheetAt = {
  place: gl.getAttribLocation(sheet, 'place'),
  paper: gl.getAttribLocation(sheet, 'paper'),
  tilt: gl.getAttribLocation(sheet, 'tilt'),
  from: gl.getUniformLocation(sheet, 'fromTexture'),
  paperColor: gl.getUniformLocation(sheet, 'paperColor'),
  backColor: gl.getUniformLocation(sheet, 'backColor'),
 };
 const pageAt = {
  position: gl.getAttribLocation(page, 'position'),
  to: gl.getUniformLocation(page, 'toTexture'),
  paperColor: gl.getUniformLocation(page, 'paperColor'),
  flip: gl.getUniformLocation(page, 'flip'),
  edgeX: gl.getUniformLocation(page, 'edgeX'),
  lift: gl.getUniformLocation(page, 'lift'),
 };

 const textures = [0, 1].map(unit => {
  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
 });
 gl.useProgram(sheet);
 gl.uniform1i(sheetAt.from, 0);
 gl.uniform3fv(sheetAt.paperColor, paper);
 gl.uniform3fv(sheetAt.backColor, back);
 gl.useProgram(page);
 gl.uniform1i(pageAt.to, 1);
 gl.uniform3fv(pageAt.paperColor, paper);

 // Плотность ограничена двойкой: на телефоне с тройной плотностью холст втрое
 // по каждой стороне — это девять раз по памяти против одного, и рисование
 // такой страницы заметно дороже, а разницы на глаз уже нет.
 const resize = () => {
  const box = canvas.getBoundingClientRect();
  const density = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(box.width * density));
  canvas.height = Math.max(1, Math.round(box.height * density));
  gl.viewport(0, 0, canvas.width, canvas.height);
 };

 const upload = (source: TexImageSource, unit: 0 | 1) => {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, textures[unit]);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
 };

 resize();
 return {
  resize,
  pages(from, to) {upload(from, 0); upload(to, 1);},
  draw(progress, forward) {
   const turn = Math.min(1, Math.max(0, progress));
   const form = shapeOf(turn);
   gl.disable(gl.DEPTH_TEST);

   // Новая страница лежит неподвижно, лист идёт поверх неё.
   gl.useProgram(page);
   gl.uniform1f(pageAt.flip, forward ? 0 : 1);
   gl.uniform1f(pageAt.edgeX, form.edge);
   gl.uniform1f(pageAt.lift, form.lift);
   gl.bindBuffer(gl.ARRAY_BUFFER, quad);
   gl.enableVertexAttribArray(pageAt.position);
   gl.vertexAttribPointer(pageAt.position, 2, gl.FLOAT, false, 0, 0);
   gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
   gl.disableVertexAttribArray(pageAt.position);

   // Лист. Каждый столбец сетки стоит на своей точке профиля, и поднятая
   // бумага кажется крупнее — это и есть перспектива, которой раньше не было.
   // Из-за неё же строки на листе гнутся: у соседних столбцов разный масштаб
   // по высоте, и прямая на бумаге выходит на экран дугой.
   let at = 0;
   for (let i = 0; i <= COLUMNS; i++) {
    const scale = CAMERA / (CAMERA - form.z[i]);
    const seen = 0.5 + (form.x[i] - 0.5) * scale;
    const px = forward ? seen : 1 - seen;
    const u = i / COLUMNS;
    const paperX = forward ? u : 1 - u;
    for (const v of [0, 1]) {
     mesh[at++] = px;
     mesh[at++] = 0.5 + (v - 0.5) * scale;
     mesh[at++] = paperX;
     mesh[at++] = v;
     mesh[at++] = form.tilt[i];
    }
   }
   gl.useProgram(sheet);
   gl.bindBuffer(gl.ARRAY_BUFFER, meshBuffer);
   gl.bufferData(gl.ARRAY_BUFFER, mesh, gl.DYNAMIC_DRAW);
   const bytes = STRIDE * 4;
   gl.enableVertexAttribArray(sheetAt.place);
   gl.vertexAttribPointer(sheetAt.place, 2, gl.FLOAT, false, bytes, 0);
   gl.enableVertexAttribArray(sheetAt.paper);
   gl.vertexAttribPointer(sheetAt.paper, 2, gl.FLOAT, false, bytes, 8);
   gl.enableVertexAttribArray(sheetAt.tilt);
   gl.vertexAttribPointer(sheetAt.tilt, 1, gl.FLOAT, false, bytes, 16);
   gl.drawArrays(gl.TRIANGLE_STRIP, 0, (COLUMNS + 1) * 2);
   gl.disableVertexAttribArray(sheetAt.place);
   gl.disableVertexAttribArray(sheetAt.paper);
   gl.disableVertexAttribArray(sheetAt.tilt);
  },
  destroy() {
   for (const texture of textures) gl.deleteTexture(texture);
   gl.deleteBuffer(quad);
   gl.deleteBuffer(meshBuffer);
   gl.deleteProgram(sheet);
   gl.deleteProgram(page);
   gl.getExtension('WEBGL_lose_context')?.loseContext();
  },
 };
}
