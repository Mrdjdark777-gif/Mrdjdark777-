#!/usr/bin/env node
/**
 * Фон-сетка: отдача на касание и тишина в покое.
 *
 * Готовый компонент из интернета крутил кадры всегда — на приложении, которое
 * играет звук часами, это чистый расход батареи. Здесь проверяется главное:
 * в покое холст неподвижен, касание пустого места поднимает волну, нажатие на
 * кнопку её не поднимает, и сетка не перехватывает нажатия у содержимого.
 */
import {chromium} from 'playwright';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(),dir=await mkdtemp(path.join(root,'.test-tmp-grid-'));
const env={...process.env,DATABASE_PATH:path.join(dir,'db.sqlite'),STORAGE_DIR:path.join(dir,'storage'),LIVE_DIR:path.join(dir,'live'),SESSION_SECRET:'grid-secret-not-production',ADMIN_PASSWORD:'grid-password',FIREBASE_SERVICE_ACCOUNT_FILE:'',PUBLIC_SITE_URL:''};
execFileSync(process.execPath,['node_modules/drizzle-kit/bin.cjs','migrate'],{env,stdio:'ignore'});
const port=3327,base='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env,stdio:['ignore','ignore','inherit']});
let browser;
try{
 for(let i=0;i<80;i++){try{await fetch(base+'/api/health');break;}catch{await new Promise(r=>setTimeout(r,250));}}
 const login=await fetch(base+'/api/auth',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:'grid-password'})});
 const cookie=login.headers.get('set-cookie').split(';')[0];
 await fetch(base+'/api/library',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({action:'setup'})});
 browser=await chromium.launch({executablePath:process.env.TT_BROWSER_EXECUTABLE});
 const ctx=await browser.newContext({viewport:{width:412,height:915},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 const page=await ctx.newPage();
 await page.goto(base+'/?mode=listen&view=podcasts');
 await page.waitForTimeout(2000);

 // Холст на месте, лежит под содержимым и не ловит нажатия.
 const shape=await page.evaluate(()=>{const c=document.querySelector('canvas.kinetic-grid');if(!c)return null;
  const st=getComputedStyle(c);const r=c.getBoundingClientRect();
  return {pos:st.position,events:st.pointerEvents,z:st.zIndex,w:Math.round(r.width),h:Math.round(r.height)};});
 assert.ok(shape,'фона-сетки нет на экране слушателя');
 assert.equal(shape.pos,'fixed','сетка должна быть закреплена на экране');
 assert.equal(shape.events,'none','сетка не должна перехватывать нажатия');
 assert.ok(shape.w>=400&&shape.h>=900,'сетка не на весь экран: '+shape.w+'×'+shape.h);

 // Слепок холста: по нему видно, шевелится картинка или стоит.
 // Слепок берём со всего холста: волна поднимается там, где коснулись, и
 // взгляд только на верхнюю полосу её попросту не заметит.
 const snap=()=>page.evaluate(()=>{const c=document.querySelector('canvas.kinetic-grid');
  const g=c.getContext('2d');const d=g.getImageData(0,0,c.width,c.height).data;
  let sum=0;for(let i=3;i<d.length;i+=4*37)sum+=d[i];return sum;});

 await page.screenshot({path:'outputs/ui/grid-rest.png'});
 const rest1=await snap();
 await page.waitForTimeout(400);
 const rest2=await snap();
 assert.equal(rest1,rest2,'в покое сетка шевелится — значит кадры крутятся впустую');
 assert.ok(rest1>0,'сетка в покое не нарисована вовсе');

 // Касание пустого места поднимает волну.
 const empty=await page.evaluate(()=>{const m=document.querySelector('.main-content');
  const r=m.getBoundingClientRect();return {x:Math.round(r.left+8),y:Math.round(r.bottom-8)};});
 await page.mouse.move(empty.x,empty.y);
 await page.mouse.down();
 await page.waitForTimeout(120);
 const live=await snap();
 await page.screenshot({path:'outputs/ui/grid-wave.png'});
 await page.mouse.up();
 assert.notEqual(live,rest1,'касание пустого места не подняло волну');

 // Волна затухает, и холст снова замирает.
 await page.waitForTimeout(1800);
 const calm1=await snap();
 await page.waitForTimeout(400);
 const calm2=await snap();
 assert.equal(calm1,calm2,'после волны сетка продолжает шевелиться');

 // Нажатие на кнопку — это нажатие на кнопку, а не фейерверк.
 const button=page.locator('.bottom-nav-item').first();
 const box=await button.boundingBox();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
 await page.mouse.down();
 await page.waitForTimeout(120);
 const onButton=await snap();
 await page.mouse.up();
 assert.equal(onButton,calm1,'нажатие на кнопку подняло волну, хотя не должно');

 console.log('PASS: фон-сетка неподвижна в покое, отвечает волной на касание пустого места, молчит на кнопках и не перехватывает нажатия');
}finally{if(browser)await browser.close();server.kill();await rm(dir,{recursive:true,force:true});}
