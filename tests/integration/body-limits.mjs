/**
 * Пределы тел небольших запросов (аудит 6 октября, п. 8).
 *
 * Раньше вход, уведомления, библиотека и эфир читали тело целиком (req.json),
 * а статистика — req.text(), и только потом что-то проверяли; nginx при этом
 * пропускает до 320M — это предел для аудио. Теперь тело читается потоком и
 * обрывается на пределе: и по заявленному размеру, и по настоящему, если
 * размер не заявлен или заявлен ложно.
 *
 * Проверяется на настоящих маршрутах (esbuild-сборка, временная база):
 * - лишнее отбивается кодом 413 и ключом #err.requestTooLarge на каждом
 *   маршруте, в том числе потоком без Content-Length;
 * - обычные запросы проходят как раньше;
 * - история автора на 150 000 кириллических знаков сохраняется, а тот же
 *   объём от не-автора отбивается до разбора.
 */
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.cwd(),dir=await mkdtemp(path.join(root,'.test-tmp-body-'));
process.env.NODE_ENV='test';process.env.DATABASE_PATH=path.join(dir,'db.sqlite');
process.env.STORAGE_DIR=path.join(dir,'storage');process.env.THUMB_DIR=path.join(dir,'thumbs');
process.env.SESSION_SECRET='body-limit-secret-0123456789abcdef';process.env.ADMIN_PASSWORD='body-limit-password';
let db;
try{
 execFileSync('npx',['drizzle-kit','migrate'],{stdio:'ignore'});
 const outfile=path.join(dir,'routes.mjs');
 await build({stdin:{contents:`export * as library from './app/api/library/route.ts';export * as auth from './app/api/auth/route.ts';export * as usage from './app/api/usage/route.ts';export * as notifications from './app/api/notifications/route.ts';export * as live from './app/api/live/route.ts';export * as session from './lib/auth.ts';export {getDb} from './db/index.ts';`,resolveDir:root},outfile,bundle:true,format:'esm',platform:'node',packages:'external',tsconfig:'tsconfig.json'});
 const m=await import(pathToFileURL(outfile).href);db=m.getDb().$client;
 const origin='https://limits.test',cookie=m.session.createSessionCookie(new Request(origin)).split(';')[0];
 const req=(url,{body,headers={},owner=true}={})=>new Request(origin+url,{method:'POST',body,duplex:'half',headers:{host:'limits.test','content-type':'application/json',...(owner?{cookie}:{}),...headers}});
 assert.equal((await m.library.POST(req('/api/library',{body:JSON.stringify({action:'setup'})}))).status,200);
 // Поток без Content-Length: размер узнаётся только по ходу чтения.
 const stream=(bytes)=>{let sent=0;return new ReadableStream({pull(c){if(sent>=bytes){c.close();return;}const n=Math.min(65536,bytes-sent);sent+=n;c.enqueue(new Uint8Array(n).fill(0x20));}});};
 const big=JSON.stringify({action:'x',pad:'a'.repeat(40*1024)});
 const tooLarge=async(name,res)=>{const r=await res;assert.equal(r.status,413,name+': лишнее не отбито кодом 413, а '+r.status);assert.equal((await r.json()).error,'#err.requestTooLarge',name+': не тот ключ ошибки');};
 await tooLarge('вход',m.auth.POST(req('/api/auth',{body:big,owner:false})));
 await tooLarge('вход, поток без размера',m.auth.POST(req('/api/auth',{body:stream(5*1024*1024),owner:false})));
 await tooLarge('вход, заявлен ложный малый размер',m.auth.POST(req('/api/auth',{body:stream(64*1024),owner:false,headers:{'content-length':'10'}})));
 await tooLarge('уведомления',m.notifications.POST(req('/api/notifications',{body:big,owner:false})));
 await tooLarge('эфир',m.live.POST(req('/api/live',{body:JSON.stringify({action:'join',pad:'a'.repeat(100*1024)}),owner:false})));
 await tooLarge('статистика',m.usage.POST(req('/api/usage',{body:stream(64*1024),owner:false})));
 await tooLarge('библиотека, не автор',m.library.POST(req('/api/library',{body:big,owner:false})));
 await tooLarge('библиотека, автор, больше мегабайта',m.library.POST(req('/api/library',{body:stream(2*1024*1024)})));
 // Обычное проходит как раньше.
 const wrong=await m.auth.POST(req('/api/auth',{body:JSON.stringify({password:'not-it'}),owner:false}));
 assert.notEqual(wrong.status,413,'обычный вход отбит как слишком большой');
 const bad=await m.auth.POST(req('/api/auth',{body:'{oops',owner:false}));
 assert.equal(bad.status,400,'сломанный JSON — это ошибка запроса 400, а не '+bad.status);
 const usage=await m.usage.POST(req('/api/usage',{body:JSON.stringify({id:'x',session:'00000000-0000-0000-0000-000000000000'}),owner:false}));
 assert.notEqual(usage.status,413,'обычное событие статистики отбито как слишком большое');
 // История автора на предельные 150 000 кириллических знаков (около 300 КБ).
 const body='Ж'.repeat(150000);
 const story=await m.library.POST(req('/api/library',{body:JSON.stringify({kind:'story',title:'Длинная история',body,published:true})}));
 assert.equal(story.status,200,'длинная история автора не сохранилась: '+story.status+' '+JSON.stringify(await story.clone().json()));
 assert.equal(db.prepare("SELECT length(body) n FROM posts WHERE title='Длинная история'").get().n,150000,'текст истории сохранился не целиком');
 console.log('PASS body limits: 413 на входе, уведомлениях, эфире, статистике и библиотеке (по размеру, потоком, при ложном размере); обычные запросы и история автора на 150 000 знаков проходят');
}finally{db?.close();await rm(dir,{recursive:true,force:true});}
