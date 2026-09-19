#!/usr/bin/env node
/**
 * Экраны слушателя и студии на настоящей production-сборке: снимает их в
 * outputs/ui/design-*.png и проверяет то, что владелец видит первым, —
 * главная без горизонтального переполнения на пяти ширинах и без вертикальной
 * прокрутки на трёх телефонах. Эфир здесь — статус в базе, а не поток: HLS и
 * AAC проверяет browser-integration в настоящем Chrome.
 *
 * TT_DESIGN_SOFT=1 — только снимки и предупреждения, без падения: для правки
 * вёрстки, когда нужно смотреть, а не проверять.
 */
import {chromium} from 'playwright';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(),dir=await mkdtemp(path.join(root,'.test-tmp-design-')),soft=process.env.TT_DESIGN_SOFT==='1';
const env={...process.env,DATABASE_PATH:path.join(dir,'db.sqlite'),STORAGE_DIR:path.join(dir,'storage'),LIVE_DIR:path.join(dir,'live'),SESSION_SECRET:'design-secret-not-production',ADMIN_PASSWORD:'design-password',FIREBASE_SERVICE_ACCOUNT_FILE:'',PUBLIC_SITE_URL:''};
execFileSync(process.execPath,['node_modules/drizzle-kit/bin.cjs','migrate'],{env,stdio:'ignore'});
await mkdir('outputs/ui',{recursive:true});
const port=3132,base='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env,stdio:['ignore','ignore','inherit']});
let browser,peaksWorker;const problems=[];
const check=(ok,message)=>{if(ok)return;if(soft)console.log('WARN:',message);else problems.push(message);};
try{
 for(let i=0;i<80;i++){try{await fetch(base+'/api/health');break;}catch{await new Promise(r=>setTimeout(r,250));}}
 const login=await fetch(base+'/api/auth',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:'design-password'})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
 const post=async(data)=>{const r=await fetch(base+'/api/library',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify(data)});const text=await r.text();assert.equal(r.status,200,text);return JSON.parse(text);};
 await post({action:'setup'});
 await post({action:'donations',links:[{kind:'boosty',url:'https://boosty.to/truethrills'},{kind:'paypal',url:'https://paypal.me/truethrills'}]});
 await post({action:'links',links:[{kind:'youtube',url:'https://youtube.com/@truethrills'},{kind:'telegram',url:'https://t.me/truethrills'}]});
 // 90 секунд звука с плавающей громкостью: плееру нужна настоящая
 // длительность, а форме звука — настоящий сигнал. На тишине волна была бы
 // ровной линией и ничего не показывала бы при сравнении с листом.
 const seconds=90,rate=44100,wav=Buffer.alloc(44+rate*2*seconds);
 wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
 for(let i=0;i<rate*seconds;i++){
  const t=i/rate,envelope=.18+.82*Math.abs(Math.sin(t*0.7))*(.55+.45*Math.abs(Math.sin(t*0.17)));
  wav.writeInt16LE(Math.round(Math.sin(2*Math.PI*180*t)*envelope*24000),44+i*2);
 }
 const audioUpload=async()=>{const r=await fetch(base+'/api/audio',{method:'POST',headers:{cookie,'content-type':'audio/wav','x-upload-size':String(wav.length)},body:wav});assert.equal(r.status,200);return (await r.json()).key;};
 const key=await audioUpload(),plainKey=await audioUpload();
 // Демонстрационные обложки вырезаны из листа владельца и живут только здесь:
 // в приложение они не попадают, в production обложки приходят из публикаций.
 // Без них кадр показывает фирменный тёмный фон, и сравнить композицию с
 // референсом нельзя. Подробности — tests/fixtures/demo-covers/README.md.
 const {readFile}=await import('node:fs/promises');
 const demoCover=async(file)=>{
  const bytes=await readFile(path.join(root,'tests/fixtures/demo-covers',file));
  const r=await fetch(base+'/api/cover',{method:'POST',headers:{cookie,'content-type':'image/jpeg','x-upload-size':String(bytes.length)},body:bytes});
  const text=await r.text();assert.equal(r.status,200,text);return JSON.parse(text).key;
 };
 // Картинка круга покоя: без неё круг на экране эфира пустой, и проверять
 // в нём нечего.
 await post({action:'calmArt',key:await demoCover('tile-forest.jpg')});
 const story=await post({kind:'story',title:'Там, где заканчивается дорога',description:'Демонстрационный текст для проверки читалки.',body:'Тишина у горного озера. Дорога осталась позади, и впервые за день стало слышно ветер.\n\n'.repeat(40),published:true,coverKey:await demoCover('tile-forest.jpg')});
 await post({kind:'video',title:'Наедине с горами',description:'Демонстрационное видео.',videoUrl:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',published:true,coverKey:await demoCover('tile-waterfall.jpg')});
 // Второй выпуск специально без обложки иновее первого: по нему видно
 // типографический S04, и у него есть «Далее» — следующий в разделе.
 // Запись эфира: тот же настоящий файл под ключом, который даёт воркер эфира.
 // По нему видно S06 — круглую обложку с кольцом прогресса.
 const {copyFile}=await import('node:fs/promises');
 const archiveKey='audio/live-'+crypto.randomUUID();
 for(const suffix of ['','.meta.json'])await copyFile(path.join(env.STORAGE_DIR,key+suffix),path.join(env.STORAGE_DIR,archiveKey+suffix));
 const archived=await post({kind:'podcast',title:'Истории после заката',description:'Специальный выпуск.',audioKey:archiveKey,duration:seconds,published:true,coverKey:await demoCover('tile-mountains.jpg')});
 await new Promise(resolve=>setTimeout(resolve,5));
 const plain=await post({kind:'podcast',title:'Голос северного ветра',description:'Люди. Маршруты. Выбор.',audioKey:plainKey,duration:seconds,published:true});
 await new Promise(resolve=>setTimeout(resolve,5));
 const podcast=await post({kind:'podcast',title:'По ту сторону тишины',description:'Демонстрационный выпуск: дорога, голос и истории, которые остаются.',audioKey:key,duration:seconds,published:true,coverKey:await demoCover('hero-lake.jpg')});
 // Форма звука на снимке настоящая: её считает тот же воркер, что и на VPS.
 // Ждём его недолго — если ffmpeg в окружении нет, снимок покажет спокойное
 // состояние ожидания, и это тоже правда, а не заглушка.
 try{
  const Database=(await import('better-sqlite3')).default;
  peaksWorker=spawn(process.execPath,[path.join(root,'scripts/live-worker.mjs')],{env,stdio:['ignore','ignore','ignore']});
  const peaksDb=new Database(env.DATABASE_PATH,{readonly:true});
  const deadline=Date.now()+60000;
  while(Date.now()<deadline){
   const done=peaksDb.prepare("SELECT COUNT(*) AS n FROM audio_peaks WHERE state='ready' AND peaks<>''").get().n;
   if(done>=2)break;
   await new Promise(r=>setTimeout(r,400));
  }
  peaksDb.close();
 }catch(e){console.warn('Форма звука не посчитана: '+e.message);}
 finally{peaksWorker?.kill('SIGTERM');peaksWorker=undefined;}

 // Тот же браузер, что у browser-integration: в CI установлен Chrome, локально можно указать исполняемый файл.
 browser=await chromium.launch({channel:process.env.TT_BROWSER_EXECUTABLE?undefined:(process.env.TT_BROWSER_CHANNEL||'chrome'),executablePath:process.env.TT_BROWSER_EXECUTABLE,headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
 const shot=async(page,name)=>page.screenshot({path:'outputs/ui/design-'+name+'.png',fullPage:false});
 const settle=async(page)=>{await page.waitForFunction(()=>!document.querySelector('.splash'));await page.waitForTimeout(250);};
 const metrics=page=>page.evaluate(()=>({scrollW:document.documentElement.scrollWidth,innerW:innerWidth,scrollH:document.documentElement.scrollHeight,innerH:innerHeight}));
 const phone=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true});
 phone.setDefaultTimeout(15000);
 const page=await phone.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.__hapticCalls=0;Object.defineProperty(navigator,'vibrate',{configurable:true,value:()=>{window.__hapticCalls++;return true;}});});
 // Главная. Прогресс кладём в хранилище устройства заранее, иначе строки
 // «Продолжить» на снимке не будет — её показывают только при реальной
 // сохранённой позиции.
 await page.goto(base+'/?mode=listen');await settle(page);
 await page.evaluate(id=>{localStorage.setItem('tt-listening-v1',JSON.stringify([{id,position:768,duration:2300,updatedAt:Date.now()}]));},podcast.id);
 await page.reload();await settle(page);await shot(page,'home');
 // A held Play opens only the contextual menu, never playback behind it.
 await page.locator('.scene-action').dispatchEvent('pointerdown',{button:0});await page.waitForTimeout(600);
 await page.getByRole('dialog').waitFor();await page.locator('.scene-action').dispatchEvent('click');
 assert.equal(await page.locator('.podcast-player').count(),0,'long press must not play');
 assert.equal(await page.evaluate(()=>window.trueThrills.back()),true,'Back closes home menu');
 await page.getByRole('dialog').waitFor({state:'hidden'});
 // Каталог и поиск.
 await page.goto(base+'/?mode=listen&view=podcasts');await settle(page);await shot(page,'catalog');
 // Узкий гротеск капсом и номера 01/02/03 владелец отверг, увидев их на живом
 // сайте: заголовки разделов набираются той же гарнитурой, что названия
 // выпусков. Проверка держит это решение, а не исходный лист.
 assert.equal(await page.locator('.voice-column-number').count(),0,'нумерация разделов убрана');
 assert.match(await page.locator('.voice-title').evaluate(el=>getComputedStyle(el).fontFamily),/Lora/,'заголовок раздела — редакционный serif');
 assert.equal(await page.locator('.voice-title').evaluate(el=>getComputedStyle(el).textTransform),'none','заголовок раздела не набирается капсом');
 await page.goto(base+'/?mode=listen&view=videos');await settle(page);await shot(page,'videos');
 await page.goto(base+'/?mode=listen&view=stories');await settle(page);await shot(page,'stories');
 // Плеер поверх каталога, на паузе, чтобы снимок был стабильным.
 await page.goto(base+'/?mode=listen&view=podcasts&post='+podcast.id);await settle(page);await page.locator('.podcast-player').waitFor();
 await page.waitForFunction(()=>{const a=document.querySelector('.podcast-player audio');return a&&Number.isFinite(a.duration)&&a.duration>0;},null,{timeout:15000}).catch(()=>{});
 await page.evaluate(()=>document.querySelector('.podcast-player audio')?.pause());await page.waitForTimeout(300);await shot(page,'player');
 // Плеер открывается поверх главной: за ним не должно просвечивать ничего.
 // Владелец увидел на телефоне два кадра одной фотографии — верх от плеера,
 // низ от главной под ним.
 await page.goto(base+'/?mode=listen');await settle(page);
 await page.locator('.scene-action').click();await page.locator('.podcast-player.is-open').waitFor();
 await page.waitForTimeout(400);
 {const bg=await page.locator('.podcast-player.is-open').evaluate(el=>getComputedStyle(el).backgroundColor);
  const seen=await page.evaluate(()=>{const p=document.querySelector('.podcast-player.is-open');const r=p.getBoundingClientRect();
   const x=Math.round(r.width/2),y=Math.round(r.height*0.8);
   const el=document.elementFromPoint(x,y);
   return {tag:el?.tagName,cls:el?.className?.toString?.().slice(0,60),inPlayer:!!el?.closest('.podcast-player')};});
  assert.notEqual(bg,'rgba(0, 0, 0, 0)','плеер не прозрачен');
  assert.equal(seen.inPlayer,true,'под плеером не видно главную');}
 await page.evaluate(()=>document.querySelector('.podcast-player audio')?.pause());

 // Типографический плеер: выпуск без обложки. Форма звука здесь в спокойном
 // состоянии — пики считает воркер эфира, которого в этой проверке нет.
 await page.goto(base+'/?mode=listen&view=podcasts&post='+plain.id);await settle(page);await page.locator('.podcast-player.is-type').waitFor();
 await page.waitForFunction(()=>{const a=document.querySelector('.podcast-player audio');return a&&Number.isFinite(a.duration)&&a.duration>0;},null,{timeout:15000}).catch(()=>{});
 await page.evaluate(()=>document.querySelector('.podcast-player audio')?.pause());await page.waitForTimeout(400);await shot(page,'player-type');
 assert.equal(await page.locator('.player-next').count(),1,'S04 has a real next episode');
 await page.locator('.player-next').click();await page.locator('.podcast-player.is-archive').waitFor();
 assert.equal(await page.locator('.player-title').innerText(),'Истории после заката','Next loads the next published episode');
 // Запись эфира: круглая обложка с кольцом прогресса.
 await page.goto(base+'/?mode=listen&view=podcasts&post='+archived.id);await settle(page);await page.locator('.podcast-player.is-archive').waitFor();
 await page.waitForFunction(()=>{const a=document.querySelector('.podcast-player audio');return a&&Number.isFinite(a.duration)&&a.duration>0;},null,{timeout:15000}).catch(()=>{});
 await page.evaluate(()=>{const a=document.querySelector('.podcast-player audio');if(a){a.currentTime=a.duration*0.38;a.pause();}});await page.waitForTimeout(400);await shot(page,'player-archive');
 // Системный Back на Android идёт через этот же мост: проверяем связку
 // целиком, а не только реестр слоёв. Меню, затем плеер, затем раздел.
 await page.goto(base+'/?mode=listen&view=podcasts&post='+podcast.id);await settle(page);
 await page.locator('.podcast-player.is-open').waitFor();
 const top=await page.locator('.player-sheet-top').boundingBox();assert.ok(top.width>=380,'player top bar must span the screen');
 await page.waitForFunction(()=>document.querySelector('.podcast-player audio')?.currentTime>0);
 await page.evaluate(()=>{window.__playingAudio=document.querySelector('.podcast-player audio');});
 const tactileBefore=await page.evaluate(()=>window.__hapticCalls);
 await page.locator('.player-more').click();await page.locator('.player-menu').waitFor();
 assert.equal(await page.evaluate(()=>window.__hapticCalls),tactileBefore+1,'one tap -> one haptic');
 await page.keyboard.press('Escape');await page.locator('.player-menu').waitFor({state:'hidden'});
 assert.equal(await page.locator('.player-more').evaluate(el=>el===document.activeElement),true,'Escape restores focus');
 await page.locator('.player-more').click();
 assert.equal(await page.evaluate(()=>window.trueThrills.back()),true,'Back закрывает меню плеера');
 await page.waitForTimeout(150);
 assert.equal(await page.locator('.player-menu').count(),0,'меню закрылось, плеер остался развёрнутым');
 assert.equal(await page.locator('.podcast-player.is-open').count(),1);
 assert.equal(await page.evaluate(()=>window.trueThrills.back()),true,'Back сворачивает плеер');
 await page.waitForTimeout(250);
 assert.equal(await page.locator('.podcast-player.is-mini').count(),1,'плеер свернулся, а не закрылся');
 assert.equal(await page.evaluate(()=>window.__playingAudio===document.querySelector('.podcast-player audio')),true,'тот же audio после сворачивания');
 assert.equal(await page.evaluate(()=>window.__playingAudio.paused),false,'звук продолжает играть');
 assert.equal(await page.evaluate(()=>window.trueThrills.back()),true,'Back уводит из раздела на главную');
 await page.waitForTimeout(250);
 assert.equal(await page.evaluate(()=>window.trueThrills.back()),false,'на главной Back отдаётся системе');
 for(const [width,height] of [[390,844],[360,640]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(150);
  const m=await metrics(page);check(m.scrollH<=height+1,`главная с мини-плеером ${width}x${height}: ${m.scrollH}>${height}`);
  const support=await page.locator('.support-strip:not(.app-strip)').boundingBox(),mini=await page.locator('.podcast-player.is-mini').boundingBox();
  check(support.y+support.height<=mini.y,`мини-плеер закрывает донат ${width}x${height}`);
  await shot(page,`mini-${width}`);
 }
 await page.setViewportSize({width:390,height:844});

 // Свёрнутый плеер на главной.
 const collapse=page.locator('.player-collapse');if(await collapse.count()){await collapse.click();await page.waitForTimeout(300);}
 await page.locator('.bottom-nav-item').first().click();await page.waitForTimeout(300);await shot(page,'home-miniplayer');
 // История.
 await page.goto(base+'/?mode=listen&view=stories&post='+story.id);await settle(page);await page.locator('.reader-scroll').waitFor();await page.waitForTimeout(300);await shot(page,'story');
 // Эфир, когда его нет, и настройки.
 await page.goto(base+'/?mode=listen&view=live');await settle(page);await shot(page,'live-idle');
  // Подсказка дыхания: четыре слова на одном круге, и в каждый момент
  // горит ровно одно — иначе за ней нельзя дышать.
  {const guide=await page.evaluate(()=>{const g=document.querySelector('.breath-guide');
    if(!g)return null;const spans=[...g.children];
    return {count:spans.length,lit:spans.filter(s=>Number(getComputedStyle(s).opacity)>.5).length,
     words:spans.map(s=>s.textContent.trim())};});
   if(!guide)problems.push('эфир: без эфира нет подсказки дыхания');
   else{
    if(guide.count!==4)problems.push('эфир: в подсказке дыхания '+guide.count+' слова вместо четырёх');
    if(guide.lit>1)problems.push('эфир: одновременно горит '+guide.lit+' слова подсказки');
   }}
  // Когда эфира нет, в круге стоит картинка автора, и она должна быть видна:
  // затемнение в центре близко к нулю, лампа не занимает полкруга, а саму
  // картинку размывать нельзя — размывается только подложка под лампой.
  {const orbState=await page.evaluate(()=>{const orb=document.querySelector('.live-orb'),
     copy=document.querySelector('.live-orb-copy'),shade=document.querySelector('.live-orb-shade'),
     img=document.querySelector('.live-orb img');
    if(!orb||!copy||!shade)return null;
    const o=orb.getBoundingClientRect(),c=copy.getBoundingClientRect();
    const first=getComputedStyle(shade).backgroundImage.match(/rgba?\(([^)]*)\)/);
    const parts=first?first[1].split(',').map(v=>v.trim()):[];
    const cs=getComputedStyle(copy);
    return {share:(c.width*c.height)/(o.width*o.height),
     centerAlpha:parts.length>3?Number(parts[3]):1,
     lamp:copy.textContent.trim(),
     backdrop:cs.backdropFilter||cs.webkitBackdropFilter||'none',
     picture:img?getComputedStyle(img).filter:'нет картинки',
     title:document.querySelector('.live-stage-name')?.textContent.trim()||''};});
   if(!orbState)problems.push('эфир: круга покоя нет');
   else{
    if(orbState.lamp!=='OFF AIR')problems.push('покой: лампа показывает «'+orbState.lamp+'», а не OFF AIR');
    if(orbState.share>0.2)problems.push('покой: лампа занимает '+Math.round(orbState.share*100)+'% круга');
    if(orbState.centerAlpha>0.1)problems.push('покой: центр круга затемнён на '+orbState.centerAlpha);
    if(!/blur/.test(orbState.backdrop))problems.push('покой: под лампой нет размытия ('+orbState.backdrop+')');
    if(orbState.picture==='нет картинки')problems.push('покой: картинка круга не загрузилась');
    else if(orbState.picture!=='none')problems.push('покой: размыта сама картинка ('+orbState.picture+') — размывать можно только подложку');
    if(orbState.title)problems.push('покой: под кругом лишний заголовок «'+orbState.title+'»');
   }}
  // Большой экран: у слушателя нет колонки с подсказками автору, и без правки
  // столбец эфира уезжал на 149 пикселей левее середины страницы.
  for(const width of [1280,1920]){
   await page.setViewportSize({width,height:900});await page.waitForTimeout(200);
   const wide=await page.evaluate(()=>{const mid=e=>{const r=e.getBoundingClientRect();return r.left+r.width/2;};
    const main=document.querySelector('.main-content'),stage=document.querySelector('.live-stage'),
     card=document.querySelector('.live-archive-card'),rings=document.querySelector('.live-rings');
    if(!main||!stage||!card||!rings)return null;
    return {off:Math.round(Math.abs(mid(main)-mid(stage))),card:Math.round(card.getBoundingClientRect().width),
     ring:Math.round(rings.getBoundingClientRect().width)};});
   if(!wide)problems.push('эфир '+width+': экран не найден');
   else{
    if(wide.off>2)problems.push('эфир '+width+': столбец смещён от середины страницы на '+wide.off+'px');
    if(wide.card>620)problems.push('эфир '+width+': карточка архива растянута на '+wide.card+'px');
    if(wide.ring<320)problems.push('эфир '+width+': круг всего '+wide.ring+'px на мониторе');
   }}
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);
 await page.goto(base+'/?mode=listen&view=settings');await settle(page);await shot(page,'settings');
 // Эфир идёт: статус в базе без потока — для вёрстки этого достаточно.
 const start=await fetch(base+'/api/live',{method:'POST',headers:{cookie,'content-type':'application/json',origin:base},body:JSON.stringify({action:'start',title:'Истории после заката',coverKey:await demoCover('tile-mountains.jpg')})});const startText=await start.text();assert.equal(start.status,200,startText);
 await page.goto(base+'/?mode=listen');await settle(page);await page.waitForFunction(()=>!!document.querySelector('.bottom-nav-dot'),null,{timeout:8000}).catch(()=>{});await shot(page,'home-live');
 // Экран эфира снимается только когда эфир действительно виден клиенту:
 // состояние приходит опросом, и раньше снимок заставал ещё пустой экран.
 await page.goto(base+'/?mode=listen&view=live');await settle(page);
 await page.waitForFunction(()=>!!document.querySelector('.live-orb-dot'),null,{timeout:10000}).catch(()=>{});
  // Круг эфира: много колец, металлическая кромка и мигающая точка. Колец
  // должно быть именно много — из одного-двух «пластинка» не читается.
  {const stage=await page.evaluate(()=>({rings:document.querySelectorAll('.live-ring').length,
    rim:document.querySelector('.live-orb')?getComputedStyle(document.querySelector('.live-orb'),'::after').maskComposite:'нет',
    dot:document.querySelector('.live-orb-dot')?getComputedStyle(document.querySelector('.live-orb-dot')).animationName:'нет',
    breath:document.querySelector('.live-ring')?getComputedStyle(document.querySelector('.live-ring')).animationName:'нет'}));
   if(stage.rings<6)problems.push('эфир: колец '+stage.rings+', нужно не меньше шести');
   if(!String(stage.rim).startsWith('exclude'))problems.push('эфир: у знака нет металлической кромки (mask-composite: '+stage.rim+')');
   if(stage.dot!=='live-blink')problems.push('эфир: красная точка не мигает ('+stage.dot+')');
   // Без эфира круг ведёт квадратное дыхание, в эфире — обычное. Годится
   // любое из двух; что кольцо действительно движется, проверяется ниже.
   if(!['live-breathe','box-breathe'].includes(stage.breath))problems.push('эфир: кольца не дышат ('+stage.breath+')');}
  // Имя анимации ничего не доказывает: прежний вариант «дышал» одной
  // прозрачностью у почти невидимой линии, имя было на месте, а на экране не
  // происходило ничего. Поэтому мерим, что кольцо реально двигается.
  {const moved=await page.evaluate(async()=>{const ring=document.querySelector('.live-ring');
    if(!ring)return null;const a=getComputedStyle(ring).transform;
    await new Promise(r=>setTimeout(r,700));
    return {a,b:getComputedStyle(ring).transform};});
   if(!moved)problems.push('эфир: колец нет');
   else if(moved.a===moved.b)problems.push('эфир: кольцо не двигается — transform не меняется ('+moved.a+')');}
  // TT_CAPTURE_MOTION=1 — покадровая съёмка круга эфира. Нужна, чтобы показать
  // владельцу движение: на обычном снимке дыхание колец увидеть нельзя. По
  // умолчанию выключена, каждый кадр это отдельный screenshot.
  if(process.env.TT_CAPTURE_MOTION==='1'){
   const {mkdir}=await import('node:fs/promises');
   await mkdir('outputs/ui/motion',{recursive:true});
   const orb=page.locator('.live-rings');
   for(let i=0;i<24;i++){
    // 3.6 с — полный вдох-выдох; 24 кадра по 150 мс покрывают его целиком.
    await orb.screenshot({path:'outputs/ui/motion/breath-'+String(i).padStart(2,'0')+'.png'});
    await page.waitForTimeout(150);
   }
   // Второй набор — как кольца отзовутся на звук. Настоящего эфира здесь нет,
   // поэтому энергия подаётся руками теми же значениями, что дал бы спектр.
   for(let i=0;i<24;i++){
    const phase=i/24*Math.PI*2;
    await page.evaluate(([ph])=>{document.querySelectorAll('.live-ring').forEach((r,n)=>{
     const v=Math.max(0,Math.sin(ph*(1+n*.35)+n)*.5+.35);
     r.style.setProperty('--ring-energy',v.toFixed(3));});},[phase]);
    await orb.screenshot({path:'outputs/ui/motion/sound-'+String(i).padStart(2,'0')+'.png'});
    await page.waitForTimeout(60);
   }
   await page.evaluate(()=>document.querySelectorAll('.live-ring').forEach(r=>r.style.removeProperty('--ring-energy')));
   console.log('Кадры движения: outputs/ui/motion');
  }
 await page.waitForTimeout(300);await shot(page,'live');
 const {id:liveId}=JSON.parse(startText);await fetch(base+'/api/live',{method:'POST',headers:{cookie,'content-type':'application/json',origin:base},body:JSON.stringify({action:'stop',id:liveId})});
 // Pending, then transient network failure, then success must recover while
 // the same screen remains open (not only after navigating away and back).
 let peakRequests=0;
 await page.route('**/api/peaks?*',route=>{peakRequests++;return peakRequests===1?route.fulfill({json:{state:'pending',peaks:''}}):peakRequests===2?route.fulfill({status:503,body:'temporary'}):route.fulfill({json:{state:'ready',peaks:'z'.repeat(96)}});});
 await page.goto(base+'/?mode=listen&view=podcasts&post='+plain.id);await settle(page);
 await page.locator('.waveform-strip:not(.is-flat)').waitFor({timeout:12000});assert.ok(peakRequests>=3,'peaks retry after temporary failure');
 assert.match(await page.locator('.player-title').evaluate(el=>getComputedStyle(el).fontFamily),/Lora/,'типографический плеер — тот же редакционный serif');
 await page.unroute('**/api/peaks?*');
 // Broken image followed by a hero change must not remove DOM behind React.
 const library=await (await fetch(base+'/api/library')).json();library.items=library.items.filter(p=>p.id===podcast.id||p.id===plain.id);
 await page.route('**/api/library',route=>route.fulfill({json:library}));
 await page.route('**/api/cover?*',route=>route.fulfill({status:404,body:'missing'}));
 await page.goto(base+'/?mode=listen');await settle(page);await page.locator('.scene-mark').waitFor();
 // Кнопка меню убрана с глаз по решению владельца, но осталась достижимой с
 // клавиатуры: пальцем и мышью её нет, Tab и Enter открывают то же меню.
 assert.equal(await page.locator('.scene-menu').evaluate(el=>getComputedStyle(el).pointerEvents),'none','кнопка меню не перехватывает нажатия по кадру');
 await page.locator('.scene-menu').focus();await page.keyboard.press('Enter');
 await page.locator('.card-menu-action').click();await page.getByRole('dialog').waitFor({state:'hidden'});
 await page.locator('.scene-title').filter({hasText:'Голос северного ветра'}).waitFor();
 assert.equal(await page.locator('.scene-mark').count(),1,'new fallback survives image failure and hero replacement');
 await page.unroute('**/api/library');await page.unroute('**/api/cover?*');
 await phone.close();
 // Переполнение и высота первого экрана — в чистом контексте: без «прочитанных»
 // публикаций, чтобы карточка-герой была на месте, как у нового слушателя.
 const fresh=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true});const sizes=await fresh.newPage();sizes.on('pageerror',e=>errors.push(e.message));
 for(const width of [360,390,412,768,1366]){const page=sizes;await page.setViewportSize({width,height:844});await page.goto(base+'/?mode=listen');await settle(page);const m=await metrics(page);check(m.scrollW<=m.innerW,`главная переполняет ширину ${width}: ${m.scrollW}>${m.innerW}`);}
 // На обычном телефоне главная умещается целиком. На самом маленьком экране
 // требование мягче и честнее: владелец попросил вернуть на главную блок
 // площадок, и прятать то, о чём он просил, хуже, чем дать пролистнуть один
 // блок. Поэтому там проверяем, что до сгиба помещается главное — герой,
 // плитки и поддержка, — а площадки могут оказаться чуть ниже.
 for(const [width,height] of [[390,844],[412,915]]){const page=sizes;await page.setViewportSize({width,height});await page.goto(base+'/?mode=listen');await settle(page);const m=await metrics(page);check(m.scrollH<=m.innerH+1,`главная ${width}×${height} прокручивается: ${m.scrollH}>${m.innerH}`);}
 {const page=sizes;await page.setViewportSize({width:360,height:640});await page.goto(base+'/?mode=listen');await settle(page);
  const bottom=await page.locator('.support-strip:not(.app-strip)').evaluate(el=>Math.round(el.getBoundingClientRect().bottom));
  check(bottom<=640,`на 360×640 строка поддержки уходит за первый экран: ${bottom}>640`);
  const m=await metrics(page);
  check(m.scrollH<=m.innerH+140,`на 360×640 главная прокручивается больше чем на один блок: ${m.scrollH}>${m.innerH}`);
  await shot(page,'home-360');}
 await fresh.close();
 // Студия автора на широком экране.
 const desk=await browser.newContext({viewport:{width:1366,height:900},deviceScaleFactor:1});await desk.addCookies([{name:cookie.split('=')[0],value:cookie.split('=').slice(1).join('='),url:base}]);
 // Панель автора: шесть пунктов против пяти у слушателя. Раньше сетка была
 // жёстко на пять колонок, и шестая кнопка уезжала во второй ряд.
 // На широком экране панель автора становится боковой колонкой — проверяем
 // именно телефонную ширину, где она нижняя.
 {const nav=await desk.newPage();await nav.setViewportSize({width:390,height:844});await nav.goto(base+'/');await settle(nav);
  // Считаем только видимые пункты: настройки — кнопка боковой панели на ПК,
  // на телефоне она скрыта и позиции в ряду не занимает.
  const rows=await nav.evaluate(()=>{const items=[...document.querySelectorAll('.bottom-nav-item')].filter(el=>el.offsetParent!==null);
   return {count:items.length,tops:new Set(items.map(el=>Math.round(el.getBoundingClientRect().top))).size,
    labels:items.map(el=>el.textContent.trim())};});
  assert.ok(rows.count>=5,'панель автора не потеряла пункты');
  // Металлические круги вокруг иконок держат по одному WebGL-контексту
  // каждый. На телефоне их быть не должно: старому WebView это лишний
  // расход, а разметка тут общая с ПК.
  const phoneShaders=await nav.evaluate(()=>document.querySelectorAll('.shader-container-exploded').length);
  assert.equal(phoneShaders,0,'на телефоне шейдерных кругов нет');
  assert.equal(await nav.evaluate(()=>document.querySelectorAll('.tt-beams').length),0,'на телефоне фона с лучами нет');
  assert.equal(rows.tops,1,'все пункты панели стоят в один ряд');
  assert.equal(rows.labels.includes('Запись'),false,'страницы записи в панели больше нет: подкасты пишутся в FL Studio');
  assert.equal(rows.labels.includes('Эфир'),true,'эфир доступен из панели');
  // Главная стоит по центру панели и несёт знак канала: до неё чаще всего
  // тянутся большим пальцем, и она должна быть заметно крупнее соседей.
  const home=await nav.evaluate(()=>{const items=[...document.querySelectorAll('.bottom-nav-item')].filter(el=>el.offsetParent!==null);
   const at=items.findIndex(el=>el.classList.contains('bottom-nav-home'));
   const mark=document.querySelector('.bottom-nav-home .nav-brand-mark');
   const other=items.find(el=>!el.classList.contains('bottom-nav-home'))?.querySelector('svg');
   return {at,count:items.length,markW:mark?Math.round(mark.getBoundingClientRect().width):0,
    otherW:other?Math.round(other.getBoundingClientRect().width):0};});
  assert.equal(home.at,Math.floor(home.count/2),'главная стоит ровно посередине панели');
  assert.ok(home.markW>=home.otherW+8,'знак главной заметно крупнее соседних значков');
  await nav.close();}
 // Оконное приложение на ПК: строки меню над страницей больше нет, три её
 // команды переехали в шапку. Подставляем мост WebView2 до загрузки страницы и
 // проверяем весь путь до сообщения, которое ловит оконная часть.
 {const shell=await desk.newPage();await shell.setViewportSize({width:2560,height:1400});
  // window.chrome в Chromium уже существует и переопределению не поддаётся,
  // поэтому подставляем только webview — как это и делает WebView2.
  await shell.addInitScript(()=>{const sent=[];
   const w=window;w.chrome=w.chrome||{};w.chrome.webview={postMessage:(m)=>sent.push(m)};
   Object.defineProperty(window,'__sent',{get:()=>sent});});
  await shell.goto(base+'/');await settle(shell);
  const menu=shell.locator('.shell-menu > button');
  if(await menu.count()!==1)problems.push('в приложении на ПК нет меню действий');
  else{
   await menu.click();
   const items=await shell.locator('.shell-menu-list button').allTextContents();
   if(items.length!==4)problems.push('в меню действий приложения '+items.length+' пунктов вместо четырёх');
   await shell.locator('.shell-menu-list button').first().click();
   await menu.click();await shell.locator('.shell-menu-list button').nth(1).click();
   await menu.click();await shell.locator('.shell-menu-list button').nth(2).click();
   await menu.click();await shell.locator('.shell-menu-list button').nth(3).click();
   const sent=await shell.evaluate(()=>window.__sent.filter(m=>m!=='true-thrills:active'&&m!=='true-thrills:idle'));
   const want=['true-thrills:reload','true-thrills:browser','true-thrills:fullscreen','true-thrills:about'];
   if(sent.join(',')!==want.join(','))problems.push('меню действий шлёт '+JSON.stringify(sent)+' вместо '+JSON.stringify(want));
  }
  await shell.close();}

 // Сайт слушателя на настольных ширинах. Телефон проверяется давно, ПК —
 // нет, и владелец увидел там раскладку студии вместо страницы канала.
 // Снимки без проверок: сначала нужно посмотреть, что вообще происходит.
 {const guest=await browser.newContext({viewport:{width:1366,height:900},deviceScaleFactor:1});
  // Ширины: 1024 и 1440 — сами границы, на которых раскладка переключается
  // (настольный каркас и третья колонка каталога), остальные — между ними и
  // монитор владельца. Разъезжается вёрстка обычно ровно на границе, которую
  // никто не смотрит.
  for(const w of [1024,1280,1440,1600,1920,2560]){
   const g=await guest.newPage();await g.setViewportSize({width:w,height:Math.round(w*0.56)});
   // Раздел снимаем тем же заходом: каталог на мониторе владелец видит не реже
   // главной, а проверялся он только на телефоне.
   await g.goto(base+'/?mode=listen&view=podcasts');await settle(g);await g.waitForTimeout(300);
   await g.screenshot({path:'outputs/ui/guest-catalog-'+w+'.png',fullPage:true});
   // Каталог сеткой: одной колонкой карточка выпуска пустовала справа на две
   // трети. И подвал на странице должен быть один — их было два подряд.
   const cat=await g.evaluate(()=>{const cards=[...document.querySelectorAll('.post-card')];
    const tops=new Set(cards.map(c=>Math.round(c.getBoundingClientRect().top)));
    return {cards:cards.length,rows:tops.size,
     feet:[...document.querySelectorAll('.site-footer,.listener-main .content-footer')]
      .filter(f=>getComputedStyle(f).display!=='none').length};});
   if(cat.cards>1&&cat.rows===cat.cards)problems.push('слушатель '+w+': каталог идёт одной колонкой ('+cat.cards+' карточек в '+cat.rows+' рядах)');
   if(cat.feet!==1)problems.push('слушатель '+w+': подвалов на странице '+cat.feet+', должен быть один');
   await g.goto(base+'/?mode=listen');await settle(g);await g.waitForTimeout(300);
   await g.screenshot({path:'outputs/ui/guest-'+w+'.png',fullPage:true});
   const m=await g.evaluate(()=>({w:document.documentElement.scrollWidth,iw:innerWidth,
    h:document.documentElement.scrollHeight,ih:innerHeight,
    shaders:document.querySelectorAll('.shader-container-exploded').length,
    beams:document.querySelectorAll('.tt-beams').length,
    listener:!!document.querySelector('.listener-main'),
    content:Math.round(document.querySelector('.main-content')?.getBoundingClientRect().width??0)}));
   console.log('слушатель '+w+':',JSON.stringify(m));
   // Оформление студии слушателю не принадлежит: металлические круги стоят
   // WebGL-контекста каждый, лучи — анимации холста. Гость платил за них,
   // просто открыв канал с компьютера.
   if(m.shaders)problems.push('слушатель '+w+': кругов студии '+m.shaders+', должно быть 0');
   if(m.beams)problems.push('слушатель '+w+': фон студии с лучами показан гостю');
   if(m.w>m.iw+1)problems.push('слушатель '+w+': переполнение по ширине');
   // Ссылка на приложение — то, за чем человек и приходит на сайт с
   // компьютера. Она должна быть видна и вести на существующий файл.
   const app=await g.evaluate(async()=>{const a=document.querySelector('.app-strip');
    if(!a)return null;const r=await fetch(a.getAttribute('href'),{method:'HEAD'});
    return {href:a.getAttribute('href'),status:r.status,type:r.headers.get('content-type')};});
   if(!app)problems.push('слушатель '+w+': на главной нет ссылки на приложение');
   else if(app.status!==200)problems.push('слушатель '+w+': ссылка на приложение отвечает '+app.status+' ('+app.href+')');
   // Каркас страницы: разделы строкой наверху, а не плавающей пилюлей внизу,
   // и подвал в конце. Порядок задан свойством order — в разметке панель
   // идёт последней, ради телефона.
   const frame=await g.evaluate(()=>{const nav=document.querySelector('.bottom-nav'),
    main=document.querySelector('.listener-main'),foot=document.querySelector('.site-footer'),
    head=document.querySelector('.top-header');
    const top=el=>el?Math.round(el.getBoundingClientRect().top+scrollY):null;
    return {navFixed:nav?getComputedStyle(nav).position:'нет',nav:top(nav),main:top(main),
     foot:top(foot),head:top(head),footShown:!!foot&&getComputedStyle(foot).display!=='none',
     headRight:head?Math.round(head.getBoundingClientRect().right):0,
     mainRight:main?Math.round(main.getBoundingClientRect().right):0};});
   if(frame.navFixed==='fixed')problems.push('слушатель '+w+': панель разделов всё ещё плавающая');
   if(!(frame.head<frame.nav&&frame.nav<frame.main))problems.push('слушатель '+w+': порядок каркаса '+JSON.stringify(frame));
   if(!frame.footShown)problems.push('слушатель '+w+': подвала нет');
   else if(frame.foot<frame.main)problems.push('слушатель '+w+': подвал выше содержимого');
   if(Math.abs(frame.headRight-frame.mainRight)>1)problems.push('слушатель '+w+': шапка не по колонке содержимого ('+frame.headRight+' против '+frame.mainRight+')');
   // Главная в две колонки: кадр слева, всё остальное справа от него, а не
   // под ним. Кадр больше не занимает экран по высоте.
   const two=await g.evaluate(()=>{const sc=document.querySelector('.immersion>.scene'),
    side=document.querySelector('.scene-side');
    if(!sc||!side)return null;const a=sc.getBoundingClientRect(),b=side.getBoundingClientRect();
    return {sceneRight:Math.round(a.right),sideLeft:Math.round(b.left),
     sceneH:Math.round(a.height),viewport:innerHeight};});
   if(!two)problems.push('слушатель '+w+': на главной нет кадра или правой колонки');
   // Карточки разделов держат ту же пропорцию 4:5, что и обложки: иначе
   // вертикальную картинку 1080×1350 режет по высоте до полоски.
   const tiles=await g.evaluate(()=>[...document.querySelectorAll('.section-tile')]
    .map(el=>{const r=el.getBoundingClientRect();return Math.round(r.width/r.height*100)/100;}));
   const wrong=tiles.filter(r=>Math.abs(r-0.8)>0.05);
   if(!tiles.length)problems.push('слушатель '+w+': карточек разделов нет');
   // Описание канала стоит в правой колонке, а не поверх фотографии. Оно не
   // зависит от числа публикаций — в отличие от списка свежего, который на
   // канале с одним выпуском пуст, и колонка оставалась голой.
   const intro=await g.evaluate(()=>{const side=document.querySelector('.side-intro'),
    over=document.querySelector('.scene-intro');
    return {side:!!side&&getComputedStyle(side).display!=='none'&&side.textContent.trim().length>10,
     over:!!over&&getComputedStyle(over).display!=='none'};});
   if(!intro.side)problems.push('слушатель '+w+': описания канала нет в правой колонке');
   if(intro.over)problems.push('слушатель '+w+': описание канала осталось и поверх кадра — показано дважды');
   else if(wrong.length)problems.push('слушатель '+w+': карточки разделов не 4:5 — '+wrong.join(', '));
   else{
    if(two.sideLeft<two.sceneRight)problems.push('слушатель '+w+': правая колонка налезает на кадр ('+two.sideLeft+' < '+two.sceneRight+')');
    if(two.sceneH>two.viewport*0.75)problems.push('слушатель '+w+': кадр занимает '+two.sceneH+'px при экране '+two.viewport);
   }
  }
  // 1023 — последний пиксель телефонной раскладки. Проверяем, что за границей
  // ничего настольного не включилось: панель разделов снова плавающая внизу,
  // подвала сайта нет, описание канала лежит поверх кадра.
  // Высота 820, а не 700: на низком экране описание с кадра прячет отдельное
  // правило @media(max-height:700px) — проверяли бы его, а не границу ширины.
  {const edge=await guest.newPage();await edge.setViewportSize({width:1023,height:820});
   await edge.goto(base+'/?mode=listen');await settle(edge);await edge.waitForTimeout(250);
   const m=await edge.evaluate(()=>({nav:getComputedStyle(document.querySelector('.bottom-nav')).position,
    foot:!!document.querySelector('.site-footer')&&getComputedStyle(document.querySelector('.site-footer')).display!=='none',
    side:!!document.querySelector('.side-intro')&&getComputedStyle(document.querySelector('.side-intro')).display!=='none',
    over:!!document.querySelector('.scene-intro')&&getComputedStyle(document.querySelector('.scene-intro')).display!=='none',
    w:document.documentElement.scrollWidth,iw:innerWidth}));
   if(m.nav!=='fixed')problems.push('граница 1023: панель разделов не плавающая ('+m.nav+')');
   if(m.foot)problems.push('граница 1023: показан настольный подвал');
   if(m.side)problems.push('граница 1023: описание канала ушло в колонку раньше границы');
   if(!m.over)problems.push('граница 1023: описание канала пропало с кадра');
   if(m.w>m.iw+1)problems.push('граница 1023: переполнение по ширине');
   await edge.close();}
  await guest.close();}

 // Одно число во всех трёх местах: памятка автору, подсказка в приложении и
 // вёрстка. Раньше памятка говорила 4:5, а приложение — 9:16.
 {const {readFile}=await import('node:fs/promises');
  const doc=await readFile('docs/COVERS-RU.md','utf8'),ru=await readFile('lib/i18n/ru.ts','utf8');
  const hint=/'editor\.coverNote'|"editor\.coverNote"/.test(ru)?ru.split(/["']editor\.coverNote["']\s*:\s*/)[1].split('\n')[0]:'';
  if(!/4:5/.test(doc)||!/1080\s*[×x]\s*1350/.test(doc))problems.push('памятка docs/COVERS-RU.md больше не называет 4:5 / 1080×1350');
  if(!/4:5/.test(hint))problems.push('подсказка в редакторе не называет 4:5: '+hint.slice(0,80));
  if(!/1080×1350/.test(hint))problems.push('подсказка в редакторе не называет 1080×1350');
  // Картинка круга покоя квадратная — это сказано и в памятке, и в студии.
  const calm=/["']settings\.calmNote["']\s*:\s*/.test(ru)?ru.split(/["']settings\.calmNote["']\s*:\s*/)[1].split('\n')[0]:'';
  if(!/1:1/.test(doc)||!/1080\s*[×x]\s*1080/.test(doc))problems.push('памятка не называет 1:1 / 1080×1080 для круга покоя');
  if(!/1080×1080/.test(calm))problems.push('подсказка про круг покоя не называет 1080×1080: '+calm.slice(0,70));}

 // Редактор видео. Предпросмотр нужен, чтобы убедиться, что ссылка та, но
 // запускаться сам он не должен: человек пришёл править карточку, а не
 // смотреть ролик. И перекрывать кнопки сохранения ему нечем.
 {const ed=await desk.newPage();await ed.setViewportSize({width:2560,height:1400});
  await ed.goto(base+'/?view=videos');await settle(ed);
  await ed.locator('.post-actions button[title]').first().click();
  await ed.locator('.editor-dialog').waitFor({timeout:8000});
  // Мерим при прокрутке вниз: именно там кадр сходится с кнопками.
  await ed.evaluate(()=>{const d=document.querySelector('.editor-dialog');if(d)d.scrollTop=d.scrollHeight;});
  await ed.waitForTimeout(400);
  const box=await ed.evaluate(()=>{
   const frame=document.querySelector('.editor-dialog .video-frame'),actions=document.querySelector('.editor-dialog .editor-actions');
   const rect=el=>{const r=el.getBoundingClientRect();return {top:Math.round(r.top),bottom:Math.round(r.bottom),left:Math.round(r.left),right:Math.round(r.right)};};
   return {frame:frame?rect(frame):null,actions:actions?rect(actions):null,
    src:document.querySelector('.editor-dialog .video-frame iframe')?.getAttribute('src')??'',
    autoplayAttr:!!document.querySelector('.editor-dialog .video-frame video')?.autoplay};});
  if(!box.frame)problems.push('редактор видео: предпросмотра нет');
  else if(!box.actions)problems.push('редактор видео: не найдены кнопки сохранения');
  else if(box.frame.top<box.actions.bottom)
   problems.push('редактор видео: предпросмотр ('+JSON.stringify(box.frame)+') не ниже кнопок ('+JSON.stringify(box.actions)+')');
  if(/autoplay=1/.test(box.src)||box.autoplayAttr)problems.push('редактор видео: предпросмотр запускается сам');
  await ed.screenshot({path:'outputs/ui/design-pc-video-editor.png'});
  await ed.close();}
 // Окно EXE — 1280×880. Требование «ни одна вкладка не прокручивается»
 // владелец снял в пользу более крупных элементов: знак канала и кнопки
 // боковой панели важнее пары вкладок, которые теперь чуть длиннее окна.
 // Поэтому здесь проверяется то, что он попросил вместо этого: размеры
 // органов управления и отсутствие переполнения по ширине. Высота каждой
 // вкладки печатается — чтобы видеть цену, а не догадываться о ней.
 // 2560×1400 — монитор владельца: 27" 2560×1440, приложение всегда во весь
 // экран. Меряем именно его, а не окно, которого у него не бывает.
 {const fit=await desk.newPage();await fit.setViewportSize({width:2560,height:1400});
  const tall=[];
  for(const v of ['home','podcasts','videos','stories','live']){
   await fit.goto(base+'/?view='+v);await settle(fit);await fit.waitForTimeout(250);
   const m=await fit.evaluate(()=>({h:document.documentElement.scrollHeight,inner:innerHeight,w:document.documentElement.scrollWidth,iw:innerWidth,
    markW:Math.round(document.querySelector('.top-header-brand img')?.getBoundingClientRect().width||0),
    navW:Math.round(document.querySelector('.bottom-nav')?.getBoundingClientRect().width||0),
    settings:!!document.querySelector('.bottom-nav-settings')?.getBoundingClientRect().height}));
   if(m.w>m.iw+1)problems.push('студия '+v+': переполнение по ширине');
   if(m.markW<72)problems.push('студия '+v+': знак канала мельче 72px ('+m.markW+')');
   if(m.navW<90)problems.push('студия '+v+': боковая панель уже 90px ('+m.navW+')');
   if(!m.settings)problems.push('студия '+v+': в боковой панели нет кнопки настроек');
   // На ПК круги есть, и их немного: браузер держит около 16 WebGL-контекстов
   // на вкладку, дальше самые старые гаснут.
   const shaders=await fit.evaluate(()=>document.querySelectorAll('.shader-container-exploded').length);
   // В браузере моста к оконному приложению нет, значит и меню действий быть
   // не должно: иначе кнопки нажимались бы вхолостую.
   if(await fit.evaluate(()=>document.querySelectorAll('.shell-menu').length))problems.push('студия '+v+': меню действий приложения показано в браузере');
   // Светлая системная полоса прокрутки на тёмной странице читается как
   // дефект окна. Мерить её ширину здесь нельзя — в headless-браузере
   // полоса наложенная и ширины не занимает никогда, такая проверка
   // прошла бы и без правила. Поэтому спрашиваем сам каскад: он и был
   // местом поломки, когда правило перебивалось другим ниже по файлу.
   const bar=await fit.evaluate(()=>getComputedStyle(document.documentElement).scrollbarWidth);
   if(bar!=='none')problems.push('студия '+v+': полоса прокрутки не спрятана (scrollbar-width: '+bar+')');
   if(!(await fit.evaluate(()=>document.querySelectorAll('.tt-beams').length)))problems.push('студия '+v+': фон с лучами не нарисовался');
   if(v==='home'&&shaders<11)problems.push('студия home: кругов с окантовкой '+shaders+', ожидалось 11 — четыре плитки, пять кнопок панели и два знака канала');
   if(shaders>12)problems.push('студия '+v+': WebGL-контекстов '+shaders+' — близко к пределу браузера');
   if(m.h>m.inner+2)tall.push(v+' '+m.h);
   // Ряды главной стоят по одной сетке: одинаковые края и, у библиотеки с
   // настройками, одинаковые колонки. Раньше верхний ряд упирался в свой
   // предел ширины и стоял уже остальных, а промежутки в 15 и 18 пикселей
   // разводили карточки на пару пикселей мимо плиток над ними.
   // Строка списка: у каждого значка действия должна быть подсказка, иначе
   // понять его можно только методом тыка. И состояний ровно два — черновик
   // или опубликованное; вкладку «Все» владелец убрал как лишнюю.
   if(v==='videos'){
    const row=await fit.evaluate(()=>({
     tabs:[...document.querySelectorAll('.filter-tabs button')].map(b=>b.textContent.trim()),
     untitled:[...document.querySelectorAll('.post-actions button:not(.text-button)')].filter(b=>!b.title.trim()).length,
     actions:document.querySelectorAll('.post-actions button:not(.text-button)').length}));
    if(row.tabs.length!==2)problems.push('видео: вкладок фильтра '+row.tabs.length+' вместо двух — '+row.tabs.join(', '));
    if(!row.actions)problems.push('видео: в строке нет значков действий, проверять нечего');
    if(row.untitled)problems.push('видео: у '+row.untitled+' значков строки нет подсказки');
    // Высоту строки задаёт текст, а не обложка. Вертикальный постер однажды
    // растянул карточку вдвое: у картинки height:100%, а у растянутой ячейки
    // высота не число — процент превращался в «сколько получится».
    const card=await fit.evaluate(()=>{const c=document.querySelector('.post-card');
     return c?{card:Math.round(c.getBoundingClientRect().height),text:Math.round(c.querySelector('.post-content').getBoundingClientRect().height)}:null;});
    // Обложка больше не обязана укладываться в высоту текста: владелец выбрал,
    // чтобы рамка шла за картинкой. Но и растягивать строку без предела ей
    // нельзя — вертикальный постер однажды удвоил карточку.
    if(card&&card.card>240)problems.push('видео: строка выросла до '+card.card+'px при тексте '+card.text+'px');
    // Обложка показывается целиком: автор должен видеть, что именно уйдёт
    // слушателю, а не середину подрезанной картинки.
    const fitMode=await fit.evaluate(()=>{const i=document.querySelector('.post-cover-image');return i?getComputedStyle(i).objectFit:'нет картинки';});
    if(fitMode!=='contain')problems.push('видео: обложка подрезается (object-fit: '+fitMode+')');
    // Пропорцию из памятки держит предпросмотр в редакторе — то место, по
    // которому автор сверяет, что приготовил. Рамка в списке идёт за самой
    // картинкой и своего соотношения не имеет.
    const shape=await fit.evaluate(()=>{const c=document.querySelector('.post-cover'),i=c?.querySelector('img');
     const r=c?.getBoundingClientRect();return i&&r&&i.naturalWidth?Math.abs(r.width/r.height-i.naturalWidth/i.naturalHeight):null;});
    if(shape!==null&&shape>0.06)problems.push('видео: рамка обложки не совпала с картинкой, расхождение '+shape.toFixed(2));
   }
   if(v==='home'){
    const grid=await fit.evaluate(()=>{
     const box=el=>{const r=el.getBoundingClientRect();return [Math.round(r.left),Math.round(r.right)];};
     const kids=sel=>[...(document.querySelector(sel)?.children??[])].map(box);
     return {rows:{'заголовок':box(document.querySelector('.page-heading')),'библиотека':box(document.querySelector('.library-heading')),
      'действия':box(document.querySelector('.home-actions')),'плитки':box(document.querySelector('.library-tiles')),'настройки':box(document.querySelector('.settings-grid'))},
      library:kids('.library-tiles'),settings:kids('.settings-grid')};});
    const edges=Object.entries(grid.rows);
    const [,first]=edges[0];
    for(const [name,[l,r]] of edges){
     if(Math.abs(l-first[0])>1)problems.push('главная: ряд «'+name+'» начинается на '+l+', а остальные на '+first[0]);
     if(Math.abs(r-first[1])>1)problems.push('главная: ряд «'+name+'» кончается на '+r+', а остальные на '+first[1]);
    }
    grid.library.forEach(([l,r],i)=>{const c=grid.settings[i];
     if(c&&(Math.abs(l-c[0])>1||Math.abs(r-c[1])>1))problems.push('главная: карточка настроек '+(i+1)+' ('+c+') не совпадает с плиткой над ней ('+[l,r]+')');});
   }
   await fit.screenshot({path:'outputs/ui/design-pc-'+v+'.png'});
  }
  if(tall.length)console.log('Длиннее экрана 1400:',tall.join(', '));
  await fit.close();}
 const studio=await desk.newPage();await studio.goto(base+'/');await settle(studio);await studio.screenshot({path:'outputs/ui/design-author-home.png',fullPage:true});
 await studio.getByRole('button',{name:'Эфир',exact:true}).first().click();await studio.waitForTimeout(600);await studio.screenshot({path:'outputs/ui/design-studio.png',fullPage:true});
 const sm=await metrics(studio);check(sm.scrollW<=sm.innerW,`студия переполняет ширину: ${sm.scrollW}>${sm.innerW}`);
 await desk.close();
 check(errors.length===0,'ошибки страницы: '+errors.join(' | '));
 if(problems.length)throw new Error('\n - '+problems.join('\n - '));
 console.log('PASS: экраны сняты в outputs/ui/design-*.png; системный Back закрывает меню, плеер и раздел по порядку; главная без переполнения на пяти ширинах, целиком помещается на 390×844 и 412×915, а на 360×640 до сгиба доходит строка поддержки; знак канала, боковая панель и кнопка настроек в студии нужного размера');
}finally{await browser?.close();peaksWorker?.kill('SIGTERM');server.kill('SIGTERM');await rm(dir,{recursive:true,force:true});}
