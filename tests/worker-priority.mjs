// Real FFmpeg with -re only for peaks: reproduce a long analysis without
// creating a huge file. A new archive must preempt it; SIGTERM must be clean.
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,copyFile,rm} from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
const root=process.cwd(),dir=await mkdtemp(path.join(root,'.test-tmp-worker-priority-'));
const env={...process.env,DATABASE_PATH:path.join(dir,'db.sqlite'),STORAGE_DIR:path.join(dir,'storage'),LIVE_DIR:path.join(dir,'live')};
let worker,db,logs='';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=10000){const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;await delay(100);}throw new Error('Worker deadline exceeded: '+logs);}
try{
 const realFfmpeg=execFileSync('which',['ffmpeg'],{encoding:'utf8'}).trim();
 await mkdir(path.join(dir,'bin'));await mkdir(path.join(env.STORAGE_DIR,'audio'),{recursive:true});await mkdir(env.LIVE_DIR);
 execFileSync(process.execPath,['node_modules/drizzle-kit/bin.cjs','migrate'],{env,stdio:'pipe'});
 const marker=path.join(dir,'analyses');
 // Test-only executable wrapper forwards every real encoder invocation.
 await writeFile(path.join(dir,'bin','ffmpeg'),`#!/bin/sh\ncase " $* " in\n *pcm_s16le*) printf 'start\\n' >> "$TT_ANALYSIS_MARKER"; exec "$TT_REAL_FFMPEG" -re "$@" ;;\n *) exec "$TT_REAL_FFMPEG" "$@" ;;\nesac\n`,{mode:0o700});
 const sample=path.join(dir,'sample.webm');
 execFileSync(realFfmpeg,['-v','error','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','12','-c:a','libopus',sample]);
 const key='audio/analysis';await copyFile(sample,path.join(env.STORAGE_DIR,key));
 db=new Database(env.DATABASE_PATH);
 db.prepare("INSERT INTO posts(id,kind,title,audio_key,published,created_at) VALUES('peaks','podcast','Analysis',?,1,?)").run(key,Date.now());
 worker=spawn(process.execPath,['scripts/live-worker.mjs'],{env:{...env,PATH:path.join(dir,'bin')+path.delimiter+env.PATH,TT_REAL_FFMPEG:realFfmpeg,TT_ANALYSIS_MARKER:marker}});
 worker.stderr.on('data',b=>logs+=b);worker.stdout.on('data',b=>logs+=b);
 const exited=new Promise(resolve=>worker.once('exit',(code,signal)=>resolve({code,signal})));
 await until(async()=>{try{return (await readFile(marker,'utf8')).length>0;}catch{return false;}});
 const first=JSON.parse(await readFile(path.join(env.LIVE_DIR,'worker.json'),'utf8')).at;
 await until(async()=>JSON.parse(await readFile(path.join(env.LIVE_DIR,'worker.json'),'utf8')).at>first,4000);
 const id=crypto.randomUUID();await mkdir(path.join(env.LIVE_DIR,id,'chunks'),{recursive:true});await copyFile(sample,path.join(env.LIVE_DIR,id,'chunks','000000.webm'));
 db.prepare('INSERT INTO broadcasts(id,title,owner_id,heartbeat) VALUES(?,?,?,?)').run(id,'Priority','owner',Date.now());
 db.prepare("INSERT INTO live_recordings(id,owner_id,title,state,next_sequence,bytes,created_at,updated_at) VALUES(?,?,?,'closing',1,1,?,?)").run(id,'owner','Priority',Date.now(),Date.now());
 const started=Date.now();
 await until(()=>db.prepare('SELECT state FROM live_recordings WHERE id=?').get(id).state==='ready',8000);
 assert.ok(Date.now()-started<8000,'archive must not wait for the 12-second peaks analysis');
 assert.equal(db.prepare('SELECT state FROM audio_peaks WHERE audio_key=?').get(key)?.state,undefined,'preemption is not a failed analysis');
 await until(async()=>{try{return (await readFile(marker,'utf8')).trim().split('\n').length>=2;}catch{return false;}});
 worker.kill('SIGTERM');
 let deadline;const result=await Promise.race([exited,new Promise((_,reject)=>{deadline=setTimeout(()=>reject(new Error('SIGTERM stalled')),5000);})]).finally(()=>clearTimeout(deadline));
 assert.equal(result.code,0,logs);assert.doesNotMatch(logs,/TypeError/);
 console.log('PASS: real FFmpeg peaks keep heartbeat alive, yield to archive, resume and shut down cleanly');
}finally{
 if(worker&&worker.exitCode===null){worker.kill('SIGKILL');await new Promise(resolve=>worker.once('exit',resolve));}
 db?.close();await rm(dir,{recursive:true,force:true});
}
