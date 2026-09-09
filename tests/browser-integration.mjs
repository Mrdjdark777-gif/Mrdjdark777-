import {chromium} from 'playwright';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(),dir=await mkdtemp(path.join(root,'.test-tmp-ui-'));
const env={...process.env,DATABASE_PATH:path.join(dir,'db.sqlite'),STORAGE_DIR:path.join(dir,'storage'),LIVE_DIR:path.join(dir,'live'),SESSION_SECRET:'ui-test-secret-not-production',ADMIN_PASSWORD:'ui-test-password',FIREBASE_SERVICE_ACCOUNT_FILE:''};
execFileSync(process.execPath,['node_modules/drizzle-kit/bin.cjs','migrate'],{env,stdio:'inherit'});
await mkdir('outputs/ui',{recursive:true});
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3131'],{env,stdio:'inherit'});
let browser,worker;
try{
const base='http://127.0.0.1:3131';
for(let i=0;i<60;i++){try{await fetch(base+'/api/health');break;}catch{await new Promise(resolve=>setTimeout(resolve,250));}}
const login=await fetch(base+'/api/auth',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:'ui-test-password'})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
async function post(data){const r=await fetch(base+'/api/library',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify(data)});assert.equal(r.status,200);return r.json();}
await post({action:'setup'});
worker=spawn(process.execPath,['scripts/live-worker.mjs'],{env,stdio:'inherit'});
const story=await post({kind:'story',title:'История у горного озера',body:'Дорога уходила к озеру. Ветер стихал, и становились слышны птицы.\n\n'.repeat(70),published:true});
const wav=Buffer.alloc(44+44100*2*8);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(44100,24);wav.writeUInt32LE(88200,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
const upload=await fetch(base+'/api/audio',{method:'POST',headers:{cookie,'content-type':'audio/wav','x-upload-size':String(wav.length)},body:wav});assert.equal(upload.status,200);const {key}=await upload.json();
const podcast=await post({kind:'podcast',title:'Проверка подкаста',audioKey:key,duration:8,published:true});
browser=await chromium.launch({headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/?mode=listen&view=podcasts&post='+podcast.id);await page.locator('.podcast-player').waitFor();
 await page.waitForFunction(()=>{const a=document.querySelector('.podcast-player audio');return a&&a.currentTime>1&&a.duration===8;});
 const times=await page.locator('.podcast-times').innerText();assert.match(times,/00:08|0:08/);
 await page.locator('.player-extras select').first().selectOption('1.5');assert.equal(await page.locator('.podcast-player audio').evaluate(a=>a.playbackRate),1.5);
 await page.locator('.podcast-toggle').click();await page.waitForFunction(()=>document.querySelector('.podcast-player audio')?.paused===true);await page.screenshot({path:'outputs/ui/player-mobile.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.goto(base+'/?mode=listen&view=stories&post='+story.id);await page.locator('.reader-scroll').waitFor();assert.equal(await page.locator('.reading-dialog').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(17, 23, 25)');await page.locator('.reader-options select').selectOption('22');await page.locator('.reader-scroll').evaluate(el=>el.scrollTop=500);await page.waitForTimeout(150);await page.screenshot({path:'outputs/ui/reader-mobile.png',fullPage:true});
 await page.reload();await page.locator('.reader-scroll').waitFor();await page.waitForFunction(()=>document.querySelector('.reader-scroll')?.scrollTop>400);assert.equal(await page.locator('.reader-options select').inputValue(),'22');
 // Donation remains visible with no URL, and becomes a real link when configured.
 await page.goto(base+'/?mode=listen');await page.locator('.donation-card').waitFor();assert.match(await page.locator('.donation-card').innerText(),/Донат/);assert.equal(await page.locator('a.donation-card').count(),0);
 await post({action:'donation',url:'https://example.com/donate'});await page.reload();await page.locator('a.donation-card').waitFor();assert.equal(await page.locator('a.donation-card').getAttribute('href'),'https://example.com/donate');await page.screenshot({path:'outputs/ui/donation-home.png',fullPage:true});
 // Real browser MediaRecorder -> HTTP upload -> FFmpeg HLS -> browser playback.
 const ownerContext=await browser.newContext({permissions:['microphone'],viewport:{width:1280,height:900}});
 const eq=cookie.indexOf('=');await ownerContext.addCookies([{name:cookie.slice(0,eq),value:cookie.slice(eq+1),url:base}]);
 const studio=await ownerContext.newPage();await studio.goto(base+'/?view=live');await studio.getByLabel('Название эфира').fill('Browser live archive');await studio.getByRole('button',{name:'Начать эфир',exact:true}).click();
 await studio.locator('.stop-live-button').waitFor();
 await page.goto(base+'/?mode=listen&view=live');await page.locator('.listener-playback-actions .primary-button').click();
 await page.waitForFunction(()=>document.querySelector('.session-status.is-onair')!==null,{},{timeout:60000});
 assert.equal(await page.locator('.live-console a.donation-card').getAttribute('href'),'https://example.com/donate');await page.screenshot({path:'outputs/ui/donation-live.png',fullPage:true});
 await studio.locator('.stop-live-button').click();await studio.waitForFunction(()=>!document.querySelector('.stop-live-button'),{},{timeout:30000});
 await page.waitForFunction(async()=>{const r=await fetch('/api/library');return (await r.json()).items.some(p=>p.title==='Browser live archive'&&p.duration>0);},{},{timeout:30000});
 await ownerContext.close();
 // Mock only the transport boundary to check that the new APK uses one native player, not duplicate HTML audio.
 await page.addInitScript(()=>{const bridge={onmessage:null,postMessage(text){const r=JSON.parse(text);window.__commands=(window.__commands||[]).concat(r.method);setTimeout(()=>bridge.onmessage?.({data:JSON.stringify({id:r.id,data:{id:r.args.id||window.__id,active:true,playing:true,loading:false,position:2000,duration:8000,rate:1,sleepUntil:0}})}),0);if(r.args.id)window.__id=r.args.id;}};window.TrueThrillsNative=bridge;});
 await page.goto(base+'/?mode=listen&view=podcasts&post='+podcast.id);await page.locator('.podcast-player').waitFor();await page.waitForFunction(()=>window.__commands?.includes('player.load'));assert.equal(await page.locator('.podcast-player audio').count(),0);
 await page.locator('.podcast-toggle').click();await page.waitForFunction(()=>window.__commands?.includes('player.pause'));
 assert.deepEqual(errors,[]);console.log('PASS: 390px layout, advancing audio duration/progress, rate, story position/font restore, native transport and no duplicate HTML audio');
}finally{await browser.close();}
}finally{if(worker){worker.kill('SIGTERM');await new Promise(resolve=>{if(worker.exitCode!==null)resolve();else worker.once('exit',resolve);});}server.kill('SIGTERM');await new Promise(resolve=>{if(server.exitCode!==null)resolve();else server.once('exit',resolve);});await rm(dir,{recursive:true,force:true});}
