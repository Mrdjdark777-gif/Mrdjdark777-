#!/usr/bin/env node
/**
 * Разграничение поверхностей: кто какой каркас получает (docs/design/SURFACES-RU.md).
 *
 * Одна страница обслуживает пять поверхностей: слушатель на телефоне,
 * слушатель на сенсорном планшете, слушатель на ПК (сайт «Студия звука»),
 * автор в студии на ПК (браузер или программа для Windows) и автор с
 * телефона. Поверхности не должны заезжать друг на друга: каркас ПК — только
 * слушателю с мышью, студия — только автору, ссылка «Скачать приложение» —
 * не внутри программы для ПК.
 *
 * Обход: каждая поверхность × каждый раздел (главная, аудио, видео, истории,
 * эфир, настройки). На каждом экране — ожидаемый каркас, нет прокрутки
 * вбок, нет ошибок страницы. На ПК-слушателе — окна поверх каркаса
 * (читалка, видео, поддержка) лежат над боковым меню и закрываются.
 *
 * Всё — во временной базе; рабочие данные не трогаются.
 */
import {chromium} from 'playwright';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=process.cwd(),dir=await mkdtemp(path.join(root,'.test-tmp-surf-'));
const env={...process.env,DATABASE_PATH:path.join(dir,'db.sqlite'),STORAGE_DIR:path.join(dir,'storage'),THUMB_DIR:path.join(dir,'thumbs'),LIVE_DIR:path.join(dir,'live'),SESSION_SECRET:'chk-secret-not-production',ADMIN_PASSWORD:'chk-password',FIREBASE_SERVICE_ACCOUNT_FILE:'',PUBLIC_SITE_URL:''};
execFileSync(process.execPath,['node_modules/drizzle-kit/bin.cjs','migrate'],{env,stdio:'ignore'});
const port=3267,base='http://127.0.0.1:'+port;
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
 await post({action:'links',links:[{kind:'youtube',url:'https://youtube.com/@truethrills'}]});
 const cover=async f=>{const b=await readFile(path.join(root,'tests/fixtures/demo-covers',f));return (await (await fetch(base+'/api/cover',{method:'POST',headers:{cookie,'content-type':'image/jpeg','x-upload-size':String(b.length)},body:b})).json()).key;};
 const seconds=6,rate=8000,wav=Buffer.alloc(44+rate*2*seconds);
 wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
 for(let i=0;i<rate*seconds;i++)wav.writeInt16LE(Math.round(Math.sin(i/9)*9000),44+i*2);
 const audio=async()=>(await (await fetch(base+'/api/audio',{method:'POST',headers:{cookie,'content-type':'audio/wav','x-upload-size':String(wav.length)},body:wav})).json()).key;
 for(const [i,t] of ['Плот','Северный ветер','Тишина','Перевал','Ночь под скалой'].entries())await post({kind:'podcast',audioCategory:['audio_story','podcast','music'][i%3],title:t,description:'Описание.',audioKey:await audio(),duration:seconds,published:true,coverKey:await cover(['tile-forest.jpg','tile-mountains.jpg','tall-lake.jpg'][i%3])});
 await post({kind:'story',title:'Записки из ледяной пустыни',description:'Рассказ.',body:'Первый абзац истории.\n\nВторой абзац.',published:true,coverKey:await cover('tile-mountains.jpg')});
 await post({kind:'video',title:'Наедине с горами',description:'Видео.',videoUrl:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',published:true,coverKey:await cover('tile-waterfall.jpg')});

 browser=await chromium.launch({executablePath:process.env.TT_BROWSER_EXECUTABLE||undefined});
 const ready=async page=>{await page.waitForLoadState('networkidle').catch(()=>{});await page.waitForFunction(()=>!document.querySelector('.splash'),null,{timeout:15000}).catch(()=>{});await page.waitForTimeout(400);};
 // Поверхности и их договор.
 const surfaces=[
  {name:'телефон, слушатель',viewport:{width:390,height:844},touch:true,owner:false,shell:'is-listener',nav:'bottom',rail:false},
  {name:'планшет, слушатель',viewport:{width:1280,height:800},touch:true,owner:false,shell:'is-listener',nav:'bottom',rail:false},
  {name:'ПК, слушатель',viewport:{width:1440,height:900},touch:false,owner:false,shell:'is-desk',nav:'none',rail:true,app:true},
  {name:'ноутбук 1024, слушатель',viewport:{width:1024,height:768},touch:false,owner:false,shell:'is-desk',nav:'none',rail:true,app:true},
  {name:'программа для ПК, слушатель',viewport:{width:1440,height:900},touch:false,owner:false,exe:true,shell:'is-desk',nav:'none',rail:true,app:false},
  {name:'ПК, автор',viewport:{width:1440,height:900},touch:false,owner:true,shell:'is-author',nav:'studio',rail:false},
  {name:'программа для ПК, автор',viewport:{width:1440,height:900},touch:false,owner:true,exe:true,shell:'is-author',nav:'studio',rail:false},
  {name:'телефон, автор',viewport:{width:390,height:844},touch:true,owner:true,shell:'is-author',nav:'bottom',rail:false},
 ];
 const views=['home','podcasts','videos','stories','live','settings'];
 for(const s of surfaces){
  const ctx=await browser.newContext({viewport:s.viewport,isMobile:s.touch,hasTouch:s.touch,locale:'ru-RU'});
  if(s.owner){const eq=cookie.indexOf('=');await ctx.addCookies([{name:cookie.slice(0,eq),value:cookie.slice(eq+1),url:base}]);}
  // Программа для ПК — это WebView2: у страницы есть window.chrome.webview.
  if(s.exe)await ctx.addInitScript(()=>{window.chrome=window.chrome||{};window.chrome.webview={postMessage(){},addEventListener(){},removeEventListener(){}};});
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const v of views){
   const at=s.name+' / '+v+': ';
   await page.goto(base+'/?'+(s.owner?'':'mode=listen&')+'view='+v);await ready(page);
   const st=await page.evaluate(()=>{
    const shell=document.querySelector('.app-shell'),nav=document.querySelector('.bottom-nav'),rail=document.querySelector('.desk-rail');
    const shown=el=>!!el&&getComputedStyle(el).display!=='none'&&el.getBoundingClientRect().width>0;
    const navBox=nav?.getBoundingClientRect();
    return {cls:shell?.className??'',nav:shown(nav),navSide:navBox?(navBox.width<160&&navBox.height>navBox.width):false,rail:shown(rail),railDom:!!rail,
     app:!!document.querySelector('.desk-app'),shellMenu:!!document.querySelector('.shell-menu'),
     scroll:document.documentElement.scrollWidth-innerWidth,
     // Кнопки карточки выпуска не выходят за её край (поделиться, слушать).
     spill:[...document.querySelectorAll('.post-card')].flatMap(c=>{const r=c.getBoundingClientRect();return [...c.querySelectorAll('button,a')].filter(b=>{const q=b.getBoundingClientRect();return q.width>0&&(q.right>r.right+1||q.left<r.left-1);}).map(b=>(b.getAttribute('aria-label')||b.textContent.trim()).slice(0,30));}).slice(0,3)};});
   check(new RegExp('\\b'+s.shell+'\\b').test(st.cls),at+'каркас «'+st.cls+'» вместо '+s.shell);
   // Не «скрыто», а «нет совсем»: спрятанное стилем меню слушателя в студии —
   // это уже смешение каркасов, и следующее же правило CSS его покажет.
   check(s.rail?st.rail:!st.railDom,at+(s.rail?'нет бокового меню сайта для ПК':'в странице есть боковое меню сайта для ПК'));
   if(s.nav==='bottom')check(st.nav&&!st.navSide,at+'нет нижней панели разделов');
   if(s.nav==='none')check(!st.nav,at+'на ПК видна телефонная панель разделов');
   if(s.nav==='studio')check(st.nav&&st.navSide,at+'у студии на ПК нет боковой панели студии');
   if(s.rail)check(st.app===s.app,at+(s.app?'в меню нет «Скачать приложение»':'внутри программы для ПК предлагается скачать приложение'));
   if(s.exe&&s.owner)check(st.shellMenu,at+'в программе для ПК нет меню программы');
   check(st.scroll<=1,at+'страница шире экрана на '+st.scroll+'px');
   check(st.spill.length===0,at+'кнопки карточки за её краем: '+st.spill.join(', '));
  }
  check(errors.length===0,s.name+': ошибки страницы: '+errors.join('; '));
  // Окна поверх каркаса ПК: над боковым меню и закрываются.
  if(s.rail&&!s.exe&&s.viewport.width===1440){
   const covered=async()=>page.evaluate(()=>{const r=document.querySelector('.desk-rail').getBoundingClientRect();const el=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return !el?.closest('.desk-rail');});
   await page.goto(base+'/?mode=listen&view=stories');await ready(page);
   await page.getByRole('button',{name:'Читать'}).first().click();await page.locator('.tt-reader').waitFor({timeout:15000}).catch(()=>{});await page.waitForTimeout(800);
   check(await page.locator('.tt-reader').count()===1,s.name+': читалка не открылась');
   check(await covered(),s.name+': боковое меню торчит поверх читалки');
   await page.keyboard.press('Escape');await page.waitForTimeout(600);
   check(await page.locator('.tt-reader').count()===0,s.name+': читалка не закрывается по Escape');
   await page.goto(base+'/?mode=listen&view=videos');await ready(page);
   await page.getByRole('button',{name:'Смотреть'}).first().click();await page.waitForTimeout(1200);
   const video=await page.evaluate(()=>!!document.querySelector('.video-frame'));
   check(video,s.name+': видео не открылось');
   if(video)check(await covered(),s.name+': боковое меню торчит поверх видео');
   await page.keyboard.press('Escape');await page.waitForTimeout(600);
   const stuck=await page.evaluate(()=>!!document.querySelector('.video-frame,.video-dialog'));
   check(!stuck,s.name+': видео не закрывается по Escape (фокус ушёл в плеер?)');
   if(stuck){await ctx.close();continue;}
   await page.locator('.desk-support-button').click();await page.waitForTimeout(600);
   const dialog=await page.evaluate(()=>{const d=document.querySelector('[role=dialog]');return !!d&&getComputedStyle(d).display!=='none';});
   check(dialog,s.name+': кнопка «Поддержать» в меню не открыла окно площадок');
   if(dialog)check(await covered(),s.name+': боковое меню торчит поверх окна поддержки');
   await page.keyboard.press('Escape');await page.waitForTimeout(400);
  }
  await ctx.close();
 }
 assert.deepEqual(problems,[],'\n'+problems.join('\n'));
 console.log('PASS: поверхности разграничены — телефон и планшет: телефонный каркас; ПК-слушатель и программа для ПК без входа: сайт «Студия звука» (в программе без «Скачать приложение»); автор на ПК и в программе: студия с боковой панелью; автор с телефона: нижняя панель; шесть разделов на каждой без прокрутки вбок и без ошибок; читалка, видео и поддержка на ПК поверх меню и закрываются');
}finally{await browser?.close();server.kill();await rm(dir,{recursive:true,force:true});}
