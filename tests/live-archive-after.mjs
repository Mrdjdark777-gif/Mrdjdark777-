#!/usr/bin/env node
/**
 * Архив эфиров до, во время и после эфира.
 *
 * Автор увидел, что во время эфира записи в архиве есть, а когда эфир
 * закончился — архив пуст. Проверяем все три состояния на одном стенде: сами
 * записи от состояния эфира зависеть не должны.
 */
import {chromium} from 'playwright';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,rm,copyFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(),dir=await mkdtemp(path.join(root,'.test-tmp-after-'));
const env={...process.env,DATABASE_PATH:path.join(dir,'db.sqlite'),STORAGE_DIR:path.join(dir,'storage'),LIVE_DIR:path.join(dir,'live'),SESSION_SECRET:'after-secret-not-production',ADMIN_PASSWORD:'after-password',FIREBASE_SERVICE_ACCOUNT_FILE:'',PUBLIC_SITE_URL:'',LIVE_ENABLED:'true'};
execFileSync(process.execPath,['node_modules/drizzle-kit/bin.cjs','migrate'],{env,stdio:'ignore'});
const port=3323,base='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env,stdio:['ignore','ignore','inherit']});
let browser,worker;
const rows=async page=>{
 await page.goto(base+'/?mode=listen&view=live');await page.waitForTimeout(1800);
 if(!await page.locator('.live-archive-list').count())await page.locator('.live-archive-card').click();
 await page.waitForTimeout(500);
 return page.evaluate(()=>({n:document.querySelectorAll('.live-archive-row').length,
  empty:document.querySelector('.live-archive-empty')?.textContent.trim()||''}));
};
try{
 for(let i=0;i<80;i++){try{await fetch(base+'/api/health');break;}catch{await new Promise(r=>setTimeout(r,250));}}
 const login=await fetch(base+'/api/auth',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:'after-password'})});
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const api=(path,body)=>fetch(base+'/api/'+path,{method:'POST',headers:{cookie,'content-type':'application/json',origin:base},body:JSON.stringify(body)}).then(async r=>({status:r.status,body:await r.text()}));
 await api('library',{action:'setup'});
 // Две готовые записи эфиров — такие же, какие оставляет воркер.
 const seconds=6,rate=44100,wav=Buffer.alloc(44+rate*2*seconds);
 wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(rate*2*seconds,40);
 for(let i=0;i<rate*seconds;i++)wav.writeInt16LE(Math.round(Math.sin(2*Math.PI*180*i/rate)*12000),44+i*2);
 const up=await fetch(base+'/api/audio',{method:'POST',headers:{cookie,'content-type':'audio/wav','x-upload-size':String(wav.length)},body:wav});
 const audioKey=(await up.json()).key;
 for(const title of ['Первая запись','Вторая запись']){
  const key='audio/live-'+crypto.randomUUID();
  await copyFile(path.join(env.STORAGE_DIR,audioKey),path.join(env.STORAGE_DIR,key));
  await copyFile(path.join(env.STORAGE_DIR,audioKey+'.meta.json'),path.join(env.STORAGE_DIR,key+'.meta.json')).catch(()=>{});
  await api('library',{kind:'podcast',title,description:'Тест',audioKey:key,duration:seconds,published:true});
 }
 // Запуск эфира требует живого воркера записи — он же потом делает выпуск.
 worker=spawn(process.execPath,[path.join(root,'scripts/live-worker.mjs')],{env,stdio:['ignore','ignore','ignore']});
 await new Promise(r=>setTimeout(r,1500));
 browser=await chromium.launch({executablePath:process.env.TT_BROWSER_EXECUTABLE});
 const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 const page=await ctx.newPage();

 const before=await rows(page);
 assert.equal(before.n,2,'до эфира в архиве должны быть обе записи, а их '+before.n+' ('+before.empty+')');

 const started=await api('live',{action:'start',title:'Идёт эфир',transport:'hls',description:'Проверка'});
 assert.equal(started.status,200,'эфир не запустился: '+started.body);
 const during=await rows(page);
 assert.equal(during.n,2,'во время эфира записи пропали: '+during.n+' ('+during.empty+')');
 // Пока эфир идёт, его запись ещё не готова, и архив обязан сказать об этом:
 // иначе после эфира пустая строка читается как «записи пропали».
 const pending=await page.evaluate(()=>[...document.querySelectorAll('.live-archive-empty')].map(e=>e.textContent.trim()).join(' | '));
 assert.ok(/готовится/.test(pending),'архив молчит о том, что запись эфира готовится: '+(pending||'пусто'));

 const live=JSON.parse(started.body).live||JSON.parse(started.body);
 const stopped=await api('live',{action:'stop',id:live.id||'', });
 assert.ok(stopped.status===200||stopped.status===400,'остановка эфира ответила '+stopped.status+': '+stopped.body);
 await new Promise(r=>setTimeout(r,1500));
 const after=await rows(page);
 assert.equal(after.n,2,'после эфира записи исчезли из архива: '+after.n+' ('+after.empty+')');
 console.log('PASS: записи в архиве не зависят от состояния эфира — до, во время и после их одинаково видно, а о незаконченной записи архив говорит прямо');
}finally{if(browser)await browser.close();worker?.kill('SIGTERM');server.kill();await rm(dir,{recursive:true,force:true});}
