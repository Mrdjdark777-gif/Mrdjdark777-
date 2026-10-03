#!/usr/bin/env node
/**
 * Все экраны слушателя на всех размерах телефонов и на всех языках — одним
 * прогоном. Плюс студия на ПК: видна ли автору статистика.
 *
 * Владелец попросил проверить, «если на разных размерах телефонов, где вообще
 * может встать приложение Android, нет косяков и оно всё отображается
 * правильно», и «на всех языках переводится абсолютно всё». Набор оформления
 * держит несколько опорных размеров и один язык; здесь — широкая сетка.
 *
 * Что считается косяком, словами:
 *  - страница шире экрана (горизонтальная прокрутка всей страницы);
 *  - видимый элемент вылезает за левый или правый край экрана (кроме того, что
 *    нарочно уходит под край внутри ленты карусели);
 *  - текст обрезан без многоточия — слово не влезло и отрезано по живому;
 *  - последний блок страницы спрятан под нижней панелью;
 *  - в итальянском и румынском видна кириллица, в украинском — русские буквы
 *    ы, э, ъ, ё: значит, где-то текст мимо словаря;
 *  - студия на ПК: у аудио и рассказов нет строки счётчика.
 *
 * Запуск: TT_BROWSER_EXECUTABLE=… node scripts/check-all-phones.mjs
 *
 * Для проверки самой проверки: TT_PHONES_CSS и TT_PHONES_JS подкладывают в
 * каждую страницу поломку, TT_PHONES_QUICK=1 оставляет два телефона и
 * итальянский — чтобы поломку не ждать четверть часа.
 * Снимки — в outputs/phones/.
 */
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,rmSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';

const root=process.cwd();
const dir=mkdtempSync(path.join(root,'.test-tmp-phones-'));
const out=path.join(root,'outputs','phones');mkdirSync(out,{recursive:true});
const env={...process.env,DATABASE_PATH:path.join(dir,'db.sqlite'),STORAGE_DIR:path.join(dir,'storage'),THUMB_DIR:path.join(dir,'thumbs'),
 LIVE_DIR:path.join(dir,'live'),SESSION_SECRET:'phones-check-secret-0123456789',ADMIN_PASSWORD:'phones-password',NODE_ENV:'production'};
execFileSync('npx',['drizzle-kit','migrate'],{env,stdio:'ignore'});
const port=Number(process.env.PORT||3141),base='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env,stdio:['ignore','ignore','inherit']});
const problems=[];const note=(m)=>{problems.push(m);};

try{
 for(let i=0;i<120;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}
 const login=await fetch(base+'/api/auth',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:'phones-password'})});
 assert.equal(login.status,200,'вход автора не прошёл');
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const post=async(d)=>{const r=await fetch(base+'/api/library',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify(d)});
  const t=await r.text();assert.equal(r.status,200,t);return JSON.parse(t);};
 await post({action:'setup'});
 await post({action:'donations',links:[{kind:'boosty',url:'https://boosty.to/truethrills'},{kind:'paypal',url:'https://paypal.me/truethrills'}]});
 await post({action:'links',links:[{kind:'youtube',url:'https://youtube.com/@truethrills'},{kind:'telegram',url:'https://t.me/truethrills'}]});
 const cover=async(f)=>{const b=readFileSync(path.join(root,'tests/fixtures/demo-covers',f));
  const r=await fetch(base+'/api/cover',{method:'POST',headers:{cookie,'content-type':'image/jpeg','x-upload-size':String(b.length)},body:b});return (await r.json()).key;};
 const seconds=20,rate=8000,wav=Buffer.alloc(44+rate*2*seconds);
 wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);
 wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
 for(let i=0;i<rate*seconds;i++)wav.writeInt16LE(Math.round(Math.sin(i/9)*9000),44+i*2);
 const audio=async()=>{const r=await fetch(base+'/api/audio',{method:'POST',headers:{cookie,'content-type':'audio/wav','x-upload-size':String(wav.length)},body:wav});return (await r.json()).key;};
 // Названия нарочно разной длины: короткое, обычное и очень длинное — длинные
 // ломают вёрстку первыми, особенно на узком экране.
 const long='Очень длинное название выпуска про горный перевал, ночёвку под скалой и обратную дорогу';
 const ids={};
 // Всё, что автор написал сам, — чтобы отличить его текст от интерфейса.
 const corpus=[];
 ids.pod1=(await post({kind:'podcast',title:'Тишина',description:'Короткое.',audioKey:await audio(),duration:seconds,published:true,coverKey:await cover('tile-forest.jpg')})).id;
 ids.pod2=(await post({kind:'podcast',title:long,description:'Описание выпуска. '.repeat(12),audioKey:await audio(),duration:seconds,published:true,coverKey:await cover('tile-mountains.jpg')})).id;
 ids.pod3=(await post({kind:'podcast',title:'Голос северного ветра',description:'Без обложки.',audioKey:await audio(),duration:seconds,published:true})).id;
 ids.vid=(await post({kind:'video',title:'Наедине с горами',description:'Видео.',videoUrl:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',published:true,coverKey:await cover('tile-waterfall.jpg')})).id;
 ids.vid2=(await post({kind:'video',title:long,description:'Видео.',videoUrl:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',published:true,coverKey:await cover('tile-forest.jpg')})).id;
 ids.story=(await post({kind:'story',title:'Там, где заканчивается дорога',description:'Рассказ.',body:Array.from({length:30},(_,i)=>'Абзац '+(i+1)+'. Тишина у горного озера. Дорога осталась позади.').join('\n\n'),published:true,coverKey:await cover('tile-mountains.jpg')})).id;
 ids.story2=(await post({kind:'story',title:long,description:'Рассказ.',body:'Море не кончалось.\n\n'.repeat(40),published:true})).id;
 // Ещё выпуски, чтобы карусель на широком планшете шла по кругу: при шести
 // карточках Embla круг выключает, и ошибка круга (карточки наезжали друг на
 // друга) на снимке не появляется вовсе — проверка была бы слепой.
 for(let n=1;n<=6;n++)await post({kind:'podcast',title:'Выпуск '+n,description:'Ещё один.',audioKey:await audio(),duration:seconds,published:true,coverKey:await cover(n%2?'tile-forest.jpg':'tile-mountains.jpg')});
 ids.hero=(await post({kind:'video',title:'Постер',description:'Кадр.',videoUrl:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',published:true,coverKey:await cover('hero-lake.jpg')})).id;
 corpus.push('Выпуск 1','Выпуск 2','Выпуск 3','Выпуск 4','Выпуск 5','Выпуск 6','Выпуск','Ещё один.','Тишина','Короткое.',long,'Описание выпуска.','Голос северного ветра','Без обложки.','Наедине с горами','Видео.',
  'Там, где заканчивается дорога','Рассказ.','Абзац Тишина у горного озера. Дорога осталась позади.','Море не кончалось.','Постер','Кадр.');
 // Счётчики: так, как их пишет сервер, — сумма в settings под usage:<id>.
 {const Database=(await import('better-sqlite3')).default;const db=new Database(env.DATABASE_PATH);
  for(const [id,n] of [[ids.pod1,17],[ids.pod2,3],[ids.story,42]])db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run('usage:'+id,String(n));
  db.close();}

 const browser=await chromium.launch({executablePath:process.env.TT_BROWSER_EXECUTABLE||undefined});
 const settle=async(page)=>{await page.waitForLoadState('networkidle').catch(()=>{});await page.evaluate(()=>document.fonts?.ready);await page.waitForTimeout(700);};

 /** Осмотр открытого экрана: всё, что считается косяком, — словами. */
 const inspect=async(page,where,lang)=>{
  const r=await page.evaluate(([lang,corpus])=>{
   const words=new Set(corpus.toLowerCase().match(/[а-яё]+/g)||[]);
   // Название, описание и текст выпуска — содержание автора, а не интерфейс.
   const authored=(t)=>{const w=t.toLowerCase().match(/[а-яё]+/g)||[];return w.length>0&&w.every(x=>words.has(x));};
   const W=innerWidth,H=innerHeight,found=[];
   const vis=(el)=>{const s=getComputedStyle(el);if(s.visibility==='hidden'||s.display==='none'||+s.opacity===0)return false;
    const b=el.getBoundingClientRect();return b.width>0&&b.height>0;};
   const label=(el)=>{const c=(el.className&&typeof el.className==='string')?'.'+el.className.trim().split(/\s+/).slice(0,2).join('.'):'';
    return el.tagName.toLowerCase()+c+(el.textContent?' «'+el.textContent.trim().replace(/\s+/g,' ').slice(0,40)+'»':'');};
   // Внутри ли элемент окна, которое нарочно обрезает (лента карусели и т. п.).
   // Нарочно обрезает только окно, которое прячет лишнее (hidden, clip), — как
   // лента карусели. Прокручиваемая область не в счёт: в ней лежит весь экран
   // приложения, и первая версия, считая её «обрезающей», проспала карточку
   // шириной 700 точек на экране в 320.
   const clipped=(el)=>{for(let p=el.parentElement;p&&p!==document.body;p=p.parentElement){const s=getComputedStyle(p);
     if(/(hidden|clip)/.test(s.overflowX)){const b=p.getBoundingClientRect();if(b.left>=-1&&b.right<=W+1)return true;}}return false;};
   if(document.documentElement.scrollWidth>W+1)found.push('страница шире экрана: '+document.documentElement.scrollWidth+' при ширине '+W);
   for(const el of document.querySelectorAll('body *')){
    if(!vis(el))continue;const s=getComputedStyle(el);
    // Область, которую можно листать вбок, — это и есть «страница шире экрана»,
    // только внутри приложения.
    if(/(auto|scroll)/.test(s.overflowX)&&el.scrollWidth>el.clientWidth+1)
     found.push('область листается вбок ('+el.scrollWidth+' в '+el.clientWidth+'): '+label(el));if(s.position==='fixed'&&el.closest('[aria-hidden="true"]'))continue;
    const b=el.getBoundingClientRect();
    if((b.right>W+1||b.left<-1)&&!clipped(el)&&b.top<H*4&&!el.closest('.app-aurora,.tt-vignette,.tt-noise,[aria-hidden="true"]'))
     found.push('за краем экрана ('+Math.round(b.left)+'…'+Math.round(b.right)+' при ширине '+W+'): '+label(el));
    // Обрезанный по живому текст: внутри шире коробки, обрезка без многоточия и без переноса строк.
    if(el.children.length===0&&el.textContent.trim().length>1&&el.scrollWidth>el.clientWidth+1&&/(hidden|clip)/.test(s.overflowX)
       &&s.textOverflow!=='ellipsis'&&s.webkitLineClamp==='none'&&!el.closest('.soft-carousel .soft-kind')&&!el.matches('.sr-only'))
     found.push('текст обрезан без многоточия: '+label(el)+' ('+el.scrollWidth+' в '+el.clientWidth+')');
   }
   // Текст мимо словаря: в итальянском и румынском — никакой кириллицы,
   // в украинском — никаких русских букв. Названия выпусков — это содержание
   // автора, а не интерфейс; их не считаем.
   const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);const stray=new Set();
   const content='.soft-episode strong,.post-title,.scene-title,.post-note,.post-cover,.player-title,.podcast-player h2,.podcast-player [class*=title],.podcast-player [class*=note],.reader-page,.reader-title,.story-reader,.live-archive-card strong,[class*=description],.soft-hero-foot strong,.resume-row,.fresh-title';
   for(let n=walker.nextNode();n;n=walker.nextNode()){const t=n.textContent.trim();if(!t)continue;const el=n.parentElement;if(!el||!vis(el)||el.closest(content))continue;
    if(authored(t))continue;
    if((lang==='it'||lang==='ro')&&/[А-Яа-яЁё]/.test(t))stray.add(t.slice(0,50));
    if(lang==='uk'&&/[ыэъёЫЭЪЁ]/.test(t))stray.add(t.slice(0,50));}
   for(const t of stray)found.push('текст мимо словаря ('+lang+'): «'+t+'»');
   // Последний блок не под нижней панелью.
   const nav=document.querySelector('.bottom-nav');
   return {found,navTop:nav&&vis(nav)?nav.getBoundingClientRect().top:null};},[lang,corpus.join(' ')]);
  for(const f of r.found)note(where+': '+f);
  // Долистываем до конца и смотрим, не спрятан ли последний блок под панелью.
  if(r.navTop!==null){
   // Листаем саму область приложения: окно браузера заперто, прокрутка живёт
   // в .listener-main. Последний блок — её последний видимый ребёнок; его низ
   // не должен уходить ниже нижней панели и мини-плеера.
   const end=await page.evaluate(async()=>{
    const main=document.querySelector('.listener-main')||document.scrollingElement;
    main.scrollTop=main.scrollHeight;await new Promise(r=>setTimeout(r,450));
    const tops=[...document.querySelectorAll('.bottom-nav,.podcast-player.is-mini')].map(e=>e.getBoundingClientRect()).filter(b=>b.height>0).map(b=>b.top);
    const nav=Math.min(...tops,innerHeight);
    let last=null;for(const el of main.children){const b=el.getBoundingClientRect();if(b.height>0&&(!last||b.bottom>last.bottom))last={bottom:b.bottom,name:String(el.className)};}
    main.scrollTop=0;return last?{nav,bottom:last.bottom,name:last.name}:null;});
   if(process.env.TT_PHONES_DEBUG&&end)console.log('конец',where,JSON.stringify(end));
   if(end&&end.bottom>end.nav+1)note(where+': последний блок «'+String(end.name).slice(0,40)+'» уходит под нижнюю панель на '+Math.round(end.bottom-end.nav)+' точек');
  }
 };

 // Планшет: приложение, а не растянутый телефон и не сайт.
 //  — нижняя панель на месте (раскладка сайта с верхними вкладками — только ПК);
 //  — ни один блок раздела не шире колонки 1160 точек;
 //  — каталог колонками, если карточек больше одной;
 //  — постер на главной не марка на пустом поле, а крупный;
 //  — карточки карусели не наезжают друг на друга;
 //  — обложка в плеере карточкой, а не фотографией во весь экран.
 const inspectTablet=async(page,where,w,h)=>{
  const r=await page.evaluate(()=>{
   const box=n=>{const b=n.getBoundingClientRect();return {l:b.left,r:b.right,t:b.top,b:b.bottom,w:b.width,h:b.height};};
   const nav=document.querySelector('.bottom-nav');const navOk=!!nav&&getComputedStyle(nav).display!=='none'&&box(nav).b>=innerHeight-2;
   const main=document.querySelector('.listener-main');
   const wide=[];
   if(main&&!document.querySelector('.podcast-player.is-open,.tt-reader')){
    for(const n of main.children){if(n.matches('.content-footer,.soft-tail,style,script')||getComputedStyle(n).display==='none')continue;
     const inner=n.matches('.immersion')?[...n.children]:[n];
     for(const k of inner){if(k.matches('.scene-side'))continue;const b=box(k);if(b.w>1162)wide.push((k.className||k.tagName)+' '+Math.round(b.w));}
     for(const k of n.querySelectorAll?.('.scene-side>*')||[]){if(k.matches('.soft-catalog'))continue;const b=box(k);if(b.w>1162)wide.push((k.className||k.tagName)+' '+Math.round(b.w));}}
   }
   const cards=[...document.querySelectorAll('.post-list>.post-card')].map(box);
   // Колонок столько, сколько карточек стоит в первом ряду — на одной высоте с первой.
   const cols=cards.length?cards.filter(c=>Math.abs(c.t-cards[0].t)<2).length:0;
   const open=!!document.querySelector('.podcast-player.is-open,.tt-reader,[role=dialog]');
   const scene=document.querySelector('.tt-soft-home .scene');
   const arts=[...document.querySelectorAll('.soft-reel>li .soft-art')].map(box).filter(b=>b.r>0&&b.l<innerWidth).sort((a,b)=>a.l-b.l);
   let overlap=0;for(let i=1;i<arts.length;i++)overlap=Math.max(overlap,arts[i-1].r-arts[i].l);
   // Первый экран главной: названия под карточками карусели не под панелью.
   const navTop=nav?box(nav).t:innerHeight;
   const names=[...document.querySelectorAll('.soft-reel>li strong')].map(box).filter(b=>b.r>0&&b.l<innerWidth);
   const hidden=names.length?Math.max(...names.map(b=>b.b))-navTop:0;
   const stage=document.querySelector('.podcast-player.is-open .player-stage');
   const page=document.querySelector('.tt-reader-page');
   const dbg=[...document.querySelectorAll('.soft-reel>li')].map(li=>Math.round(li.getBoundingClientRect().left)+':'+(li.style.transform||'-')).join(' ')+' reel='+(document.querySelector('.soft-reel')?.style.transform||'-')+' loop='+(document.querySelector('.soft-carousel')?.dataset.loop||'?')+' view='+Math.round(document.querySelector('.soft-carousel')?.getBoundingClientRect().width||0);
   return {hidden:Math.round(hidden),reader:page?page.getBoundingClientRect().width:null,dbg,open,navOk,wide,cards:cards.length,cols,scene:scene?box(scene).w:null,overlap:Math.round(overlap),
    stage:stage&&getComputedStyle(stage).display!=='none'?box(stage):null,colWidth:main?Math.min(main.clientWidth-64,1160):0};
  });
  // Плеер, читалка и окна закрывают панель нарочно — там её и не должно быть.
  if(!r.navOk&&!r.open)note(where+': нет нижней панели — на планшете открылась раскладка сайта, а не приложение');
  for(const x of r.wide)note(where+': блок «'+x+'» шире колонки 1160 — растянут на весь экран');
  if(r.cards>1&&r.cols<2&&!r.open)note(where+': каталог одной колонкой — карточки растянуты на всю ширину');
  if(r.scene!==null&&r.scene<r.colWidth*0.4)note(where+': постер на главной '+Math.round(r.scene)+' точек — марка на пустом поле');
  if(r.hidden>2)note(where+': названия под карточками карусели уходят под нижнюю панель на '+r.hidden+' точек — первый экран главной не помещается');
  if(r.overlap>2)note(where+': карточки карусели наезжают друг на друга на '+r.overlap+' точек'+(process.env.TT_PHONES_DEBUG?' ['+r.dbg+']':''));
  // Строка читалки не длиннее книжной меры: 680 точек и запас на увеличение.
  if(r.reader!==null&&r.reader>760)note(where+': строка читалки '+Math.round(r.reader)+' точек — длиннее книжной, глаз теряет начало следующей');
  if(r.stage&&(r.stage.w>660||r.stage.h>820))note(where+': обложка в плеере '+Math.round(r.stage.w)+'×'+Math.round(r.stage.h)+' — растянута, выйдет мылом');
 };
 const phones=[[320,568],[360,640],[360,780],[375,667],[384,854],[390,844],[412,915],[430,932],[480,1000]];
 const views=[['главная','/?mode=listen'],['слушать','/?mode=listen&view=podcasts'],['видео','/?mode=listen&view=videos'],
  ['истории','/?mode=listen&view=stories'],['эфир','/?mode=listen&view=live'],['настройки','/?mode=listen&view=settings'],
  ['плеер','/?mode=listen&view=podcasts&post='+ids.pod2],['читалка','/?mode=listen&view=stories&post='+ids.story]];
 const tabletViews=[...views,['видеоплеер','/?mode=listen&view=videos&post='+ids.vid]];
 const langs={ru:'ru-RU',it:'it-IT',uk:'uk-UA',ro:'ro-RO'};
 let screens=0;
 const run=async(w,h,lang,list,shots)=>{
  const ctx=await browser.newContext({viewport:{width:w,height:h},deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:langs[lang]});
  const page=await ctx.newPage();page.on('pageerror',e=>note(lang+' '+w+'×'+h+': ошибка на странице: '+e.message));
  for(const [name,url] of list){
   await page.goto(base+url);
   if(process.env.TT_PHONES_CSS)await page.addStyleTag({content:process.env.TT_PHONES_CSS});
   if(process.env.TT_PHONES_JS)await page.evaluate(process.env.TT_PHONES_JS);
   await settle(page);screens++;
   await inspect(page,lang+' '+w+'×'+h+' '+name,lang);
   if(shots)await page.screenshot({path:path.join(out,`${lang}-${w}x${h}-${name}.png`)});
  }
  await ctx.close();
 };
 // Планшеты — от 10 до 13 дюймов, стоя и боком. Владелец: «проверь, как себя
 // ведёт приложение на 10 дюймах… максимальный планшет 12–13 дюймов; дальше и
 // выше — уже сайт, его дизайн отдельно». В точках CSS: Galaxy Tab 10–11"
 // 800×1280, iPad Pro 11" 834×1194, iPad Pro 12.9" 1024×1366.
 // Потом владелец поднял границу до 15 дюймов: у него Galaxy Tab S8 Ultra
 // 14,6" — 924×1480 стоя и 1480×924 боком.
 const tablets=[[800,1280],[834,1194],[1024,1366],[924,1480],[1280,800],[1194,834],[1366,1024],[1480,924]];
 const runTablet=async(w,h,lang,list,shots)=>{
  const ctx=await browser.newContext({viewport:{width:w,height:h},deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:langs[lang]});
  const page=await ctx.newPage();page.on('pageerror',e=>note(lang+' планшет '+w+'×'+h+': ошибка на странице: '+e.message));
  for(const [name,url] of list){
   await page.goto(base+url);
   if(process.env.TT_PHONES_CSS)await page.addStyleTag({content:process.env.TT_PHONES_CSS});
   if(process.env.TT_PHONES_JS)await page.evaluate(process.env.TT_PHONES_JS);
   await settle(page);screens++;
   await inspect(page,lang+' планшет '+w+'×'+h+' '+name,lang);
   await inspectTablet(page,'планшет '+w+'×'+h+' '+name,w,h);
   if(shots)await page.screenshot({path:path.join(out,`tablet-${lang}-${w}x${h}-${name}.png`)});
  }
  await ctx.close();
 };
 if(process.env.TT_PHONES_TABLETS==='only'){
  const only=process.env.TT_PHONES_SIZE;const pick=process.env.TT_PHONES_VIEW;
  for(const [w,h] of tablets.filter(([w,h])=>!only||only===w+'x'+h))await runTablet(w,h,'ru',tabletViews.filter(([n])=>!pick||n===pick),true);
 }else{
 // Все размеры — на русском; все языки — на самом узком и на обычном экране.
 const quick=process.env.TT_PHONES_QUICK==='1';
 for(const [w,h] of quick?[[320,568],[390,844]]:phones)await run(w,h,'ru',views,!quick&&(w===320||w===390||w===480));
 for(const lang of quick?['it']:['it','uk','ro'])for(const [w,h] of quick?[[320,568]]:[[320,568],[390,844]])await run(w,h,lang,views,!quick&&w===320);
 // Телефон боком.
 if(!quick)await run(740,360,'ru',views.slice(0,6),true);
 for(const [w,h] of quick?[[800,1280]]:tablets)await runTablet(w,h,'ru',tabletViews,!quick);
 if(!quick)for(const lang of ['it','uk','ro'])await runTablet(1024,1366,lang,views,false);
 }

 // Студия на ПК: статистика у автора.
 for(const [w,h] of [[1280,720],[1440,900]]){
  const ctx=await browser.newContext({viewport:{width:w,height:h}});
  const eq=cookie.indexOf('=');await ctx.addCookies([{name:cookie.slice(0,eq),value:cookie.slice(eq+1),url:base}]);
  const page=await ctx.newPage();
  for(const [name,view,id,n] of [['аудио','podcasts',ids.pod1,17],['истории','stories',ids.story,42]]){
   await page.goto(base+'/?view='+view);
   if(process.env.TT_PHONES_CSS)await page.addStyleTag({content:process.env.TT_PHONES_CSS});
   await settle(page);
   const seen=await page.evaluate(()=>[...document.querySelectorAll('.post-usage')].map(e=>{const b=e.getBoundingClientRect();
    return {text:e.textContent.trim(),visible:b.width>0&&b.height>0&&getComputedStyle(e).visibility!=='hidden'};}));
   const shown=seen.filter(s=>s.visible).map(s=>s.text);
   if(!shown.some(t=>{const m=t.match(/(\d+)\s*$/);return m&&+m[1]>=n;}))note('студия '+w+'×'+h+' '+name+': счётчика не меньше '+n+' не видно; строки счётчиков: '+JSON.stringify(seen));
   // Выпуск без обложки: рамка не схлопывается до значка.
   const bare=await page.evaluate(()=>[...document.querySelectorAll('.post-cover')].filter(c=>!c.querySelector('.post-cover-image'))
    .map(c=>{const b=c.getBoundingClientRect();return {w:Math.round(b.width),h:Math.round(b.height)};}));
   for(const b of bare)if(b.w<120||b.h<150)note('студия '+w+'×'+h+' '+name+': у выпуска без обложки рамка схлопнулась до '+b.w+'×'+b.h+' — значок смят, ряд рваный');
   await page.screenshot({path:path.join(out,`studio-${w}x${h}-${name}.png`)});screens++;
  }
  await ctx.close();
 }
 await browser.close();
 console.log('осмотрено экранов: '+screens);
}finally{server.kill('SIGKILL');rmSync(dir,{recursive:true,force:true});}

if(problems.length){
 const uniq=[...new Set(problems)];
 console.log('КОСЯКИ ('+uniq.length+'):\n - '+uniq.join('\n - '));
 process.exitCode=1;
}else console.log('PASS: все экраны слушателя на девяти телефонах и боком, четыре языка и статистика в студии — без косяков');
