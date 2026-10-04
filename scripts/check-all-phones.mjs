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
 ids.pod1=(await post({kind:'podcast',audioCategory:'audio_story',title:'Тишина',description:'Короткое.',audioKey:await audio(),duration:seconds,published:true,coverKey:await cover('tile-forest.jpg')})).id;
 ids.pod2=(await post({kind:'podcast',audioCategory:'podcast',title:long,description:'Описание выпуска. '.repeat(12),audioKey:await audio(),duration:seconds,published:true,coverKey:await cover('tall-lake.jpg')})).id;
 ids.pod3=(await post({kind:'podcast',audioCategory:'music',title:'Голос северного ветра',description:'Без обложки.',audioKey:await audio(),duration:seconds,published:true})).id;
 ids.vid=(await post({kind:'video',title:'Наедине с горами',description:'Видео.',videoUrl:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',published:true,coverKey:await cover('tile-waterfall.jpg')})).id;
 ids.vid2=(await post({kind:'video',title:long,description:'Видео.',videoUrl:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',published:true,coverKey:await cover('tile-forest.jpg')})).id;
 ids.story=(await post({kind:'story',title:'Там, где заканчивается дорога',description:'Рассказ.',body:Array.from({length:30},(_,i)=>'Абзац '+(i+1)+'. Тишина у горного озера. Дорога осталась позади.').join('\n\n'),published:true,coverKey:await cover('tile-mountains.jpg')})).id;
 ids.story2=(await post({kind:'story',title:long,description:'Рассказ.',body:'Море не кончалось.\n\n'.repeat(40),published:true})).id;
 // Ещё выпуски, чтобы карусель на широком планшете шла по кругу: при шести
 // карточках Embla круг выключает, и ошибка круга (карточки наезжали друг на
 // друга) на снимке не появляется вовсе — проверка была бы слепой.
 for(let n=1;n<=6;n++)await post({kind:'podcast',audioCategory:['audio_story','podcast','music'][n%3],title:'Выпуск '+n,description:'Ещё один.',audioKey:await audio(),duration:seconds,published:true,coverKey:await cover(n%2?'tile-forest.jpg':'tile-mountains.jpg')});
 ids.hero=(await post({kind:'video',title:'Постер',description:'Кадр.',videoUrl:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',published:true,coverKey:await cover('hero-lake.jpg')})).id;
 corpus.push('Выпуск 1','Выпуск 2','Выпуск 3','Выпуск 4','Выпуск 5','Выпуск 6','Выпуск','Ещё один.','Тишина','Короткое.',long,'Описание выпуска.','Голос северного ветра','Без обложки.','Наедине с горами','Видео.',
  'Там, где заканчивается дорога','Рассказ.','Абзац Тишина у горного озера. Дорога осталась позади.','Море не кончалось.','Постер','Кадр.');
 // Старая запись без типа аудио — такая, какие уже лежат в рабочих данных:
 // вставлена прямо в базу, мимо студии, с пустым audio_category. Карточка
 // обязана показать нейтральное «АУДИО», а не угаданный тип.
 const legacyKey=await audio();ids.legacy='legacy-audio-0001';corpus.push('Старая запись','Без типа.');
 // Счётчики: так, как их пишет сервер, — сумма в settings под usage:<id>.
 {const Database=(await import('better-sqlite3')).default;const db=new Database(env.DATABASE_PATH);
  db.prepare("INSERT INTO posts(id,kind,title,description,body,audio_key,duration,published,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
   .run(ids.legacy,'podcast','Старая запись','Без типа.','',legacyKey,seconds,1,Date.now()-86400000*30);
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
   // Фотография плеера — в своей рамке. Высокая обложка (постер 2:3) раньше
   // вылезала ниже рамки и затемнения: под фотографией шла вторая полоса.
   {const st=document.querySelector('.player-stage'),ph=st&&st.querySelector('.player-stage-photo');
    if(ph&&vis(st)){const a=st.getBoundingClientRect(),b=ph.getBoundingClientRect();
     // Рамка, которая обрезает лишнее, прячет и выступ — тогда его не видно.
     const cut=/(hidden|clip)/.test(getComputedStyle(st).overflow);
     if(!cut&&(b.bottom>a.bottom+1||b.top<a.top-1))
      found.push('фотография плеера вылезает из рамки: '+Math.round(b.top)+'…'+Math.round(b.bottom)+' при рамке '+Math.round(a.top)+'…'+Math.round(a.bottom));}}
   // Шапка разделов «Аудио», «Видео», «Истории» — одна на три: заголовок
   // слева, подзаголовок колонкой справа; верх первой строки подзаголовка —
   // на высоте верха заголовка, низ последней — на линии его низа (просьба
   // владельца). Стоя и боком. Поиск и сортировка — одной строкой.
   {const head=document.querySelector('.listener-main .voice-headline');
    if(head&&vis(head)){const t=head.querySelector('.voice-title').getBoundingClientRect(),
     lines=[...head.querySelectorAll('.voice-kicker-line')].map(n=>n.getBoundingClientRect());
     if(!lines.length)found.push('в шапке раздела нет подзаголовка');
     else{if(lines[0].left<t.right-1)found.push('подзаголовок раздела не справа от заголовка');
      if(Math.abs(lines[0].top-t.top)>2||Math.abs(lines.at(-1).bottom-t.bottom)>2)
       found.push('подзаголовок раздела не по высоте заголовка: '+Math.round(lines[0].top)+'…'+Math.round(lines.at(-1).bottom)+' при заголовке '+Math.round(t.top)+'…'+Math.round(t.bottom));}
     if(t.right>innerWidth)found.push('заголовок раздела вылез за край экрана');
     const se=document.querySelector('.listener-main .catalog-search'),so=document.querySelector('.listener-main .catalog-sort');
     if(se&&so&&vis(se)){const a=se.getBoundingClientRect(),c=so.getBoundingClientRect();
      if(c.top>=a.bottom||c.left<a.right)found.push('поиск и сортировка разъехались на две строки');}}}
   // Эфир в покое: нижней «Поделиться» нет — она повторяла кнопку в шапке,
   // которая делится тем же эфиром. Надписи под кругом сгруппированы, но
   // кольцо, растущее в такт дыханию, на «Вдох» не наезжает.
   {const calm=document.querySelector('.live-stage:not(.is-live)');
    if(calm){if(calm.querySelector('.live-share'))found.push('в эфире без трансляции снова кнопка «Поделиться» под кругом — она повторяет кнопку в шапке');
     const rings=calm.querySelector('.live-rings'),guide=calm.querySelector('.breath-guide'),note=calm.querySelector('.breath-note');
     if(rings&&guide){const gap=guide.getBoundingClientRect().top-rings.getBoundingClientRect().bottom;
      if(gap>24)found.push('под кругом эфира пустота '+Math.round(gap)+' точек до «Вдох» — владелец просил сгруппировать надписи');
      if(gap<16)found.push('«Вдох» ближе '+Math.round(gap)+' точек к кругу — растущее в такт дыханию кольцо на него наедет');}
     if(guide&&note){const gap=note.getBoundingClientRect().top-guide.getBoundingClientRect().bottom;
      if(gap>14)found.push('между «Вдох» и подсказкой пустота '+Math.round(gap)+' точек');}}}
   if(document.querySelector('.soft-all'))found.push('у карусели снова кнопка «Все» — владелец попросил её убрать');
   // Нижняя панель без резкой кромки: сверху не линия, а переход в её цвет.
   {const nb=document.querySelector('.is-listener .bottom-nav');
    if(nb&&vis(nb)){const c=getComputedStyle(nb),fade=getComputedStyle(nb,'::before');
     const line=parseFloat(c.borderTopWidth)>0&&!/rgba\(.*,\s*0\)|transparent/.test(c.borderTopColor);
     if(line)found.push('у нижней панели резкая линия сверху ('+c.borderTopColor+')');
     if(fade.content==='none'||parseFloat(fade.height)<16)found.push('над нижней панелью нет плавного перехода — содержимое обрезается ровной чертой');}}
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

 // Планшет — тот же телефон. Владелец: «всё должно выглядеть так же, как на
 // телефоне, без компромиссов», а потом: «нормальное полноэкранное приложение
 // в любом положении экрана». Стоя планшет объявляет телефонную ширину
 // (430–700) и рисует телефонный экран, увеличенный; боком — тот же масштаб и
 // весь экран в ширину. Проверка сравнивает с настоящим телефоном того же
 // логического размера: опорные блоки обязаны стоять там же, до 2 точек.
 const anchors=['.top-header','.scene','.soft-hero-foot .scene-action','.soft-catalog-head','.soft-carousel','.soft-archive-row',
  '.page-heading','.voice-headline','.catalog-tools','.post-list>.post-card','.post-cover','.voice-hero,.voice-header','.player-stage','.player-title','.podcast-toggle',
  '.live-orb','.live-stage','.settings-panel','.tt-reader-page','.bottom-nav'];
 const frame=(page,reader=false)=>page.evaluate(([anchors,reader])=>{
  // В полном экране планшет забывает meta viewport, и читалка возвращает
  // себе телефонный вид увеличением (zoom) — замеры делим на него, чтобы
  // сравнивать с телефоном в его точках.
  const fs=!!document.fullscreenElement&&document.documentElement.hasAttribute('data-tt-tablet');
  const z=fs&&document.documentElement.hasAttribute('data-tt-fs-zoom')?parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tt-fs-zoom'))||1:1;
  const raw=document.body.getBoundingClientRect(),body={left:raw.left/z,top:raw.top/z,width:raw.width/z,height:raw.height/z,right:raw.right/z};
  const box=(n)=>{const b=n.getBoundingClientRect();return {left:b.left/z,top:b.top/z,width:b.width/z,height:b.height/z,right:b.right/z,bottom:b.bottom/z};};
  // Читалка в полном экране закрывает собою всё: сравниваем только её саму —
  // страница под ней не видна и не увеличена.
  const only=(reader||document.fullscreenElement)&&document.querySelector('.tt-reader');
  const at={};for(const sel of anchors){const n=document.querySelector(sel);if(!n||getComputedStyle(n).display==='none'||only&&!only.contains(n))continue;
   const b=box(n);if(!b.width&&!b.height)continue;
   at[sel]=[Math.round(b.left-body.left),Math.round(b.top-body.top),Math.round(b.width),Math.round(b.height)];}
  // Всё fixed — внутри колонки: панель, плеер, окна, подсказки.
  const out=[];for(const n of document.querySelectorAll('body *')){const st=getComputedStyle(n);if(st.position!=='fixed'||st.display==='none'||st.visibility==='hidden'||only&&!only.contains(n))continue;
   const b=box(n);if(!b.width||!b.height)continue;
   if(b.left<body.left-2||b.right>body.right+2)out.push((n.className&&typeof n.className==='string'?n.className.split(' ')[0]:n.tagName)+' '+Math.round(b.left)+'…'+Math.round(b.right));}
  const nav=document.querySelector('.bottom-nav'),navTop=nav&&getComputedStyle(nav).display!=='none'?nav.getBoundingClientRect().top:innerHeight;
  const names=[...document.querySelectorAll('.soft-reel>li strong')].map(n=>n.getBoundingClientRect()).filter(b=>b.right>body.left&&b.left<body.right);
  const hidden=names.length?Math.round(Math.max(...names.map(b=>b.bottom))-navTop):0;
  const metas=[...document.querySelectorAll('meta[name=viewport]')].map(m=>m.content).join(' | ')+' tablet='+document.documentElement.hasAttribute('data-tt-tablet')+' fullscreen='+!!document.fullscreenElement;
  return {metas,hidden,fs,width:document.documentElement.clientWidth,iw:innerWidth,body:[Math.round(body.left),Math.round(body.width),Math.round(body.height)],at,out};
 },[anchors,reader]);
 // Логический экран планшета: стоя — телефонная ширина 430–700, боком — тот
 // же масштаб, а ширина вся. Та же формула, что в app/layout.tsx.
 const logical=(w,h)=>{const small=Math.min(w,h),big=Math.max(w,h),narrow=Math.max(430,Math.min(700,Math.ceil(560/(big/small-7/15))));
  return w<h?[narrow,Math.round(narrow*h/w)]:[Math.round(big*narrow/small),narrow];};
 // phone — страница телефона или уже снятый с неё замер.
 const inspectTablet=async(page,where,w,h,phone)=>{
  // Строка «Нажми «Слушать», чтобы включить звук» — след самого стенда: здесь
  // браузер не играет AAC и автозапуска нет. Она появляется с задержкой, то на
  // одном экране, то на другом, и сдвигает кнопки на 35 точек. Для сравнения
  // раскладки её прячем на обоих.
  const calm={content:'.podcast-player-message{display:none!important}'};
  await page.addStyleTag(calm);if(!phone.at)await phone.addStyleTag(calm);
  const t=await frame(page),p=phone.at?phone:await frame(phone);
  const [want]=logical(w,h);
  // Приложение — на весь экран, без колонки и тёмных полей по бокам.
  if(Math.abs(t.body[1]-want)>1)note(where+': приложение '+t.body[1]+' точек в ширину вместо '+want+(w<h?' — это не телефонный экран':' — не на весь экран'));
  if(!t.fs&&Math.abs(t.width-want)>1)note(where+': ширина экрана '+t.width+' вместо '+want+' — планшет рисует не телефон, а свою раскладку'+(process.env.TT_PHONES_DEBUG?' [meta: '+t.metas+']':''));
  // Первый экран главной как у телефона (стоя): названия под карточками
  // карусели над нижней панелью, а не под ней.
  if(w<h&&t.hidden>2)note(where+': названия под карточками карусели уходят под нижнюю панель на '+t.hidden+' точек — первый экран главной не помещается');
  for(const x of t.out)note(where+': «'+x+'» вылезает за экран приложения');
  for(const sel of anchors){const a=t.at[sel],b=p.at[sel];
   if(!a&&!b)continue;
   if(!a||!b){note(where+': «'+sel+'» '+(a?'есть на планшете, но нет на телефоне':'есть на телефоне, но нет на планшете'));continue;}
   const d=Math.max(...a.map((v,k)=>Math.abs(v-b[k])));
   if(d>2)note(where+': «'+sel+'» не как на телефоне: '+a.join(',')+' против '+b.join(',')+' (x,y,ширина,высота)');}
 };
 // Экран боком (телефон и планшет): плеер помещается целиком, без прокрутки, —
 // кнопка воспроизведения и скорость с таймером над нижним краем.
 const inspectLandscape=async(page,where)=>{
  const r=await page.evaluate(()=>{const H=innerHeight,W=innerWidth,out=[];
   if(W<=H)return out;
   // Боком — та же раскладка, что стоя (решение владельца: «дизайн
   // остаётся, без изменения идеи»). Постер — во всю ширину и целиком, 15:7;
   // карточки списков — во всю ширину, одна под другой; читалка — разворот.
   const scene=document.querySelector('.tt-soft-home .scene:not(.scene-fallback)');
   if(scene){const b=scene.getBoundingClientRect(),m=document.querySelector('.listener-main').getBoundingClientRect();
    const cs=getComputedStyle(document.querySelector('.listener-main'));
    const inner=m.width-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight);
    if(Math.abs(b.width-inner)>2)out.push('постер не во всю ширину: '+Math.round(b.width)+' из '+Math.round(inner));
    if(Math.abs(b.height-b.width*7/15)>2)out.push('постер не 15:7: '+Math.round(b.width)+'×'+Math.round(b.height));}
   const cards=[...document.querySelectorAll('.listener-main .post-list>.post-card')].map(n=>n.getBoundingClientRect());
   if(cards.length>1){const list=document.querySelector('.listener-main .post-list').getBoundingClientRect();
    if(cards.some(c=>Math.abs(c.width-list.width)>2))out.push('карточки списка не во всю ширину, как стоя: '+Math.round(cards[0].width)+' из '+Math.round(list.width));}
   const sheets=[...document.querySelectorAll('.tt-reader-page:not(.is-copy)')].map(n=>n.getBoundingClientRect());
   if(document.querySelector('.tt-reader')&&W>=600){
    if(sheets.length!==2)out.push('читалка боком не разворотом: страниц рядом '+sheets.length);
    else if(sheets[0].right>sheets[1].left-8)out.push('страницы разворота наезжают друг на друга');}
   const p=document.querySelector('.podcast-player.is-open');if(!p)return out;
   for(const sel of ['.podcast-toggle','.player-extras','.player-title']){const n=p.querySelector(sel);if(!n)continue;const b=n.getBoundingClientRect();
    if(b.bottom>H+1||b.top<-1)out.push('«'+sel+'» за краем экрана: '+Math.round(b.top)+'…'+Math.round(b.bottom)+' при высоте '+H);}
   // Блоки управления не наезжают друг на друга: название сжималось до
   // полоски и пряталось под дорожкой прокрутки.
   let prev=null;for(const n of p.querySelectorAll('.player-body>*')){const s=getComputedStyle(n);if(s.display==='none'||s.position==='absolute')continue;
    const b=n.getBoundingClientRect();if(!b.height)continue;
    if(prev&&b.top<prev.b.bottom-1)out.push('«'+(n.className||n.tagName)+'» наезжает на «'+(prev.n.className||prev.n.tagName)+'» на '+Math.round(prev.b.bottom-b.top)+' точек');
    // Сжат — значит, коробка ниже того, что в ней должно стоять: всё
    // содержимое, а у названия с ограничением строк — эти строки целиком.
    const lines=s.webkitLineClamp==='none'?0:+s.webkitLineClamp,lh=parseFloat(s.lineHeight)||0;
    const need=lines&&lh?Math.min(n.scrollHeight,lines*lh):n.scrollHeight;
    if(need>n.clientHeight+2&&!/(auto|scroll)/.test(s.overflowY))out.push('«'+(n.className||n.tagName)+'» сжат: нужно '+Math.round(need)+' точек, а коробка '+n.clientHeight);
    prev={n,b};}
   const st=p.querySelector('.player-stage');
   // Фотография — фоном во весь экран, управление столбиком поверх, как стоя.
   if(st&&getComputedStyle(st).display!=='none'){const b=st.getBoundingClientRect();
    if(b.height<H-2||b.width<W-2)out.push('фотография плеера не фоном во весь экран: '+Math.round(b.width)+'×'+Math.round(b.height)+' на экране '+W+'×'+H);}
   return out;});
  for(const x of r)note(where+': '+x);
 };
 // Карусель главной листается пальцем — на любом экране, стоя и боком.
 // Владелец: «перевернул телефон горизонтально — карусель не работает».
 // Бросок — как у пальца: касание, восемь шагов по 16 мс, отпускание, с
 // метками времени (иначе инерции нет). После броска посередине должна встать
 // другая карточка, ровно по центру окна, и карточки не наезжают друг на друга.
 const checkCarousel=async(page,where,keep=false)=>{
  if(!await page.locator('.soft-carousel').count())return;
  if(process.env.TT_PHONES_DEBUG)console.log('размеры',where,await page.evaluate(()=>{const q=s=>{const n=document.querySelector(s);if(!n)return null;const b=n.getBoundingClientRect();return [Math.round(b.top),Math.round(b.bottom),Math.round(b.width)].join('/');};
   return JSON.stringify({li:q('.soft-reel>li'),art:q('.soft-reel>li .soft-art'),name:q('.soft-reel>li strong'),car:q('.soft-carousel'),head:q('.soft-catalog-head'),nav:q('.bottom-nav'),hdr:q('.top-header'),scene:q('.tt-soft-home .scene'),foot:q('.soft-hero-foot'),card:getComputedStyle(document.querySelector('.tt-soft-home')).getPropertyValue('--tt-land-card')});}));
  // Карусель докручивается до середины экрана: палец листает то, что видит.
  await page.evaluate(()=>document.querySelector('.soft-carousel').scrollIntoView({block:'center'}));await page.waitForTimeout(400);
  const look=()=>page.evaluate(()=>{const v=document.querySelector('.soft-carousel'),vr=v.getBoundingClientRect(),mid=vr.left+v.clientWidth/2;
   const arts=[...v.querySelectorAll('.soft-reel>li .soft-art')].map((a,i)=>{const r=a.getBoundingClientRect();return {i,l:r.left,r:r.right,off:Math.abs(r.left+r.width/2-mid)};});
   const best=arts.reduce((p,q)=>q.off<p.off?q:p);
   const vis=arts.filter(a=>a.r>vr.left&&a.l<vr.right).sort((a,b)=>a.l-b.l);
   const overlap=vis.slice(1).map((a,k)=>vis[k].r-a.l).filter(d=>d>1).map(Math.round);
   const name=v.querySelectorAll('.soft-reel>li strong')[best.i]?.textContent.trim();
   // Пустота сбоку: между краем окна и ближайшей карточкой зазор больше
   // промежутка между карточками — круг не замкнулся.
   const blank=vis.length?Math.round(Math.max(vis[0].l-vr.left,vr.right-vis[vis.length-1].r)):Math.round(vr.width);
   const step=v.querySelector('.soft-reel>li')?.getBoundingClientRect().width||0;
   return {mid:best.i,name,off:Math.round(best.off*10)/10,overlap,width:Math.round(vr.width),top:Math.round(vr.top),loop:v.dataset.loop,blank,cards:arts.length,step};});
  const a=await look();
  const cdp=await page.context().newCDPSession(page);
  const box=await page.locator('.soft-carousel').boundingBox();
  // Медленно, на полторы карточки, с остановкой перед отпусканием — без
  // инерции: так после броска посередине обязана встать соседняя карточка, а
  // не та же самая, прокрученная полным кругом.
  // Шаг ленты — ширина ячейки. Разность мест двух ячеек не годится: после
  // перестановки на стыке круга соседние по списку стоят в разных концах.
  const card=await page.evaluate(()=>document.querySelector('.soft-reel>li').getBoundingClientRect().width);
  const y=Math.round(box.y+box.height*0.4);let x=Math.round(box.x+box.width/2+card),t=Date.now()/1000;
  const steps=Math.ceil(card*1.5/10);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}],timestamp:t});
  for(let i=0;i<steps;i++){x-=10;t+=0.03;await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y}],timestamp:t});}
  for(let i=0;i<6;i++){t+=0.03;await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y}],timestamp:t});}
  t+=0.03;await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[],timestamp:t});
  await page.waitForTimeout(2200);
  const b=await look();await cdp.detach().catch(()=>{});
  if(process.env.TT_PHONES_DEBUG)console.log('карусель',where,JSON.stringify(a),JSON.stringify(b));
  if(a.overlap.length)note(where+': карточки карусели наезжают друг на друга на '+a.overlap.join(', ')+' точек');
  if(a.cards>1&&a.loop!=='yes')note(where+': круг карусели выключен ('+a.cards+' карточек на окно '+a.width+') — лента встаёт с пустотой сбоку');
  if(a.off>3)note(where+': карусель стоит не по центру: средняя карточка в '+a.off+' точках от середины');
  // Сравнение по номеру карточки, а не по названию: у тестовых выпусков
  // названия бывают одинаковыми, и переход между ними выглядел бы стоянием.
  if(b.mid===a.mid)note(where+': карусель не листается пальцем — после броска посередине та же карточка «'+a.name+'»');
  else if(b.off>3)note(where+': карусель после броска не встала по центру ('+b.off+' точек)');
  if(b.overlap.length)note(where+': после броска карточки карусели наезжают друг на друга на '+b.overlap.join(', ')+' точек');
  // Пустота — это пустое место под карточку. Крайние карточки чуть меньше
  // (глубина), и узкая щель у края — не пустота.
  if(b.blank>b.step*0.6)note(where+': после броска сбоку от карусели пустота '+b.blank+' точек — карточки не идут по кругу');
  // Быстрый бросок — как обычно листают: короткое резкое движение пальцем.
  // Лента обязана уехать и встать на другой карточке, а не вернуться назад.
  {const c2=await page.context().newCDPSession(page);const bx=await page.locator('.soft-carousel').boundingBox();
   const yy=Math.round(bx.y+bx.height*0.4);let xx=Math.round(bx.x+bx.width*0.7),tt=Date.now()/1000;const before=await look();
   await c2.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:xx,y:yy}],timestamp:tt});
   for(let i=0;i<6;i++){xx-=28;tt+=0.016;await c2.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:xx,y:yy}],timestamp:tt});}
   tt+=0.016;await c2.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[],timestamp:tt});
   await page.waitForTimeout(2500);const after=await look();await c2.detach().catch(()=>{});
   if(process.env.TT_PHONES_DEBUG)console.log('бросок',where,before.name,'→',after.name,after.off);
   if(after.mid===before.mid)note(where+': быстрый бросок не листает карусель — посередине снова «'+before.name+'»');
   else if(after.off>3)note(where+': после быстрого броска карусель не встала по центру ('+after.off+' точек)');}
  // После поворота страницу не перезагружаем: поворот проверяется на том же
  // документе, иначе это было бы открытие заново, а не поворот.
  if(!keep){await page.goto(page.url());await page.waitForLoadState('networkidle').catch(()=>{});}
  else await page.evaluate(()=>{const m=document.querySelector('.listener-main')||document.scrollingElement;m.scrollTop=0;});
 };
 // Поворот на ходу. Владелец: «поворачиваю телефон — карусель не работает».
 // Страница открывается стоя и поворачивается уже открытой, как телефон в
 // руке: тот же документ, другой размер окна и ориентация экрана. После
 // поворота и обратно карусель обязана листаться, экран — не съезжать.
 // Боком у телефона сбоку вырез под камеру: браузер отдаёт его как отступ
 // безопасной зоны слева или справа (смотря в какую сторону повернули). На
 // снимке владельца из-за него страница вылезала за правый край.
 // Порядок важен: смена размера окна у Playwright сбрасывает размер экрана на
 // 800×600, поэтому сначала окно, а уже потом экран и ориентация.
 // Размер экрана эмуляция после открытия страницы не меняет (остаётся
 // 800×600), поэтому экран подменяется в самой странице — скрипт планшета
 // читает именно screen.width и screen.height.
 const rotate=async(page,w,h,side='left')=>{
  await page.evaluate(([w,h])=>{for(const [k,v] of [['width',w],['height',h],['availWidth',w],['availHeight',h]])Object.defineProperty(screen,k,{get:()=>v,configurable:true});},[w,h]);
  await page.setViewportSize({width:w,height:h});
  const cdp=await page.context().newCDPSession(page);
  // Своё «устройство» через CDP здесь не ставим: оно спорило с эмуляцией
  // Playwright, и браузер переставал слушать meta viewport — планшет после
  // поворота оставался шириной в экран. Ориентация в стилях считается по
  // размеру окна, а не по датчику.
  const cut=w>h?32:0;
  await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:{top:w>h?0:24,left:side==='left'?cut:0,right:side==='right'?cut:0,bottom:w>h?0:16}}).catch(e=>note('эмуляция выреза недоступна: '+e.message));
  await page.evaluate(()=>window.dispatchEvent(new Event('orientationchange')));
  await page.waitForTimeout(1200);await cdp.detach().catch(()=>{});};
 // Под вырезом и системной панелью сбоку не должно быть ни текста, ни кнопок:
 // на снимке владельца правый край страницы уходил под панель.
 const inspectSafe=async(page,where,side)=>{
  const bad=await page.evaluate(([side])=>{const W=innerWidth,out=[];
   // Ширину выреза берём у самой страницы: на планшете страница
   // масштабирована, и в её точках вырез уже, чем задан эмуляции.
   const probe=document.createElement('div');probe.style.cssText='position:fixed;top:0;left:0;width:0;height:0;padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right)';
   document.body.appendChild(probe);const cs=getComputedStyle(probe);const cut=parseFloat(side==='left'?cs.paddingLeft:cs.paddingRight)||0;probe.remove();
   if(cut<1)return ['стенд: вырез '+(side==='left'?'слева':'справа')+' не дошёл до страницы — проверять нечего'];
   for(const n of document.querySelectorAll('body *')){
    const s=getComputedStyle(n);if(s.visibility==='hidden'||s.display==='none'||+s.opacity===0)continue;
    const text=[...n.childNodes].some(c=>c.nodeType===3&&c.textContent.trim());
    if(!text&&!n.matches('button,a,input,select'))continue;
    if(n.closest('[aria-hidden="true"],.sr-only,.soft-carousel'))continue;
    const b=n.getBoundingClientRect();if(!b.width||!b.height||b.bottom<0||b.top>innerHeight)continue;
    if(side==='left'&&b.left<cut-1||side==='right'&&b.right>W-cut+1)
     out.push((n.className&&typeof n.className==='string'?n.className.split(' ')[0]:n.tagName)+' «'+n.textContent.trim().slice(0,24)+'» '+Math.round(b.left)+'…'+Math.round(b.right));}
   return out.slice(0,4);},[side]);
  for(const x of bad)note(where+': под вырезом '+(side==='left'?'слева':'справа')+': '+x);
 };
 const checkRotation=async(w,h)=>{
  const ctx=await browser.newContext({viewport:{width:w,height:h},screen:{width:w,height:h},deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'ru-RU'});
  const page=await ctx.newPage();page.on('pageerror',e=>note('поворот '+w+'×'+h+': ошибка на странице: '+e.message));
  await page.goto(base+'/?mode=listen');
  if(process.env.TT_PHONES_CSS)await page.addStyleTag({content:process.env.TT_PHONES_CSS});
  await settle(page);
  for(const [W,H,label,side] of [[h,w,'боком','left'],[h,w,'боком-вправо','right'],[w,h,'снова стоя','left']]){
   await rotate(page,W,H,side);screens++;
   const where='поворот '+w+'×'+h+' → '+label+' ('+W+'×'+H+')';
   await inspect(page,where,'ru');if(W>H)await inspectSafe(page,where,side);
   // Постер — картинка, он идёт под вырез до самого края стекла: отодвинутый
   // от выреза, он давал жёсткую границу и тёмную полосу у камеры.
   if(W>H){const sc=await page.evaluate(()=>{const n=document.querySelector('.tt-soft-home .scene');if(!n)return null;const b=n.getBoundingClientRect();return {l:b.left,r:b.right,W:innerWidth};});
    if(sc&&(sc.l>0.5||sc.r<sc.W-0.5))note(where+': постер не до края экрана ('+Math.round(sc.l)+'…'+Math.round(sc.r)+' из '+sc.W+') — у выреза жёсткая граница');}
   // Планшет после поворота пересчитывает ширину экрана — тем же масштабом.
   if(Math.min(w,h)>=600){const cw=await page.evaluate(()=>document.documentElement.clientWidth),[lw]=logical(W,H);
    if(Math.abs(cw-lw)>2)note(where+': после поворота ширина экрана '+cw+' вместо '+lw+' — планшет не пересчитал масштаб'+(process.env.TT_PHONES_DEBUG?' '+await page.evaluate(()=>JSON.stringify({sw:screen.width,sh:screen.height,iw:innerWidth,vv:visualViewport.scale,meta:[...document.querySelectorAll('meta[name=viewport]')].map(m=>m.content),tab:document.documentElement.hasAttribute('data-tt-tablet')})):''));}
   await page.screenshot({path:path.join(out,`rotate-${w}x${h}-${label.replace(/\s+/g,'-')}.png`)});
   await checkCarousel(page,where,true);
  }
  // Все разделы боком с вырезом сбоку — открытые переходом по нижней панели,
  // как это делает человек, уже в лежачем положении.
  await rotate(page,h,w,'left');
  for(const [name] of views.slice(1,6)){
   const idx={'слушать':0,'видео':1,'эфир':3,'истории':4}[name];if(idx===undefined)continue;
   await page.locator('.bottom-nav > *').nth(idx).click();await page.waitForTimeout(900);screens++;
   const where='поворот '+w+'×'+h+' боком, вырез слева: '+name;
   await inspect(page,where,'ru');await inspectLandscape(page,where);await inspectSafe(page,where,'left');
   await page.screenshot({path:path.join(out,`rotate-${w}x${h}-боком-${name}.png`)});
  }
  // Мало выпусков — как у владельца: на главной остаются четыре карточки
  // (остальные скрыты так же, как их скрывает слушатель, через меню
  // карточки). Лента обязана идти по кругу и стоя, и боком.
  {const list=await (await fetch(base+'/api/library',{headers:{cookie}})).json();
   const keep=new Set(list.items.filter(p=>p.published).slice(0,6).map(p=>p.id));
   const hide=list.items.filter(p=>p.published&&!keep.has(p.id)).map((p,i)=>({id:p.id,at:Date.now()-i}));
   await page.evaluate(h=>localStorage.setItem('tt-hidden-v1',JSON.stringify(h)),hide);
   await page.locator('.bottom-nav > *').nth(2).click();await page.waitForTimeout(900);
   for(const [W,H,label] of [[h,w,'боком, мало выпусков'],[w,h,'стоя, мало выпусков']]){
    await rotate(page,W,H,'left');screens++;
    const where='поворот '+w+'×'+h+' → '+label;
    await page.screenshot({path:path.join(out,`rotate-${w}x${h}-${label.replace(/[\s,]+/g,'-')}.png`)});
    await checkCarousel(page,where,true);}
   await page.evaluate(()=>localStorage.removeItem('tt-hidden-v1'));}
  await ctx.close();
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
   await inspectLandscape(page,lang+' '+w+'×'+h+' '+name);
   if(shots)await page.screenshot({path:path.join(out,`${lang}-${w}x${h}-${name}.png`)});
   if(name==='главная'&&lang==='ru')await checkCarousel(page,lang+' '+w+'×'+h+' главная');
   // Тип аудио в карточках — из данных записи: три типа и нейтральное «АУДИО»
   // у старой записи без типа. Тип читается целиком, а не обрезан.
   if(name==='слушать'&&lang==='ru'){
    const tags=await page.evaluate(()=>[...document.querySelectorAll('.post-card')].map(c=>{const m=c.querySelector('.post-meta');
     const tag=m?[...m.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim():'';
     return {title:c.querySelector('.post-title')?.textContent.trim(),tag,cut:m?m.scrollWidth>m.clientWidth+1:false};}));
    const want={'Тишина':'АУДИОИСТОРИЯ','Голос северного ветра':'МУЗЫКА','Старая запись':'АУДИО'};
    for(const [title,tag] of Object.entries(want)){const c=tags.find(x=>x.title===title);
     if(!c)note(lang+' '+w+'×'+h+' слушать: нет карточки «'+title+'»');
     else if(c.tag!==tag)note(lang+' '+w+'×'+h+' слушать: у «'+title+'» подпись «'+c.tag+'» вместо «'+tag+'»');}
    for(const c of tags)if(c.cut)note(lang+' '+w+'×'+h+' слушать: тип «'+c.tag+'» обрезан');}
   // Читалка боком с выбором «одна страница» — как в Play Книгах: одна
   // страница во всю ширину, а не разворот.
   if(name==='читалка'&&w>h&&w>=600){
    await page.evaluate(()=>{const p=JSON.parse(localStorage.getItem('tt-reader-prefs-v1')||'{}');localStorage.setItem('tt-reader-prefs-v1',JSON.stringify({...p,spread:false}));});
    await page.goto(base+url);await settle(page);
    const one=await page.evaluate(()=>[...document.querySelectorAll('.tt-reader-page:not(.is-copy)')].map(n=>n.getBoundingClientRect().width));
    if(one.length!==1)note(lang+' '+w+'×'+h+' читалка, «одна страница»: страниц рядом '+one.length+' вместо одной');
    else if(one[0]<w*0.6)note(lang+' '+w+'×'+h+' читалка, «одна страница»: страница '+Math.round(one[0])+' в ширину из '+w+' — не во всю ширину');
    if(shots)await page.screenshot({path:path.join(out,`${lang}-${w}x${h}-читалка-одна.png`)});
    await page.evaluate(()=>{const p=JSON.parse(localStorage.getItem('tt-reader-prefs-v1')||'{}');localStorage.setItem('tt-reader-prefs-v1',JSON.stringify({...p,spread:true}));});}
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
  const ctx=await browser.newContext({viewport:{width:w,height:h},screen:{width:w,height:h},deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:langs[lang]});
  // Полный экран — только по касанию, как в настоящем браузере. Безоконный
  // пускал в него и без касания, при открытии читалки, и растягивал заодно
  // окно телефона в соседней вкладке: сравнение становилось случайным.
  await ctx.addInitScript(()=>{const real=Element.prototype.requestFullscreen;
   Element.prototype.requestFullscreen=function(...a){return navigator.userActivation&&!navigator.userActivation.isActive?Promise.reject(new TypeError('no gesture')):real.apply(this,a);};});
  const page=await ctx.newPage();page.on('pageerror',e=>note(lang+' планшет '+w+'×'+h+': ошибка на странице: '+e.message));
  // Телефон той же логической ширины и высоты: стоя — та же ширина, что
  // объявляет планшет (430–700), боком — колонка 430 × высота окна.
  // Высота — та, что вышла на самом планшете: без системных панелей она
  // может отличаться от расчётной на точку.
  await page.goto(base+list[0][1]);await settle(page);
  const [lw]=logical(w,h),lh=await page.evaluate(()=>innerHeight);
  // Экран телефона — того же размера, что окно: в полном экране окно
  // растягивается до экрана, и без этого телефон в читалке вдруг становился
  // высотой с планшет (1480), а сравнение — случайным.
  const pctx=await browser.newContext({viewport:{width:lw,height:lh},screen:{width:lw,height:lh},deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:langs[lang]});
  // Телефон — образец раскладки, в полный экран ему не нужно: в безоконном
  // браузере окно в полном экране растягивалось до чужого экрана (1480), и
  // сравнение становилось случайным.
  await pctx.addInitScript(()=>{Element.prototype.requestFullscreen=function(){return Promise.resolve();};});
  const phone=await pctx.newPage();
  for(const [name,url] of list){
   await page.goto(base+url);await phone.goto(base+url);
   if(process.env.TT_PHONES_CSS){await page.addStyleTag({content:process.env.TT_PHONES_CSS});}
   if(process.env.TT_PHONES_JS)await page.evaluate(process.env.TT_PHONES_JS);
   await settle(page);await settle(phone);
   // Читалка просится в полный экран сама, при открытии; безоконный браузер
   // иногда пускает и без касания. Обычный вид сравниваем без полного экрана,
   // полный — отдельно ниже.
   if(await page.evaluate(()=>!!document.fullscreenElement)){await page.evaluate(()=>document.exitFullscreen()).catch(()=>{});await page.waitForTimeout(700);}
   await page.waitForTimeout(200);await phone.waitForTimeout(200);screens++;
   // Образец обязан быть того размера, с каким создан. Изредка безоконный
   // браузер отдавал вкладке телефона чужой размер (700×819 вместо 791×494),
   // и расхождение было бы ложным. Тогда — перезагрузка; не помогло — это
   // поломка стенда, и она называется своими словами, а не косяком экрана.
   const sized=()=>phone.evaluate(([w,h])=>Math.abs(document.documentElement.clientWidth-w)<=2&&Math.abs(innerHeight-h)<=2,[lw,lh]);
   let fair=true;
   if(!await sized()){await phone.reload();await settle(phone);
    if(!await sized()){fair=false;note('стенд: телефон-образец для планшета '+w+'×'+h+' не своего размера — сравнение '+name+' не проведено');}}
   await inspect(page,lang+' планшет '+w+'×'+h+' '+name,lang);
   if(fair)await inspectTablet(page,'планшет '+w+'×'+h+' '+name,w,h,phone);
   await inspectLandscape(page,'планшет '+w+'×'+h+' '+name);
   if(shots)await page.screenshot({path:path.join(out,`tablet-${lang}-${w}x${h}-${name}.png`)});
   if(name==='главная'&&lang==='ru')await checkCarousel(page,'планшет '+w+'×'+h+' главная');
   // Читалка — в настоящем полном экране, без часов и панелей Android. Браузер
   // пускает в него только по касанию, поэтому касаемся середины страницы, как
   // человек, — это заодно убирает панели читалки. Телефон — так же.
   if(name==='читалка'){
    // Образец снимается с телефона до того, как планшет уйдёт в полный экран:
    // безоконный браузер растягивает в нём окна всех вкладок, и телефон
    // после этого — уже не телефон.
    const tap=async(pg)=>{const b=await pg.locator('.tt-reader-stage').boundingBox();await pg.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);await pg.waitForTimeout(900);};
    await tap(phone);const sample=await frame(phone,true);
    await tap(page);
    const fs=await page.evaluate(()=>!!document.fullscreenElement);
    if(!fs)note('планшет '+w+'×'+h+' читалка: по касанию не вышла в полный экран — видны часы и панели');
    else await inspectTablet(page,'планшет '+w+'×'+h+' читалка в полном экране',w,h,sample);
    if(shots)await page.screenshot({path:path.join(out,`tablet-${lang}-${w}x${h}-читалка-полный.png`)});
    await page.evaluate(()=>document.fullscreenElement&&document.exitFullscreen()).catch(()=>{});
    await phone.evaluate(()=>document.fullscreenElement&&document.exitFullscreen()).catch(()=>{});
   }
  }
  await pctx.close();await ctx.close();
 };
 const landscapes=[[740,360],[844,390],[915,412]];
 const rotations=process.env.TT_PHONES_SIZE?[process.env.TT_PHONES_SIZE.split("x").map(Number)]:[[390,844],[412,915],[360,780],[924,1480]];
 if(process.env.TT_PHONES_ROTATE==='only'){for(const [w,h] of rotations)await checkRotation(w,h);}
 else if(process.env.TT_PHONES_LANDSCAPE==='only'){
  for(const [w,h] of landscapes.filter(([w,h])=>!process.env.TT_PHONES_SIZE||process.env.TT_PHONES_SIZE===w+'x'+h))
   await run(w,h,'ru',tabletViews.filter(([n])=>!process.env.TT_PHONES_VIEW||n===process.env.TT_PHONES_VIEW),true);
 }else if(process.env.TT_PHONES_TABLETS==='only'){
  const only=process.env.TT_PHONES_SIZE;const pick=process.env.TT_PHONES_VIEW;
  for(const [w,h] of tablets.filter(([w,h])=>!only||only===w+'x'+h))await runTablet(w,h,'ru',tabletViews.filter(([n])=>!pick||n===pick),true);
 }else{
 // Все размеры — на русском; все языки — на самом узком и на обычном экране.
 const quick=process.env.TT_PHONES_QUICK==='1';
 for(const [w,h] of quick?[[320,568],[390,844]]:phones)await run(w,h,'ru',views,!quick&&(w===320||w===390||w===480));
 for(const lang of quick?['it']:['it','uk','ro'])for(const [w,h] of quick?[[320,568]]:[[320,568],[390,844]])await run(w,h,lang,views,!quick&&w===320);
 // Телефон боком — все экраны, как стоя: владелец просил одно приложение в
 // любом положении.
 if(!quick)for(const [w,h] of landscapes)await run(w,h,'ru',tabletViews,true);
 if(!quick)for(const [w,h] of rotations)await checkRotation(w,h);
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
