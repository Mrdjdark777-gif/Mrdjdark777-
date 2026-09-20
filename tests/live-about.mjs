#!/usr/bin/env node
/**
 * Описание эфира на экране слушателя.
 *
 * Оно стоит сразу под названием и должно читаться целиком. В колонке экрана
 * эфира описание однажды уже сжало соседями: текст обрезало по половине
 * строки, и выглядело это как «описание уехало вниз». Проверяем на живой
 * раскладке: место в колонке, читаемая высота и отсутствие обрезки.
 */
import {chromium} from 'playwright';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(),dir=await mkdtemp(path.join(root,'.test-tmp-about-'));
const env={...process.env,DATABASE_PATH:path.join(dir,'db.sqlite'),STORAGE_DIR:path.join(dir,'storage'),LIVE_DIR:path.join(dir,'live'),SESSION_SECRET:'about-secret-about-secret-about-secret',ADMIN_PASSWORD:'about-password',FIREBASE_SERVICE_ACCOUNT_FILE:'',PUBLIC_SITE_URL:'',LIVE_ENABLED:'true'};
execFileSync(process.execPath,['node_modules/drizzle-kit/bin.cjs','migrate'],{env,stdio:'ignore'});
const port=3319,base='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env,stdio:['ignore','ignore','inherit']});
let browser;
const NOTE='Сегодня о дорогах, которые не заканчиваются там, где кончается асфальт, и о людях, которые идут дальше.';
try{
 for(let i=0;i<80;i++){try{await fetch(base+'/api/health');break;}catch{await new Promise(r=>setTimeout(r,250));}}
 const login=await fetch(base+'/api/auth',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:'about-password'})});
 const cookie=login.headers.get('set-cookie').split(';')[0];
 await fetch(base+'/api/library',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({action:'setup'})});
 // Идущий эфир с описанием: такую же строку создаёт запуск из студии.
 execFileSync(process.execPath,['-e',"const Database=require('better-sqlite3');const db=new Database(process.argv[1]);const owner=db.prepare(\"select value from settings where key='owner'\").get().value;db.prepare('insert into broadcasts (id,title,owner_id,heartbeat,active,description) values (?,?,?,?,1,?)').run('about-live','Ночной разговор',owner,Date.now(),process.argv[2]);",path.join(dir,'db.sqlite'),NOTE],{stdio:'inherit'});
 browser=await chromium.launch({executablePath:process.env.TT_BROWSER_EXECUTABLE});
 const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 const page=await ctx.newPage();
 await page.goto(base+'/?mode=listen&view=live');
 await page.waitForTimeout(2500);
 const box=await page.evaluate(()=>{
  const pick=s=>{const el=document.querySelector(s);if(!el)return null;const r=el.getBoundingClientRect();
   const style=getComputedStyle(el);
   return {top:Math.round(r.top),bottom:Math.round(r.bottom),h:Math.round(r.height),
    scroll:el.scrollHeight,client:el.clientHeight,line:parseFloat(style.lineHeight)||0,text:el.textContent.trim()};};
  return {name:pick('.live-stage-name'),about:pick('.live-stage-about'),clock:pick('.live-stage-clock'),cta:pick('.live-cta')};
 });
 assert.ok(box.about,'описание эфира должно быть на экране слушателя');
 assert.ok(box.about.text.startsWith('Сегодня о дорогах'),'на экране должно быть описание автора, а не что-то другое');
 assert.ok(box.name,'у эфира должно быть название');
 // Описание идёт сразу за названием, а не уезжает под кнопку.
 assert.ok(box.about.top>=box.name.bottom,'описание должно стоять под названием');
 assert.ok(box.about.top-box.name.bottom<=40,'между названием и описанием провал '+(box.about.top-box.name.bottom)+'px');
 if(box.cta)assert.ok(box.about.bottom<=box.cta.top,'описание не должно оказаться ниже кнопки эфира');
 // Высота честная: текст не срезан по половине строки.
 assert.ok(box.about.line>0,'у описания должен быть межстрочный интервал');
 const lines=box.about.client/box.about.line;
 assert.ok(lines>=1,'описание сжали до '+box.about.client+'px при строке '+box.about.line+'px');
 assert.ok(Math.abs(lines-Math.round(lines))<0.25,'описание обрезано по половине строки: '+box.about.client+'px при строке '+box.about.line+'px');
 assert.ok(box.about.client>=box.about.line*2-1,'описание должно показывать хотя бы две строки, а показывает '+box.about.client+'px');
 // Низкий экран: колонка переполнена, и соседи начинают давить. Именно так
 // описание однажды и срезало — по половине строки.
 await page.setViewportSize({width:390,height:520});
 await page.waitForTimeout(600);
 const tight=await page.evaluate(()=>{const el=document.querySelector('.live-stage-about');if(!el)return null;
  const style=getComputedStyle(el);return {client:el.clientHeight,line:parseFloat(style.lineHeight)||0};});
 assert.ok(tight,'на низком экране описание пропало');
 const tightLines=tight.client/tight.line;
 assert.ok(tightLines>=1,'на низком экране описание сжали до '+tight.client+'px при строке '+tight.line+'px');
 assert.ok(Math.abs(tightLines-Math.round(tightLines))<0.25,'на низком экране описание срезано по половине строки: '+tight.client+'px при строке '+tight.line+'px');
 console.log('PASS: описание эфира стоит под названием, не сжимается соседями и не режется по половине строки даже на низком экране');
}finally{if(browser)await browser.close();server.kill();await rm(dir,{recursive:true,force:true});}
