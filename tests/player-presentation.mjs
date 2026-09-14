/**
 * Правило выбора представления плеера. Держит S02/S04/S06 на одной модели:
 * если оно поедет, слушатель увидит чужой макет вместо своего выпуска.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import {build} from 'esbuild';
const root=path.resolve(import.meta.dirname,'..');
const {outputFiles}=await build({entryPoints:[path.join(root,'lib/player-presentation.ts')],bundle:true,write:false,format:'esm',platform:'node'});
const {presentation,isLiveArchive}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));

assert.equal(presentation({cover:'/api/cover?id=1'}),'photo','выпуск с обложкой открывается фотоплеером');
assert.equal(presentation({cover:null}),'type','без обложки остаётся типографический макет');
assert.equal(presentation({cover:undefined}),'type','отсутствующая обложка равна пустой');
assert.equal(presentation({cover:'/api/cover?id=1',archived:true}),'archive','запись эфира важнее обложки');
assert.equal(presentation({archived:true}),'archive','запись эфира без обложки тоже S06');

assert.equal(isLiveArchive('audio/live-2026-09-14.m4a'),true,'ключ записи эфира распознан');
assert.equal(isLiveArchive('audio/upload-12.m4a'),false,'обычная загрузка не архив');
assert.equal(isLiveArchive(null),false,'у выпуска без файла нет признака архива');
assert.equal(isLiveArchive(undefined),false,'отсутствующий ключ не ломает правило');

console.log('PASS: представление плеера выбирается публикацией — архив, затем обложка, иначе типографика');
