import {chromium} from 'playwright';
import {build} from 'esbuild';
import path from 'node:path';
import {createServer} from 'node:http';
import {readFile,mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import assert from 'node:assert/strict';
const root=process.cwd();
const temp=await mkdtemp(path.join(root,'.reader-check-'));
const screenshots=path.join(root,'outputs/reader-check');
await mkdir(screenshots,{recursive:true});
await writeFile(path.join(temp,'entry.tsx'),"import React,{StrictMode,useState} from 'react';\nimport {createRoot} from 'react-dom/client';\nimport {StoryReader} from '../components/studio/story-reader';\nimport {LocaleProvider} from '../components/i18n-provider';\nimport {createCurl,GONE,shadowEnvelope} from '../lib/page-curl';\nObject.assign(window,{createCurl,GONE,shadowEnvelope});\nfunction App(){const [open,setOpen]=useState(true);return <LocaleProvider locale=\"ru\">{open?<StoryReader id=\"test\" title=\"Он выжил. Но какой ценой? История выживания в открытом океане\" body={Array.from({length:100},(_,i)=>`\u0410\u0431\u0437\u0430\u0446 ${i+1}. \u041c\u044b \u0447\u0438\u0442\u0430\u0435\u043c \u043d\u0430\u0441\u0442\u043e\u044f\u0449\u0443\u044e \u0438\u0441\u0442\u043e\u0440\u0438\u044e. \u0414\u043b\u0438\u043d\u043d\u0430\u044f \u0434\u043e\u0440\u043e\u0433\u0430 \u043f\u0440\u043e\u0445\u043e\u0434\u0438\u043b\u0430 \u0447\u0435\u0440\u0435\u0437 \u043b\u0435\u0441, \u0430 \u0437\u0430 \u0434\u0435\u0440\u0435\u0432\u044c\u044f\u043c\u0438 \u0431\u044b\u043b\u043e \u0441\u043b\u044b\u0448\u043d\u043e \u043c\u043e\u0440\u0435. \u0421\u0442\u0440\u0430\u043d\u0438\u0446\u0430 \u0434\u043e\u043b\u0436\u043d\u0430 \u043e\u0441\u0442\u0430\u0432\u0430\u0442\u044c\u0441\u044f \u0447\u0438\u0442\u0430\u0435\u043c\u043e\u0439 \u0438 \u0441\u043e\u0445\u0440\u0430\u043d\u044f\u0442\u044c \u043c\u0435\u0441\u0442\u043e.`).join('\\n\\n')} onClose={()=>setOpen(false)}/>:<button onClick={()=>setOpen(true)}>\u041e\u0442\u043a\u0440\u044b\u0442\u044c</button>}</LocaleProvider>}\ncreateRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);\n");
await build({entryPoints:[path.join(temp,'entry.tsx')],bundle:true,outfile:path.join(temp,'app.js'),tsconfig:path.join(root,'tsconfig.json'),plugins:process.env.TT_READER_CONTROLS_MUTATION==='1'?[{name:'test-controls-mutation',setup(b){b.onLoad({filter:/story-reader\.tsx$/},async args=>({contents:(await readFile(args.path,'utf8')).replace('seek(Math.min(1,Math.max(0,(x-r.left-9)/Math.max(1,r.width-18)))*(total-1));','seek(0);'),loader:'tsx'}));}}]:process.env.TT_READER_SHADOW_MUTATION==='1'?[{name:'test-shadow-mutation',setup(b){b.onLoad({filter:/page-curl\.ts$/},async args=>({contents:(await readFile(args.path,'utf8')).replace('gl.uniform1f(pageAt.lighting, shadowEnvelope(turn));','gl.uniform1f(pageAt.lighting, 1);'),loader:'ts'}));}}]:[]});
await writeFile(path.join(temp,'index.html'),"<!doctype html><html lang=\"ru\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><style>*{box-sizing:border-box}body{margin:0;font-family:Arial}button,input{font:inherit}:root{--font-ui:Arial}</style><link rel=\"stylesheet\" href=\"app.css\"><div id=\"root\"></div><script src=\"app.js\"></script></html>\n");
const server=createServer(async(req,res)=>{try{const name=req.url==='/'?'index.html':req.url.slice(1);if(!['index.html','app.js','app.css'].includes(name)){res.writeHead(404).end();return;}res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(await readFile(path.join(temp,name)));}catch{res.writeHead(500).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url='http://127.0.0.1:'+server.address().port;
let browser;const errors=[];
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.locator('.tt-reader-line').first().waitFor();await page.waitForTimeout(200);
 const number=()=>page.locator('.tt-reader-page-count').innerText();
 const settled=()=>page.waitForFunction(()=>document.querySelector('.tt-reader-gl')?.dataset.on==='no'&&document.querySelector('.tt-reader-page:not(.is-copy)'));
 await page.mouse.click(365,420);await settled();assert.match(await number(),/^2 \//,'tap must turn forward');
 await page.mouse.click(15,420);await settled();assert.match(await number(),/^1 \//,'tap must turn backward');
 // One large move then release must count; do not require a second move.
 await page.mouse.move(330,420);await page.mouse.down();await page.mouse.move(150,420);await page.mouse.up();await settled();assert.match(await number(),/^2 \//,'single-move swipe lost');
 const before=await number();
 await page.mouse.move(330,420);await page.mouse.down();await page.mouse.move(260,420);await page.waitForTimeout(180);await page.mouse.up();await settled();assert.equal(await number(),before,'held small drag must cancel, not use stale fling velocity');
 // Return drag and pointercancel.
 await page.mouse.move(330,420);await page.mouse.down();await page.mouse.move(140,420);await page.locator('.tt-reader-stage').dispatchEvent('pointercancel',{pointerId:1,isPrimary:true});await page.mouse.up();await settled();assert.equal(await number(),before,'pointer cancel changed page');
 // Reject another pointer during an active gesture.
 await page.locator('.tt-reader-stage').dispatchEvent('pointerdown',{pointerId:31,isPrimary:true,button:0,clientX:320,clientY:420});
 await page.locator('.tt-reader-stage').dispatchEvent('pointerdown',{pointerId:32,isPrimary:false,button:0,clientX:320,clientY:420});
 await page.locator('.tt-reader-stage').dispatchEvent('pointermove',{pointerId:32,isPrimary:false,clientX:20,clientY:420});
 await page.locator('.tt-reader-stage').dispatchEvent('pointerup',{pointerId:32,isPrimary:false,clientX:20,clientY:420});
 await page.locator('.tt-reader-stage').dispatchEvent('pointercancel',{pointerId:31,isPrimary:true});await settled();assert.equal(await number(),before,'second pointer hijacked gesture');
 await page.getByLabel('Настройки чтения',{exact:true}).click();
 for(const tone of ['day','sepia','black','night'])await page.locator('.tt-reader-theme.is-'+tone).click();
 await page.getByLabel('Отмена',{exact:true}).click();
 await page.mouse.click(365,420);await settled();assert.match(await number(),/^3 \//,'themes broke reader');
 await page.setViewportSize({width:844,height:390});await page.waitForTimeout(150);await settled();
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);
 await page.addInitScript(()=>localStorage.setItem('tt-reading-test',JSON.stringify({ratio:.5,marks:[null,{}, {ratio:'bad'}, {ratio:.5,text:'Здесь',at:1}]})));
 await page.reload();await page.locator('.tt-reader-line').first().waitFor();await page.waitForTimeout(250);
 await page.getByLabel('Закладки',{exact:true}).click();assert.equal(await page.locator('.tt-reader-mark').count(),1,'corrupt marks not filtered');await page.getByLabel('Отмена',{exact:true}).click();
 // Direct scrubbing: touch drag updates continuously, keyboard and endpoints agree.
 const rail=page.locator('.tt-reader-seek');const input=rail.locator('input');
 const box=await rail.boundingBox();const y=box.y+22;
 const max=Number(await input.getAttribute('max'));
 await page.mouse.click(box.x+9,y);assert.equal(Number(await input.inputValue()),0,'seek first endpoint');
 await page.mouse.move(box.x+9,y);await page.mouse.down();
 for(const fraction of [.25,.5,.75,1]){
  await page.mouse.move(box.x+9+(box.width-18)*fraction,y);
  assert.equal(Number(await input.inputValue()),Math.round(max*fraction),'seek must follow every move immediately');
 }
 await page.mouse.up();assert.equal(Number(await input.inputValue()),max,'seek last endpoint');
 await input.focus();await page.keyboard.press('Home');assert.equal(Number(await input.inputValue()),0,'keyboard Home');
 await page.keyboard.press('End');assert.equal(Number(await input.inputValue()),max,'keyboard End');
 const edges=await page.evaluate(()=>{
  const r=document.querySelector('.tt-reader-seek-rail').getBoundingClientRect();
  const t=document.querySelector('.tt-reader-seek-thumb').getBoundingClientRect();
  const h=document.querySelector('.tt-reader-top').getBoundingClientRect();
  const progress=document.querySelector('.tt-reader-progress').getBoundingClientRect();
  const heading=document.querySelector('.tt-reader-heading');
  return {end:Math.abs(t.x+t.width/2-r.right),safe:progress.top>=h.bottom-4,title:heading.clientWidth>=heading.scrollWidth};
 });assert.ok(edges.end<1,'thumb must meet rail end');assert.ok(edges.safe,'progress must sit below header / cutout');assert.ok(edges.title,'title clipped horizontally');
 await page.mouse.click(box.x+9,y);
 // Real touch events, including repeated moves and cancellation.
 const cdp=await context.newCDPSession(page);
 for(const [type,x] of [['touchStart',box.x+9],['touchMove',box.x+box.width-9],['touchEnd',0]]){
  await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y}]});
 }
 assert.equal(Number(await input.inputValue()),max,'touch scrub must reach last page');
 await page.mouse.click(box.x+box.width/2,y);await settled();
 await page.screenshot({path:path.join(screenshots,'reader-controls.png')});
 // Header wraps long Cyrillic titles on a small screen and respects an inset.
 await page.setViewportSize({width:320,height:740});
 await page.evaluate(()=>document.querySelector('.tt-reader').style.setProperty('--tt-reader-safe-top','32px'));
 await page.waitForTimeout(100);
 const safe=await page.evaluate(()=>{
  const title=document.querySelector('.tt-reader-heading');
  const h=document.querySelector('.tt-reader-top').getBoundingClientRect();
  const p=document.querySelector('.tt-reader-progress').getBoundingClientRect();
  const text=document.querySelector('.tt-reader-page:not(.is-copy)').getBoundingClientRect();
  return {fits:title.scrollHeight<=title.clientHeight+1&&title.scrollWidth<=title.clientWidth+1,
   inset:parseFloat(getComputedStyle(document.querySelector('.tt-reader-top')).paddingTop),
   clear:p.top>=h.bottom-4&&text.top>=h.bottom+8};
 });assert.ok(safe.fits,'long title must wrap without clipping');assert.equal(safe.inset,32);assert.ok(safe.clear,'safe-area header overlaps progress/text');
 await page.screenshot({path:path.join(screenshots,'reader-controls-small.png')});
 await page.evaluate(()=>document.querySelector('.tt-reader').style.removeProperty('--tt-reader-safe-top'));
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);
 // Scrub immediately interrupts an in-flight turn, rather than dropping the request.
 await page.mouse.click(365,420);
 const sr=await rail.boundingBox();await page.mouse.click(sr.x+9,sr.y+22);
 assert.equal(Number(await input.inputValue()),0,'seek during animation dropped');await settled();
 console.log('PASS mouse/touch/keyboard seek, exact endpoints and safe header progress');
 // Actual GLSL compilation + pixels at both DOM hand-offs, four paper tones/directions.
 const gpu=await page.evaluate(()=>{
  const canvas=document.createElement('canvas');canvas.style.cssText='width:390px;height:844px';document.body.append(canvas);
  const curl=window.createCurl(canvas,[0,0,0]);if(!curl)return {available:false};
  const gl=canvas.getContext('webgl');const results=[];
  for(const rgb of [[0,0,0],[20,24,26],[244,241,234],[239,224,198]]){
   const texture=document.createElement('canvas');texture.width=390;texture.height=844;
   const ctx=texture.getContext('2d');ctx.fillStyle=`rgb(${rgb})`;ctx.fillRect(0,0,390,844);
   curl.paper(rgb.map(x=>x/255));curl.pages(texture,texture);
   for(const forward of [true,false])for(const turn of [0,window.GONE]){
    curl.draw(turn,forward);const pixels=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    let max=0;for(let i=0;i<pixels.length;i+=4)for(let c=0;c<3;c++)max=Math.max(max,Math.abs(pixels[i+c]-rgb[c]));
    results.push({rgb,forward,turn,max,error:gl.getError()});
   }
  }
  curl.destroy();canvas.remove();return {available:true,results};
 });
 assert.ok(gpu.available,'WebGL unavailable — pixel checks NOT passed');
 for(const r of gpu.results){assert.equal(r.error,0,'GL error');assert.ok(r.max<=1,'visible shadow at hand-off '+JSON.stringify(r));}
 await page.screenshot({path:path.join(screenshots,'reader-night.png')});
 await page.mouse.move(335,420);await page.mouse.down();await page.mouse.move(170,420);await page.screenshot({path:path.join(screenshots,'reader-turn.png')});await page.mouse.up();await settled();
 // Loss of GPU must finish safely through fallback.
 await page.evaluate(()=>document.querySelector('.tt-reader-gl').getContext('webgl').getExtension('WEBGL_lose_context').loseContext());await page.waitForTimeout(100);await page.mouse.click(365,420);await settled();
 assert.equal(errors.length,0,errors.join('\n'));console.log('PASS browser reader scenarios and 16 GPU endpoint pixel comparisons');
 await context.close();
 const fallback=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
 await fallback.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl'?null:original.call(this,type,...args);};});
 const p=await fallback.newPage();await p.goto(url);await p.locator('.tt-reader-line').first().waitFor();await p.waitForTimeout(150);await p.mouse.click(365,420);await p.waitForTimeout(80);assert.match(await p.locator('.tt-reader-page-count').innerText(),/^2 \//);await fallback.close();console.log('PASS no-WebGL + reduced-motion');
}finally{await browser?.close();server.close();await rm(temp,{recursive:true,force:true});}
