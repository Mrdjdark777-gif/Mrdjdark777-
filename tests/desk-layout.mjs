#!/usr/bin/env node
/**
 * Слушатель на ПК — концепция «Студия звука» (владелец выбрал 8 октября).
 *
 * На ПК слушатель видел телефонную раскладку, растянутую на монитор:
 * узкая колонка посередине, обрезанная карусель, телефонный плеер на весь
 * экран. Теперь у ПК свой каркас: боковое меню, верхняя строка с поиском,
 * баннер с постером, полки выпусков, плеер полосой внизу.
 *
 * Проверяется на настоящей сборке в Chromium, 1280×800 — 2560×1440:
 * - каркас .is-desk, меню слева (первая — «Главная»), нижней панели нет;
 * - нигде нет прокрутки вбок и ничего не уходит за край;
 * - постер в баннере целиком: своя пропорция, в границах баннера;
 * - полка — один ряд плиток;
 * - поиск сверху ищет по всем разделам и возвращает главную, когда стёрт;
 * - плеер: полоса внизу во всю ширину, меню над ней не заходит под неё;
 *   развёрнутый — обложка слева от названия; Escape сворачивает;
 * - телефон и сенсорный планшет этот каркас не получают.
 *
 * Всё — во временной базе; рабочие данные не трогаются.
 */
import {chromium} from 'playwright';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=process.cwd(),dir=await mkdtemp(path.join(root,'.test-tmp-desk-'));
const env={...process.env,DATABASE_PATH:path.join(dir,'db.sqlite'),STORAGE_DIR:path.join(dir,'storage'),THUMB_DIR:path.join(dir,'thumbs'),LIVE_DIR:path.join(dir,'live'),SESSION_SECRET:'chk-secret-not-production',ADMIN_PASSWORD:'chk-password',FIREBASE_SERVICE_ACCOUNT_FILE:'',PUBLIC_SITE_URL:''};
execFileSync(process.execPath,['node_modules/drizzle-kit/bin.cjs','migrate'],{env,stdio:'ignore'});
const port=3263,base='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env,stdio:['ignore','ignore','inherit']});
let browser;
const problems=[];const check=(ok,msg)=>{if(!ok)problems.push(msg);};
try{
 for(let i=0;i<80;i++){try{await fetch(base+'/api/health');break;}catch{await new Promise(r=>setTimeout(r,250));}}
 const login=await fetch(base+'/api/auth',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:'chk-password'})});
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const post=async d=>{const r=await fetch(base+'/api/library',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify(d)});const t=await r.text();assert.equal(r.status,200,t);return JSON.parse(t);};
 await post({action:'setup'});
 await post({action:'donations',links:[{kind:'boosty',url:'https://boosty.to/truethrills'}]});
 await post({action:'links',links:[{kind:'youtube',url:'https://youtube.com/@truethrills'},{kind:'telegram',url:'https://t.me/truethrills'}]});
 const cover=async f=>{const b=await readFile(path.join(root,'tests/fixtures/demo-covers',f));return (await (await fetch(base+'/api/cover',{method:'POST',headers:{cookie,'content-type':'image/jpeg','x-upload-size':String(b.length)},body:b})).json()).key;};
 const seconds=6,rate=8000,wav=Buffer.alloc(44+rate*2*seconds);
 wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
 for(let i=0;i<rate*seconds;i++)wav.writeInt16LE(Math.round(Math.sin(i/9)*9000),44+i*2);
 const audio=async()=>(await (await fetch(base+'/api/audio',{method:'POST',headers:{cookie,'content-type':'audio/wav','x-upload-size':String(wav.length)},body:wav})).json()).key;
 const covers=['tile-forest.jpg','tile-mountains.jpg','tile-waterfall.jpg','tall-lake.jpg'];
 const titles=['Плот','Северный ветер','Тишина','Не конец','Перевал','Ночь под скалой','Последний костёр','Река без имени','Обрыв','Ледник'];
 for(let n=0;n<titles.length;n++)await post({kind:'podcast',audioCategory:['audio_story','podcast','music'][n%3],title:titles[n],description:'Описание выпуска '+n+'.',audioKey:await audio(),duration:seconds,published:true,coverKey:await cover(covers[n%4])});
 await post({kind:'story',title:'Записки из ледяной пустыни',description:'Рассказ.',body:'Текст истории.\n\nВторой абзац.',published:true,coverKey:await cover('tile-mountains.jpg')});
 await post({kind:'video',title:'Наедине с горами',description:'Видео.',videoUrl:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',published:true,coverKey:await cover('tile-waterfall.jpg')});
 const lib=await (await fetch(base+'/api/library',{headers:{cookie}})).json();
 await post({action:'hero',id:lib.items.find(p=>p.title==='Плот').id,key:await cover('hero-lake.jpg')});

 browser=await chromium.launch({executablePath:process.env.TT_BROWSER_EXECUTABLE||undefined});
 const ready=async page=>{await page.waitForLoadState('networkidle').catch(()=>{});await page.waitForFunction(()=>!document.querySelector('.splash'),null,{timeout:15000}).catch(()=>{});await page.waitForTimeout(500);};
 for(const [w,h] of [[1280,800],[1440,900],[1920,1080],[2560,1440]]){
  const at=w+'×'+h+': ';
  const ctx=await browser.newContext({viewport:{width:w,height:h},locale:'ru-RU'});const page=await ctx.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/?mode=listen&view=home');await ready(page);
  await page.waitForFunction(()=>document.querySelector('.desk-banner-art')?.complete,null,{timeout:15000}).catch(()=>{});
  const shell=await page.evaluate(()=>{
   const s=document.querySelector('.app-shell'),rail=document.querySelector('.desk-rail'),nav=document.querySelector('.bottom-nav');
   const r=rail?.getBoundingClientRect();
   return {cls:s?.className??'',rail:r?{left:Math.round(r.left),width:Math.round(r.width),display:getComputedStyle(rail).display}:null,
    items:[...document.querySelectorAll('.desk-nav-item')].map(b=>b.textContent.trim()),
    navShown:!!nav&&getComputedStyle(nav).display!=='none',scroll:document.documentElement.scrollWidth-innerWidth};
  });
  check(/\bis-desk\b/.test(shell.cls)&&!/\bis-listener\b/.test(shell.cls),at+'слушатель на ПК не получил каркас .is-desk: '+shell.cls);
  check(shell.rail&&shell.rail.left===0&&shell.rail.width>=240&&shell.rail.display!=='none',at+'бокового меню слева нет: '+JSON.stringify(shell.rail));
  check(shell.items.length===5&&shell.items[0].startsWith('Главная'),at+'разделы в меню не те или «Главная» не первая: '+shell.items.join(' | '));
  check(!shell.navShown,at+'нижняя телефонная панель разделов видна на ПК');
  // Без каркаса дальше мерить нечего: остальные проверки только упали бы на
  // отсутствующих элементах, а не назвали бы поломку.
  if(!/\bis-desk\b/.test(shell.cls)||!shell.rail){await ctx.close();continue;}
  check(shell.scroll<=1,at+'страница шире окна на '+shell.scroll+'px');
  // Ничего не уходит за правый край окна (кроме ушедших в скрытые ряды плиток).
  const over=await page.evaluate(()=>[...document.querySelectorAll('.app-shell *')].filter(el=>{const b=el.getBoundingClientRect();return b.width>0&&b.height>0&&b.right>innerWidth+1&&!el.closest('.desk-row,.desk-banner');}).slice(0,3).map(el=>el.className||el.tagName));
  check(over.length===0,at+'за правым краем: '+over.join(', '));
  // Постер целиком: своя пропорция и в границах баннера.
  const banner=await page.evaluate(()=>{const b=document.querySelector('.desk-banner'),img=b?.querySelector('img.desk-banner-art');if(!b||!img)return null;
   const br=b.getBoundingClientRect(),ir=img.getBoundingClientRect();
   return {natural:img.naturalWidth/img.naturalHeight,shown:ir.width/ir.height,inside:ir.left>=br.left-1&&ir.right<=br.right+1&&ir.top>=br.top-1&&ir.bottom<=br.bottom+1,fit:getComputedStyle(img).objectFit,h:Math.round(br.height)};});
  check(banner,at+'на главной нет баннера с постером');
  if(banner){check(Math.abs(banner.shown-banner.natural)/banner.natural<0.02&&banner.fit!=='cover',at+'постер в баннере искажён или обрезан: пропорция '+banner.shown.toFixed(3)+' вместо '+banner.natural.toFixed(3)+', object-fit '+banner.fit);
   check(banner.inside,at+'постер вылез за баннер');check(banner.h>=280&&banner.h<=0.62*h,at+'баннер высотой '+banner.h+' при экране '+h);}
  // Полки — по одному ряду.
  const rows=await page.evaluate(()=>[...document.querySelectorAll('.desk-row')].map(r=>{const tops=[...r.children].map(c=>c.getBoundingClientRect()).filter(b=>b.height>0).map(b=>Math.round(b.top));return {n:tops.length,total:r.children.length,rows:new Set(tops).size};}));
  check(rows.length>=2,at+'на главной меньше двух полок: '+rows.length);
  for(const r of rows)check(r.rows===1&&r.n>=Math.min(4,r.total),at+'полка не в один ряд или в ней меньше четырёх плиток: '+JSON.stringify(r));
  // Строка поиска на одной линии с содержимым.
  const align=await page.evaluate(()=>({search:Math.round(document.querySelector('.desk-search')?.getBoundingClientRect().left??-1),main:Math.round(document.querySelector('.desk-home')?.getBoundingClientRect().left??-999)}));
  check(Math.abs(align.search-align.main)<=2,at+'поиск и содержимое начинаются с разных мест: '+align.search+' и '+align.main);
  if(w===1440){
   // Поиск по всем разделам.
   await page.fill('.desk-search input','ледян');await page.waitForTimeout(300);
   const found=await page.evaluate(()=>({titles:[...document.querySelectorAll('.desk-results .desk-tile strong')].map(e=>e.textContent),home:!!document.querySelector('.desk-home')&&getComputedStyle(document.querySelector('.desk-home')).display!=='none'}));
   check(found.titles.length===1&&found.titles[0]==='Записки из ледяной пустыни'&&!found.home,at+'поиск сверху нашёл не то или главная не ушла: '+JSON.stringify(found));
   await page.fill('.desk-search input','');await page.waitForTimeout(300);
   check(await page.locator('.desk-home').isVisible(),at+'после очистки поиска главная не вернулась');
   // Плеер: полоса внизу, меню над ней.
   await page.locator('.desk-shelf',{has:page.locator('h2',{hasText:'Аудио'})}).locator('.desk-tile').first().click();
   await page.waitForTimeout(1200);
   const open=await page.evaluate(()=>{const p=document.querySelector('.desk-player-open'),c=p?.querySelector('.player-cover-frame')?.getBoundingClientRect(),t=p?.querySelector('.player-title')?.getBoundingClientRect();return {open:!!p,coverLeft:c?c.right<=t.left:false};});
   check(open.open,at+'развёрнутый плеер ПК не открылся');check(open.coverLeft,at+'в развёрнутом плеере обложка не слева от названия');
   await page.keyboard.press('Escape');await page.waitForTimeout(600);
   const bar=await page.evaluate(()=>{const b=document.querySelector('.desk-player-bar')?.getBoundingClientRect(),r=document.querySelector('.desk-rail').getBoundingClientRect();
    return b?{left:Math.round(b.left),right:Math.round(b.right),bottom:Math.round(b.bottom),h:Math.round(b.height),railBottom:Math.round(r.bottom),
     toggle:!!document.querySelector('.desk-player-bar .podcast-toggle'),slider:!!document.querySelector('.desk-player-bar [role=slider]')}:null;});
   check(bar,at+'после Escape плеер не свернулся в полосу');
   if(bar){check(bar.left===0&&bar.right===w&&bar.bottom===h,at+'полоса плеера не во всю ширину внизу: '+JSON.stringify(bar));
    check(bar.railBottom<=h-bar.h+1,at+'боковое меню заходит под полосу плеера: низ меню '+bar.railBottom+', верх полосы '+(h-bar.h));
    check(bar.toggle&&bar.slider,at+'в полосе плеера нет кнопки воспроизведения или полосы времени');}
  }
  check(errors.length===0,at+'ошибки страницы: '+errors.join('; '));
  await ctx.close();
 }
 // Телефон и сенсорный планшет — без каркаса ПК.
 for(const [w,h,label] of [[390,844,'телефон'],[1280,800,'планшет']]){
  const ctx=await browser.newContext({viewport:{width:w,height:h},isMobile:true,hasTouch:true,locale:'ru-RU'});const page=await ctx.newPage();
  await page.goto(base+'/?mode=listen&view=home');await ready(page);
  const s=await page.evaluate(()=>({cls:document.querySelector('.app-shell')?.className??'',rail:!!document.querySelector('.desk-rail'),home:!!document.querySelector('.desk-home')}));
  check(/\bis-listener\b/.test(s.cls)&&!s.rail&&!s.home,label+' получил каркас ПК: '+JSON.stringify(s));
  await ctx.close();
 }
 assert.deepEqual(problems,[],'\n'+problems.join('\n'));
 console.log('PASS: ПК 1280–2560 — каркас «Студия звука»: меню слева, без прокрутки вбок, постер целиком, полки в один ряд, поиск по всем разделам, плеер полосой внизу и развёрнутый с обложкой слева; телефон и планшет — без каркаса ПК');
}finally{await browser?.close();server.kill();await rm(dir,{recursive:true,force:true});}
