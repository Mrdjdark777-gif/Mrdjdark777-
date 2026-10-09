#!/usr/bin/env node
/** Смахивание мини-плеера: решение о закрытии считается без DOM, поэтому его
 *  можно проверить числами, а не жестом в браузере. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {build} from 'esbuild';
const root=path.resolve(import.meta.dirname,'..');
const {outputFiles}=await build({entryPoints:[path.join(root,'lib/swipe.ts')],bundle:true,write:false,format:'esm',platform:'node'});
const {swipeAxis,swipeCloses,swipeFade}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));

assert.equal(swipeAxis(4,3),'none','мелкое дрожание пальца жестом не считается');
assert.equal(swipeAxis(60,10),'horizontal','движение поперёк — смахивание');
assert.equal(swipeAxis(-60,10),'horizontal','смахивание работает в обе стороны');
assert.equal(swipeAxis(20,40),'vertical','движение вдоль — прокрутка страницы, не жест');
assert.equal(swipeAxis(30,25),'vertical','по диагонали побеждает прокрутка: её жалко ломать');

assert.equal(swipeCloses(60,390),false,'короткого движения мало');
assert.equal(swipeCloses(100,390),true,'четверть ширины закрывает');
assert.equal(swipeCloses(-100,390),true,'в левую сторону так же');
assert.equal(swipeCloses(75,1200),false,'на планшете 75 пикселей — ещё не жест');
assert.equal(swipeCloses(320,1200),true,'на планшете закрывает четверть его ширины');
assert.equal(swipeCloses(70,200),true,'на узком экране работает нижняя граница в 70 пикселей');

assert.ok(swipeFade(0,390)===1,'без движения панель непрозрачна');
assert.ok(swipeFade(100,390)<1,'на сдвиге панель бледнеет');
assert.ok(swipeFade(400,390)>=0.35,'но не исчезает совсем');
console.log('PASS: смахивание мини-плеера — порог, ось и затухание');
