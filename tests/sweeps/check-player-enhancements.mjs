import {chromium} from 'playwright';
import {build} from 'esbuild';
import {mkdtemp,readFile,writeFile,rm,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
const temp=await mkdtemp(path.resolve('.player-check-'));
await writeFile(path.join(temp,'entry.tsx'),`
import React from 'react';import {createRoot} from 'react-dom/client';
import {PlayerChrome} from '../components/studio/player-chrome';
import {HeartBeam} from '../components/ui/heart-beam';import {LocaleProvider} from '../components/i18n-provider';
const noop=()=>{};window.shares=0;
const view={title:'76 дней',position:60,duration:120,playing:true,loading:false,seekable:true,rate:1,sleep:0,sleepOptions:[],sleepValue:0,presentation:'photo',kindLabel:'Подкаст',postId:'audio-test'};
createRoot(document.getElementById('root')).render(<LocaleProvider locale="ru"><HeartBeam/><PlayerChrome expanded view={view} onExpand={noop} act={{toggle:noop,seekBy:noop,seekTo:noop,setRate:noop,setSleep:noop,close:noop,donate:noop,share:()=>window.shares++}}/></LocaleProvider>);
`);
await build({entryPoints:[path.join(temp,'entry.tsx')],bundle:true,outfile:path.join(temp,'app.js'),tsconfig:path.resolve('tsconfig.json'),plugins:process.env.TT_PLAYER_MUTATION==='1'?[{name:'share-mutation',setup(b){b.onLoad({filter:/player-chrome\.tsx$/},async a=>({loader:'tsx',contents:(await readFile(a.path,'utf8')).replace('act.share!();','void 0;')}));}}]:[]});
const css=(await readFile('app/globals.css','utf8')).replace(/^@import.*$/gm,'');
await writeFile(path.join(temp,'layout.css'),css);
await writeFile(path.join(temp,'index.html'),`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="layout.css"><link rel="stylesheet" href="app.css"><style>*{box-sizing:border-box}body{margin:0;background:#121619;color:white}:root{--tt-gutter:20px;--font-ui:Arial;--background:#121619}button{font:inherit}</style><div id="root"></div><script src="app.js"></script>`);
const server=createServer(async(req,res)=>{if(req.url.startsWith('/brand/logo.png')){res.setHeader('Content-Type','image/png');res.end(await readFile('public/brand/logo.png'));return;}const name=req.url==='/'?'index.html':req.url.slice(1);if(!['index.html','app.js','app.css','layout.css'].includes(name)){res.writeHead(404).end();return;}res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(await readFile(path.join(temp,name)));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:320,height:740}});const errors=[];let events=0;
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/usage',r=>{events++;return r.fulfill({json:{counted:true}});});
 await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('.player-share').click();
 assert.equal(await page.evaluate(()=>window.shares),1,'visible share button must invoke sharing');
 const state=await page.evaluate(()=>{const hearts=[...document.querySelectorAll('.tt-heart-beam')];const buttons=[...document.querySelectorAll('.player-sheet-top button')].map(b=>{const r=b.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width};});return {ids:hearts.map(h=>h.querySelector('linearGradient').id),beat:getComputedStyle(document.querySelector('.is-beating')).animationName,spark:getComputedStyle(document.querySelector('.player-donate .tt-heart-spark')).animationName,buttons};});
 assert.equal(new Set(state.ids).size,2,'home and player gradients must be independent');assert.equal(state.beat,'tt-heart-beat');assert.equal(state.spark,'tt-heart-run');
 for(const b of state.buttons)assert.ok(b.left>=0&&b.right<=320&&b.width>=44,'player actions must fit narrow screen with touch targets');
 await page.waitForTimeout(100);assert.equal(events,1,'one playback must create one usage event');
 await mkdir('outputs/player-check',{recursive:true});await page.screenshot({path:'outputs/player-check/player.png'});
 await page.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await page.locator('.is-beating').first().evaluate(e=>getComputedStyle(e).animationName),'none');
 assert.equal(await page.locator('.player-donate .tt-heart-spark').evaluate(e=>getComputedStyle(e).animationName),'none');
 assert.deepEqual(errors,[]);console.log('PASS player: share action, independent gradients, heartbeat, reduced motion, 320px targets, usage event');
}finally{await browser?.close();await new Promise(r=>server.close(r));await rm(temp,{recursive:true,force:true});}
