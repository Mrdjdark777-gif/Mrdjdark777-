#!/usr/bin/env node
/**
 * Порядок системной кнопки «Назад»: меню, потом полный плеер, потом
 * навигация. Ошибка здесь выбрасывает человека из приложения вместо того,
 * чтобы закрыть то, что он открыл, — и заметна только на живом телефоне.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import {build} from 'esbuild';
const root=path.resolve(import.meta.dirname,'..');
const {outputFiles}=await build({entryPoints:[path.join(root,'lib/back-stack.ts')],bundle:true,write:false,format:'esm',platform:'node'});
const m=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const {pushBackLayer,runBack,resetBackLayers,BACK_MENU,BACK_PLAYER,BACK_OVERLAY,BACK_NAV}=m;

// Без слоёв нажатие уходит системе: приложение закрывается, как и ожидается.
resetBackLayers();
assert.equal(runBack(),false,'на главной без листов Back отдаётся системе');

// Порядок: меню важнее плеера, плеер важнее навигации.
resetBackLayers();
const log=[];
pushBackLayer(BACK_NAV,()=>{log.push('nav');return true;});
pushBackLayer(BACK_PLAYER,()=>{log.push('player');return true;});
pushBackLayer(BACK_MENU,()=>{log.push('menu');return true;});
assert.equal(runBack(),true);assert.deepEqual(log,['menu'],'первым закрывается меню');
assert.equal(runBack(),true);assert.deepEqual(log,['menu','menu'],'слой снимает себя сам, а не Back');

// Снятый слой больше не участвует.
resetBackLayers();
const order=[];
const drop=pushBackLayer(BACK_MENU,()=>{order.push('menu');return true;});
pushBackLayer(BACK_PLAYER,()=>{order.push('player');return true;});
drop();
assert.equal(runBack(),true);assert.deepEqual(order,['player'],'после закрытия меню Back сворачивает плеер');

// Слой вправе отказаться: очередь идёт ниже, а не упирается в него.
resetBackLayers();
const tried=[];
pushBackLayer(BACK_NAV,()=>{tried.push('nav');return true;});
pushBackLayer(BACK_OVERLAY,()=>{tried.push('overlay');return false;});
assert.equal(runBack(),true);assert.deepEqual(tried,['overlay','nav'],'отказ верхнего слоя не съедает нажатие');

// Все отказались — нажатие уходит системе, а не теряется.
resetBackLayers();
pushBackLayer(BACK_PLAYER,()=>false);
pushBackLayer(BACK_NAV,()=>false);
assert.equal(runBack(),false,'нажатие, которое никто не взял, возвращается системе');

// Два слоя одного уровня: верхний — тот, что открыт позже.
resetBackLayers();
const both=[];
pushBackLayer(BACK_OVERLAY,()=>{both.push('первый');return true;});
pushBackLayer(BACK_OVERLAY,()=>{both.push('второй');return true;});
assert.equal(runBack(),true);assert.deepEqual(both,['второй'],'на равных уровнях закрывается открытый последним');

assert.ok(BACK_MENU>BACK_PLAYER&&BACK_PLAYER>BACK_OVERLAY&&BACK_OVERLAY>BACK_NAV,'порядок уровней тот же, что в спецификации');

// Мост между страницей и Android держится на одном имени. Если переименовать
// его в вебе, Back молча вернётся к прежнему поведению — и заметно это станет
// только на телефоне, поэтому имя проверяется здесь.
const {readFile}=await import('node:fs/promises');
const activity=await readFile(path.join(root,'android/app/src/main/java/com/truethrills/listener/MainActivity.java'),'utf8');
const studio=await readFile(path.join(root,'app/studio.tsx'),'utf8');
assert.match(activity,/window\.trueThrills&&window\.trueThrills\.back/,'Android спрашивает страницу перед закрытием приложения');
assert.match(activity,/private void systemBack\(\)/,'прежнее поведение осталось запасным путём');
assert.match(studio,/host\.trueThrills=\{\.\.\.host\.trueThrills,back:runBack\}/,'страница выставляет мост под тем же именем');
assert.match(studio,/pushBackLayer\(BACK_OVERLAY/,'листы поверх экрана участвуют в порядке');
assert.match(studio,/pushBackLayer\(BACK_NAV/,'возврат на главную участвует в порядке');
const chrome=await readFile(path.join(root,'components/studio/player-chrome.tsx'),'utf8');
assert.match(chrome,/pushBackLayer\(BACK_MENU/,'меню плеера участвует в порядке');
assert.match(chrome,/pushBackLayer\(BACK_PLAYER/,'развёрнутый плеер участвует в порядке');

console.log('PASS: Back закрывает меню, затем плеер, затем навигацию и только потом уходит системе');
