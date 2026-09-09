import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {execFileSync,spawn} from 'node:child_process';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd(),dir=await mkdtemp(path.join(root,'.test-live-'));
Object.assign(process.env,{NODE_ENV:'test',DATABASE_PATH:path.join(dir,'db.sqlite'),STORAGE_DIR:path.join(dir,'storage'),LIVE_DIR:path.join(dir,'live'),SESSION_SECRET:'test-secret-only',ADMIN_PASSWORD:'test-pass'});
let worker;let logs='';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,seconds=30){const end=Date.now()+seconds*1000;while(Date.now()<end){const result=await fn();if(result)return result;await delay(200);}throw new Error('Timed out; worker: '+logs);}
try{
 execFileSync('npx',['drizzle-kit','migrate'],{stdio:'pipe'});
 const outfile=path.join(dir,'routes.mjs');await build({stdin:{contents:`export * as live from '${root}/app/api/live/route.ts';export * as stream from '${root}/app/api/live-stream/route.ts';export * as auth from '${root}/lib/auth.ts';export {getDb} from '${root}/db';`,resolveDir:root},outfile,bundle:true,format:'esm',platform:'node',packages:'external'});
 const {live,stream,auth,getDb}=await import(outfile),db=getDb().$client;
 const origin='https://true-thrills.test',cookie=auth.createSessionCookie(new Request(origin)).split(';')[0];
 const sessionReq=new Request(origin,{headers:{cookie}});db.prepare('INSERT INTO settings VALUES(?,?)').run('owner',auth.sessionUserId(sessionReq));
 const call=async(route,method,body,query='',authorized=true)=>route[method](new Request(origin+'/api/'+(route===live?'live':'live-stream')+query,{method,headers:{host:'true-thrills.test',origin,...(authorized?{cookie}:{}),'content-type':body instanceof Buffer?'audio/webm':'application/json'},...(body!==undefined?{body:body instanceof Buffer?body:JSON.stringify(body)}:{})}));
 assert.equal((await call(live,'POST',{action:'start',title:'No worker',transport:'hls'})).status,400);
 worker=spawn(process.execPath,['scripts/live-worker.mjs'],{env:process.env});worker.stderr.on('data',b=>logs+=b);worker.stdout.on('data',b=>logs+=b);
 await until(async()=>{try{return JSON.parse(await readFile(path.join(process.env.LIVE_DIR,'worker.json'),'utf8')).at;}catch{return false;}});
 const start=async title=>{const response=await call(live,'POST',{action:'start',title,transport:'hls'});const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data.id;};
 const fixture=path.join(dir,'sample.webm');execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','14','-c:a','libopus','-b:a','128k','-f','webm',fixture]);const bytes=await readFile(fixture);
 const id=await start('Archived test'),size=24000;
 assert.equal((await call(stream,'POST',bytes.subarray(0,size),'?id='+id+'&seq=0',false)).status,403);
 let seq=0;
 for(let i=0;i<bytes.length;i+=size){const chunk=bytes.subarray(i,i+size),query='?id='+id+'&seq='+seq;
  assert.equal((await call(stream,'POST',chunk,query)).status,200);
  assert.equal((await call(stream,'POST',chunk,query)).status,200,'retry must not duplicate bytes');
  if(seq===0)assert.equal((await call(stream,'POST',Buffer.from('wrong'),query)).status,400);
  seq++;
 }
 const list=await until(async()=>{const response=await call(stream,'GET',undefined,'?id='+id+'&file=index.m3u8',false);return response.status===200?response.text():false;});
 assert.match(list,/#EXTINF:/);const segment=list.split('\n').find(x=>x.startsWith('?id='));assert.equal((await call(stream,'GET',undefined,segment,false)).status,200);
 assert.equal((await call(stream,'GET',undefined,'?id='+id+'&file=../../.env',false)).status,404);
 await call(live,'POST',{action:'stop',id});
 const archive=await until(()=>{const r=db.prepare('SELECT * FROM live_recordings WHERE id=?').get(id);if(r.state==='failed')throw new Error(r.error+' '+logs);return r.state==='ready'?r:false;});
 const post=db.prepare('SELECT * FROM posts WHERE id=?').get(archive.post_id);assert.equal(post.published,1);assert.ok(post.duration>=13&&post.duration<=15);assert.equal(post.kind,'podcast');
 const file=path.join(process.env.STORAGE_DIR,post.audio_key);assert.ok((await readFile(file)).length>0);assert.match(await (await call(stream,'GET',undefined,'?id='+id+'&file=index.m3u8',false)).text(),/#EXT-X-ENDLIST/);
 // Final POST response may be lost: retry remains safe even after publication.
 const lastStart=(seq-1)*size;assert.equal((await call(stream,'POST',bytes.subarray(lastStart),'?id='+id+'&seq='+(seq-1))).status,200);
 // Force the abandoned sender timeout; the VPS must archive the received part.
 const abandoned=await start('Power loss');assert.equal((await call(stream,'POST',bytes,'?id='+abandoned+'&seq=0')).status,200);
 db.prepare('UPDATE live_recordings SET updated_at=? WHERE id=?').run(Date.now()-91000,abandoned);
 await until(()=>db.prepare('SELECT state FROM live_recordings WHERE id=?').get(abandoned).state==='ready');
 assert.equal(db.prepare('SELECT active FROM broadcasts WHERE id=?').get(abandoned).active,0);
 // Unpublishing the generated podcast also revokes the retained HLS archive.
 db.prepare('UPDATE posts SET published=0 WHERE id=?').run(post.id);
 assert.equal((await call(stream,'GET',undefined,'?id='+id+'&file=index.m3u8',false)).status,404);
 // Full backup includes live recovery fragments and the externally referenced Firebase file.
 await writeFile(path.join(dir,'.env'),'PUBLIC_SITE_URL=https://true-thrills.test\n');
 const firebase=path.join(dir,'firebase.json');await writeFile(firebase,'{"test":true}');
 const backupResult=execFileSync(process.execPath,[path.join(root,'scripts/backup-data.mjs'),path.join(dir,'snapshots')],{cwd:dir,env:{...process.env,FIREBASE_SERVICE_ACCOUNT_FILE:firebase},encoding:'utf8'});
 const backup=backupResult.split('Backup created: ')[1].trim();assert.equal(await readFile(path.join(backup,'firebase-service-account.json'),'utf8'),'{"test":true}');
 assert.ok((await readFile(path.join(backup,'live',abandoned,'chunks','000000.webm'))).length>0);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM push_events WHERE id=?').get('post:'+id).n,1);
 console.log('PASS: real FFmpeg HLS, idempotent upload, ordered fragments, path/auth isolation, M4A duration, automatic publication, abandoned PC recovery and unpublished archive privacy');
}finally{
 if(worker){worker.kill('SIGTERM');await new Promise(resolve=>{if(worker.exitCode!==null)resolve();else worker.once('exit',resolve);});}
 await rm(dir,{recursive:true,force:true});
}
