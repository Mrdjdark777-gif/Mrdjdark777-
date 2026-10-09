#!/usr/bin/env node
/**
 * «Далее»: следующий выпуск по отображаемому порядку. Ошибка здесь уводит
 * слушателя не туда, куда он нажал, — и выглядит как поломка плеера.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import {build} from 'esbuild';
const root=path.resolve(import.meta.dirname,'..');
const {outputFiles}=await build({entryPoints:[path.join(root,'lib/next-episode.ts')],bundle:true,write:false,format:'esm',platform:'node'});
const {nextEpisode}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));

const ep=(id,over={})=>({id,kind:'podcast',audioKey:'audio/'+id,published:1,...over});
const list=[ep('3'),ep('2'),ep('1')];

assert.equal(nextEpisode(list,'3').id,'2','следующий — тот, что идёт ниже в списке');
assert.equal(nextEpisode(list,'2').id,'1');
assert.equal(nextEpisode(list,'1'),null,'на последнем выпуске блока нет');
assert.equal(nextEpisode(list,'нет такого'),null,'выпуск не из списка не даёт ложного «далее»');
assert.equal(nextEpisode([],'3'),null,'пустой раздел не ломает выбор');

// Порядок берётся из списка, а не из даты: обратная сортировка меняет и «далее».
assert.equal(nextEpisode([ep('1'),ep('2'),ep('3')],'1').id,'2','порядок задаёт список');

// Черновики, видео, истории и выпуски без файла пропускаются.
const mixed=[ep('5'),ep('4',{published:0}),{id:'v',kind:'video',published:1,audioKey:null},ep('3',{audioKey:null}),ep('2')];
assert.equal(nextEpisode(mixed,'5').id,'2','между ними только то, что действительно можно включить');
assert.equal(nextEpisode(mixed,'4'),null,'от черновика «далее» не строится');
assert.equal(nextEpisode(mixed,'v'),null,'видео не участвует в аудиоцепочке');

console.log('PASS: «далее» идёт по отображаемому порядку, пропускает невоспроизводимое и исчезает на последнем выпуске');
