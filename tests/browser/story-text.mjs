#!/usr/bin/env node
/**
 * Текст истории приходит, когда её открывают (лёгкий каталог).
 *
 * Каталог больше не носит полный текст историй — только начало для карточки.
 * Значит, читалка и редактор берут текст отдельным запросом. Опасное место —
 * редактор: открыть историю без текста и нажать «Опубликовать» значит стереть
 * её. Здесь проверяется в настоящем браузере:
 * - слушатель: «Читать» открывает читалку с началом настоящего текста, а
 *   список каталога текста не содержит;
 * - автор: «Редактировать» открывает редактор с полным текстом, сохранение
 *   без правок оставляет текст целым;
 * - если текст не пришёл, редактор не открывается вовсе и показывается ошибка.
 *
 * Всё — во временной базе; рабочие данные не трогаются.
 */
import {chromium} from 'playwright';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=process.cwd(),dir=await mkdtemp(path.join(root,'.test-tmp-story-'));
const env={...process.env,DATABASE_PATH:path.join(dir,'db.sqlite'),STORAGE_DIR:path.join(dir,'storage'),LIVE_DIR:path.join(dir,'live'),SESSION_SECRET:'chk-secret-not-production',ADMIN_PASSWORD:'chk-password',FIREBASE_SERVICE_ACCOUNT_FILE:'',PUBLIC_SITE_URL:''};
execFileSync(process.execPath,['node_modules/drizzle-kit/bin.cjs','migrate'],{env,stdio:'ignore'});
const port=3261,base='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env,stdio:['ignore','ignore','inherit']});
let browser;
try{
 for(let i=0;i<80;i++){try{await fetch(base+'/api/health');break;}catch{await new Promise(r=>setTimeout(r,250));}}
 const login=await fetch(base+'/api/auth',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:'chk-password'})});
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const api=d=>fetch(base+'/api/library',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify(d)}).then(r=>r.json());
 await api({action:'setup'});
 const text='Начало истории о плоте.\n\n'+'Ветер гнал волну. '.repeat(1500)+'\n\nКонец истории.';
 await api({kind:'story',title:'Плот',description:'',body:text,published:true});
 const list=await (await fetch(base+'/api/library')).json(),story=list.items.find(p=>p.title==='Плот');
 assert.ok(story&&!('body' in story)&&story.excerpt.startsWith('Начало истории'),'список каталога: у истории снова полный текст или нет начала');
 const full=async()=>(await (await fetch(base+'/api/library?id='+story.id,{headers:{cookie}})).json()).item.body;

 browser=await chromium.launch({executablePath:process.env.TT_BROWSER_EXECUTABLE||undefined});
 // Слушатель: «Читать» открывает читалку с настоящим текстом.
 {const ctx=await browser.newContext({viewport:{width:390,height:844},locale:'ru-RU',isMobile:true,hasTouch:true});
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const asked=[];page.on('request',r=>{if(r.url().includes('/api/library?id='))asked.push(r.url());});
  await page.goto(base+'/?mode=listen&view=stories');await page.waitForLoadState('networkidle').catch(()=>{});await page.waitForTimeout(600);
  await page.getByRole('button',{name:'Читать'}).first().click();
  await page.locator('.tt-reader').waitFor({timeout:15000});
  const shown=await page.waitForFunction(()=>document.querySelector('.tt-reader')?.textContent.includes('Начало истории о плоте'),null,{timeout:15000}).then(()=>true,()=>false);
  assert.ok(shown,'читалка открылась без текста истории');
  assert.equal(asked.length,1,'читалка не запросила текст истории отдельно');
  assert.deepEqual(errors,[],'ошибки страницы у слушателя: '+errors.join('; '));
  await ctx.close();}

 // Автор: редактор открывается с полным текстом, сохранение его не теряет.
 {const ctx=await browser.newContext({viewport:{width:1280,height:900},locale:'ru-RU'});
  const eq=cookie.indexOf('=');await ctx.addCookies([{name:cookie.slice(0,eq),value:cookie.slice(eq+1),url:base}]);
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/?view=stories');await page.waitForLoadState('networkidle').catch(()=>{});await page.waitForTimeout(600);
  // Текст не пришёл — редактор не открывается, есть ошибка.
  await page.route('**/api/library?id=*',r=>r.abort());
  await page.getByRole('button',{name:'Редактировать'}).first().click();
  await page.waitForTimeout(1200);
  assert.equal(await page.locator('textarea.story-textarea').count(),0,'редактор истории открылся без текста — сохранение стёрло бы историю');
  assert.ok(await page.locator('[data-sonner-toast]').count()>0,'текст не пришёл, а ошибки на экране нет');
  await page.unroute('**/api/library?id=*');
  await page.getByRole('button',{name:'Редактировать'}).first().click();
  const area=page.locator('textarea.story-textarea');await area.waitFor({timeout:15000});
  assert.equal(await area.inputValue(),text,'в редакторе не полный текст истории');
  await page.getByRole('button',{name:'Опубликовать'}).click();
  await page.waitForFunction(()=>!document.querySelector('textarea.story-textarea'),null,{timeout:15000});
  assert.equal(await full(),text,'после сохранения без правок текст истории изменился');
  assert.deepEqual(errors,[],'ошибки страницы у автора: '+errors.join('; '));
  await ctx.close();}
 console.log('PASS: история — каталог без текста; читалка и редактор берут текст отдельно; без текста редактор не открывается; сохранение без правок текст не теряет');
}finally{await browser?.close();server.kill();await rm(dir,{recursive:true,force:true});}
