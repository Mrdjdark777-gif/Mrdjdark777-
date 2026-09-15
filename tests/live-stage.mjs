#!/usr/bin/env node
/**
 * Экран эфира: что он говорит в каждом состоянии. Ошибка здесь — это ложь
 * слушателю о том, идёт ли эфир, поэтому правило проверяется отдельно.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import {build} from 'esbuild';
const root=path.resolve(import.meta.dirname,'..');
const {outputFiles}=await build({entryPoints:[path.join(root,'lib/live-stage.ts')],bundle:true,write:false,format:'esm',platform:'node'});
const {liveStage,onAirLabelVisible,ringsPulsing,stageAction}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));

const stage=(over={})=>liveStage({onAir:true,joined:true,phase:'playing',...over});

// Без эфира экран не притворяется живым.
assert.equal(stage({onAir:false,joined:false,phase:'idle'}),'offline');
assert.equal(onAirLabelVisible('offline'),false,'«Мы в эфире» без эфира не показывается');
assert.equal(stageAction('offline'),'none','нечего включать, значит нет и кнопки');

// Эфир идёт, но слушатель ещё не нажал «Слушать»: это не offline.
assert.equal(stage({joined:false,phase:'idle'}),'ready','идущий эфир виден до подключения');
assert.equal(onAirLabelVisible('ready'),true,'«Мы в эфире» показывается сразу, а не после подключения');
assert.equal(stageAction('ready'),'play','эфир можно включить одним нажатием');
assert.equal(ringsPulsing('ready',false),false,'до звука кольца не пульсируют');

// Подключение — состояние, а не воспроизведение.
assert.equal(stage({phase:'connecting'}),'connecting');
assert.equal(stage({phase:'waiting'}),'connecting','ожидание первых данных — то же подключение');
assert.equal(stageAction('connecting'),'busy');
assert.equal(ringsPulsing('connecting',false),false,'до звука кольца не пульсируют');

// Переподключение не выдаётся за эфир.
assert.equal(stage({phase:'reconnecting'}),'reconnecting');
assert.equal(stageAction('reconnecting'),'busy');
assert.equal(ringsPulsing('reconnecting',false),false);

// Воспроизведение: пауза на кнопке, пульс — только здесь и только без reduced motion.
assert.equal(stage({phase:'playing'}),'playing');
assert.equal(stageAction('playing'),'pause');
assert.equal(ringsPulsing('playing',false),true);
assert.equal(ringsPulsing('playing',true),false,'reduced motion выключает пульс');

// Пауза и блокировка автозапуска дают понятную кнопку «включить».
assert.equal(stageAction('paused'),'play');
assert.equal(stageAction('blocked'),'play','запрет автозапуска показывает явный CTA, а не мнимое воспроизведение');
assert.equal(stage({phase:'blocked'}),'blocked');

// Завершение важнее всего остального: старый эфир не остаётся на экране.
assert.equal(stage({phase:'ended'}),'ended');
assert.equal(stage({onAir:false,joined:false,phase:'ended'}),'ended');
assert.equal(onAirLabelVisible('ended'),false);

// Ошибка у подключённого слушателя видна и после пропажи эфира.
assert.equal(stage({onAir:false,phase:'error'}),'error');
assert.equal(stage({onAir:false,joined:false,phase:'error'}),'offline','без попытки подключения это просто отсутствие эфира');
assert.equal(stageAction('error'),'play','после ошибки можно попробовать снова');

console.log('PASS: экран эфира честен во всех состояниях — offline не говорит «в эфире», connecting и reconnecting не выдают себя за звук, ended уводит к архиву');
