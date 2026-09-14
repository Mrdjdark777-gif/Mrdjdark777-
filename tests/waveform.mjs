#!/usr/bin/env node
/**
 * Пики формы звука. Если сведение поедет, слушатель увидит чужую картинку
 * под своим выпуском — и она будет выглядеть достоверно, поэтому проверяем.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import {build} from 'esbuild';
const root=path.resolve(import.meta.dirname,'..');
const {outputFiles}=await build({entryPoints:[path.join(root,'lib/waveform.ts')],bundle:true,write:false,format:'esm',platform:'node'});
const {peaksFromPcm,encodePeaks,decodePeaks,barHeight,PEAK_COUNT}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));

// Тишина остаётся тишиной, а не превращается в ровный забор.
assert.deepEqual(peaksFromPcm(new Int16Array(4800),8),new Array(8).fill(0),'тишина даёт нулевые пики');
assert.deepEqual(peaksFromPcm(new Int16Array(0),4),[0,0,0,0],'пустой файл не ломает сведение');
assert.deepEqual(peaksFromPcm(new Int16Array(100),0),[],'нулевое число столбиков допустимо');

// Громкое место выше тихого, а самый громкий столбик упирается в потолок.
const ramp=new Int16Array(1000);
for(let i=0;i<ramp.length;i++)ramp[i]=Math.round(i/ramp.length*32000);
const bars=peaksFromPcm(ramp,10);
assert.equal(bars.length,10);
assert.equal(bars[9],35,'самый громкий участок занимает всю высоту');
assert.ok(bars[0]<bars[5]&&bars[5]<bars[9],'громкость растёт вместе со звуком');

// Отрицательная полуволна считается так же: модуль, а не знак.
assert.deepEqual(peaksFromPcm(Int16Array.from([-32000,-32000]),1),peaksFromPcm(Int16Array.from([32000,32000]),1),'знак не влияет на высоту');

// Кодирование переживает круг и не растёт в объёме.
const encoded=encodePeaks(bars);
assert.equal(encoded.length,10,'один символ на столбик');
assert.deepEqual(decodePeaks(encoded),bars,'пики читаются обратно без потерь');
assert.equal(encodePeaks([-5,99]),'0z','уровни за пределами шкалы прижимаются к краям');
assert.deepEqual(decodePeaks('  '),[],'мусор не превращается в столбики');

// Столбик никогда не исчезает полностью: полоса остаётся полосой.
assert.equal(barHeight(0),6,'тишина — тонкая линия, а не дыра');
assert.equal(barHeight(35),100,'потолок шкалы — полная высота');

assert.equal(PEAK_COUNT,96);
assert.equal(encodePeaks(peaksFromPcm(ramp)).length,PEAK_COUNT,'по умолчанию пиков ровно столько, сколько столбиков');

console.log('PASS: пики считаются по модулю сигнала, переживают кодирование и не рисуют забор из тишины');
