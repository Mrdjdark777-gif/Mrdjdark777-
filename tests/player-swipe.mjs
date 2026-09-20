#!/usr/bin/env node
/**
 * Мини-панель плеера закрывается смахиванием в сторону. Пороги считает
 * lib/swipe и проверяет tests/swipe.mjs; здесь проверяется сам жест в
 * настоящем браузере: короткое движение панель оставляет, длинное — закрывает
 * плеер целиком.
 */
import {chromium} from 'playwright';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(),dir=await mkdtemp(path.join(root,'.test-tmp-chk-'));
const env={...process.env,DATABASE_PATH:path.join(dir,'db.sqlite'),STORAGE_DIR:path.join(dir,'storage'),LIVE_DIR:path.join(dir,'live'),SESSION_SECRET:'chk-secret-not-production',ADMIN_PASSWORD:'chk-password',FIREBASE_SERVICE_ACCOUNT_FILE:'',PUBLIC_SITE_URL:''};
execFileSync(process.execPath,['node_modules/drizzle-kit/bin.cjs','migrate'],{env,stdio:'ignore'});
const port=3245,base='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env,stdio:['ignore','ignore','inherit']});
let browser;
try{
 for(let i=0;i<80;i++){try{await fetch(base+'/api/health');break;}catch{await new Promise(r=>setTimeout(r,250));}}
 const login=await fetch(base+'/api/auth',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:'chk-password'})});
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const post=d=>fetch(base+'/api/library',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify(d)}).then(async r=>JSON.parse(await r.text()));
 await post({action:'setup'});
 const seconds=20,rate=44100,wav=Buffer.alloc(44+rate*2*seconds);
 wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
 for(let i=0;i<rate*seconds;i++)wav.writeInt16LE(Math.round(Math.sin(2*Math.PI*180*i/rate)*12000),44+i*2);
 const up=await fetch(base+'/api/audio',{method:'POST',headers:{cookie,'content-type':'audio/wav','x-upload-size':String(wav.length)},body:wav});
 const audioKey=(await up.json()).key;
 const created=await post({kind:'podcast',title:'Проба',description:'Тест',audioKey,published:true});
 const postId=(created.item||created.post||created).id;
 browser=await chromium.launch({executablePath:process.env.TT_BROWSER_EXECUTABLE});
 const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
 const page=await ctx.newPage();
 await page.goto(base+'/?mode=listen&view=podcasts&post='+postId);
 await page.waitForTimeout(1500);
 // свернуть плеер в мини-панель
 const collapse=page.locator('.player-collapse');
 if(await collapse.count()){await collapse.click();await page.waitForTimeout(400);}
 assert.equal(await page.locator('.podcast-player.is-mini').count(),1,'мини-панель должна быть на экране до жеста');
 const box=await page.locator('.podcast-player.is-mini').boundingBox();
 const swipe=async(dx)=>{
  const y=box.y+box.height/2,x=box.x+box.width/2;
  await page.evaluate(([x,y,dx])=>{
   const el=document.querySelector('.podcast-player.is-mini');if(!el)return;
   const mk=(type,cx)=>new TouchEvent(type,{bubbles:true,cancelable:true,touches:type==='touchend'?[]:[new Touch({identifier:1,target:el,clientX:cx,clientY:y})],changedTouches:[new Touch({identifier:1,target:el,clientX:cx,clientY:y})]});
   el.dispatchEvent(mk('touchstart',x));
   for(let i=1;i<=6;i++)el.dispatchEvent(mk('touchmove',x+dx*i/6));
   el.dispatchEvent(mk('touchend',x+dx));
  },[x,y,dx]);
  await page.waitForTimeout(400);
 };
 await swipe(40);
 assert.equal(await page.locator('.podcast-player.is-mini').count(),1,'короткое движение не должно закрывать плеер');
 await swipe(160);
 assert.equal(await page.locator('.podcast-player.is-mini').count(),0,'смахивание должно закрыть мини-панель');
 assert.equal(await page.locator('.podcast-player').count(),0,'плеер должен закрыться целиком, а не развернуться');
 console.log('PASS: мини-панель плеера закрывается смахиванием, короткое движение её не трогает');
}finally{if(browser)await browser.close();server.kill();await rm(dir,{recursive:true,force:true});}
