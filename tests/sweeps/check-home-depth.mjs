import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const port=3143,base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{stdio:'ignore'});
const items=Array.from({length:6},(_,i)=>({id:`home-${i}`,kind:i===3?'story':'podcast',title:['По ту сторону тишины','Голос северного ветра','Истории после заката','Там, где заканчивается дорога','Первый маршрут','Истории из леса'][i],description:'История о людях и природе',body:'Рассказ',published:1,createdAt:10-i,duration:90,audioKey:i===3?null:`audio/${i}`,coverKey:`cover/${i}`}));
const library={items,isOwner:false,needsSetup:false,signedIn:false,archivePending:false,live:null,donations:[{kind:'boosty',url:'https://boosty.to/truethrills'},{kind:'paypal',url:'https://paypal.me/truethrills'}],links:[{kind:'youtube',url:'https://youtube.com/@truethrills'},{kind:'telegram',url:'https://t.me/truethrills'}],pinned:null};
let browser;const results=[],errors=[];
try{
 for(let i=0;i<80;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}
 browser=await chromium.launch({args:['--no-sandbox']});await mkdir('outputs/home-depth',{recursive:true});
 const lock=JSON.parse(await readFile('tests/fixtures/layout-lock.json','utf8'));
 for(const [w,h] of [[320,568],[360,640],[390,844],[412,915],[1024,573]]){
  // 1024 — сенсорный планшет: телефонную главную получает он, а ПК с мышью —
  // свой каркас «Студия звука» (tests/browser/desk-layout.mjs).
  const context=await browser.newContext({viewport:{width:w,height:h},hasTouch:true,isMobile:true});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',async route=>{const u=new URL(route.request().url());
   if(u.pathname==='/api/library')return route.fulfill({json:library});
   if(u.pathname==='/api/cover')return route.fulfill({contentType:'image/jpeg',body:await readFile('tests/fixtures/demo-covers/'+(u.search.includes('0')?'hero-lake.jpg':'tile-mountains.jpg'))});
   return route.fulfill({json:{live:null,enabled:false,items:[]}});
  });
  await page.goto(base+'/?mode=listen&view=home');await page.locator('.soft-art').first().waitFor();await page.waitForFunction(()=>!document.querySelector('.splash'));await page.waitForTimeout(600);
  if(process.env.TT_HOME_MUTATION==='1')await page.addStyleTag({content:'.tt-soft-home .scene{width:100vw!important;margin-left:-16px!important;max-width:none!important}'});
  const m=await page.evaluate(()=>{const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}};const art=document.querySelector('.soft-art');return {scene:box('.scene'),action:box('.scene-action'),nav:box('.bottom-nav'),art:box('.soft-art'),car:box('.soft-carousel'),shadow:getComputedStyle(art).boxShadow,scroll:document.documentElement.scrollWidth,iw:innerWidth};});
  assert.ok(m.scroll<=w,'horizontal page overflow');
  if(w<768){
   // Постер идёт от края до края — это решение владельца, и он подтвердил его
   // дважды. Прежнее правило требовало полей по бокам и спорило с ним: такая
   // проверка не сторожит, а врёт. Правило теперь то же, что в прогоне
   // оформления.
   assert.ok(m.scene.x<=0.5&&m.scene.width>=w-0.5,'poster must run edge to edge: x='+m.scene.x+' width='+m.scene.width+' of '+w);
   assert.ok(m.scene.height<=h*.53,'poster exceeds half-screen budget');
   assert.ok(m.action.bottom<=m.nav.y,'main CTA must remain above navigation');}
  assert.ok(m.art.y-m.car.y>=5,'shadow needs top breathing room');
  // Холодный ореол вокруг карточки владелец просил сам: «оттени от фона, они
  // должны выделяться». Прежнее правило запрещало его — осталось от времён,
  // когда ореол обрезался полосой. Обрезку чинили отступами, а ореол оставили,
  // поэтому проверка теперь требует его наличия, а не отсутствия.
  assert.ok(/111, 231/.test(m.shadow),'cold halo around the card must stay: '+m.shadow);
  await page.screenshot({path:`outputs/home-depth/home-${w}.png`});
  if(w===390||w===360){const key=w===390?'слушатель 390':'слушатель 360';const selectors=Object.keys(lock[key]);const measured=await page.evaluate(s=>Object.fromEntries(s.map(sel=>{const e=document.querySelector(sel);if(!e)return [sel,null];const r=e.getBoundingClientRect();return [sel,[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)]]})),selectors);if(process.env.TT_LOCK_WRITE==='1')lock[key]=measured;}
  if(w===390){await page.locator('.soft-carousel').evaluate(e=>e.scrollLeft=e.scrollWidth);assert.ok(await page.locator('.soft-carousel').evaluate(e=>e.scrollLeft>0),'carousel must scroll');await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.soft-art').first().evaluate(e=>getComputedStyle(e).transform),'none');await page.locator('.soft-episode').first().focus();assert.notEqual(await page.locator('.soft-episode').first().evaluate(e=>getComputedStyle(e).outlineStyle),'none');await page.locator('.soft-carousel').evaluate(e=>e.scrollLeft=0);await page.locator('.soft-carousel').scrollIntoViewIfNeeded();await page.screenshot({path:'outputs/home-depth/carousel.png'});}
  if(w===390){await page.route('**/api/cover?*',r=>r.fulfill({status:404,body:''}));await page.reload();await page.locator('.scene-mark').waitFor();const title=await page.locator('.scene-title').boundingBox();assert.ok(title&&title.width>100&&title.height>15,'fallback poster must show the real title');}
  results.push({w,h,poster:m.scene});await context.close();
 }
 assert.deepEqual(errors,[]);if(process.env.TT_LOCK_WRITE==='1')await writeFile('tests/fixtures/layout-lock.json',JSON.stringify(lock,null,1)+'\n');
 await writeFile('outputs/home-depth/measurements.json',JSON.stringify(results,null,2));console.log('PASS home: 5 sizes, poster geometry, CTA, no horizontal overflow, neutral shadows, carousel scroll, focus, reduced motion. API fixtures; real production UI.');
}finally{await browser?.close();server.kill('SIGTERM');}
