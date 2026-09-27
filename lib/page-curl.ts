/**
 * Переворот страницы: лист гнётся вокруг отвесной оси.
 *
 * Здесь только поверхность: два холста со страницами и доля оборота от нуля до
 * единицы. Ни жестов, ни загрузки страниц, ни кнопок — их ведёт сама читалка,
 * и отдавать их сюда значило бы держать управление в двух местах.
 *
 * Нет WebGL — createCurl возвращает null, и читалка остаётся на прежнем обороте
 * из полос. Это не запас на всякий случай: на части устройств WebGL в WebView
 * выключен, и молча чёрный экран вместо страницы там недопустим.
 *
 * Почему геометрия своя, а не взятый готовым шейдер. Сначала здесь стоял
 * InvertedPageCurl из gl-transitions: он гнёт лист по диагонали, вокруг наклонной
 * оси. Картинка выходила объёмная, но строки на листе вставали наискосок —
 * владелец прислал снимок, где слова едут по диагонали, и фотографии настоящей
 * книги, на которых видно главное: ось сгиба отвесная, строки остаются
 * горизонтальными, бумага только сжимается по ширине. Это не настройка того
 * шейдера, а другая геометрия, поэтому она написана здесь целиком.
 *
 * Как устроен лист. Он закреплён у корешка и лежит на странице. Считаем всё в
 * долях ширины: 0 — корешок, 1 — свободный край.
 *
 *   q          — где бумага отрывается от страницы;
 *   R          — радиус сгиба;
 *   πR         — сколько бумаги уходит на пол-оборота;
 *   1 - q - πR — то, что уже легло назад поверх страницы.
 *
 * Пока q близко к единице, лист почти плоский и у правого края только намечается
 * горбик. Дальше q уходит влево, горбик растёт и доезжает до корешка — ровно так
 * это и выглядит на фотографиях настоящей книги.
 *
 * Сгиб описывается одной координатой по горизонтали, поэтому строки не
 * наклоняются и не прыгают: меняется только то, насколько тесно они стоят.
 */

const VERTEX =
 'attribute vec2 position; varying vec2 vUV;' +
 'void main(){vUV=position*0.5+0.5;gl_Position=vec4(position,0.0,1.0);}';

const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUV;
uniform sampler2D fromTexture;
uniform sampler2D toTexture;
/** 1 — листаем вперёд (корешок слева), -1 — назад. */
uniform float direction;
/** Цвет бумаги: им закрашено всё, куда не попал текст. */
uniform vec3 paperColor;
/** Цвет изнанки листа. Считается снаружи по светлоте оформления. */
uniform vec3 backColor;
/** Наклон листа у самого корешка. Ноль — лежит, -PI — лёг на другую сторону. */
uniform float bendA;
/** На сколько лист выгнут по всей своей длине. Ноль — прямой. */
uniform float bendB;
/** Докуда лист достаёт по горизонтали: за этой чертой начинается его тень. */
uniform float edgeX;

const float PI = 3.141592653589793;

/** Бумажная координата в координату снимка: при листании назад корешок справа. */
float shot(float u){ return direction > 0.0 ? u : 1.0 - u; }

vec3 pageFrom(float u, float y){
 if(u < 0.0 || u > 1.0) return paperColor;
 vec4 c = texture2D(fromTexture, vec2(shot(u), y));
 return mix(paperColor, c.rgb, c.a);
}
vec3 pageTo(float u, float y){
 if(u < 0.0 || u > 1.0) return paperColor;
 vec4 c = texture2D(toTexture, vec2(shot(u), y));
 return mix(paperColor, c.rgb, c.a);
}
/**
 * Изнанка листа. Текст на ней проступает еле-еле — так и на настоящей бумаге
 * виден оборот печати. Зеркальным он выходит сам собой: по изнанке бумажная
 * координата идёт навстречу экранной.
 */
vec3 pageBack(float u, float y){
 return mix(backColor, pageFrom(u, y), 0.10);
}

void main(){
 float y = vUV.y;
 float x = direction > 0.0 ? vUV.x : 1.0 - vUV.x;
 float a = bendA, b = bendB;

 float bestZ = -1000.0, bestU = -1.0, bestT = 0.0;
 bool hit = false;

 if(abs(b) < 0.02){
  // Лист прямой: он просто повёрнут у корешка и сжат по ширине.
  float c = cos(a);
  if(abs(c) > 0.001){
   float u = x / c;
   if(u >= 0.0 && u <= 1.0){ hit = true; bestU = u; bestT = a; bestZ = u * sin(a); }
  }
 }else{
  // Лист — дуга: угол касательной идёт от a до a+b ровно по его длине.
  // Одному месту экрана отвечает до трёх точек бумаги; видна самая ближняя.
  float w = b * x + sin(a);
  if(abs(w) <= 1.0){
   float s = asin(w);
   for(int i = 0; i < 3; i++){
    // Наклон листа идёт от a+b до a и заходит и ниже -90 градусов, и выше 90,
    // поэтому ветвей три: средняя, верхняя и нижняя.
    float t = i == 0 ? s : (i == 1 ? PI - s : -PI - s);
    float u = (t - a) / b;
    if(u >= 0.0 && u <= 1.0){
     float z = (cos(a) - cos(t)) / b;
     if(z > bestZ){ bestZ = z; bestU = u; bestT = t; hit = true; }
    }
   }
  }
 }

 vec3 colour;
 if(hit){
  // Куда повёрнута бумага в этом месте: к нам лицом или изнанкой.
  float face = cos(bestT);
  colour = face >= 0.0 ? pageFrom(bestU, y) : pageBack(bestU, y);
  // Свет падает спереди: чем круче бумага стоит, тем она темнее.
  colour *= 0.45 + 0.55 * abs(face);
 }else{
  // Новая страница, открывшаяся из-под листа, и тень поднятой бумаги на ней.
  colour = pageTo(x, y) * mix(0.38, 1.0, clamp((x - edgeX) / 0.18, 0.0, 1.0));
 }

 gl_FragColor = vec4(colour, 1.0);
}
`;

/**
 * Насколько лист выгибается посреди оборота, в радианах на всю его длину.
 *
 * Знак отрицательный, и это главное. Наклон бумаги вдоль листа обязан убывать:
 * у корешка лист поднимается, в середине проходит верхнюю точку, дальше
 * опускается к свободному краю — это арка, и ровно её видно на фотографиях.
 * Когда наклон нарастал, получалась не арка, а завиток: на экране лист
 * распадался на две плоские половины с тёмной полосой между ними.
 */
const BEND = 2.0;

/**
 * Куда дотягивается лист по горизонтали. За этой чертой лежит его тень.
 *
 * Лист растёт вправо, пока бумага повёрнута к читателю меньше чем на прямой
 * угол. Значит дальше всего он уходит там, где наклон проходит -90 градусов, а
 * если до такого места дуга не доходит — на одном из своих концов.
 */
const reach = (a: number, b: number) => {
 const tip = Math.abs(b) < 1e-6
  ? Math.cos(a)
  : (Math.sin(a + b) - Math.sin(a)) / b;
 const low = Math.min(a, a + b), high = Math.max(a, a + b);
 const steep = -Math.PI / 2;
 if (Math.abs(b) > 0.02 && low <= steep && steep <= high)
  return Math.max(0, (-1 - Math.sin(a)) / b);
 return Math.max(0, tip);
};

/**
 * Форма листа для доли оборота.
 *
 * Лист поворачивается у корешка на половину оборота — от «лежит вправо» до
 * «лёг влево», — и по дороге выгибается аркой. Выгиба нет ни в начале, ни в
 * конце: лист лежит плоско и на своей стороне, и на новой.
 *
 * Свободный край здесь не задаётся, а получается сам из поворота и выгиба —
 * длина листа не меняется. Раньше край задавался, а поворот подбирался под
 * него делением пополам; подбор убран вместе с завитком, ради которого он и
 * понадобился.
 */
const shape = (phase: number) => {
 const a = Math.PI * phase;
 const b = -BEND * Math.sin(Math.PI * phase);
 return {a, b};
};

/** Где оказывается свободный край листа при такой стадии оборота. */
const tipOf = (a: number, b: number) =>
 Math.abs(b) < 1e-6 ? Math.cos(a) : (Math.sin(a + b) - Math.sin(a)) / b;

const bend = (turn: number) => {
 // Палец ведёт свободный край листа ровно за собой, от правого края к левому.
 // Сам по себе лист движется иначе: пока он выгибается аркой, край почти стоит
 // на месте, а под конец перебрасывается разом. Так ведёт себя настоящая
 // бумага, но под пальцем это читается как «тяну, а ничего не происходит».
 // Поэтому стадия оборота подбирается под то место, куда пришёл палец: форма
 // остаётся аркой, а край идёт за рукой.
 const want = 1 - 2 * Math.min(1, Math.max(0, turn));
 let low = 0, high = 1;
 for (let step = 0; step < 20; step++) {
  const mid = (low + high) / 2;
  const at = shape(mid);
  if (tipOf(at.a, at.b) > want) low = mid; else high = mid;
 }
 const {a, b} = shape((low + high) / 2);
 return {a, b, edge: reach(a, b)};
};

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
 * Собирает поверхность изгиба на готовом холсте.
 *
 * Возвращает null, если WebGL недоступен или шейдер не собрался. Молчать об
 * этом нельзя, но и падать тоже: читалка обязана открыться и без изгиба.
 */
export function createCurl(canvas: HTMLCanvasElement, paper: Paper): Curl | null {
 const gl = canvas.getContext('webgl', {alpha: false, antialias: true, depth: false, stencil: false});
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
 const vertex = compile(gl.VERTEX_SHADER, VERTEX);
 const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT);
 if (!vertex || !fragment) return null;
 const program = gl.createProgram();
 if (!program) return null;
 gl.attachShader(program, vertex);
 gl.attachShader(program, fragment);
 gl.linkProgram(program);
 gl.deleteShader(vertex);
 gl.deleteShader(fragment);
 if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {gl.deleteProgram(program); return null;}
 gl.useProgram(program);

 const buffer = gl.createBuffer();
 gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
 gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
 const position = gl.getAttribLocation(program, 'position');
 gl.enableVertexAttribArray(position);
 gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

 const at = (name: string) => gl.getUniformLocation(program, name);
 const uniform = {
  direction: at('direction'), paperColor: at('paperColor'),
  backColor: at('backColor'), bendA: at('bendA'), bendB: at('bendB'), edgeX: at('edgeX'),
 };
 gl.uniform3fv(uniform.paperColor, paper);
 // Изнанка листа. На тёмной бумаге она светлее бумаги, на светлой — темнее:
 // перевёрнутый лист ловит свет иначе, чем лежащая страница, и без этого
 // разворот в ночном оформлении выглядел чёрной прорехой.
 const lit = paper[0] * 0.3 + paper[1] * 0.6 + paper[2] * 0.1;
 const shift = lit < 0.5 ? 0.17 : -0.12;
 gl.uniform3fv(uniform.backColor,
  paper.map(v => Math.min(1, Math.max(0, v + shift))) as unknown as Float32List);


 const textures = [0, 1].map(unit => {
  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(at(unit === 0 ? 'fromTexture' : 'toTexture'), unit);
  return texture;
 });

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
   const shape = bend(Math.min(1, Math.max(0, progress)));
   gl.uniform1f(uniform.direction, forward ? 1 : -1);
   gl.uniform1f(uniform.bendA, shape.a);
   gl.uniform1f(uniform.bendB, shape.b);
   gl.uniform1f(uniform.edgeX, shape.edge);
   gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  },
  destroy() {
   for (const texture of textures) gl.deleteTexture(texture);
   gl.deleteBuffer(buffer);
   gl.deleteProgram(program);
   gl.getExtension('WEBGL_lose_context')?.loseContext();
  },
 };
}
