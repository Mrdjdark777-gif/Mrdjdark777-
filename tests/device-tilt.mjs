#!/usr/bin/env node
/**
 * Наклон телефона в поворот карточки — без телефона и без браузера.
 *
 * Проверять это на устройстве нечем, а ошибиться здесь легко: перепутанный
 * знак разворачивает карточку в другую сторону, и на глаз это выглядит просто
 * «как-то не так». Поэтому арифметика вынесена отдельно и проверяется числами.
 */
import {build} from 'esbuild';
import assert from 'node:assert/strict';
import path from 'node:path';

const root=process.cwd();
const {outputFiles}=await build({entryPoints:[path.join(root,'lib/device-tilt.ts')],
 bundle:true,write:false,format:'esm',platform:'node'});
const {aim,ease,shadowOf,turnOf,LIMIT,SPAN}=await import(
 'data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));

// 1. Телефон в покое — карточка стоит прямо.
{
 const t=aim(38,0);
 assert.ok(Math.abs(t.x)<0.01,'в привычном положении карточка не должна быть завёрнута: '+t.x);
 assert.ok(Math.abs(t.y)<0.01,'в покое поворота вбок быть не должно: '+t.y);
}

// 2. Наклон вбок крутит вокруг вертикальной оси, и знак именно такой.
{
 const right=aim(38,SPAN);
 assert.ok(right.y>0,'наклон телефона вправо обязан повернуть карточку вправо: '+right.y);
 assert.equal(Math.round(right.y),LIMIT,'на краю диапазона поворот равен пределу');
 const left=aim(38,-SPAN);
 assert.equal(Math.round(left.y),-LIMIT,'влево — зеркально');
}

// 3. Наклон вперёд-назад крутит вокруг горизонтальной оси.
{
 // Отодвинул верх телефона от себя (beta больше покоя) — верх карточки уходит
 // назад, то есть поворот вокруг X отрицательный.
 const away=aim(38+SPAN,0);
 assert.ok(away.x<0,'отодвинул телефон — верх карточки обязан уйти назад: '+away.x);
 const near=aim(38-SPAN,0);
 assert.ok(near.x>0,'наклонил к себе — верх карточки обязан выйти вперёд: '+near.x);
}

// 4. Дальше края диапазона карточка не заваливается.
{
 const far=aim(38+SPAN*10,SPAN*10);
 assert.ok(Math.abs(far.x)<=LIMIT+0.001&&Math.abs(far.y)<=LIMIT+0.001,
  'поворот обязан упираться в предел, а не расти без конца: '+JSON.stringify(far));
}

// 5. Телефон без датчика ничего не ломает.
{
 const none=aim(null,null);
 assert.ok(Math.abs(none.x)<0.01&&Math.abs(none.y)<0.01,
  'без показаний датчика карточка стоит прямо: '+JSON.stringify(none));
}

// 6. Сглаживание идёт К цели и не перелетает её.
{
 let now={x:0,y:0};const goal={x:LIMIT,y:-LIMIT};
 for(let i=0;i<200;i++)now=ease(now,goal);
 assert.ok(Math.abs(now.x-goal.x)<0.01&&Math.abs(now.y-goal.y)<0.01,
  'сглаживание обязано дойти до цели: '+JSON.stringify(now));
 const step=ease({x:0,y:0},goal);
 assert.ok(step.x>0&&step.x<goal.x,'один шаг сглаживания не должен прыгать в цель: '+step.x);
}

// 7. Тень уезжает в сторону, противоположную повороту: свет остаётся на месте.
{
 const right=shadowOf({x:0,y:LIMIT});
 assert.ok(right.x<0,'повернули карточку вправо — тень обязана уйти влево: '+right.x);
 const flat=shadowOf({x:0,y:0});
 assert.ok(flat.y>0,'в покое тень лежит под карточкой, а не над ней: '+flat.y);
}

// 8. Разворот по месту в карусели: середина стоит лицом, края повёрнуты.
{
 assert.ok(Math.abs(turnOf(200,200,200))<0.001,'карточка посреди полосы обязана стоять лицом');
 const right=turnOf(400,200,200),left=turnOf(0,200,200);
 assert.ok(right<0,'карточка справа от середины разворачивается правым краем назад: '+right);
 assert.ok(left>0,'слева — зеркально: '+left);
 assert.equal(Math.round(right),-Math.round(left),'развороты по краям обязаны быть зеркальными');
 assert.ok(Math.abs(turnOf(5000,200,200))<=12.001,'дальше края разворот не растёт');
 assert.ok(Math.abs(turnOf(100,200,0))<0.001,'без ширины полосы разворота нет, а не деление на ноль');
}

console.log('PASS: наклон телефона переводится в поворот карточки с верными знаками, упирается в предел, сглаживается к цели и уводит тень в противоположную сторону; карточки в карусели разворачиваются от середины к краям зеркально');
