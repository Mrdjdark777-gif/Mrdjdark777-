/**
 * Изгиб страницы на WebGL.
 *
 * Здесь только поверхность: два холста со страницами и доля оборота от нуля до
 * единицы. Ни жестов, ни загрузки страниц, ни кнопок — их ведёт сама читалка,
 * и отдавать их сюда значило бы держать управление в двух местах.
 *
 * Нет WebGL — createCurl возвращает null, и читалка остаётся на прежнем
 * обороте из полос. Это не запас на всякий случай: на части устройств WebGL в
 * WebView выключен, и молча чёрный экран вместо страницы там недопустим.
 *
 * Шейдер — InvertedPageCurl из gl-transitions: Hewlett-Packard, BSD-3-Clause,
 * адаптация Sergey Kosarevsky. Текст лицензии лежит в
 * vendor/page-curl-shader.LICENSE.txt и обязан ехать вместе с поставкой.
 * Источник: https://github.com/gl-transitions/gl-transitions
 *
 * Изменено против источника: цвет бумаги приходит снаружи (у нас четыре
 * оформления, и просвет между страницами обязан быть цвета бумаги, а не
 * чёрным), выборка холстов с сохранением пропорций, направление оборота и
 * крайние состояния при нуле и единице.
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
uniform float progress;
uniform float direction;
uniform float viewportAspect;
uniform float fromAspect;
uniform float toAspect;
uniform vec3 paperColor;
vec2 sampleUV(vec2 p, float aspect) {
  p.x = direction > 0.0 ? p.x : 1.0-p.x;
  vec2 scaleFit = vec2(min(1.0, aspect/viewportAspect), min(1.0, viewportAspect/aspect));
  return (p-0.5)/scaleFit+0.5;
}
vec4 getFromColor(vec2 p) {
  vec2 uv=sampleUV(p,fromAspect);
  if(any(lessThan(uv,vec2(0.0)))||any(greaterThan(uv,vec2(1.0))))return vec4(paperColor,1.0);
  vec4 c=texture2D(fromTexture,uv);return vec4(mix(paperColor,c.rgb,c.a),1.0);
}
vec4 getToColor(vec2 p) {
  vec2 uv=sampleUV(p,toAspect);
  if(any(lessThan(uv,vec2(0.0)))||any(greaterThan(uv,vec2(1.0))))return vec4(paperColor,1.0);
  vec4 c=texture2D(toTexture,uv);return vec4(mix(paperColor,c.rgb,c.a),1.0);
}
// Author: Hewlett-Packard
// License: BSD 3 Clause
// Adapted by Sergey Kosarevsky from:
// http://rectalogic.github.io/webvfx/examples_2transition-shader-pagecurl_8html-example.html

/*
Copyright (c) 2010 Hewlett-Packard Development Company, L.P. All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are
met:

   * Redistributions of source code must retain the above copyright
     notice, this list of conditions and the following disclaimer.
   * Redistributions in binary form must reproduce the above
     copyright notice, this list of conditions and the following disclaimer
     in the documentation and/or other materials provided with the
     distribution.
   * Neither the name of Hewlett-Packard nor the names of its
     contributors may be used to endorse or promote products derived from
     this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
"AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
in vec2 texCoord;
*/

const float MIN_AMOUNT = -0.16;
const float MAX_AMOUNT = 1.5;

const float PI = 3.141592653589793;

uniform float edgeScale;
#define scale edgeScale
const float sharpness = 3.0;

const float cylinderRadius = 1.0 / PI / 2.0;

// These depend on the progress uniform and must be computed per-fragment.
// Global initializers with uniforms are invalid in GLSL ES and fail on Mesa.
float amount;
float cylinderCenter;
float cylinderAngle;

vec3 hitPoint(float hitAngle, float yc, vec3 point, mat3 rrotation)
{
        float hitPoint = hitAngle / (2.0 * PI);
        point.y = hitPoint;
        return rrotation * point;
}

vec4 antiAlias(vec4 color1, vec4 color2, float distanc)
{
        distanc *= scale;
        if (distanc < 0.0) return color2;
        if (distanc > 2.0) return color1;
        float dd = pow(1.0 - distanc / 2.0, sharpness);
        return ((color2 - color1) * dd) + color1;
}

float distanceToEdge(vec3 point)
{
        float dx = abs(point.x > 0.5 ? 1.0 - point.x : point.x);
        float dy = abs(point.y > 0.5 ? 1.0 - point.y : point.y);
        if (point.x < 0.0) dx = -point.x;
        if (point.x > 1.0) dx = point.x - 1.0;
        if (point.y < 0.0) dy = -point.y;
        if (point.y > 1.0) dy = point.y - 1.0;
        if ((point.x < 0.0 || point.x > 1.0) && (point.y < 0.0 || point.y > 1.0)) return sqrt(dx * dx + dy * dy);
        return min(dx, dy);
}

vec4 seeThrough(float yc, vec2 p, mat3 rotation, mat3 rrotation)
{
        float hitAngle = PI - (acos(clamp(yc / cylinderRadius, -1.0, 1.0)) - cylinderAngle);
        vec3 point = hitPoint(hitAngle, yc, rotation * vec3(p, 1.0), rrotation);
        if (yc <= 0.0 && (point.x < 0.0 || point.y < 0.0 || point.x > 1.0 || point.y > 1.0))
        {
            return getToColor(p);
        }

        if (yc > 0.0) return getFromColor(p);

        vec4 color = getFromColor(point.xy);
        vec4 tcolor = vec4(0.0);

        return antiAlias(color, tcolor, distanceToEdge(point));
}

vec4 seeThroughWithShadow(float yc, vec2 p, vec3 point, mat3 rotation, mat3 rrotation)
{
        float shadow = distanceToEdge(point) * 30.0;
        shadow = (1.0 - shadow) / 3.0;

        if (shadow < 0.0) shadow = 0.0; else shadow *= amount;

        vec4 shadowColor = seeThrough(yc, p, rotation, rrotation);
        shadowColor.r -= shadow;
        shadowColor.g -= shadow;
        shadowColor.b -= shadow;

        return shadowColor;
}

vec4 backside(float yc, vec3 point)
{
        vec4 color = getFromColor(point.xy);
        float gray = (color.r + color.b + color.g) / 15.0;
        gray += (8.0 / 10.0) * (pow(max(0.0, 1.0 - abs(yc / cylinderRadius)), 2.0 / 10.0) / 2.0 + (5.0 / 10.0));
        color.rgb = paperColor * (0.70 + 0.30 * clamp(gray, 0.0, 1.0));
        return color;
}

vec4 behindSurface(vec2 p, float yc, vec3 point, mat3 rrotation)
{
        float safeAmount = amount >= 0.0 ? max(amount, 1e-4) : min(amount, -1e-4);
        float shado = (1.0 - ((-cylinderRadius - yc) / safeAmount * 7.0)) / 6.0;
        shado *= 1.0 - abs(point.x - 0.5);

        yc = (-cylinderRadius - cylinderRadius - yc);

        float hitAngle = (acos(clamp(yc / cylinderRadius, -1.0, 1.0)) + cylinderAngle) - PI;
        point = hitPoint(hitAngle, yc, point, rrotation);

        if (yc < 0.0 && point.x >= 0.0 && point.y >= 0.0 && point.x <= 1.0 && point.y <= 1.0 && (hitAngle < PI || amount > 0.5))
        {
                float dx = point.x - 0.5;
                float dy = point.y - 0.5;
                shado = 1.0 - (sqrt(dx * dx + dy * dy) / (71.0 / 100.0));
                float nyc = -yc / cylinderRadius;
                shado *= nyc * nyc * nyc;
                shado *= 0.5;
        }
        else
        {
                shado = 0.0;
        }
        return vec4(getToColor(p).rgb - shado, 1.0);
}

vec4 transition(vec2 p) {
  amount = progress * (MAX_AMOUNT - MIN_AMOUNT) + MIN_AMOUNT;
  cylinderCenter = amount;
  cylinderAngle = 2.0 * PI * amount;

  const float angle = 100.0 * PI / 180.0;
        float c = cos(-angle);
        float s = sin(-angle);

        mat3 rotation = mat3( c, s, 0,
                                                                -s, c, 0,
                                                                -0.801, 0.8900, 1
                                                                );
        c = cos(angle);
        s = sin(angle);

        mat3 rrotation = mat3(	c, s, 0,
                                                                        -s, c, 0,
                                                                        0.98500, 0.985, 1
                                                                );

        vec3 point = rotation * vec3(p, 1.0);

        float yc = point.y - cylinderCenter;

        if (yc < -cylinderRadius)
        {
                // Behind surface
                return behindSurface(p,yc, point, rrotation);
        }

        if (yc > cylinderRadius)
        {
                // Flat surface
                return getFromColor(p);
        }

        float hitAngle = (acos(clamp(yc / cylinderRadius, -1.0, 1.0)) + cylinderAngle) - PI;

        float hitAngleMod = mod(hitAngle, 2.0 * PI);
        if ((hitAngleMod > PI && amount < 0.5) || (hitAngleMod > PI/2.0 && amount < 0.0))
        {
                return seeThrough(yc, p, rotation, rrotation);
        }

        point = hitPoint(hitAngle, yc, point, rrotation);

        if (point.x < 0.0 || point.y < 0.0 || point.x > 1.0 || point.y > 1.0)
        {
                return seeThroughWithShadow(yc, p, point, rotation, rrotation);
        }

        vec4 color = backside(yc, point);

        vec4 otherColor;
        if (yc < 0.0)
        {
                float dx2 = point.x - 0.5;
                float dy2 = point.y - 0.5;
                float shado = 1.0 - (sqrt(dx2 * dx2 + dy2 * dy2) / 0.71);
                float nyc2 = -yc / cylinderRadius;
                shado *= nyc2 * nyc2 * nyc2;
                shado *= 0.5;
                otherColor = vec4(0.0, 0.0, 0.0, shado);
        }
        else
        {
                otherColor = getFromColor(p);
        }

        color = antiAlias(color, otherColor, cylinderRadius - abs(yc));

        vec4 cl = seeThroughWithShadow(yc, p, point, rotation, rrotation);
        float dist = distanceToEdge(point);

        return antiAlias(color, cl, dist);
}

void main() {
 vec2 p=vUV; if(direction<0.0)p.x=1.0-p.x;
 if(progress<=0.0){gl_FragColor=getFromColor(p);return;}
 if(progress>=1.0){gl_FragColor=getToColor(p);return;}
 vec4 c=transition(p);
 gl_FragColor=vec4(mix(paperColor,c.rgb,c.a),1.0);
}
`;

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
  progress: at('progress'), direction: at('direction'), paperColor: at('paperColor'),
  viewportAspect: at('viewportAspect'), fromAspect: at('fromAspect'),
  toAspect: at('toAspect'), edgeScale: at('edgeScale'),
 };
 gl.uniform3fv(uniform.paperColor, paper);

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
  gl.uniform1f(uniform.viewportAspect, canvas.width / canvas.height);
  // Чем мягче эта величина, тем шире растушёвка края листа. Берётся от
  // меньшей стороны: иначе на узком телефоне край выходил бы рваным.
  gl.uniform1f(uniform.edgeScale, Math.min(canvas.width, canvas.height));
 };

 const upload = (source: TexImageSource, unit: 0 | 1) => {
  const width = 'width' in source ? Number(source.width) : 0;
  const height = 'height' in source ? Number(source.height) : 0;
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, textures[unit]);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.uniform1f(unit === 0 ? uniform.fromAspect : uniform.toAspect,
   height > 0 ? width / height : 1);
 };

 resize();
 return {
  resize,
  pages(from, to) {upload(from, 0); upload(to, 1);},
  draw(progress, forward) {
   gl.uniform1f(uniform.progress, Math.min(1, Math.max(0, progress)));
   gl.uniform1f(uniform.direction, forward ? 1 : -1);
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
