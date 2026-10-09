#!/usr/bin/env node
/**
 * Постер главной в студии сохраняется с первого раза — и со второго тоже.
 *
 * Поломка, ради которой это написано. Владелец: «когда я загружаю обложку на
 * главную страницу, там оно не сразу работает, через раз всё подключается».
 * Студия перечитывает данные раз в 15 секунд и при возврате в окно — в том
 * числе после окна выбора файла. Форма постера при каждой подгрузке вставала
 * обратно на прежний закреплённый выпуск: выбранные тип и выпуск слетали, и
 * «Сохранить» либо требовало выбрать выпуск, либо вешало постер не туда.
 *
 * Путь автора, два круга подряд: тип, выпуск, возврат в окно (подгрузка),
 * файл, ещё одна подгрузка, «Сохранить» — постер закреплён за выбранным
 * выпуском, форма после сохранения показывает его и превью. Заодно: тип
 * аудио в форме подписан «Аудио», у аудиовыпуска в списке виден его тип.
 *
 * Всё — во временной базе; рабочие данные не трогаются.
 */
import {chromium} from 'playwright';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=process.cwd(),dir=await mkdtemp(path.join(root,'.test-tmp-hero-'));
const env={...process.env,DATABASE_PATH:path.join(dir,'db.sqlite'),STORAGE_DIR:path.join(dir,'storage'),LIVE_DIR:path.join(dir,'live'),SESSION_SECRET:'chk-secret-not-production',ADMIN_PASSWORD:'chk-password',FIREBASE_SERVICE_ACCOUNT_FILE:'',PUBLIC_SITE_URL:''};
execFileSync(process.execPath,['node_modules/drizzle-kit/bin.cjs','migrate'],{env,stdio:'ignore'});
const port=3253,base='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env,stdio:['ignore','ignore','inherit']});
let browser;
try{
 for(let i=0;i<80;i++){try{await fetch(base+'/api/health');break;}catch{await new Promise(r=>setTimeout(r,250));}}
 const login=await fetch(base+'/api/auth',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:'chk-password'})});
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const api=d=>fetch(base+'/api/library',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify(d)}).then(async r=>JSON.parse(await r.text()));
 const lib=async()=>(await fetch(base+'/api/library',{headers:{cookie}})).json();
 await api({action:'setup'});
 const seconds=3,rate=8000,wav=Buffer.alloc(44+rate*2*seconds);
 wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
 const audioKey=(await (await fetch(base+'/api/audio',{method:'POST',headers:{cookie,'content-type':'audio/wav','x-upload-size':String(wav.length)},body:wav})).json()).key;
 await api({kind:'podcast',audioCategory:'audio_story',title:'76 дней',description:'Плот.',audioKey,duration:seconds,published:true});
 await api({kind:'podcast',audioCategory:'music',title:'Не конец',description:'Музыка.',audioKey,duration:seconds,published:true});
 await api({kind:'video',title:'Видео дня',description:'Ролик.',videoUrl:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',published:true});
 const items=(await lib()).items,id=t=>items.find(p=>p.title===t).id;
 // Сначала закреплено одно — форма должна уметь уйти с него на другое.
 await api({action:'pin',id:id('76 дней')});

 browser=await chromium.launch({executablePath:process.env.TT_BROWSER_EXECUTABLE||undefined});
 const ctx=await browser.newContext({viewport:{width:1280,height:900},locale:'ru-RU'});
 const eq=cookie.indexOf('=');await ctx.addCookies([{name:cookie.slice(0,eq),value:cookie.slice(eq+1),url:base}]);
 const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/');await page.waitForLoadState('networkidle').catch(()=>{});await page.waitForTimeout(600);
 // Студия на ПК: активный пункт боковой панели подсвечен по размеру самой
 // иконки — кольцом вокруг круга, без плашки и без полоски с конусом света
 // (владелец: «плохо выглядит… подогнать под размеры самой иконки»). На
 // главной студии пять быстрых действий в один ряд, первое — «Загрузить
 // аудио» (владелец: «почему нет кнопки, чтобы добавить аудио?»).
 {const rail=await page.evaluate(()=>{const a=document.querySelector('.bottom-nav-item[data-active=true]'),m=a?.querySelector('.tt-metal'),l=document.querySelector('.bottom-nav .tt-limelight');
   return {bg:a&&getComputedStyle(a).backgroundColor,ring:m?getComputedStyle(m).boxShadow:'',lamp:l?getComputedStyle(l).display==='none'||Number(getComputedStyle(l).opacity)===0:true};});
  assert.ok(/^rgba\(0, 0, 0, 0\)$|^transparent$/.test(rail.bg||''),'активный пункт боковой панели снова с плашкой: '+rail.bg);
  assert.ok(rail.lamp,'у активного пункта боковой панели снова полоска с конусом света');
  assert.match(rail.ring,/rgb\(111, 231, 222\) 0px 0px 0px 2px/,'у активной иконки боковой панели нет бирюзового кольца: '+rail.ring);
  const tiles=await page.locator('.home-actions .home-tile').evaluateAll(b=>b.map(x=>({text:x.textContent.trim(),top:Math.round(x.getBoundingClientRect().top)})));
  assert.equal(tiles.length,5,'быстрых действий в студии не пять: '+tiles.length);
  assert.equal(tiles[0].text.replace(/\s+/g,' '),'Загрузить аудио','первое действие не «Загрузить аудио»: «'+tiles[0].text+'»');
  assert.equal(new Set(tiles.map(x=>x.top)).size,1,'быстрые действия не в один ряд: '+tiles.map(x=>x.top).join(', '));
  const chooser=page.waitForEvent('filechooser',{timeout:5000}).catch(()=>null);
  await page.locator('.home-actions .home-tile').first().click();
  const fc=await chooser;
  assert.ok(fc,'«Загрузить аудио» не открывает выбор файла');
  assert.match(String(await page.locator('input[type=file][accept^="audio"]').getAttribute('accept')),/audio/,'выбор файла открылся не для аудио');}
 const panel=page.locator('.hero-poster-panel');await panel.waitFor();
 // Сервер у владельца — через интернет, ответ идёт не мгновенно. Без
 // задержки окно, в котором форма стояла на прежнем, локально не видно.
 await page.route('**/api/library',async r=>{if(r.request().method()==='GET')await new Promise(x=>setTimeout(x,1200));await r.continue();});
 const kind=panel.locator('select').nth(0),target=panel.locator('select').nth(1);
 // Подгрузка данных, как после возврата в окно: ждём ответ библиотеки.
 const refresh=async()=>{const done=page.waitForResponse(r=>r.url().includes('/api/library')&&r.request().method()==='GET');
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await done;await page.waitForTimeout(300);};

 assert.equal(await kind.inputValue(),'podcast','форма не встала на закреплённый выпуск: тип');
 assert.equal(await target.inputValue(),id('76 дней'),'форма не встала на закреплённый выпуск');
 assert.deepEqual(await kind.locator('option').allTextContents(),['Аудио','Видео','История'],'типы в постере главной');
 const labels=await target.locator('option').allTextContents();
 assert.ok(labels.includes('76 дней · Аудиоистория')&&labels.includes('Не конец · Музыка'),'у аудио в списке нет типа: '+labels.join(' | '));

 const round=async(kindValue,title,file)=>{
  await kind.selectOption(kindValue);await target.selectOption(id(title));
  await refresh();
  assert.equal(await kind.inputValue(),kindValue,'«'+title+'»: после подгрузки данных тип слетел на «'+await kind.inputValue()+'»');
  assert.equal(await target.inputValue(),id(title),'«'+title+'»: после подгрузки данных выбранный выпуск слетел');
  await panel.locator('input[type=file]').setInputFiles(path.join(root,'tests/fixtures/demo-covers',file));
  await refresh();
  assert.equal(await target.inputValue(),id(title),'«'+title+'»: после выбора файла выпуск слетел');
  // Сообщение прошлого круга должно уйти, иначе его примем за новое.
  await page.getByText('Постер на главной сохранён').first().waitFor({state:'detached',timeout:20000});
  await panel.getByRole('button',{name:'Сохранить',exact:true}).click();
  // Смотрим форму сразу, как студия сказала «сохранён», без паузы: в этот
  // момент она уже обязана стоять на сохранённом и показывать постер.
  await page.getByText('Постер на главной сохранён').last().waitFor({timeout:15000});
  const shownTarget=await target.inputValue(),shownPreview=await panel.locator('.hero-poster-preview').count();
  const d=await lib();
  assert.equal(d.pinned,id(title),'«'+title+'»: постер ведёт не на выбранный выпуск');
  assert.equal(d.poster?.post,id(title),'«'+title+'»: постер не сохранился: '+JSON.stringify(d.poster));
  assert.equal(shownTarget,id(title),'«'+title+'»: после сохранения форма показывает другое');
  assert.equal(shownPreview,1,'«'+title+'»: после сохранения нет превью постера');
  await page.waitForTimeout(1500);
  assert.equal(await target.inputValue(),id(title),'«'+title+'»: форма ушла с сохранённого выпуска');
  assert.equal(await panel.locator('.hero-poster-preview').count(),1,'«'+title+'»: превью постера пропало');
  return d.poster.v;};

 const v1=await round('podcast','Не конец','hero-lake.jpg');
 const v2=await round('video','Видео дня','tile-forest.jpg');
 assert.notEqual(v1,v2,'второй постер не заменил первый: версия та же');
 // После перезагрузки студии форма стоит на сохранённом.
 await page.reload();await page.waitForLoadState('networkidle').catch(()=>{});await page.waitForTimeout(600);
 assert.equal(await kind.inputValue(),'video','после перезагрузки тип не тот');
 assert.equal(await target.inputValue(),id('Видео дня'),'после перезагрузки выпуск не тот');
 assert.deepEqual(errors,[],'ошибки на странице: '+errors.join('; '));
 console.log('Постер главной: выбор не слетает при подгрузке данных, два постера подряд сохраняются на выбранные выпуски; «Аудио» и тип выпуска в форме.');
}finally{await browser?.close();server.kill();await rm(dir,{recursive:true,force:true});}
