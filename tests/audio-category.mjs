#!/usr/bin/env node
/**
 * Тип аудиоматериала — весь путь в настоящем браузере, как его проходит автор.
 *
 * Студия: аудиофайл выбран → форма; без типа сохранить нельзя, рядом с полем
 * «Выберите тип аудио.»; запись создаётся с каждым из трёх типов; после
 * перезагрузки форма правки показывает сохранённый тип; тип меняется без
 * повторной загрузки файла. Старая запись без типа открывается в студии с
 * просьбой выбрать тип.
 *
 * Слушатель: раздел «Аудио» — «Внутри истории.», поиск «Найти историю или
 * музыку», подписи в карточках из данных записи (а у старой — «АУДИО»),
 * поиск, сортировка и запуск по «Слушать» работают; на 360, 390 и 430 точек
 * нет горизонтальной прокрутки и нижняя панель не закрывает карточки.
 *
 * Всё — во временной базе и временном хранилище; рабочие данные не трогаются.
 * Снимки — в outputs/ui/audio-*.png.
 */
import {chromium} from 'playwright';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

const root=process.cwd(),dir=await mkdtemp(path.join(root,'.test-tmp-chk-'));
const out=path.join(root,'outputs','ui');await mkdir(out,{recursive:true});
const env={...process.env,DATABASE_PATH:path.join(dir,'db.sqlite'),STORAGE_DIR:path.join(dir,'storage'),LIVE_DIR:path.join(dir,'live'),SESSION_SECRET:'chk-secret-not-production',ADMIN_PASSWORD:'chk-password',FIREBASE_SERVICE_ACCOUNT_FILE:'',PUBLIC_SITE_URL:''};
execFileSync(process.execPath,['node_modules/drizzle-kit/bin.cjs','migrate'],{env,stdio:'ignore'});
const port=3247,base='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env,stdio:['ignore','ignore','inherit']});
let browser;
try{
 for(let i=0;i<80;i++){try{await fetch(base+'/api/health');break;}catch{await new Promise(r=>setTimeout(r,250));}}
 const login=await fetch(base+'/api/auth',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:'chk-password'})});
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const api=d=>fetch(base+'/api/library',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify(d)}).then(async r=>JSON.parse(await r.text()));
 const items=async()=>(await (await fetch(base+'/api/library',{headers:{cookie}})).json()).items;
 await api({action:'setup'});
 const seconds=6,rate=8000,wav=Buffer.alloc(44+rate*2*seconds);
 wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
 for(let i=0;i<rate*seconds;i++)wav.writeInt16LE(Math.round(Math.sin(i/7)*9000),44+i*2);

 // Старая запись без типа — как в рабочих данных: мимо студии, пустое поле.
 const up=await fetch(base+'/api/audio',{method:'POST',headers:{cookie,'content-type':'audio/wav','x-upload-size':String(wav.length)},body:wav});
 const legacyKey=(await up.json()).key;
 {const db=new Database(env.DATABASE_PATH);
  db.prepare("INSERT INTO posts(id,kind,title,description,body,audio_key,duration,published,created_at) VALUES('legacy-1','podcast','Старая запись','Без типа.','',?,?,1,?)").run(legacyKey,seconds,Date.now()-86400000);
  db.close();}

 browser=await chromium.launch({executablePath:process.env.TT_BROWSER_EXECUTABLE||undefined});
 const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true,locale:'ru-RU'});
 const eq=cookie.indexOf('=');await ctx.addCookies([{name:cookie.slice(0,eq),value:cookie.slice(eq+1),url:base}]);
 const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const settle=async()=>{await page.waitForLoadState('networkidle').catch(()=>{});await page.waitForTimeout(500);};
 await page.goto(base+'/?view=podcasts');await settle();

 const dialog=page.locator('.editor-dialog');
 const upload=async(title)=>{
  await page.locator('input[type=file][accept^="audio"]').setInputFiles({name:title+'.wav',mimeType:'audio/wav',buffer:wav});
  await dialog.waitFor({state:'visible'});
  await dialog.locator('input').first().fill(title);
 };
 const publish=()=>dialog.getByRole('button',{name:'Опубликовать'}).click();

 // 1. Новая запись: тип не выбран сам; без него — понятная ошибка у поля.
 await upload('Проба 1');
 assert.equal(await dialog.locator('.audio-type-option').count(),3,'вариантов типа не ровно три');
 assert.equal(await dialog.locator('input[name=audio-category]:checked').count(),0,'тип выбран сам — угадывать его нельзя');
 const hints=await dialog.locator('.audio-type-copy').evaluateAll(n=>n.map(c=>c.querySelector('strong').textContent+' '+c.querySelector('small').textContent));
 assert.deepEqual(hints,[
  'Аудиоистория Озвученный рассказ или документальная история.',
  'Подкаст Разговорный выпуск, интервью или обсуждение.',
  'Музыка Музыкальный трек или композиция.'],'подписи и пояснения вариантов не те');
 // Тип стоит рядом с названием и описанием, до кнопок сохранения.
 const order=await dialog.evaluate(d=>{const y=s=>d.querySelector(s)?.getBoundingClientRect().top??-1;
  return {desc:y('textarea'),type:y('.audio-type'),actions:y('.editor-actions')};});
 assert.ok(order.desc<order.type&&order.type<order.actions,'выбор типа не между описанием и кнопками: '+JSON.stringify(order));
 await publish();await page.waitForTimeout(500);
 assert.equal(await dialog.isVisible(),true,'форма закрылась без типа');
 assert.equal((await dialog.locator('.audio-type-error').textContent()).trim(),'Выберите тип аудио.','нет понятной ошибки у поля');
 assert.equal((await items()).filter(p=>p.title==='Проба 1').length,0,'запись без типа всё равно ушла на сервер');
 await dialog.screenshot({path:path.join(out,'audio-type-error.png')});
 // «В черновики» без типа тоже не проходит: форма требует тип для любого сохранения.
 await dialog.getByRole('button',{name:'В черновики'}).click();await page.waitForTimeout(400);
 assert.equal((await items()).filter(p=>p.title==='Проба 1').length,0,'черновик без типа ушёл на сервер из формы');

 // 2. Три записи — по одной на каждый тип. Выбор виден рамкой и точкой.
 const types=[['Проба 1','Аудиоистория','audio_story'],['Проба 2','Подкаст','podcast'],['Проба 3','Музыка','music']];
 for(const [title,label,value] of types){
  if(title!=='Проба 1')await upload(title);
  await dialog.locator('.audio-type-option',{hasText:label}).click();
  const picked=await dialog.evaluate(d=>{const c=d.querySelector('.audio-type-option.is-checked');if(!c)return null;
   const s=getComputedStyle(c),dot=getComputedStyle(c.querySelector('.audio-type-mark'),'::after');
   return {count:d.querySelectorAll('.audio-type-option.is-checked').length,border:parseFloat(s.borderTopWidth),dot:dot.content!=='none'&&parseFloat(dot.width)>0,error:!!d.querySelector('.audio-type-error')};});
  assert.ok(picked&&picked.count===1,'выбран не один вариант');
  assert.ok(picked.border>=2&&picked.dot,'выбор виден только цветом: рамка '+picked.border+', точка '+picked.dot);
  assert.equal(picked.error,false,'ошибка не ушла после выбора');
  if(title==='Проба 2')await dialog.screenshot({path:path.join(out,'audio-type-choice.png')});
  await publish();await dialog.waitFor({state:'hidden'});await page.waitForTimeout(300);
  const saved=(await items()).find(p=>p.title===title);
  assert.ok(saved,'запись «'+title+'» не создалась');
  assert.equal(saved.audioCategory,value,'у «'+title+'» на сервере тип '+saved.audioCategory+' вместо '+value);
 }

 // 3. После перезагрузки форма правки показывает сохранённый тип, и тип
 //    меняется без повторной загрузки файла.
 await page.reload();await settle();
 const before=(await items()).find(p=>p.title==='Проба 1');
 await page.locator('.post-card',{hasText:'Проба 1'}).getByRole('button',{name:'Редактировать'}).click();
 await dialog.waitFor({state:'visible'});
 assert.equal(await dialog.locator('input[name=audio-category]:checked').getAttribute('value'),'audio_story','форма правки не показала сохранённый тип');
 // Файл уже на сервере: форма правки не просит аудио заново (поле файла в
 // форме — только для обложки).
 assert.equal(await dialog.locator('input[type=file][accept^="audio"]').count(),0,'для смены типа форма просит аудиофайл');
 await dialog.locator('.audio-type-option',{hasText:'Музыка'}).click();
 await publish();await dialog.waitFor({state:'hidden'});await page.waitForTimeout(300);
 const after=(await items()).find(p=>p.id===before.id);
 assert.equal(after.audioCategory,'music','тип не сменился');
 assert.equal(after.audioKey,before.audioKey,'смена типа поменяла файл');

 // 4. Старая запись без типа: студия просит выбрать тип.
 await page.locator('.post-card',{hasText:'Старая запись'}).getByRole('button',{name:'Редактировать'}).click();
 await dialog.waitFor({state:'visible'});
 assert.equal(await dialog.locator('.audio-type-old').count(),1,'у старой записи нет просьбы выбрать тип');
 assert.equal(await dialog.locator('input[name=audio-category]:checked').count(),0,'старой записи тип выбран сам');
 await page.keyboard.press('Escape');await page.waitForTimeout(300);
 if(await dialog.isVisible())await dialog.getByRole('button',{name:'Отмена'}).click();
 await page.waitForTimeout(300);

 // 5. Слушатель: раздел «Аудио» на трёх ширинах.
 const listen=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true,locale:'ru-RU'});
 const lp=await listen.newPage();lp.on('pageerror',e=>errors.push(e.message));
 for(const w of [360,390,430]){
  await lp.setViewportSize({width:w,height:844});
  await lp.goto(base+'/?mode=listen&view=podcasts');await lp.waitForLoadState('networkidle').catch(()=>{});await lp.waitForTimeout(700);
  const v=await lp.evaluate(()=>{const W=innerWidth;const q=s=>document.querySelector(s);
   const tags=[...document.querySelectorAll('.post-card')].map(c=>({title:c.querySelector('.post-title').textContent.trim(),
    tag:[...c.querySelector('.post-meta').childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim()}));
   const nav=q('.bottom-nav').getBoundingClientRect().top;
   const main=q('.listener-main');main.scrollTop=main.scrollHeight;
   const last=[...document.querySelectorAll('.post-card')].pop().getBoundingClientRect();
   const lastBtn=[...document.querySelectorAll('.post-card .text-button')].pop().getBoundingClientRect();
   const res={W,scroll:document.documentElement.scrollWidth,title:q('.voice-title').textContent,kicker:q('.voice-kicker').textContent,
    search:q('.catalog-search input').placeholder,sort:q('.catalog-sort').selectedOptions[0].textContent,
    nav:q('.bottom-nav-podcasts').textContent.trim(),card:!!q('.voice-card'),tags,lastBottom:last.bottom,btnBottom:lastBtn.bottom,navTop:nav,
    listen:[...document.querySelectorAll('.post-card .text-button')].map(b=>b.textContent.replace(/\d+:\d+/,'').trim())};
   main.scrollTop=0;return res;});
  assert.ok(v.scroll<=v.W,w+': горизонтальная прокрутка '+v.scroll+' при ширине '+v.W);
  assert.equal(v.title,'Внутри\nистории',w+': заголовок «'+v.title+'»');
  assert.equal(v.kicker,'Истории о выживании. Музыка, которая погружает.',w+': подзаголовок');
  assert.equal(v.search,'Найти историю или музыку');assert.equal(v.sort,'Сначала новые');
  assert.equal(v.nav,'Аудио',w+': вкладка «'+v.nav+'»');assert.equal(v.card,false,w+': карточка «новый эпизод» вернулась');
  const tag=t=>v.tags.find(x=>x.title===t)?.tag;
  assert.equal(tag('Проба 1'),'МУЗЫКА',w+': подпись после правки');assert.equal(tag('Проба 2'),'ПОДКАСТ');
  assert.equal(tag('Проба 3'),'МУЗЫКА');assert.equal(tag('Старая запись'),'АУДИО',w+': старая запись без типа');
  assert.ok(v.listen.every(s=>s==='Слушать'),w+': кнопка в карточке не «Слушать»: '+v.listen.join(', '));
  assert.ok(v.btnBottom<=v.navTop+1,w+': нижняя панель закрывает кнопку «Слушать» последней карточки ('+Math.round(v.btnBottom)+' > '+Math.round(v.navTop)+')');
  await lp.screenshot({path:path.join(out,`audio-${w}.png`)});
 }
 // Поиск, сортировка, запуск.
 await lp.setViewportSize({width:390,height:844});
 await lp.locator('.catalog-search input').fill('Проба 2');await lp.waitForTimeout(400);
 assert.deepEqual(await lp.locator('.post-card .post-title').allTextContents(),['Проба 2'],'поиск не нашёл ровно одну запись');
 await lp.locator('.catalog-search input').fill('');await lp.waitForTimeout(300);
 const newest=await lp.locator('.post-card .post-title').allTextContents();
 await lp.locator('.catalog-sort').selectOption('old');await lp.waitForTimeout(300);
 const oldest=await lp.locator('.post-card .post-title').allTextContents();
 assert.deepEqual(oldest,[...newest].reverse(),'сортировка «Сначала старые» не переворачивает список');
 assert.equal(oldest[0],'Старая запись');
 await lp.locator('.catalog-sort').selectOption('new');await lp.waitForTimeout(300);
 await lp.locator('.post-card',{hasText:'Проба 3'}).locator('.text-button').click();await lp.waitForTimeout(1200);
 assert.equal(await lp.locator('.podcast-player').count(),1,'«Слушать» не открыло плеер');
 assert.match(await lp.locator('.podcast-player').textContent(),/Проба 3/,'плеер открыл не ту запись');
 assert.deepEqual(errors,[],'ошибки на странице: '+errors.join('; '));
 console.log('PASS: тип аудио — ошибка без выбора у поля, три типа сохраняются на сервере, после перезагрузки форма показывает тип, смена без нового файла, старая запись просит тип; раздел «Аудио» — заголовок, подписи, поиск, сортировка, «Слушать» на 360/390/430 без прокрутки вбок и без перекрытия панелью');
}finally{await browser?.close();server.kill('SIGKILL');await rm(dir,{recursive:true,force:true});}
