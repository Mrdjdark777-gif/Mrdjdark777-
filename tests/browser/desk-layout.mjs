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
 * - первый экран (9 октября): обложка во всю ширину без ничего поверх,
 *   под ней название и первый ряд блока «Новое в True Thrills» — целиком в
 *   окне; обложка 4:1 из студии ложится на весь баннер, без неё постер целиком;
 * - каркас (13 октября, вечер): бокового меню нет; в верхней строке знак
 *   канала слева, разделы ровно по центру, справа «Приложение», поддержка,
 *   поделиться, настройки — без поиска; ничто ни на что не наезжает;
 * - на обложке — кнопка действия и «Поделиться», под ней — только описание:
 *   ни типа, ни длительности, ни названия;
 * - QR-код приложения (фирменный, с логотипом) в окошке «Приложение» и в
 *   полосе под «Новое» читается: его снимают с экрана и распознают;
 * - поиск — в разделе, а не в верхней строке;
 * - «Новое в True Thrills» — один ряд по центру, не больше восьми плиток,
 *   без полок по разделам и без переключателей; каждый выпуск один раз;
 *   запись эфира подписана как запись; «Поделиться» — отдельной кнопкой;
 *   с плеером внизу плитки того же размера, что без него;
 * - вход для автора в настройках — только в программе для ПК;
 * - крупный выпуск раздела — не на пол-экрана;
 * - на ПК нет фона-сетки (она спорила с обложками);
 * - меню: без карточки поддержки, «Скачать приложение» — заметной карточкой
 *   без номера сборки, YouTube — отдельной кнопкой; в подвале ни номера,
 *   ни «Поддержать»;
 * - разделы — витрина: крупно последний выпуск, переключатели типа и
 *   порядка, сетка плиток; карточек телефонного списка нет;
 * - поиск сверху ищет по всем разделам и возвращает главную, когда стёрт;
 * - плеер: полоса внизу во всю ширину, меню над ней не заходит под неё;
 *   развёрнутый — обложка слева от названия; Escape сворачивает;
 * - телефон и сенсорный планшет этот каркас не получают.
 *
 * Всё — во временной базе; рабочие данные не трогаются.
 */
import {chromium} from 'playwright';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,rm,readFile,copyFile} from 'node:fs/promises';
import crypto from 'node:crypto';
import jsQR from 'jsqr';
import sharp from 'sharp';
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
 await post({action:'links',links:[{kind:'youtube',url:'https://youtube.com/@truethrills'},{kind:'tiktok',url:'https://www.tiktok.com/@truethrills'},{kind:'telegram',url:'https://t.me/truethrills'}]});
 const cover=async f=>{const b=await readFile(path.join(root,'tests/fixtures/demo-covers',f));return (await (await fetch(base+'/api/cover',{method:'POST',headers:{cookie,'content-type':'image/jpeg','x-upload-size':String(b.length)},body:b})).json()).key;};
 const seconds=6,rate=8000,wav=Buffer.alloc(44+rate*2*seconds);
 wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
 for(let i=0;i<rate*seconds;i++)wav.writeInt16LE(Math.round(Math.sin(i/9)*9000),44+i*2);
 const audio=async()=>(await (await fetch(base+'/api/audio',{method:'POST',headers:{cookie,'content-type':'audio/wav','x-upload-size':String(wav.length)},body:wav})).json()).key;
 const covers=['tile-forest.jpg','tile-mountains.jpg','tile-waterfall.jpg','tall-lake.jpg'];
 const titles=['Плот','Северный ветер','Тишина','Не конец','Перевал','Ночь под скалой','Последний костёр','Река без имени','Обрыв','Ледник'];
 for(let n=0;n<titles.length;n++)await post({kind:'podcast',audioCategory:['audio_story','podcast','music'][n%3],title:titles[n],description:'Описание выпуска '+n+'.',audioKey:await audio(),duration:seconds,published:true,coverKey:await cover(covers[n%4])});
 await post({kind:'story',title:'Записки из ледяной пустыни',description:'Рассказ.',body:'Текст истории.\n\n'+Array.from({length:24},()=>'Плот нужно подкачивать. Снаряжение изнашивается. Ружьё ломается, его\nприходится чинить. При этом расходовать всё на один ремонт нельзя: неизвестно, что откажет следующим.').join('\n\n'),published:true,coverKey:await cover('tile-mountains.jpg')});
 await post({kind:'video',title:'Наедине с горами',description:'Видео.',videoUrl:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',published:true,coverKey:await cover('tile-waterfall.jpg')});
 // Запись эфира — как её публикует воркер: ключ audio/live-…, тип звука не выбран.
 {const k=await audio(),ak='audio/live-'+crypto.randomUUID();
  await copyFile(path.join(env.STORAGE_DIR,k),path.join(env.STORAGE_DIR,ak));
  await copyFile(path.join(env.STORAGE_DIR,k+'.meta.json'),path.join(env.STORAGE_DIR,ak+'.meta.json')).catch(()=>{});
  const made=await post({kind:'podcast',audioCategory:'podcast',title:'Эфир у костра',description:'Запись эфира.',audioKey:ak,duration:seconds,published:true});
  execFileSync(process.execPath,['-e',"require('better-sqlite3')(process.argv[1]).prepare('update posts set audio_category=null where id=?').run(process.argv[2])",env.DATABASE_PATH,(made.item||made.post||made).id]);}
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
   const s=document.querySelector('.app-shell'),nav=document.querySelector('.bottom-nav');
   return {cls:s?.className??'',oldRail:!!document.querySelector('.desk-rail'),brand:!!document.querySelector('.top-header .desk-brand img'),
    items:[...document.querySelectorAll('.top-header .desk-tab')].map(b=>b.textContent.trim()),search:!!document.querySelector('.top-header input[type=search]'),
    navShown:!!nav&&getComputedStyle(nav).display!=='none',scroll:document.documentElement.scrollWidth-innerWidth};
  });
  check(/\bis-desk\b/.test(shell.cls)&&!/\bis-listener\b/.test(shell.cls),at+'слушатель на ПК не получил каркас .is-desk: '+shell.cls);
  check(!shell.oldRail,at+'снова боковое меню — владелец убрал его 13 октября');
  check(shell.brand,at+'нет знака канала слева в верхней строке');
  check(shell.items.length===5&&shell.items[0].startsWith('Главная'),at+'разделы в верхней строке не те или «Главная» не первая: '+shell.items.join(' | '));
  check(!shell.search,at+'в верхней строке снова поиск — он должен быть в разделах');
  check(!shell.navShown,at+'нижняя телефонная панель разделов видна на ПК');
  // Без каркаса дальше мерить нечего: остальные проверки только упали бы на
  // отсутствующих элементах, а не назвали бы поломку.
  if(!/\bis-desk\b/.test(shell.cls)){await ctx.close();continue;}
  check(shell.scroll<=1,at+'страница шире окна на '+shell.scroll+'px');
  // Ничего не уходит за правый край окна (кроме ушедших в скрытые ряды плиток).
  const over=await page.evaluate(()=>[...document.querySelectorAll('.app-shell *')].filter(el=>{const b=el.getBoundingClientRect();return b.width>0&&b.height>0&&b.right>innerWidth+1&&!el.closest('.desk-banner');}).slice(0,3).map(el=>el.className||el.tagName));
  check(over.length===0,at+'за правым краем: '+over.join(', '));
  // Постер целиком: своя пропорция и в границах баннера.
  const banner=await page.evaluate(()=>{const b=document.querySelector('.desk-banner'),img=b?.querySelector('img.desk-banner-art');if(!b||!img)return null;
   const br=b.getBoundingClientRect(),ir=img.getBoundingClientRect();
   return {natural:img.naturalWidth/img.naturalHeight,shown:ir.width/ir.height,inside:ir.left>=br.left-1&&ir.right<=br.right+1&&ir.top>=br.top-1&&ir.bottom<=br.bottom+1,fit:getComputedStyle(img).objectFit,h:Math.round(br.height)};});
  check(banner,at+'на главной нет баннера с постером');
  if(banner){check(Math.abs(banner.shown-banner.natural)/banner.natural<0.02&&banner.fit!=='cover',at+'постер в баннере искажён или обрезан: пропорция '+banner.shown.toFixed(3)+' вместо '+banner.natural.toFixed(3)+', object-fit '+banner.fit);
   check(banner.inside,at+'постер вылез за баннер');check(banner.h>=240,at+'баннер высотой '+banner.h+' при экране '+h);}
  // Первый экран: обложка во всю ширину содержимого, на ней — только кнопка
  // действия и «Поделиться», под ней — строка описания, ниже ряд «Новое в
  // True Thrills» целиком в окне.
  const first=await page.evaluate(()=>{const b=document.querySelector('.desk-hero>.desk-banner')?.getBoundingClientRect(),home=document.querySelector('.desk-home').getBoundingClientRect(),
   note=document.querySelector('.desk-hero>.desk-hero-note')?.getBoundingClientRect(),fresh=document.querySelector('.desk-hero+.desk-fresh'),
   onCover=[...document.querySelectorAll('.desk-banner-actions>*')].filter(e=>e.getBoundingClientRect().width>0).map(e=>e.getAttribute('aria-label')?'share':e.textContent.trim()),
   words=[...document.querySelectorAll('.desk-hero h1,.desk-hero .desk-eyebrow,.desk-hero h2')].filter(e=>{const r=e.getBoundingClientRect();return r.width>2&&r.height>2;}).map(e=>e.textContent);
   const tiles=[...(fresh?.querySelectorAll('.desk-grid>.desk-tile')??[])].map(t=>t.getBoundingClientRect()),top=tiles[0]?.top;
   return b&&tiles.length?{left:Math.round(b.left),right:Math.round(b.right),homeL:Math.round(home.left),homeR:Math.round(home.right),rowBottom:Math.round(Math.max(...tiles.filter(t=>Math.abs(t.top-top)<2).map(t=>t.bottom))),
    noteTop:note?Math.round(note.top):null,bannerBottom:Math.round(b.bottom),onCover,words,
    title:fresh.querySelector('h2')?.textContent,tile:Math.round(tiles[0].width)}:null;});
  check(first,at+'на первом экране нет обложки или блока «Новое в True Thrills» сразу под ней');
  if(first){
   check(first.title==='Новое в True Thrills',at+'под обложкой не «Новое в True Thrills», а '+first.title);
   check(first.rowBottom<=h,at+'первый ряд «Новое в True Thrills» обрезан низом окна: низ ряда '+first.rowBottom+' при окне '+h);
   if(h>=1080)check(first.tile>=200,at+'на высоком окне плитки остались мелкими: '+first.tile+'px');
   check(first.onCover.length===2&&/^Слушать|^Продолжить/.test(first.onCover[0])&&first.onCover[1]==='share',at+'на обложке не «Слушать» и «Поделиться»: '+JSON.stringify(first.onCover));
   check(first.words.length===0,at+'под обложкой снова тип, длительность или название: '+first.words.join(' | '));
   check(first.noteTop===null||first.noteTop>=first.bannerBottom,at+'описание легло на обложку');
   check(Math.abs(first.left-first.homeL)<=1&&Math.abs(first.right-first.homeR)<=1,at+'обложка не во всю ширину содержимого: '+first.left+'–'+first.right+' при содержимом '+first.homeL+'–'+first.homeR);
  }
  // «Новое в True Thrills» — один ряд по центру, не больше восьми плиток;
  // без полок по разделам и без переключателей; каждый выпуск один раз.
  const cat=await page.evaluate(()=>{const grid=document.querySelector('.desk-fresh .desk-grid'),g=grid?.getBoundingClientRect(),tiles=[...document.querySelectorAll('.desk-fresh .desk-tile')].map(t=>t.getBoundingClientRect());
   return {blocks:[...document.querySelectorAll('.desk-home .desk-shelf')].map(s=>s.querySelector('h2')?.textContent),
   titles:[...document.querySelectorAll('.desk-fresh .desk-tile strong')].map(e=>e.textContent),hero:document.querySelector('.desk-hero h1')?.textContent,
   chips:document.querySelectorAll('.desk-home .desk-chip').length,rows:new Set(tiles.map(t=>Math.round(t.top))).size,
   sides:g&&tiles.length?[Math.round(Math.min(...tiles.map(t=>t.left))-g.left),Math.round(g.right-Math.max(...tiles.map(t=>t.right)))]:null,
   room:g&&tiles.length?Math.floor((g.width+18)/(tiles[0].width+18)):0,
   nested:document.querySelectorAll('.desk-tile button button').length,shares:document.querySelectorAll('.desk-fresh .desk-tile .desk-tile-share').length,
   archiveTag:[...document.querySelectorAll('.desk-fresh .desk-tile')].find(t=>t.querySelector('strong')?.textContent==='Эфир у костра')?.querySelector('.desk-tag')?.textContent};});
  check(cat.blocks.length===1&&cat.blocks[0]==='Новое в True Thrills',at+'на главной не один блок каталога, а: '+cat.blocks.join(' | '));
  check(cat.chips===0,at+'у «Новое в True Thrills» снова переключатели разделов');
  check(new Set(cat.titles).size===cat.titles.length&&!cat.titles.includes(cat.hero),at+'в «Новое в True Thrills» выпуск повторяется или повторяет обложку: '+cat.titles.join(' | '));
  check(cat.rows===1,at+'«Новое в True Thrills» не в один ряд: рядов '+cat.rows);
  check(cat.titles.length===Math.min(8,cat.room),at+'в ряду '+cat.titles.length+' плиток, а влезает '+cat.room+' (и не больше восьми)');
  check(cat.sides&&Math.abs(cat.sides[0]-cat.sides[1])<=2,at+'ряд «Новое» не по центру: слева '+cat.sides?.[0]+', справа '+cat.sides?.[1]);
  check(cat.nested===0&&cat.shares===0,at+'у плиток «Новое» снова «Поделиться» или кнопка в кнопке: вложенных '+cat.nested+', «Поделиться» '+cat.shares);
  check(/запись эфира/i.test(cat.archiveTag??''),at+'запись эфира подписана не как запись: '+cat.archiveTag);
  // Разделы ровно по центру строки и не наезжают ни на знак канала, ни на кнопки.
  const head=await page.evaluate(()=>{const q=s=>document.querySelector(s)?.getBoundingClientRect();const tabs=q('.top-header .desk-tabs'),acts=q('.top-header .top-header-actions'),brand=q('.top-header .desk-brand'),main=q('.desk-home');
   return tabs&&acts&&brand&&main?{left:Math.round(tabs.left-brand.right),right:Math.round(acts.left-tabs.right),mid:Math.round(tabs.left+tabs.width/2),contentMid:Math.round(main.left+main.width/2)}:null;});
  check(head,at+'в верхней строке нет знака канала, разделов или кнопок');
  if(head){check(head.left>=12&&head.right>=12,at+'разделы наезжают на соседей: слева '+head.left+', справа '+head.right);
   check(Math.abs(head.mid-head.contentMid)<=2,at+'разделы не по центру строки: середина '+head.mid+', середина содержимого '+head.contentMid);}
  if(w===1440){
   // Приложение и соцсети — по замечаниям владельца 9 и 13 октября: QR-код
   // фирменный и читается, без номера сборки, YouTube и TikTok плашками;
   // поддержки нигде, кроме сердечка, нет.
   const band=await page.evaluate(()=>{const b=document.querySelector('.desk-app-band'),foot=document.querySelector('.site-footer');
    return {support:!!document.querySelector('.desk-support,.desk-support-button'),text:b?.textContent??'',points:b?.querySelectorAll('.desk-band-points li').length??0,
     dl:b?.querySelector('.desk-app-action')?.getAttribute('href')??'',
     yt:b?.querySelector('.desk-youtube')?.getAttribute('href')??'',ytIcon:!![...(b?.querySelectorAll('.desk-social')??[])].find(a=>/youtube/.test(a.getAttribute('href')??'')),
     tt:b?.querySelector('.desk-tiktok')?.getAttribute('href')??'',ttIcon:!![...(b?.querySelectorAll('.desk-social')??[])].find(a=>/tiktok/.test(a.getAttribute('href')??'')),
     qrUrl:b?.querySelector('.desk-qr')?.getAttribute('data-qr-url')??'',
     foot:foot?.textContent??'',footGlow:!!foot?.querySelector('.donation-glow,[class*=glow]')};});
   check(!band.support,at+'снова карточка поддержки');
   check(band.points===3&&band.dl.endsWith('.apk'),at+'в полосе приложения нет трёх пунктов «что даёт» или кнопки скачивания: '+band.points+', '+band.dl);
   check(!/\d+\.\d+\.\d+/.test(band.text.replace(band.dl,'')),at+'у приложения номер сборки: '+band.text);
   check(/youtube\.com/.test(band.yt)&&!band.ytIcon,at+'YouTube не плашкой с логотипом (или продублирован значком)');
   check(/tiktok\.com/.test(band.tt)&&!band.ttIcon,at+'TikTok не плашкой с логотипом (или продублирован значком)');
   check(band.qrUrl.startsWith(base+'/app/')&&band.qrUrl.endsWith('.apk'),at+'QR-код ведёт не на APK этого сайта: '+band.qrUrl);
   if(band.qrUrl)check((await fetch(band.qrUrl,{method:'HEAD'})).status===200,at+'по адресу из QR-кода APK не отдаётся: '+band.qrUrl);
   check(!/\d+\.\d+\.\d+/.test(band.foot),at+'в подвале номер сборки: '+band.foot);
   check(!/Поддержать/.test(band.foot)&&!band.footGlow,at+'в подвале снова «Поддержать» с подсветкой');
   // QR-код читается: снимаем его с экрана и распознаём — в полосе и в окошке
   // «Приложение» из верхней строки.
   const readQr=async loc=>{const png=await loc.screenshot();const {data,info}=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    return jsQR(new Uint8ClampedArray(data.buffer,data.byteOffset,data.length),info.width,info.height)?.data??null;};
   // По центру окна: у верха её закрыла бы липкая верхняя строка, и на
   // снимок попала бы шапка поверх кода.
   await page.evaluate(()=>document.querySelector('.desk-app-band .desk-qr-card')?.scrollIntoView({block:'center'}));await page.waitForTimeout(200);
   const bandRead=await readQr(page.locator('.desk-app-band .desk-qr-card'));
   check(bandRead===band.qrUrl,at+'QR-код в полосе приложения не читается с экрана: '+bandRead);
   await page.evaluate(()=>scrollTo(0,0));
   await page.locator('.top-header .desk-app-button').click();await page.waitForTimeout(400);
   const popRead=await page.locator('.desk-app-panel .desk-qr-card').count()?await readQr(page.locator('.desk-app-panel .desk-qr-card')):null;
   check(popRead===band.qrUrl,at+'«Приложение» в верхней строке не открыло читаемый QR-код: '+popRead);
   await page.keyboard.press('Escape');await page.waitForTimeout(300);
   check(!(await page.locator('.desk-app-panel').count()),at+'окошко «Приложение» не закрывается по Escape');
   // Плеер внизу не меняет размер плиток «Новое».
   const tileW=()=>page.evaluate(()=>Math.round(document.querySelector('.desk-fresh .desk-tile')?.getBoundingClientRect().width??0));
   const before=await tileW();
   await page.locator('.desk-hero .desk-cta').click();await page.waitForTimeout(1200);await page.keyboard.press('Escape');await page.waitForTimeout(800);
   const withBar=await tileW(),barShown=await page.locator('.desk-player-bar').count();
   check(barShown===1&&before===withBar,at+'с плеером внизу плитки другого размера: '+before+' → '+withBar+(barShown?'':' (плеер не открылся)'));
   // «Поделиться» на обложке делится, а не открывает выпуск (у плиток его нет).
   await page.evaluate(()=>{window.__shared=[];navigator.share=d=>{window.__shared.push(d.url||d.text||'');return Promise.resolve();};navigator.canShare=()=>true;});
   await page.locator('.desk-banner-share').click();await page.waitForTimeout(500);
   const shared=await page.evaluate(()=>({n:document.querySelectorAll('.desk-player-open,.share-sheet,[role=dialog]').length,open:!!document.querySelector('.desk-player-open')}));
   check(!shared.open,at+'«Поделиться» на обложке открыло плеер вместо того, чтобы поделиться');
   await page.keyboard.press('Escape');await page.waitForTimeout(300);
   // Плеер: полоса внизу, меню над ней.
   // Выпуск с обложкой: у записи эфира без обложки плеер рисует не картинку.
   const glacier=page.locator('.desk-fresh .desk-tile',{hasText:'Ледник'}).locator('.desk-tile-open');
   if(await glacier.count())await glacier.click();else{check(false,at+'в ряду «Новое» нет свежего выпуска «Ледник»');await page.locator('.desk-hero .desk-cta').click();}
   await page.waitForTimeout(1200);
   const open=await page.evaluate(()=>{const p=document.querySelector('.desk-player-open'),c=p?.querySelector('.player-cover-frame')?.getBoundingClientRect(),t=p?.querySelector('.player-title')?.getBoundingClientRect();return {open:!!p,coverLeft:c?c.right<=t.left:false};});
   check(open.open,at+'развёрнутый плеер ПК не открылся');check(open.coverLeft,at+'в развёрнутом плеере обложка не слева от названия');
   await page.keyboard.press('Escape');await page.waitForTimeout(600);
   const bar=await page.evaluate(()=>{const b=document.querySelector('.desk-player-bar')?.getBoundingClientRect();
    return b?{left:Math.round(b.left),right:Math.round(b.right),bottom:Math.round(b.bottom),h:Math.round(b.height),
     toggle:!!document.querySelector('.desk-player-bar .podcast-toggle'),slider:!!document.querySelector('.desk-player-bar [role=slider]')}:null;});
   check(bar,at+'после Escape плеер не свернулся в полосу');
   if(bar){check(bar.left===0&&bar.right===w&&bar.bottom===h,at+'полоса плеера не во всю ширину внизу: '+JSON.stringify(bar));
    check(bar.toggle&&bar.slider,at+'в полосе плеера нет кнопки воспроизведения или полосы времени');}
  }
  if(w===1440){
   // «Аудио» (13 октября): крупной карточки «Последнее» нет — поиск,
   // переключатели и сетка всех выпусков; у плиток нет «Поделиться».
   await page.goto(base+'/?mode=listen&view=podcasts');await ready(page);
   const shop=await page.evaluate(()=>({feature:!!document.querySelector('.desk-feature'),cards:document.querySelectorAll('.post-card').length,
    chips:[...document.querySelectorAll('.desk-chip')].map(c=>c.textContent),shares:document.querySelectorAll('.desk-tile .desk-tile-share,.desk-tile [aria-label^="Поделиться"]').length,
    tile:Math.round(document.querySelector('.desk-grid>.desk-tile')?.getBoundingClientRect().width??0),search:Math.round(document.querySelector('.desk-section-search')?.getBoundingClientRect().width??0),
    cols:new Set([...document.querySelectorAll('.desk-grid>.desk-tile')].map(t=>Math.round(t.getBoundingClientRect().top))).size,tiles:document.querySelectorAll('.desk-grid>.desk-tile').length}));
   check(!shop.feature,at+'в «Аудио» снова крупная карточка «Последнее»');
   check(shop.cards===0,at+'в «Аудио» на ПК телефонный список карточек');
   check(shop.shares===0,at+'у плиток снова «Поделиться»: '+shop.shares);
   check(shop.tile>=210&&shop.search>=320,at+'плитки или поиск в разделе мелкие: плитка '+shop.tile+', поиск '+shop.search);
   check(!(await page.locator('.kinetic-grid').count()),at+'на ПК в разделе снова фон-сетка');
   check(['Все','Аудиоистория','Подкаст','Музыка','Сначала новые','Сначала старые'].every(c=>shop.chips.includes(c)),at+'переключатели витрины не те: '+shop.chips.join(' | '));
   check(shop.tiles===titles.length,at+'в сетке '+shop.tiles+' плиток, ждали '+titles.length+' (все выпуски)');
   check(shop.cols<shop.tiles,at+'сетка витрины идёт одной колонкой');
   // Поиск — в разделе: находит в этом разделе и очищается. Нет поиска — так
   // и сказать, а не ждать его до конца отведённого времени.
   const hasSearch=await page.locator('.desk-section-search input').count();
   check(hasSearch===1,at+'в «Аудио» нет поиска');
   if(hasSearch){
   await page.fill('.desk-section-search input','обры');await page.waitForTimeout(250);
   const found=await page.evaluate(()=>[...document.querySelectorAll('.desk-grid .desk-tile strong')].map(e=>e.textContent));
   check(found.length===1&&found[0]==='Обрыв',at+'поиск в разделе нашёл не то: '+JSON.stringify(found));
   await page.fill('.desk-section-search input','');await page.waitForTimeout(250);
   check(await page.locator('.desk-grid>.desk-tile').count()===titles.length,at+'после очистки поиска в разделе вернулись не все выпуски');
   }
   await page.locator('.desk-chip',{hasText:'Музыка'}).click();await page.waitForTimeout(200);
   const music=await page.evaluate(()=>[...document.querySelectorAll('.desk-grid .desk-tag')].map(e=>e.textContent));
   check(music.length===titles.filter((_,n)=>n%3===2).length&&music.every(x=>/музыка/i.test(x)),at+'«Музыка» показывает не только музыку: '+music.join(', '));
   await page.locator('.desk-chip',{hasText:'Все'}).click();await page.locator('.desk-chip',{hasText:'Сначала старые'}).click();await page.waitForTimeout(200);
   const oldest=await page.evaluate(()=>document.querySelector('.desk-grid .desk-tile strong')?.textContent);
   check(oldest==='Плот',at+'«Сначала старые» начинает не с первого выпуска: '+oldest);
   // «Видео»: обложки 4:5, как в приложении и везде на сайте; крупная карточка
   // по размеру обложки, не на пол-экрана и не во всю ширину.
   await page.goto(base+'/?mode=listen&view=videos');await ready(page);
   const video=await page.evaluate(()=>{const c=document.querySelector('.desk-feature-cover')?.getBoundingClientRect(),f=document.querySelector('.desk-feature')?.getBoundingClientRect(),
    m=document.querySelector('.desk-section')?.getBoundingClientRect();
    return c&&f&&m?{ratio:c.width/c.height,cover:Math.round(c.width),h:Math.round(f.height),w:Math.round(f.width),full:Math.round(m.width)}:null;});
   check(video&&Math.abs(video.ratio-0.8)<0.02,at+'у видео крупная обложка не 4:5: '+JSON.stringify(video));
   check(video&&video.cover<=240&&video.h<=h*0.45&&video.w<=860&&video.w<video.full,at+'крупная карточка видео огромная: '+JSON.stringify(video));
   // Подвал на ПК — без «Скачать приложение»: оно вверху и в полосе с QR-кодом.
   check(!(await page.locator('.site-footer-app').count()),at+'в подвале на ПК снова «Скачать приложение»');
   // Поиск есть в каждом разделе, даже с одним выпуском; в «Аудио» он широкий.
   check(await page.locator('.desk-section-search').count()===1,at+'в «Видео» нет поиска');
   await page.goto(base+'/?mode=listen&view=stories');await ready(page);
   check(await page.locator('.desk-section-search').count()===1,at+'в «Историях» нет поиска');
   const storyCard=await page.evaluate(()=>Math.round(document.querySelector('.desk-feature')?.getBoundingClientRect().width??0));
   check(storyCard>0&&storyCard<=860,at+'карточка «Последнее» в «Историях» растянута: '+storyCard);
   // Читалка на ПК (13 октября, по образцу ЛитРес): две полосы во всю ширину
   // с полями, выключка по ширине, красная строка, абзацы без пустых строк,
   // поля сверху, крупные кнопки, крестик закрыть, без настройки «Боком».
   await page.getByRole('button',{name:'Читать'}).first().click();await page.locator('.tt-reader').waitFor({timeout:15000});await page.waitForTimeout(1200);
   const book=await page.evaluate(()=>{const r=document.querySelector('.tt-reader'),pages=[...r.querySelectorAll('.tt-reader-page:not(.is-copy)')].map(p=>p.getBoundingClientRect());
    const lines=[...r.querySelectorAll('.tt-reader-page:not(.is-copy) .tt-reader-line')];
    const paraGaps=lines.filter((l,i)=>l.classList.contains('is-para')&&!l.textContent.trim()&&lines[i+1]?.classList.contains('is-para')).length;
    const icons=[...r.querySelectorAll('.tt-reader-top .tt-reader-icon')].filter(b=>b.getBoundingClientRect().width>0).map(b=>Math.round(b.getBoundingClientRect().width));
    const text=lines.find(l=>l.classList.contains('is-para')&&l.textContent.trim());
    return {book:r.classList.contains('is-book'),cols:pages.length,span:pages.length===2?Math.round(pages[1].right-pages[0].left):0,
     justify:r.querySelectorAll('.tt-reader-line.is-justify').length,indent:lines.some(l=>parseFloat(l.style.paddingLeft)>0),paraGaps,icons,
     close:!!r.querySelector('.tt-reader-close'),glued:!lines.some(l=>l.textContent.trim()==='приходится чинить. При этом расходовать всё на один ремонт нельзя: неизвестно, что откажет следующим.'),
     top:text?Math.round(text.getBoundingClientRect().top):0};});
   check(book.book&&book.cols===2&&book.span>=w*0.75,at+'читалка на ПК не разворотом во всю ширину: '+JSON.stringify(book));
   check(book.justify>0&&book.indent&&book.paraGaps===0,at+'текст в читалке ПК без выключки, красной строки или с пустыми строками между абзацами: '+JSON.stringify(book));
   check(book.glued,at+'строки, разорванные переносом посреди фразы, не склеились');
   check(book.close&&book.icons.length===4&&book.icons.every(x=>x>=44),at+'в шапке читалки нет крестика или кнопки мелкие: '+JSON.stringify(book.icons));
   await page.locator('.tt-reader-top [aria-label="Настройки чтения"]').click({timeout:5000}).catch(()=>check(false,at+'в шапке читалки нет кнопки настроек'));await page.waitForTimeout(300);
   check(!(await page.locator('.tt-reader-sheet',{hasText:'Боком'}).count()),at+'в настройках читалки на ПК снова «Боком»');
   await page.keyboard.press('Escape');await page.waitForTimeout(300);
   if(await page.locator('.tt-reader-sheet').count())await page.locator('.tt-reader-sheet [aria-label="Отмена"]').click();
   if(await page.locator('.tt-reader-close').count()){
    await page.locator('.tt-reader-close').click();await page.waitForTimeout(500);
    check(!(await page.locator('.tt-reader').count()),at+'крестик не закрыл читалку');
   }else{await page.keyboard.press('Escape');await page.waitForTimeout(500);}
   // Вход для автора — только в программе для ПК, в браузере его нет.
   await page.goto(base+'/?mode=listen&view=settings');await ready(page);
   check(!(await page.locator('.listener-main a[href="/login"]').count()),at+'в настройках браузера снова вход для автора');
  }
  check(errors.length===0,at+'ошибки страницы: '+errors.join('; '));
  await ctx.close();
 }
 // Адаптивный первый экран с обложкой 4:1 из студии (2400×600), от ноутбука
 // 1280×720 до 2K: картинка никогда не режется; от высоты окна 720 рамка
 // ровно 4:1, ниже — не уже 5:1 с размытыми боками; «Новое» и меню целиком.
 // Снимается; сервер отдаёт её всем.
 {
  const raft=lib.items.find(p=>p.title==='Плот').id;
  const {default:sharp}=await import('sharp');
  const art=await sharp({create:{width:2400,height:600,channels:3,background:{r:20,g:60,b:70}}}).jpeg({quality:85}).toBuffer();
  const wideKey=(await (await fetch(base+'/api/cover',{method:'POST',headers:{cookie,'content-type':'image/jpeg','x-upload-size':String(art.length)},body:art})).json()).key;
  await post({action:'hero',id:raft,wide:wideKey});
  const data=await (await fetch(base+'/api/library')).json();
  check(data.posterWide?.post===raft,'сервер не отдаёт обложку для ПК гостю: '+JSON.stringify(data.posterWide));
  check((await fetch(base+'/api/cover?id=hero-wide&v=1')).status===200,'адрес обложки для ПК не отвечает');
  for(const [w,h] of [[1280,600],[1366,657],[1536,730],[1440,900],[1920,945],[1920,1080],[2560,1305]]){const short=h<720;
   const at='обложка 2400×600 на '+w+'×'+h+': ';
   const ctx=await browser.newContext({viewport:{width:w,height:h},locale:'ru-RU'});const page=await ctx.newPage();
   await page.goto(base+'/?mode=listen&view=home');await ready(page);
   await page.waitForFunction(()=>document.querySelector('.desk-banner-wide')?.complete,null,{timeout:15000}).catch(()=>{});
   const m=await page.evaluate(()=>{const b=document.querySelector('.desk-hero>.desk-banner')?.getBoundingClientRect(),img=document.querySelector('.desk-banner img.desk-banner-wide');
    if(!b||!img||!img.naturalWidth)return null;
    // Где картинка нарисована на самом деле: object-fit решает, режется она или нет.
    const fit=getComputedStyle(img).objectFit,nw=img.naturalWidth,nh=img.naturalHeight;
    const k=fit==='cover'?Math.max(b.width/nw,b.height/nh):Math.min(b.width/nw,b.height/nh);
    const tiles=[...document.querySelectorAll('.desk-hero+.desk-fresh .desk-grid>.desk-tile')].map(t=>t.getBoundingClientRect()),top=tiles[0]?.top;
    const shelf=tiles.length?{bottom:Math.max(...tiles.filter(t=>Math.abs(t.top-top)<2).map(t=>t.bottom))}:null;
    // Кнопки верхней строки целиком в окне (раньше здесь мерилось боковое меню).
    const acts=document.querySelector('.top-header-actions')?.getBoundingClientRect();
    return {railFits:!!acts&&acts.right<=innerWidth+1&&acts.bottom<=innerHeight,fit,frame:b.width/b.height,drawnW:nw*k,drawnH:nh*k,bw:b.width,bh:b.height,blur:!!document.querySelector('.desk-banner .desk-banner-blur'),shelfBottom:shelf?Math.round(shelf.bottom):9999};});
   check(m,at+'обложка загружена, а на главной ПК её нет');
   if(m){
    check(m.drawnW<=m.bw+1&&m.drawnH<=m.bh+1,at+'картинка обрезана: нарисована '+Math.round(m.drawnW)+'×'+Math.round(m.drawnH)+' в рамке '+Math.round(m.bw)+'×'+Math.round(m.bh));
    if(!short){
     check(Math.abs(m.frame-4)<0.02,at+'рамка не 4:1, а '+m.frame.toFixed(2)+':1 — у картинки не будет одного точного размера');
     check(Math.abs(m.drawnW-m.bw)<=2&&Math.abs(m.drawnH-m.bh)<=2,at+'картинка 2400×600 не заполняет рамку: '+Math.round(m.drawnW)+'×'+Math.round(m.drawnH)+' в '+Math.round(m.bw)+'×'+Math.round(m.bh));
    }else{
     check(m.frame<=5.02,at+'в низком окне рамка ужалась до '+m.frame.toFixed(2)+':1 — обложка стала полоской');
     if(m.frame>4.02)check(m.blur,at+'рамка шире картинки, а по бокам пусто — нет размытого продолжения');
    }
    check(m.railFits,at+'кнопки верхней строки не помещаются в окно');
    check(m.shelfBottom<=h,at+'первый ряд «Новое в True Thrills» обрезан низом окна: низ '+m.shelfBottom+' при окне '+h);
   }
   await ctx.close();
  }
  // С открытым плеером на маленьком ноутбуке места меньше всего: плитки уже
  // самые мелкие, сжимается рамка — но не в полоску и без обрезки.
  {
   const ctx=await browser.newContext({viewport:{width:1280,height:600},locale:'ru-RU'});const page=await ctx.newPage();
   await page.goto(base+'/?mode=listen&view=home');await ready(page);
   await page.locator('.desk-hero .desk-cta').click();await page.waitForTimeout(1500);await page.keyboard.press('Escape');await page.waitForTimeout(900);
   const m=await page.evaluate(()=>{const b=document.querySelector('.desk-hero>.desk-banner')?.getBoundingClientRect(),img=document.querySelector('.desk-banner img.desk-banner-wide');
    if(!b||!img||!document.querySelector('.desk-player-bar'))return null;
    return {frame:b.width/b.height,cut:getComputedStyle(img).objectFit==='cover'};});
   check(m,'обложка с плеером на 1280×600: плеер не открылся или обложки нет');
   if(m){check(m.frame<=5.02,'обложка с плеером на 1280×600: рамка ужалась до '+m.frame.toFixed(2)+':1 — обложка стала полоской');check(!m.cut,'обложка с плеером на 1280×600: картинка режется');}
   await ctx.close();
  }
  await post({action:'hero',id:raft,wide:''});
  check(!(await (await fetch(base+'/api/library')).json()).posterWide,'обложка для ПК не снимается');
 }
 // В программе для ПК (WebView2) вход для автора в настройках остаётся:
 // через неё владелец и входит в студию.
 {
  const ctx=await browser.newContext({viewport:{width:1440,height:900},locale:'ru-RU'});
  await ctx.addInitScript(()=>{window.chrome=window.chrome||{};window.chrome.webview={postMessage(){},addEventListener(){},removeEventListener(){}};});
  const page=await ctx.newPage();await page.goto(base+'/?mode=listen&view=settings');await ready(page);
  check(await page.locator('.listener-main a[href="/login"]').count()===1,'программа для ПК: в настройках нет входа для автора');
  await ctx.close();
 }
 // Телефон и сенсорный планшет — без каркаса ПК.
 for(const [w,h,label] of [[390,844,'телефон'],[1280,800,'планшет']]){
  const ctx=await browser.newContext({viewport:{width:w,height:h},isMobile:true,hasTouch:true,locale:'ru-RU'});const page=await ctx.newPage();
  await page.goto(base+'/?mode=listen&view=home');await ready(page);
  const s=await page.evaluate(()=>({cls:document.querySelector('.app-shell')?.className??'',rail:!!document.querySelector('.desk-tabs'),home:!!document.querySelector('.desk-home')}));
  check(/\bis-listener\b/.test(s.cls)&&!s.rail&&!s.home,label+' получил каркас ПК: '+JSON.stringify(s));
  await ctx.close();
 }
 assert.deepEqual(problems,[],'\n'+problems.join('\n'));
 console.log('PASS: ПК 1280–2560 — каркас «Студия звука» без бокового меню: знак канала слева, разделы ровно по центру верхней строки, справа «Приложение» с читаемым фирменным QR-кодом, поддержка, поделиться и настройки, без поиска; на обложке — «Слушать» и «Поделиться», под ней только описание; обложка 4:1 (2400×600) во всю ширину содержимого, ровно в рамке и никогда не режется; «Новое в True Thrills» — один ряд по центру до восьми плиток, целиком на первом экране и того же размера с плеером (каждый выпуск один раз, запись эфира подписана как запись, без «Поделиться» на плитках); полоса приложения с QR-кодом, тремя пунктами и YouTube и TikTok плашками, без поддержки и номера сборки; вход для автора только в программе; «Аудио» — без крупной карточки, плитки и поиск крупнее; «Видео» — обложки 4:5 и карточка по размеру обложки; подвал ПК без «Скачать приложение»; разделы без фона-сетки; без прокрутки вбок; плеер полосой внизу и развёрнутый с обложкой слева; телефон и планшет — без каркаса ПК');
}finally{await browser?.close();server.kill();await rm(dir,{recursive:true,force:true});}
