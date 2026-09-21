#!/usr/bin/env node
/**
 * Записи эфиров в студии: прослушать, скачать, удалить.
 *
 * Скачивание было с самого начала, а прослушать и удалить было нечем — список
 * копился, в том числе записями, чьи выпуски автор уже удалил. Проверяем весь
 * путь: строка появляется, у готовой записи есть кнопки, удаление убирает её и
 * из базы, а выпуск в подкастах после этого остаётся на месте.
 */
import {chromium} from 'playwright';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,rm,copyFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(),dir=await mkdtemp(path.join(root,'.test-tmp-archives-'));
const env={...process.env,DATABASE_PATH:path.join(dir,'db.sqlite'),STORAGE_DIR:path.join(dir,'storage'),LIVE_DIR:path.join(dir,'live'),SESSION_SECRET:'archives-secret-not-production',ADMIN_PASSWORD:'archives-password',FIREBASE_SERVICE_ACCOUNT_FILE:'',PUBLIC_SITE_URL:''};
execFileSync(process.execPath,['node_modules/drizzle-kit/bin.cjs','migrate'],{env,stdio:'ignore'});
const port=3317,base='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env,stdio:['ignore','ignore','inherit']});
let browser;
try{
 for(let i=0;i<80;i++){try{await fetch(base+'/api/health');break;}catch{await new Promise(r=>setTimeout(r,250));}}
 const login=await fetch(base+'/api/auth',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:'archives-password'})});
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const post=d=>fetch(base+'/api/library',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify(d)}).then(async r=>JSON.parse(await r.text()));
 await post({action:'setup'});
 const seconds=6,rate=44100,wav=Buffer.alloc(44+rate*2*seconds);
 wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
 for(let i=0;i<rate*seconds;i++)wav.writeInt16LE(Math.round(Math.sin(2*Math.PI*180*i/rate)*12000),44+i*2);
 const up=await fetch(base+'/api/audio',{method:'POST',headers:{cookie,'content-type':'audio/wav','x-upload-size':String(wav.length)},body:wav});
 const audioKey=(await up.json()).key;
 const archiveKey='audio/live-'+crypto.randomUUID();
 await copyFile(path.join(env.STORAGE_DIR,audioKey),path.join(env.STORAGE_DIR,archiveKey));
 await copyFile(path.join(env.STORAGE_DIR,audioKey+'.meta.json'),path.join(env.STORAGE_DIR,archiveKey+'.meta.json')).catch(()=>{});
 const created=await post({kind:'podcast',title:'Запись эфира',description:'Тест',audioKey:archiveKey,published:true});
 const postId=(created.item||created.post||created).id;
 // Готовая запись эфира в базе: воркер создаёт такую же после обработки.
 const id=crypto.randomUUID();
 execFileSync(process.execPath,['-e',"const Database=require('better-sqlite3');const db=new Database(process.argv[1]);const owner=db.prepare(\"select value from settings where key='owner'\").get().value;db.prepare('insert into live_recordings (id,owner_id,title,state,created_at,updated_at,next_sequence,bytes,post_id) values (?,?,?,?,?,?,?,?,?)').run(process.argv[2],owner,'Тестовый эфир','ready',Date.now(),Date.now(),3,1000,process.argv[3]);",path.join(dir,'db.sqlite'),id,postId],{stdio:'inherit'});
 browser=await chromium.launch({executablePath:process.env.TT_BROWSER_EXECUTABLE});
 const ctx=await browser.newContext({viewport:{width:1600,height:1000}});
 const page=await ctx.newPage();
 await page.goto(base+'/login');await page.fill('input[type=password]','archives-password');await page.press('input[type=password]','Enter');
 await page.waitForTimeout(1500);
 await page.goto(base+'/?view=live');await page.waitForTimeout(2000);
 await page.evaluate(()=>{const d=document.querySelector('.live-archives');if(d)d.open=true;});
 await page.waitForTimeout(600);
 assert.equal(await page.locator('.live-archives article').count(),1,'запись эфира должна быть в списке');
 assert.equal(await page.locator('.archive-actions button:has-text("Прослушать")').count(),1,'у готовой записи должна быть кнопка прослушивания');
 assert.equal(await page.locator('.archive-actions a:has-text("Скачать")').count(),1,'скачивание должно остаться');
 assert.equal(await page.locator('.archive-actions .archive-danger').count(),1,'у записи должна быть кнопка удаления');
 // Обложка — картинка в пропорции 4:5, а не растянутая на всю строку полоса:
 // общее правило для span однажды уже победило её собственное flex:none.
 const art=await page.evaluate(()=>{const el=document.querySelector('.live-archives .archive-cover');if(!el)return null;
  const r=el.getBoundingClientRect();const img=el.querySelector('img');const i=img&&img.getBoundingClientRect();
  return {w:Math.round(r.width),h:Math.round(r.height),fit:img?getComputedStyle(img).objectFit:'',iw:i?Math.round(i.width):0};});
 assert.ok(art,'у записи должна быть обложка');
 assert.ok(art.w<=140,'обложка растянулась на '+art.w+'px вместо миниатюры');
 assert.ok(art.w>=70,'обложка в студии меньше пригодного размера: '+art.w+'px');
 // На высоком мониторе обложка крупнее: ужимается она только там, где иначе
 // страница эфира не помещается целиком.
 await page.setViewportSize({width:1600,height:1300});await page.waitForTimeout(400);
 const big=await page.evaluate(()=>Math.round(document.querySelector('.live-archives .archive-cover').getBoundingClientRect().width));
 assert.ok(big>=85,'на высоком мониторе обложка записи должна быть крупнее, а она '+big+'px');
 await page.setViewportSize({width:1600,height:1000});await page.waitForTimeout(400);
 assert.ok(art.h>art.w,'обложка должна быть вертикальной 4:5, а не квадратом: '+art.w+'×'+art.h);
 assert.equal(art.fit,'contain','обложку нельзя обрезать: object-fit '+art.fit);
 // Описание эфира видно в строке, а состояние не отсылает в подкасты.
 assert.equal(await page.locator('.archive-about').first().innerText(),'Тест','в строке должно быть описание эфира');
 const meta=await page.locator('.archive-meta').first().innerText();
 assert.ok(!/подкаст/i.test(meta),'состояние записи не должно отсылать в подкасты: '+meta);
 // Панель занимает строку, а не половину экрана.
 const panel=await page.evaluate(()=>Math.round(document.querySelector('.live-archives').getBoundingClientRect().height));
 assert.ok(panel<=230,'панель записей раздулась до '+panel+'px на одну запись');
 // Осиротевшая запись: выпуск в архиве есть, строки эфира уже нет. Автор
 // обязан видеть её и мочь удалить — иначе она вечно висит у слушателя.
 {const orphanKey='audio/live-'+crypto.randomUUID();
  await copyFile(path.join(env.STORAGE_DIR,audioKey),path.join(env.STORAGE_DIR,orphanKey));
  await copyFile(path.join(env.STORAGE_DIR,audioKey+'.meta.json'),path.join(env.STORAGE_DIR,orphanKey+'.meta.json')).catch(()=>{});
  const made=await post({kind:'podcast',title:'Забытая запись',description:'Осталась без строки эфира',audioKey:orphanKey,duration:seconds,published:true});
  assert.ok(!made.error,'не удалось создать осиротевшую запись: '+JSON.stringify(made));
  const orphanId=(made.item||made.post||made).id;
  assert.ok(orphanId,'у созданной записи нет идентификатора: '+JSON.stringify(made));
  await page.reload();await page.waitForTimeout(1500);
  await page.evaluate(()=>{const d=document.querySelector('.live-archives');if(d)d.open=true;});
  await page.waitForTimeout(600);
  const titles=await page.evaluate(()=>[...document.querySelectorAll('.live-archives .archive-copy strong')].map(e=>e.textContent.trim()));
  assert.ok(titles.includes('Забытая запись'),'автор не видит запись, у которой осталась только публикация: '+titles.join(', '));
  const gone=await fetch(base+'/api/live-stream?id='+orphanId+'&remove=1',{method:'POST',headers:{cookie,origin:base}});
  assert.equal(gone.status,200,'осиротевшую запись должно быть можно удалить, а ответ '+gone.status);
  const left=await fetch(base+'/api/library',{headers:{cookie}}).then(r=>r.json());
  assert.ok(!left.items.some(p=>p.id===orphanId),'после удаления осиротевшая запись осталась в библиотеке');
  await page.reload();await page.waitForTimeout(1500);
  await page.evaluate(()=>{const d=document.querySelector('.live-archives');if(d)d.open=true;});
  await page.waitForTimeout(600);}
 // Удаление спрашивает подтверждение, а не срабатывает с первого нажатия.
 await page.locator('.archive-actions .archive-danger').click();await page.waitForTimeout(300);
 assert.equal(await page.locator('.archive-ask').count(),1,'удаление должно спрашивать подтверждение');
 assert.equal(await page.locator('.live-archives article').count(),1,'до подтверждения запись остаётся');
 await page.locator('.archive-ask .archive-danger').click();await page.waitForTimeout(1500);
 await page.reload();await page.waitForTimeout(1500);
 await page.evaluate(()=>{const d=document.querySelector('.live-archives');if(d)d.open=true;});
 await page.waitForTimeout(500);
 assert.equal(await page.locator('.live-archives article').count(),0,'после подтверждения запись должна исчезнуть');
 // Запись эфира живёт только в архиве, поэтому удаление уносит и выпуск, на
 // котором она держится: иначе автор удалял запись у себя, а у слушателя она
 // оставалась в архиве эфиров.
 const library=await fetch(base+'/api/library',{headers:{cookie}}).then(r=>r.json());
 assert.ok(!library.items.some(p=>p.id===postId),'после удаления записи её выпуск не должен оставаться в библиотеке');
 // То же самое глазами слушателя: архив эфиров пуст.
 const guest=await fetch(base+'/api/library').then(r=>r.json());
 assert.ok(!(guest.items||[]).some(p=>p.id===postId),'удалённая запись осталась видна слушателю');
 const gone=await fetch(base+'/api/live-stream?id='+id+'&remove=1',{method:'POST',headers:{cookie,origin:base}});
 assert.equal(gone.status,400,'повторное удаление той же записи должно отвечать ошибкой, а не молчанием');
 console.log('PASS: записи эфиров — обложка 4:5 без обрезки, описание в строке, компактная панель, прослушивание, скачивание и удаление с подтверждением, которое уносит и выпуск записи у слушателя');
}finally{if(browser)await browser.close();server.kill();await rm(dir,{recursive:true,force:true});}
