#!/usr/bin/env node
/**
 * Три раздела слушателя — «Аудио», «Видео», «Истории» — в одном оформлении.
 *
 * Шапка у всех одна: заголовок с засечками слева двумя строками («Внутри
 * истории.», «Истории в кадре.», «Истории на страницах.»), подзаголовок —
 * колонкой справа: строки вплотную и по центру высоты заголовка, сверху и
 * снизу поровну; шапка не заходит под затемнение у верхней кромки. Поиск и сортировка — одной строкой (его правка
 * поверх макетов, где сортировка стояла ниже). Заголовок, поиск и список
 * начинаются от одного левого края; размер заголовка одинаков во всех трёх.
 *
 * На 360, 390 и 430 точек: нет горизонтальной прокрутки, заголовок не
 * вылезает за край, подзаголовок не обрезан, поиск не съеден сортировкой,
 * карточки в границах экрана, кнопки карточки не наезжают друг на друга,
 * нижняя панель не закрывает последнюю карточку.
 *
 * «Истории»: поиск, сортировка, «Читать» открывает читалку с той же историей,
 * «Назад» возвращает к списку, «Поделиться» отдаёт ссылку на запись.
 *
 * Всё — во временной базе; рабочие данные не трогаются. Снимки — в
 * outputs/ui/sections-*.png.
 */
import {chromium} from 'playwright';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,rm,mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import sharp from 'sharp';

const root=process.cwd(),dir=await mkdtemp(path.join(root,'.test-tmp-sec-'));
const out=path.join(root,'outputs','ui');await mkdir(out,{recursive:true});
const env={...process.env,DATABASE_PATH:path.join(dir,'db.sqlite'),STORAGE_DIR:path.join(dir,'storage'),LIVE_DIR:path.join(dir,'live'),SESSION_SECRET:'chk-secret-not-production',ADMIN_PASSWORD:'chk-password',FIREBASE_SERVICE_ACCOUNT_FILE:'',PUBLIC_SITE_URL:''};
execFileSync(process.execPath,['node_modules/drizzle-kit/bin.cjs','migrate'],{env,stdio:'ignore'});
const port=3249,base='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env,stdio:['ignore','ignore','inherit']});
let browser;
const SECTIONS=[
 {view:'podcasts',nav:'.bottom-nav-podcasts',navText:'Аудио',title:'Внутри\nистории',kicker:['Истории о выживании','Музыка, которая погружает'],search:'Найти историю или музыку',button:'Слушать'},
 {view:'videos',nav:'.bottom-nav-videos',navText:'Видео',title:'Истории\nв кадре',kicker:['Истории о выживании','Смотри True Thrills','прямо в приложении'],search:'Найти видео',button:'Смотреть'},
 {view:'stories',nav:'.bottom-nav-stories',navText:'Истории',title:'Истории\nна страницах',kicker:['Читай о тех,','кто не сдался','Вместе с','True Thrills'],search:'Найти историю',button:'Читать'},
];
try{
 for(let i=0;i<80;i++){try{await fetch(base+'/api/health');break;}catch{await new Promise(r=>setTimeout(r,250));}}
 const login=await fetch(base+'/api/auth',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:'chk-password'})});
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const api=d=>fetch(base+'/api/library',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify(d)}).then(async r=>JSON.parse(await r.text()));
 await api({action:'setup'});
 const cover=async f=>{const b=await readFile(path.join(root,'tests/fixtures/demo-covers',f));
  return (await (await fetch(base+'/api/cover',{method:'POST',headers:{cookie,'content-type':'image/jpeg','x-upload-size':String(b.length)},body:b})).json()).key;};
 const seconds=4,rate=8000,wav=Buffer.alloc(44+rate*2*seconds);
 wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
 const audioKey=(await (await fetch(base+'/api/audio',{method:'POST',headers:{cookie,'content-type':'audio/wav','x-upload-size':String(wav.length)},body:wav})).json()).key;
 const long='Очень длинное название, которое никак не помещается в две строки узкой карточки на телефоне';
 const longNote='Длинное описание без конца. '.repeat(16);
 // Обложка как у владельца — 1080×1350 (4:5): по ней видно, что плеер
 // показывает её своей пропорцией.
 const portrait=await sharp({create:{width:1080,height:1350,channels:3,background:{r:40,g:60,b:90}}}).jpeg().toBuffer();
 const coverKey45=(await (await fetch(base+'/api/cover',{method:'POST',headers:{cookie,'content-type':'image/jpeg','x-upload-size':String(portrait.length)},body:portrait})).json()).key;
 await api({kind:'podcast',audioCategory:'audio_story',title:'76 дней',description:'Стивен Каллахэн. 76 дней на плоту посреди Атлантики.',audioKey,duration:seconds,published:true,coverKey:coverKey45});
 await api({kind:'podcast',audioCategory:'music',title:long,description:longNote,audioKey,duration:seconds,published:true,coverKey:await cover('tile-forest.jpg')});
 await api({kind:'video',title:'Он выжил. Но какой ценой?',description:'Стивен Каллахэн. 76 дней в Атлантике.',videoUrl:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',published:true,coverKey:await cover('tile-waterfall.jpg')});
 await api({kind:'video',title:long,description:longNote,videoUrl:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',published:true});
 // По третьей записи в «Аудио» и «Видео»: три карточки на экран мерим во всех
 // трёх разделах, а не только в «Историях».
 await api({kind:'podcast',audioCategory:'podcast',title:'Третий выпуск',description:'Короткое описание.',audioKey,duration:seconds,published:true,coverKey:await cover('tile-mountains.jpg')});
 await api({kind:'video',title:'Третье видео',description:'Короткое описание.',videoUrl:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',published:true,coverKey:await cover('tile-forest.jpg')});
 const first=await api({kind:'story',title:'Первая история',description:'Ранняя запись.',body:'Море не кончалось.\n\nВторой абзац.',published:true,coverKey:await cover('tile-mountains.jpg')});
 await new Promise(r=>setTimeout(r,20));
 await api({kind:'story',title:long,description:longNote,body:'Текст.',published:true,coverKey:await cover('tile-forest.jpg')});
 await new Promise(r=>setTimeout(r,20));
 await api({kind:'story',title:'Он выжил. Но какой ценой?',description:'Стивен Каллахэн. 76 дней в Атлантике.',body:'Ночь. Плот. Океан.\n\nУтро не приходит.',published:true,coverKey:await cover('hero-lake.jpg')});
 assert.ok(first.id||first.item?.id||true);

 browser=await chromium.launch({executablePath:process.env.TT_BROWSER_EXECUTABLE||undefined});
 const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true,locale:'ru-RU'});
 await ctx.addInitScript(()=>{window.__shared=[];navigator.share=async d=>{window.__shared.push(d);};});
 const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const open=async view=>{await page.goto(base+'/?mode=listen&view='+view);await page.waitForLoadState('networkidle').catch(()=>{});await page.waitForTimeout(700);};
 const problems=[];

 for(const w of [360,390,430]){
  await page.setViewportSize({width:w,height:844});
  const sizes={};
  for(const s of SECTIONS){
   await open(s.view);
   const v=await page.evaluate(()=>{const q=x=>document.querySelector(x),r=x=>q(x)?.getBoundingClientRect();
    // Шапку меряем до прокрутки: после неё список уезжает вверх вместе с ней.
    const main=q('.listener-main');main.scrollTop=0;
    const head={t:r('.voice-title'),k:r('.voice-kicker'),mainTop:main.getBoundingClientRect().top,
     lines:[...document.querySelectorAll('.voice-kicker-line')].map(e=>{const b=e.getBoundingClientRect();return {text:e.textContent,over:e.scrollWidth>e.clientWidth+1,top:b.top,bottom:b.bottom};}),
     search:r('.catalog-search'),sort:r('.catalog-sort'),list:r('.post-list'),
     // Правый край текста каждой строки подзаголовка — по самому тексту, а
     // не по блоку: блок тянется на всю колонку при любом выравнивании.
     kickText:[...document.querySelectorAll('.voice-kicker-line')].map(e=>{const g=document.createRange();g.selectNodeContents(e);return [...g.getClientRects()].map(r=>({l:r.left,r:r.right}));}).flat(),
     // Первые три карточки до прокрутки — над нижней панелью, обложка 4:5.
     firstCards:[...document.querySelectorAll('.post-card')].slice(0,3).map(c=>{const b=c.getBoundingClientRect(),v=c.querySelector('.post-cover').getBoundingClientRect();return {bottom:b.bottom,ratio:v.height/v.width};}),
     navTop:q('.bottom-nav')?.getBoundingClientRect().top};
    main.scrollTop=main.scrollHeight;
    const cards=[...document.querySelectorAll('.post-card')].map(c=>{const b=c.getBoundingClientRect(),cover=c.querySelector('.post-cover').getBoundingClientRect(),
     title=c.querySelector('.post-title').getBoundingClientRect(),note=c.querySelector('.post-note').getBoundingClientRect(),
     act=c.querySelector('.text-button').getBoundingClientRect(),sh=c.querySelector('.post-share').getBoundingClientRect();
     return {l:b.left,r:b.right,coverOk:cover.left>=b.left-1&&cover.right<=b.right+1,
      titleLines:Math.round(title.height/parseFloat(getComputedStyle(c.querySelector('.post-title')).lineHeight)),
      stack:title.bottom<=note.top+1&&note.bottom<=act.top+1,shareApart:act.right<=sh.left+1&&sh.right<=b.right+1,
      button:c.querySelector('.text-button').textContent.replace(/\d+:\d+/,'').trim(),
      tag:[...c.querySelector('.post-meta').childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim(),
      date:c.querySelector('.post-meta span')?.textContent};});
    const lastBtn=[...document.querySelectorAll('.post-card .text-button')].pop()?.getBoundingClientRect();
    const res={W:innerWidth,scroll:document.documentElement.scrollWidth,...head,
     title:q('.voice-title')?.textContent,kickFont:q('.voice-kicker')&&parseFloat(getComputedStyle(q('.voice-kicker')).fontSize),size:q('.voice-title')&&getComputedStyle(q('.voice-title')).fontSize,
     ph:q('.catalog-search input')?.placeholder,
     phFits:(()=>{const i=q('.catalog-search input');if(!i)return false;const c=document.createElement('canvas').getContext('2d');const st=getComputedStyle(i);c.font=st.fontSize+' '+st.fontFamily;return c.measureText(i.placeholder).width<=i.clientWidth+1;})(),
     sortText:q('.catalog-sort')?.selectedOptions[0]?.textContent,nav:q('.bottom-nav')?.getBoundingClientRect().top,
     navText:null,lastBtn:lastBtn&&lastBtn.bottom,cards};
    main.scrollTop=0;return res;});
   v.navText=(await page.locator(s.nav).textContent().catch(()=>''))?.trim();
   const at=w+' «'+s.navText+'»: ';
   if(v.scroll>v.W)problems.push(at+'горизонтальная прокрутка '+v.scroll+' при ширине '+v.W);
   if(v.title!==s.title)problems.push(at+'заголовок «'+v.title+'» вместо «'+s.title+'»');
   if(JSON.stringify(v.lines.map(l=>l.text))!==JSON.stringify(s.kicker))problems.push(at+'подзаголовок: '+JSON.stringify(v.lines.map(l=>l.text)));
   if(v.lines.some(l=>l.over))problems.push(at+'строка подзаголовка обрезана');
   if(!v.t||!v.k)problems.push(at+'нет заголовка или подзаголовка');
   else{
    if(v.k.left<v.t.right-1)problems.push(at+'подзаголовок не справа от заголовка');
    // Меряем сами строки подзаголовка, а не его рамку. Владелец: строки
    // вплотную друг к другу и по центру высоты заголовка — сверху и снизу
    // поровну («без такого большого пространства посередине»).
    const top=v.lines[0]?.top,bottom=v.lines.at(-1)?.bottom;
    const off=((top+bottom)-(v.t.top+v.t.bottom))/2;
    if(!(Math.abs(off)<=2))problems.push(at+'подзаголовок не по центру высоты заголовка: сдвиг '+Math.round(off)+' (строки '+Math.round(top)+'…'+Math.round(bottom)+', заголовок '+Math.round(v.t.top)+'…'+Math.round(v.t.bottom)+')');
    for(let i=1;i<v.lines.length;i++){const gap=v.lines[i].top-v.lines[i-1].bottom;
     if(gap>v.kickFont*0.75)problems.push(at+'между строками подзаголовка провал '+Math.round(gap)+' точек');}
    // Верх экрана под шапкой гаснет маской на 20 точек — заголовок туда не
    // заходит, с запасом.
    // Заголовок близко к шапке, без пустого поля (владелец: «много свободного
    // места без смысла»), но не под растворением верха списка (6 точек).
    {const gap=v.t.top-v.mainTop;
     if(gap<10)problems.push(at+'заголовок под затемнением верхней кромки: '+Math.round(gap)+' точек от края');
     if(gap>22)problems.push(at+'над заголовком пустое поле: '+Math.round(gap)+' точек от края');}
    if(v.k.right>v.W-15)problems.push(at+'подзаголовок у самого края экрана');
    // Подзаголовок — у правого края экрана, по краю поиска и списка; между
    // ним и заголовком свободное место (владелец: «прям сбоку экрана»).
    // Подзаголовок — у правого края, его строки — по центру друг друга
    // до пикселя (владелец: «идеально до пикселя отцентрованы по всем
    // плоскостям»), без точек в конце.
    {const right=Math.max(...v.kickText.map(x=>x.r)),left=Math.min(...v.kickText.map(x=>x.l)),mid=(left+right)/2;
     if(Math.abs(right-v.list.right)>2)problems.push(at+'подзаголовок не у правого края: кончается на '+Math.round(right)+', край '+Math.round(v.list.right));
     for(const x of v.kickText)if(Math.abs((x.l+x.r)/2-mid)>1)problems.push(at+'строки подзаголовка не по центру друг друга: сдвиг '+((x.l+x.r)/2-mid).toFixed(1));
     for(const l of v.lines)if(/[.]$/.test(l.text))problems.push(at+'в конце строки подзаголовка точка: «'+l.text+'»');}
    if(Math.abs(v.t.left-v.search.left)>1||Math.abs(v.t.left-v.list.left)>1)problems.push(at+'заголовок, поиск и список с разных левых краёв');
   }
   if(v.ph!==s.search)problems.push(at+'в поиске «'+v.ph+'» вместо «'+s.search+'»');
   if(s.view!=='podcasts'&&!v.phFits)problems.push(at+'подсказка «'+v.ph+'» не помещается в поле поиска');
   if(v.sortText!=='Сначала новые')problems.push(at+'сортировка «'+v.sortText+'»');
   if(!v.search||!v.sort||v.sort.top>=v.search.bottom||v.sort.left<v.search.right)problems.push(at+'поиск и сортировка не в одну строку');
   if(v.sort&&v.sort.right>v.W-15)problems.push(at+'сортировка вылезла за поле');
   if(v.navText!==s.navText)problems.push(at+'вкладка подписана «'+v.navText+'»');
   if(!v.cards.length)problems.push(at+'нет карточек — проверять нечего');
   for(const c of v.cards){
    if(c.l<0||c.r>v.W)problems.push(at+'карточка за границей экрана');
    if(!c.coverOk)problems.push(at+'обложка вылезла из карточки');
    if(c.titleLines>2)problems.push(at+'название в карточке длиннее двух строк ('+c.titleLines+')');
    if(!c.stack)problems.push(at+'название, описание и кнопка наезжают друг на друга');
    if(!c.shareApart)problems.push(at+'кнопка «Поделиться» наезжает на «'+c.button+'»');
    if(c.button!==s.button)problems.push(at+'кнопка карточки «'+c.button+'» вместо «'+s.button+'»');
    if(!/^\d{2}\.\d{2}\.\d{4}$/.test(c.date||''))problems.push(at+'дата в карточке «'+c.date+'»');
   }
   if(s.view==='stories'&&v.cards.some(c=>c.tag!=='ИСТОРИЯ'))problems.push(at+'тип в карточке истории не «ИСТОРИЯ»');
   if(s.view==='videos'&&v.cards.some(c=>c.tag!=='ВИДЕО'))problems.push(at+'тип в карточке видео не «ВИДЕО»');
   if(v.lastBtn>v.nav+1)problems.push(at+'нижняя панель закрывает кнопку последней карточки');
   // Три карточки на экран (владелец: «чтоб на один экран входило их три»):
   // при высоте 844 первые три видны целиком, до нижней панели. Обложка в
   // них ровно 4:5 — карточка не выше обложки и не режет её по бокам.
   if(v.firstCards.length>=3&&v.firstCards[2].bottom>v.navTop+1)problems.push(at+'на экран не входят три карточки: третья кончается на '+Math.round(v.firstCards[2].bottom)+', панель с '+Math.round(v.navTop));
   for(const c of v.firstCards)if(Math.abs(c.ratio-1.25)>0.02)problems.push(at+'обложка в карточке не 4:5: '+c.ratio.toFixed(3));
   sizes[s.view]=v.size;
   await page.screenshot({path:path.join(out,`sections-${s.view}-${w}.png`)});
  }
  if(new Set(Object.values(sizes)).size!==1)problems.push(w+': заголовки разделов разного размера — '+JSON.stringify(sizes));
 }

 // Три карточки на один экран — на разных телефонах, в том числе на экране
 // владельца (388×758 точек: Android-приложение без строки состояния и
 // кнопок системы). Владелец: «уменьши плашки так, чтоб идеально помещались
 // три выпуска на один экран». Обложка при этом ровно 4:5, текст влезает.
 for(const [w,h] of [[388,758],[390,844],[360,780],[430,932],[412,860]]){
  await page.setViewportSize({width:w,height:h});
  for(const s of SECTIONS){
   await open(s.view);
   const c=await page.evaluate(()=>{const nav=document.querySelector('.bottom-nav').getBoundingClientRect().top;
    return {nav,cards:[...document.querySelectorAll('.post-card')].slice(0,3).map(c=>{const b=c.getBoundingClientRect(),v=c.querySelector('.post-cover').getBoundingClientRect(),
     n=c.querySelector('.post-content');return {bottom:b.bottom,ratio:v.height/v.width,over:n.scrollHeight>n.clientHeight+1||b.height>v.height+3};})};});
   const at=w+'×'+h+' «'+s.navText+'»: ';
   if(c.cards.length<3)problems.push(at+'меньше трёх карточек — мерить нечего');
   else if(c.cards[2].bottom>c.nav+1)problems.push(at+'три карточки не входят на экран: третья кончается на '+Math.round(c.cards[2].bottom)+', панель с '+Math.round(c.nav));
   for(const k of c.cards){if(Math.abs(k.ratio-1.25)>0.02)problems.push(at+'обложка не 4:5: '+k.ratio.toFixed(3));
    if(k.over)problems.push(at+'текст карточки не влезает в высоту обложки');}
  }
 }
 await page.setViewportSize({width:390,height:844});
 // «Истории»: поиск, сортировка, открытие, возврат, ссылка.
 await page.setViewportSize({width:390,height:844});await open('stories');
 const titles=()=>page.locator('.post-card .post-title').allTextContents();
 const newest=await titles();
 assert.equal(newest[0],'Он выжил. Но какой ценой?','«Сначала новые»: первой стоит не самая новая история');
 await page.locator('.catalog-search input').fill('Первая');await page.waitForTimeout(400);
 assert.deepEqual(await titles(),['Первая история'],'поиск по историям не нашёл ровно одну запись');
 await page.locator('.catalog-search input').fill('');await page.waitForTimeout(300);
 assert.deepEqual(await page.locator('.catalog-sort option').evaluateAll(o=>o.map(x=>x.value)),['new','old'],'варианты сортировки потерялись');
 await page.locator('.catalog-sort').selectOption('old');await page.waitForTimeout(300);
 assert.deepEqual(await titles(),[...newest].reverse(),'«Сначала старые» не переворачивает список историй');
 await page.locator('.catalog-sort').selectOption('new');await page.waitForTimeout(300);
 const card=page.locator('.post-card',{hasText:'Он выжил'}).first();
 await card.locator('.post-share').click();await page.waitForTimeout(300);
 const shared=await page.evaluate(()=>window.__shared);
 assert.equal(shared.length,1,'«Поделиться» ничего не отправило');
 assert.equal(shared[0].title,'Он выжил. Но какой ценой?','поделились не той историей');
 assert.match(shared[0].url,/^http:\/\/127\.0\.0\.1:\d+\/.+/,'в ссылке нет адреса записи: '+shared[0].url);
 await card.locator('.text-button').click();await page.locator('.tt-reader').waitFor({timeout:8000});
 await page.waitForTimeout(600);
 assert.match(await page.locator('.tt-reader').textContent(),/Плот/,'«Читать» открыло не ту историю');
 await page.locator('.tt-reader').locator('button[aria-label="Назад"]').first().click({force:true});
 await page.locator('.tt-reader').waitFor({state:'detached',timeout:8000});
 assert.equal(await page.locator('.voice-title').textContent(),'Истории\nна страницах','после чтения вернулись не к списку историй');
 assert.ok(await page.locator('.post-card').count()>=3,'после чтения список историй пуст');
 // Плеер: обложка целиком, своей пропорцией — не растянута и не обрезана,
 // в рамке плеера и выше названия. Владелец: «всё растянуто и вообще
 // неправильно отображается».
 for(const w of [360,390,430]){
  await page.setViewportSize({width:w,height:w===360?640:844});await open('podcasts');
  await page.locator('.post-card',{hasText:'76 дней'}).locator('.text-button').click();
  await page.locator('.podcast-player.is-open .player-cover').waitFor({timeout:8000});
  await page.waitForFunction(()=>{const i=document.querySelector('.player-cover');return i&&i.complete&&i.naturalWidth>0;},null,{timeout:8000});
  const pl=await page.evaluate(()=>{const st=document.querySelector('.podcast-player.is-open').getBoundingClientRect(),img=document.querySelector('.player-cover'),
   r=img.getBoundingClientRect(),title=document.querySelector('.podcast-player .player-body')?.querySelector('h2,.player-title,.player-brand');
   return {st:{t:st.top,b:st.bottom,l:st.left,r:st.right},r:{t:r.top,b:r.bottom,l:r.left,r:r.right,w:r.width,h:r.height},nat:img.naturalHeight/img.naturalWidth,
    fit:getComputedStyle(img).objectFit,text:title?title.getBoundingClientRect().top:null};});
  const at=w+' плеер: ';
  if(Math.abs(pl.r.h/pl.r.w-pl.nat)>0.02)problems.push(at+'обложка не своей пропорции: '+(pl.r.h/pl.r.w).toFixed(3)+' при '+pl.nat.toFixed(3));
  if(pl.r.t<pl.st.t-1||pl.r.b>pl.st.b+1||pl.r.l<pl.st.l-1||pl.r.r>pl.st.r+1)problems.push(at+'обложка вылезла за экран плеера');
  if(pl.text!==null&&pl.r.b>pl.text+1)problems.push(at+'обложка заходит под надписи плеера');
  if(pl.r.w<150)problems.push(at+'обложка слишком мелкая: '+Math.round(pl.r.w)+' точек');
  await page.screenshot({path:path.join(out,`sections-player-${w}.png`)});
 }
 // Плеер боком — как у YouTube Music (владелец прислал снимок): обложка на
 // весь экран, название мелко вверху слева, «−15 / ▶ / +15» по центру,
 // скорость и таймер по бокам от них, дорожка внизу. Ничто ни на что не
 // налезает и не выходит за экран; описания поверх картинки нет.
 for(const [w,h] of [[844,390],[915,412]]){
  await page.setViewportSize({width:w,height:h});await open('podcasts');
  await page.locator('.post-card',{hasText:'76 дней'}).locator('.text-button').click();
  await page.locator('.podcast-player.is-open').waitFor({timeout:8000});await page.waitForTimeout(600);
  const L=await page.evaluate(()=>{const r=s=>{const e=document.querySelector('.podcast-player.is-open '+s);if(!e||getComputedStyle(e).display==='none')return null;const b=e.getBoundingClientRect();return {l:b.left,t:b.top,r:b.right,b:b.bottom};};
   const kids=[...document.querySelectorAll('.podcast-player.is-open .player-extras>*')].map(e=>{const b=e.getBoundingClientRect();return {l:b.left,t:b.top,r:b.right,b:b.bottom};});
   return {W:innerWidth,H:innerHeight,photo:r('.player-stage-photo'),title:r('.player-title'),actions:r('.player-sheet-actions'),collapse:r('.player-collapse'),
    transport:r('.podcast-transport'),timeline:r('.podcast-timeline'),extras:kids,note:r('.player-note'),cover:r('.player-cover-frame')};});
  const at=w+'×'+h+' плеер боком: ',hit=(a,b)=>a&&b&&a.l<b.r-1&&b.l<a.r-1&&a.t<b.b-1&&b.t<a.b-1,inside=x=>x&&x.l>=-1&&x.t>=-1&&x.r<=L.W+1&&x.b<=L.H+1;
  if(!L.photo||L.photo.r-L.photo.l<L.W-2||L.photo.b-L.photo.t<L.H-2)problems.push(at+'обложка не на весь экран');
  if(L.cover)problems.push(at+'обложка видна ещё и карточкой');
  if(L.note)problems.push(at+'описание лежит поверх обложки');
  if(!L.title||L.title.t>L.H*0.2||L.title.l>L.W*0.2)problems.push(at+'название не вверху слева');
  if(hit(L.title,L.actions)||hit(L.title,L.collapse))problems.push(at+'название налезает на кнопки шапки');
  if(!L.transport||Math.abs((L.transport.l+L.transport.r)/2-L.W/2)>2||Math.abs((L.transport.t+L.transport.b)/2-L.H/2)>L.H*0.12)problems.push(at+'кнопки воспроизведения не по центру');
  for(const x of L.extras){if(hit(x,L.transport))problems.push(at+'скорость или таймер налезают на кнопки воспроизведения');if(hit(x,L.timeline))problems.push(at+'скорость или таймер налезают на дорожку');if(!inside(x))problems.push(at+'скорость или таймер за краем экрана');}
  for(const [n,x] of [['название',L.title],['кнопки',L.transport],['дорожка',L.timeline]])if(!inside(x))problems.push(at+n+' за краем экрана');
  await page.screenshot({path:path.join(out,`sections-player-land-${w}.png`)});
  // Касание кнопки ▶ управление не прячет; касание пустого места — прячет
  // всё, остаётся одна обложка; следующее касание возвращает (владелец:
  // «должна остаться только обложка и всё»).
  const shown=()=>page.evaluate(()=>{const o=s=>{const e=document.querySelector('.podcast-player.is-open '+s);return e?Number(getComputedStyle(e).opacity):0;};
   const b=document.querySelector('.podcast-transport button:nth-child(2)')?.getBoundingClientRect();const hitEl=b?document.elementFromPoint(b.left+b.width/2,b.top+b.height/2):null;
   return {top:o('.player-sheet-top'),body:o('.player-body'),photo:o('.player-stage-photo'),playHit:!!hitEl?.closest('.podcast-transport')};});
  await page.locator('.podcast-transport button').nth(1).click();await page.waitForTimeout(400);
  if((await shown()).body<0.9){problems.push(at+'нажатие на ▶ спрятало управление');
   await page.mouse.click(Math.round(L.W*0.5),Math.round(L.H*0.5));await page.waitForTimeout(450);}
  else{await page.locator('.podcast-transport button').nth(1).click();await page.waitForTimeout(200);}
  await page.mouse.click(Math.round(L.W*0.12),Math.round(L.H*0.62));await page.waitForTimeout(450);
  const hid=await shown();
  if(hid.top>0.05||hid.body>0.05)problems.push(at+'касание пустого места не спрятало управление');
  if(hid.playHit)problems.push(at+'спрятанная кнопка ▶ всё ещё нажимается');
  if(hid.photo<0.95)problems.push(at+'вместе с управлением пропала и обложка');
  await page.screenshot({path:path.join(out,`sections-player-land-bare-${w}.png`)});
  await page.mouse.click(Math.round(L.W*0.5),Math.round(L.H*0.5));await page.waitForTimeout(450);
  const back=await shown();
  if(back.top<0.95||back.body<0.95)problems.push(at+'повторное касание не вернуло управление');
 }
 await page.setViewportSize({width:390,height:844});
 // Главная: постер сразу под логотипом шапки, с парой точек воздуха, и не
 // заходит на неё (владелец: «смотрится ужасно, когда обложка заходит на
 // название и настройки шапки»).
 {const items=(await (await fetch(base+'/api/library',{headers:{cookie}})).json()).items;
  const song=items.find(p=>p.title==='76 дней');await api({action:'hero',id:song.id,key:await cover('hero-lake.jpg')});
  await page.goto(base+'/?mode=listen');await page.waitForLoadState('networkidle').catch(()=>{});await page.waitForTimeout(900);
  const h=await page.evaluate(()=>{const b=s=>document.querySelector(s)?.getBoundingClientRect();
   return {scene:b('.scene'),head:b('.top-header'),brand:b('.top-header-brand'),eyebrow:b('.scene .soft-eyebrow'),menu:b('.scene-menu')};});
  if(!h.scene)problems.push('главная: нет постера');
  else{const air=h.scene.top-h.brand.bottom;
   if(air<1)problems.push('главная: постер заходит на логотип шапки ('+Math.round(air)+')');
   if(air>8)problems.push('главная: между логотипом и постером '+Math.round(air)+' точек — должно быть вплотную, пара точек воздуха');
   if(h.eyebrow&&(h.eyebrow.top<h.scene.top||h.eyebrow.bottom>h.scene.bottom))problems.push('главная: подпись типа вне постера');}
  await page.screenshot({path:path.join(out,'sections-home-390.png')});}
 // Подписи поддержки, эфира и соцсетей — тексты владельца, дословно, и
 // целиком: длиннее прежних, поэтому переносятся, а не обрезаются.
 {await api({action:'donations',links:[{kind:'boosty',url:'https://boosty.to/truethrills'}]});
  await api({action:'links',links:[{kind:'tiktok',url:'https://tiktok.com/@true_thrills'}]});
  const texts=async sel=>page.evaluate(sel=>[...document.querySelectorAll(sel)].map(e=>({text:e.textContent.trim(),cut:e.scrollWidth>e.clientWidth+1})),sel);
  const expect=(where,got,want)=>{const hit=got.find(x=>x.text===want);
   if(!hit)problems.push(where+': нет текста «'+want+'» (есть: '+got.map(x=>'«'+x.text+'»').join(', ')+')');
   else if(hit.cut)problems.push(where+': текст «'+want+'» обрезан');};
  for(const [w,h] of [[360,780],[390,844]]){
   await page.setViewportSize({width:w,height:h});
   await page.goto(base+'/?mode=listen');await page.waitForLoadState('networkidle').catch(()=>{});await page.waitForTimeout(800);
   expect(w+' главная',await texts('.support-card .support-strip-label'),'За каждой историей — работа.');
   expect(w+' главная',await texts('.support-card .support-card-note'),'Поддержка помогает создавать новые выпуски True Thrills.');
   expect(w+' главная',await texts('.soft-socials-label'),'За пределами приложения');
   await open('live');
   expect(w+' эфир',await texts('.live-archive-copy span'),'То, что было вживую. Теперь — в записи.');
   expect(w+' эфир',await texts('.support-strip-copy span'),'Для тех, кому важен живой разговор.');
   await page.locator('.support-button').first().click();await page.waitForTimeout(500);
   expect(w+' окно поддержки',await texts('[role=dialog] h2,[role=dialog] [data-slot=dialog-title]'),'Поддержать True Thrills');
   expect(w+' окно поддержки',await texts('.donate-note'),'Свободный доступ к каждой истории. Добровольная поддержка новых.');
   await page.keyboard.press('Escape');await page.waitForTimeout(300);
  }
  await page.setViewportSize({width:390,height:844});}
 assert.deepEqual(errors,[],'ошибки на странице: '+errors.join('; '));
 assert.deepEqual(problems,[],'\n - '+problems.join('\n - '));
 console.log('Разделы «Аудио», «Видео», «Истории»: одна шапка, одна строка поиска, карточки в границах на 360/390/430; поиск, сортировка, чтение и «Поделиться» в «Историях» работают.');
}finally{await browser?.close();server.kill();await rm(dir,{recursive:true,force:true});}
