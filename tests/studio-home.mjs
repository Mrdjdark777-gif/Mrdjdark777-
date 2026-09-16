import assert from 'node:assert/strict';
import {build} from 'esbuild';
const {outputFiles}=await build({stdin:{contents:"export * from './lib/studio-home';",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node'});
const {workbench,DRAFT_LIMIT,PUBLISHED_LIMIT}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const item=(id,published,createdAt,kind='podcast')=>({id,kind,title:'Выпуск '+id,published,createdAt});

assert.deepEqual(workbench([]),{drafts:[],published:[],draftCount:0},'пусто — ничего не выдумываем');

const w=workbench([item('a',false,10),item('b',true,30),item('c',false,20),item('d',true,5)]);
assert.deepEqual(w.drafts.map(p=>p.id),['c','a'],'черновики от новых к старым');
assert.deepEqual(w.published.map(p=>p.id),['b','d'],'опубликованные от новых к старым');
assert.equal(w.draftCount,2);

// published приходит числом из SQLite — 0 и 1 должны читаться так же, как false и true.
const sqlite=workbench([item('x',0,1),item('y',1,2)]);
assert.deepEqual(sqlite.drafts.map(p=>p.id),['x'],'ноль — это черновик');
assert.deepEqual(sqlite.published.map(p=>p.id),['y'],'единица — это публикация');

const big=workbench(Array.from({length:9},(_,i)=>item('d'+i,false,i)));
assert.equal(big.drafts.length,DRAFT_LIMIT,'список черновиков ограничен');
assert.equal(big.draftCount,9,'счётчик видит все черновики, а не только показанные');
assert.equal(big.drafts[0].id,'d8','первым идёт самый свежий');
assert.equal(workbench(Array.from({length:7},(_,i)=>item('p'+i,true,i))).published.length,PUBLISHED_LIMIT);

const original=[item('x',true,1),item('y',false,9)];workbench(original);
assert.deepEqual(original.map(p=>p.id),['x','y'],'исходный список не переставлен: он рисует остальные экраны');

console.log('PASS: главная студии — черновики, последние публикации, число из SQLite, пределы списков и сохранность порядка.');
