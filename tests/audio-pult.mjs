#!/usr/bin/env node
/**
 * Пульт входа в студии: источник, устройство, канал и срез низких.
 *
 * Владелец: «у нас в студии нет таких настроек даже, нужно бы сделать красиво
 * и убери под плашкой… всю писанину». Раньше вход брался только с
 * «устройства Windows по умолчанию», а под выбором стоял абзац о том, как
 * перенаправить FL Studio. Теперь вход выбирается прямо на пульте.
 *
 * Проверяется на настоящей сборке в Chromium с поддельными устройствами:
 * - на пульте три списка (источник, устройство, канал) и переключатель среза
 *   низких, сеткой 2×2; абзаца-пояснения нет;
 * - в списке устройств есть устройство по умолчанию и найденные входы;
 * - смена канала и устройства при открытом входе переподключает его с этим
 *   устройством, а канал «Стерео» даёт два канала метра;
 * - выбор переживает перезагрузку страницы.
 *
 * Всё — во временной базе; рабочие данные не трогаются.
 */
import {chromium} from 'playwright';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=process.cwd(),dir=await mkdtemp(path.join(root,'.test-tmp-pult-'));
const env={...process.env,DATABASE_PATH:path.join(dir,'db.sqlite'),STORAGE_DIR:path.join(dir,'storage'),LIVE_DIR:path.join(dir,'live'),SESSION_SECRET:'chk-secret-not-production',ADMIN_PASSWORD:'chk-password',FIREBASE_SERVICE_ACCOUNT_FILE:'',PUBLIC_SITE_URL:''};
execFileSync(process.execPath,['node_modules/drizzle-kit/bin.cjs','migrate'],{env,stdio:'ignore'});
const port=3257,base='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env,stdio:['ignore','ignore','inherit']});
let browser;
try{
 for(let i=0;i<80;i++){try{await fetch(base+'/api/health');break;}catch{await new Promise(r=>setTimeout(r,250));}}
 const login=await fetch(base+'/api/auth',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:'chk-password'})});
 const cookie=login.headers.get('set-cookie').split(';')[0];
 await fetch(base+'/api/library',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({action:'setup'})});

 browser=await chromium.launch({executablePath:process.env.TT_BROWSER_EXECUTABLE||undefined,
  args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 const ctx=await browser.newContext({viewport:{width:1440,height:900},locale:'ru-RU',permissions:['microphone']});
 const eq=cookie.indexOf('=');await ctx.addCookies([{name:cookie.slice(0,eq),value:cookie.slice(eq+1),url:base}]);
 // Два поддельных входа с понятными именами и учёт каждого открытия входа:
 // с каким устройством его просили.
 await ctx.addInitScript(()=>{
  const md=navigator.mediaDevices,real=md.getUserMedia.bind(md);window.__opens=[];
  const fake=[{deviceId:'default',kind:'audioinput',label:'По умолчанию',groupId:'g0'},{deviceId:'mic-1',kind:'audioinput',label:'Komplete Audio 6',groupId:'g1'},{deviceId:'cable-out',kind:'audioinput',label:'CABLE Output (VB-Audio Virtual Cable)',groupId:'g2'}];
  md.enumerateDevices=async()=>fake.map(d=>({...d,toJSON(){return d;}}));
  md.getUserMedia=async c=>{const want=c?.audio?.deviceId?.exact??'default';window.__opens.push(want);
   const s=await real({audio:true,video:false});return s;};
 });
 const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/?view=live');await page.waitForLoadState('networkidle').catch(()=>{});await page.waitForTimeout(800);

 const pult=page.locator('.live-console .audio-pult');
 assert.equal(await pult.count(),1,'на пульте эфира нет блока входа .audio-pult');
 const look=await page.evaluate(()=>{const p=document.querySelector('.live-console .audio-pult');
  const cells=[...p.children].map(c=>{const r=c.getBoundingClientRect();return {top:Math.round(r.top),bottom:Math.round(r.bottom),left:Math.round(r.left),right:Math.round(r.right),text:c.textContent.trim()};});
  return {cells,selects:p.querySelectorAll('[data-slot=select-trigger]').length,switch:!!p.querySelector('[data-slot=switch]'),
   help:!!document.querySelector('.live-console .mic-setup p'),text:document.querySelector('.live-console').textContent};});
 assert.equal(look.selects,3,'на пульте не три списка (источник, устройство, канал): '+look.selects);
 assert.ok(look.switch,'на пульте нет переключателя среза низких');
 assert.ok(!look.help&&!/устройства записи Windows по умолчанию|CABLE Input/.test(look.text),'под выбором источника снова абзац-пояснение');
 const [a,b,c,d]=look.cells;
 await page.locator('.live-console').screenshot({path:path.join(process.env.TT_SHOT_DIR||dir,'audio-pult.png')}).catch(()=>{});
 // Источник и канал — в один ряд; устройство — на всю ширину под ними, чтобы
 // длинное имя входа читалось целиком; срез низких — ниже.
 const row=Math.abs(a.bottom-c.bottom)<=2&&c.left>a.left,wide=b.top>=a.bottom&&b.left===a.left&&b.right>=c.right-1,low=d.top>=b.bottom;
 assert.ok(row&&wide&&low,'раскладка пульта входа: '+JSON.stringify(look.cells));
 // Ни одно значение на пульте не обрезается многоточием.
 {const cut=await page.evaluate(()=>[...document.querySelectorAll('.live-console .audio-pult [data-slot=select-value]')].filter(v=>v.scrollWidth>v.clientWidth+1).map(v=>v.textContent));
  assert.deepEqual(cut,[],'на пульте обрезано: '+cut.join(' | '));}
 assert.match(a.text,/^Источник/);assert.match(b.text,/^Устройство/);assert.match(c.text,/^Канал/);assert.match(d.text,/Срез низких/);

 // Открыть вход — «Проверить микрофон».
 await page.getByRole('button',{name:'Проверить микрофон'}).click();
 await page.waitForFunction(()=>window.__opens.length>=1&&document.querySelector('.signal-head strong')?.textContent!=='Нет сигнала',null,{timeout:15000});
 const pick=async(label,option)=>{await pult.locator('label.field',{hasText:label}).locator('[data-slot=select-trigger]').click();
  await page.getByRole('option',{name:option,exact:true}).click();await page.waitForTimeout(700);};
 // Список устройств: по умолчанию и найденные входы с их именами.
 await pult.locator('label.field',{hasText:'Устройство'}).locator('[data-slot=select-trigger]').click();
 const options=await page.getByRole('option').allTextContents();await page.keyboard.press('Escape');
 assert.deepEqual(options,['Устройство Windows по умолчанию','Komplete Audio 6','CABLE Output (VB-Audio Virtual Cable)'],'список устройств: '+options.join(' | '));
 const opened=async()=>page.evaluate(()=>window.__opens.at(-1));
 const count=async()=>page.evaluate(()=>window.__opens.length);
 let before=await count();
 await pick('Устройство','CABLE Output (VB-Audio Virtual Cable)');
 await page.waitForFunction(n=>window.__opens.length>n,before,{timeout:10000}).catch(()=>{});
 assert.ok(await count()>before,'смена устройства не переподключила вход');
 assert.equal(await opened(),'cable-out','вход переподключён не с выбранным устройством');
 before=await count();
 {const cut=await page.evaluate(()=>{const v=[...document.querySelectorAll('.live-console .audio-pult [data-slot=select-value]')][1];return v.scrollWidth>v.clientWidth+1;});
  assert.ok(!cut,'имя устройства «CABLE Output (VB-Audio Virtual Cable)» на пульте обрезано');}
 await pick('Канал','Стерео');
 await page.waitForFunction(n=>window.__opens.length>n,before,{timeout:10000}).catch(()=>{});
 assert.ok(await count()>before,'смена канала не переподключила вход');
 assert.equal(await opened(),'cable-out','после смены канала вход открыт не с выбранным устройством');
 await pult.locator('[data-slot=switch]').click();
 // Выбор переживает перезагрузку.
 await page.reload();await page.waitForLoadState('networkidle').catch(()=>{});await page.waitForTimeout(800);
 const kept=await page.evaluate(()=>{const p=document.querySelector('.live-console .audio-pult');const v=[...p.querySelectorAll('[data-slot=select-value]')].map(x=>x.textContent.trim());
  return {v,low:p.querySelector('[data-slot=switch]')?.getAttribute('data-state')};});
 assert.deepEqual(kept.v,['Микрофон','CABLE Output (VB-Audio Virtual Cable)','Стерео'],'после перезагрузки выбор пульта не сохранился: '+kept.v.join(' | '));
 assert.equal(kept.low,'checked','после перезагрузки срез низких не сохранился');
 assert.deepEqual(errors,[],'ошибки страницы: '+errors.join('; '));
 console.log('PASS: пульт входа — источник, устройство, канал и срез низких без пояснений, имена не обрезаны; смена устройства и канала переподключает вход с выбранным устройством; выбор переживает перезагрузку');
}finally{await browser?.close();server.kill();await rm(dir,{recursive:true,force:true});}
