import assert from 'node:assert/strict';
import {build} from 'esbuild';
const {outputFiles}=await build({stdin:{contents:"export * from './lib/studio-home';",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node'});
const {workbench,DRAFT_LIMIT,PUBLISHED_LIMIT}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const item=(id,published,createdAt,kind='podcast')=>({id,kind,title:'Выпуск '+id,published,createdAt});

// Пусто — не падаем и ничего не выдумываем.
assert.deepEqual(workbench([]),{drafts:[],published:[],draftCount:0});

// Черновики и публикации разделены и идут от новых к старым.
const mixed=[item('a',false,10),item('b',true,30),item('c',false,20),item('d',true,5)];
const w=workbench(mixed);
assert.deepEqual(w.drafts.map(p=>p.id),['c','a'],'черновики от новых к старым');
assert.deepEqual(w.published.map(p=>p.id),['b','d'],'опубликованные от новых к старым');
assert.equal(w.draftCount,2);

// Счётчик считает все черновики, а список показывает только первые.
const many=Array.from({length:9},(_,i)=>item('d'+i,false,i));
const big=workbench(many);
assert.equal(big.drafts.length,DRAFT_LIMIT,'список черновиков ограничен');
assert.equal(big.draftCount,9,'счётчик видит все черновики, а не только показанные');
assert.equal(big.drafts[0].id,'d8','первым идёт самый свежий черновик');

const pub=workbench(Array.from({length:7},(_,i)=>item('p'+i,true,i)));
assert.equal(pub.published.length,PUBLISHED_LIMIT);
assert.equal(pub.draftCount,0);

// Исходный массив не переставляется: он же рисует остальные экраны.
const original=[item('x',true,1),item('y',false,9)];
workbench(original);
assert.deepEqual(original.map(p=>p.id),['x','y'],'исходный список остался в своём порядке');

console.log('PASS: главная студии — черновики, последние публикации, пределы списков и сохранность исходного порядка.');
