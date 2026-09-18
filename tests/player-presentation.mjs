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


// Длительность на карточке. У видео её вписывает автор: ролик лежит на чужой
// площадке, и длины приложение не знает. Разбор обязан отличать пустое поле
// от испорченного ввода — иначе опечатка молча сохранилась бы нулём.
const timing=await build({entryPoints:[path.join(root,'lib/client.ts')],bundle:true,write:false,format:'esm',platform:'node'});
const {clock,parseClock}=await import('data:text/javascript;base64,'+Buffer.from(timing.outputFiles[0].text).toString('base64'));

assert.equal(clock(0),'00:00');
assert.equal(clock(90),'01:30');
assert.equal(clock(3599),'59:59','до часа подпись без часов');
assert.equal(clock(3600),'1:00:00','с часа появляются часы');
assert.equal(clock(5430),'1:30:30');
assert.equal(clock(-5),'00:00','отрицательное время не ломает подпись');

assert.equal(parseClock(''),0,'пустое поле — длительности нет');
assert.equal(parseClock('  '),0,'пробелы равны пустому');
assert.equal(parseClock('12:30'),750);
assert.equal(parseClock('0:05'),5);
assert.equal(parseClock('1:30:30'),5430);
assert.equal(parseClock('90:00'),5400,'минуты больше 59 допустимы');
assert.equal(parseClock('12:60'),null,'секунд больше 59 не бывает');
assert.equal(parseClock('12'),null,'без двоеточия непонятно, минуты это или секунды');
assert.equal(parseClock('abc'),null);
assert.equal(parseClock('12:3'),null,'односимвольные секунды двусмысленны');
assert.equal(clock(parseClock('1:30:30')),'1:30:30','поле и подпись понимают друг друга');

console.log('PASS: макет плеера, признак записи эфира и разбор длительности, введённой руками.');
