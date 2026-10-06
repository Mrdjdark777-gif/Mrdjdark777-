/**
 * Лёгкий каталог (аудит 6 октября, п. 6).
 *
 * Публичный список /api/library отдавал все опубликованные записи вместе с
 * полным текстом историй, а студия опрашивает его раз в 15 секунд: десять
 * историй по 150 000 знаков — около трёх мегабайт JSON на каждый опрос.
 * Теперь список несёт только начало текста (excerpt), а целиком история
 * приходит по /api/library?id=… — когда её открывают читать или править.
 *
 * Проверяется на настоящем маршруте (esbuild-сборка, временная база):
 * - в списке нет body ни у слушателя, ни у автора; у историй есть excerpt;
 * - десять предельных историй — меньше 64 КБ списка (было около 3 МБ);
 * - запись по id приходит с полным текстом; черновик чужому — 404, автору — да;
 * - неизвестный id — 404.
 */
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.cwd(),dir=await mkdtemp(path.join(root,'.test-tmp-light-'));
process.env.NODE_ENV='test';process.env.DATABASE_PATH=path.join(dir,'db.sqlite');
process.env.STORAGE_DIR=path.join(dir,'storage');process.env.THUMB_DIR=path.join(dir,'thumbs');
process.env.SESSION_SECRET='library-light-secret-0123456789abcdef';
let db;
try{
 execFileSync('npx',['drizzle-kit','migrate'],{stdio:'ignore'});
 const outfile=path.join(dir,'routes.mjs');
 await build({stdin:{contents:`export * as library from './app/api/library/route.ts';export * as session from './lib/auth.ts';export {getDb} from './db/index.ts';`,resolveDir:root},outfile,bundle:true,format:'esm',platform:'node',packages:'external',tsconfig:'tsconfig.json'});
 const m=await import(pathToFileURL(outfile).href);db=m.getDb().$client;
 const origin='https://light.test',cookie=m.session.createSessionCookie(new Request(origin)).split(';')[0];
 const post=d=>m.library.POST(new Request(origin+'/api/library',{method:'POST',body:JSON.stringify(d),headers:{host:'light.test','content-type':'application/json',cookie}}));
 const get=async(q='',owner=false)=>{const r=await m.library.GET(new Request(origin+'/api/library'+q,{headers:{host:'light.test',...(owner?{cookie}:{})}}));return {status:r.status,text:await r.text()};};
 assert.equal((await post({action:'setup'})).status,200);
 const body=i=>('История '+i+'. ').padEnd(150000,'Ж');
 for(let i=0;i<10;i++)assert.equal((await post({kind:'story',title:'История '+i,body:body(i),published:true})).status,200);
 assert.equal((await post({kind:'story',title:'Черновик',body:'Секретный текст черновика.',published:false})).status,200);
 const ids=Object.fromEntries(db.prepare('SELECT title,id FROM posts').all().map(r=>[r.title,r.id]));

 for(const owner of [false,true]){
  const who=owner?'автор':'слушатель',list=await get('',owner);
  assert.equal(list.status,200);
  const items=JSON.parse(list.text).items;
  assert.ok(items.every(p=>!('body' in p)),who+': в списке каталога снова полный текст историй');
  const first=items.find(p=>p.title==='История 3');
  assert.equal(first.excerpt,body(3).slice(0,160),who+': у истории в списке нет начала текста для карточки');
  assert.ok(list.text.length<64*1024,who+': список каталога с десятью длинными историями весит '+list.text.length+' байт — текст всё ещё едет целиком');
  assert.equal(items.some(p=>p.title==='Черновик'),owner,who+': черновик в списке '+(owner?'не виден автору':'виден слушателю'));
 }
 const one=await get('?id='+ids['История 3']);
 assert.equal(one.status,200);
 assert.equal(JSON.parse(one.text).item.body,body(3),'история по id пришла не целиком');
 assert.equal((await get('?id='+ids['Черновик'])).status,404,'черновик по id отдан слушателю');
 assert.equal(JSON.parse((await get('?id='+ids['Черновик'],true)).text).item.body,'Секретный текст черновика.','автор не получил свой черновик по id');
 assert.equal((await get('?id=nope')).status,404);
 console.log('PASS library light: список без текстов (только начало), десять длинных историй — меньше 64 КБ; история целиком по id; черновик — только автору');
}finally{db?.close();await rm(dir,{recursive:true,force:true});}
