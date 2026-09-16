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
  const support=await page.locator('.support-strip').boundingBox(),mini=await page.locator('.podcast-player.is-mini').boundingBox();
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
 await page.goto(base+'/?mode=listen&view=settings');await settle(page);await shot(page,'settings');
 // Эфир идёт: статус в базе без потока — для вёрстки этого достаточно.
 const start=await fetch(base+'/api/live',{method:'POST',headers:{cookie,'content-type':'application/json',origin:base},body:JSON.stringify({action:'start',title:'Истории после заката',coverKey:await demoCover('tile-mountains.jpg')})});const startText=await start.text();assert.equal(start.status,200,startText);
 await page.goto(base+'/?mode=listen');await settle(page);await page.waitForFunction(()=>!!document.querySelector('.bottom-nav-dot'),null,{timeout:8000}).catch(()=>{});await shot(page,'home-live');
 // Экран эфира снимается только когда эфир действительно виден клиенту:
 // состояние приходит опросом, и раньше снимок заставал ещё пустой экран.
 await page.goto(base+'/?mode=listen&view=live');await settle(page);
 await page.waitForFunction(()=>!!document.querySelector('.live-orb-dot'),null,{timeout:10000}).catch(()=>{});
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
  const bottom=await page.locator('.support-strip').evaluate(el=>Math.round(el.getBoundingClientRect().bottom));
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
   if(m.navW<100)problems.push('студия '+v+': боковая панель уже 100px ('+m.navW+')');
   if(!m.settings)problems.push('студия '+v+': в боковой панели нет кнопки настроек');
   if(m.h>m.inner+2)tall.push(v+' '+m.h);
   // Ряды главной стоят по одной сетке: одинаковые края и, у библиотеки с
   // настройками, одинаковые колонки. Раньше верхний ряд упирался в свой
   // предел ширины и стоял уже остальных, а промежутки в 15 и 18 пикселей
   // разводили карточки на пару пикселей мимо плиток над ними.
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
