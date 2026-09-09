#!/usr/bin/env node
// Dedicated systemd process; never ties a broadcast or archive to a Next request.
import Database from 'better-sqlite3';
import {spawn,execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile,rename,stat,rm} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
const root=path.resolve(process.env.LIVE_DIR||'data/live'),storage=path.resolve(process.env.STORAGE_DIR||'data/storage');
await mkdir(root,{recursive:true,mode:0o700});await mkdir(path.join(storage,'audio'),{recursive:true});
execFileSync('ffmpeg',['-version'],{stdio:'ignore'});execFileSync('ffprobe',['-version'],{stdio:'ignore'});
const db=new Database(process.env.DATABASE_PATH||'data/truethrills.db');db.pragma('busy_timeout = 5000');db.pragma('journal_mode = WAL');
const active=new Map(),children=new Set();let quitting=false;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function atomic(file,data){const tmp=file+'.tmp';await writeFile(tmp,data,{mode:0o600});await rename(tmp,file);}
async function processRecording(row){
 const dir=path.join(root,row.id),generation='g-'+randomUUID(),out=path.join(dir,generation);await mkdir(out,{recursive:true,mode:0o700});
 const archive=path.join(out,'archive.m4a');
 const args=['-hide_banner','-loglevel','error','-nostdin','-y','-protocol_whitelist','file,pipe','-f','matroska','-i','pipe:0',
  '-map','0:a:0','-vn','-c:a','aac','-b:a','128k','-ar','48000','-ac','2','-f','hls','-hls_time','3','-hls_list_size','0','-hls_flags','temp_file','-hls_segment_filename',path.join(out,'seg-%06d.ts'),path.join(out,'index.m3u8'),
  '-map','0:a:0','-vn','-c:a','aac','-b:a','128k','-ar','48000','-ac','2','-movflags','+faststart',archive];
 const ff=spawn('ffmpeg',args,{stdio:['pipe','ignore','pipe']});children.add(ff);ff.once('close',()=>children.delete(ff));let errorText='',exited=false,code=null;
 ff.stderr.on('data',b=>{errorText=(errorText+b.toString()).slice(-3000);});
 ff.stdin.on('error',()=>{}); // The write callback and exit status carry the failure.
 const exit=new Promise(resolve=>{ff.on('error',e=>{errorText=e.message;exited=true;resolve(-1);});ff.on('close',c=>{exited=true;code=c;resolve(c);});});
 let seq=0,announced=false;
 try{
  while(!quitting){
   const current=db.prepare('SELECT * FROM live_recordings WHERE id=?').get(row.id);if(!current)throw new Error('Recording metadata missing');
   if(exited)throw new Error('Encoder exited: '+code);
   if(!announced){try{const list=await readFile(path.join(out,'index.m3u8'),'utf8');if(list.includes('#EXTINF:')){db.prepare('UPDATE live_recordings SET playlist=? WHERE id=?').run(generation+'/index.m3u8',row.id);announced=true;}}catch{}}
   if(seq<current.next_sequence){const bytes=await readFile(path.join(dir,'chunks',String(seq).padStart(6,'0')+'.webm'));await new Promise((resolve,reject)=>ff.stdin.write(bytes,e=>e?reject(e):resolve()));seq++;continue;}
   if(current.state==='receiving'&&(Date.now()-current.updated_at>90000||Date.now()-current.created_at>8*3600000)){
    db.transaction(()=>{db.prepare("UPDATE live_recordings SET state='closing' WHERE id=? AND state='receiving'").run(row.id);db.prepare('UPDATE broadcasts SET active=0 WHERE id=?').run(row.id);})();
   }else if(current.state!=='receiving')break;
   await delay(250);
  }
  if(quitting){ff.stdin.destroy();ff.kill('SIGTERM');await exit;return;} // Retain chunks; restart rebuilds both outputs.
  db.prepare("UPDATE live_recordings SET state='processing' WHERE id=?").run(row.id);
  ff.stdin.end();const timeout=setTimeout(()=>ff.kill('SIGKILL'),120000);const rc=await exit;clearTimeout(timeout);
  if(rc!==0||seq===0)throw new Error(errorText||'No audio received');
  const duration=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',archive],{encoding:'utf8',timeout:15000}).trim());
  if(!Number.isFinite(duration)||duration<=0)throw new Error('Invalid archive duration');
  const key='audio/live-'+row.id,final=path.join(storage,key);await rename(archive,final);
  const size=(await stat(final)).size;
  await atomic(final+'.meta.json',JSON.stringify({contentType:'audio/mp4',customMetadata:{owner:row.owner_id},size,etag:randomUUID()}));
  db.transaction(()=>{
   db.prepare("INSERT INTO posts(id,kind,title,description,body,audio_key,duration,published,created_at) VALUES(?,'podcast',?,'','','',0,1,?) ON CONFLICT(id) DO NOTHING").run(row.id,row.title,row.created_at);
   db.prepare('UPDATE posts SET audio_key=?,duration=? WHERE id=?').run(key,Math.round(duration),row.id);
   db.prepare("UPDATE live_recordings SET state='ready',post_id=?,playlist=?,error=NULL,updated_at=? WHERE id=?").run(row.id,generation+'/index.m3u8',Date.now(),row.id);
   db.prepare('UPDATE broadcasts SET active=0 WHERE id=?').run(row.id);
   const event='post:'+row.id;
   if(db.prepare('INSERT OR IGNORE INTO push_events(id,created_at) VALUES(?,?)').run(event,Date.now()).changes){
    const payload=JSON.stringify({titleKey:'push.newPodcast',body:row.title,url:'/?mode=listen&view=podcasts&post='+row.id,tag:event});
    db.prepare(`INSERT INTO push_outbox(id,subscription_id,payload,origin,category,expires_at) SELECT ?||':'||id,id,?,?,2,? FROM push_subscriptions WHERE (preferences & 2)!=0`).run(event,payload,process.env.PUBLIC_SITE_URL||'https://truethrills.com',Date.now()+86400000);
   }
  })();
  console.log(JSON.stringify({event:'archive-ready',id:row.id,seconds:Math.round(duration),bytes:size}));
 }catch(error){
  ff.kill('SIGKILL');await exit;
  if(!quitting){db.prepare("UPDATE live_recordings SET state='failed',error=? WHERE id=?").run(String(error.message).slice(0,500),row.id);db.prepare('UPDATE broadcasts SET active=0 WHERE id=?').run(row.id);console.error(JSON.stringify({event:'archive-failed',id:row.id}));}
 }
}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{quitting=true;for(const child of children){child.stdin.destroy();child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),3000);timer.unref();}});
while(!quitting){
 await atomic(path.join(root,'worker.json'),JSON.stringify({at:Date.now()}));
 for(const row of db.prepare("SELECT * FROM live_recordings WHERE state IN ('receiving','closing','processing')").all()){
  if(!active.has(row.id)){const task=processRecording(row).finally(()=>active.delete(row.id));active.set(row.id,task);}
 }
 await delay(1000);
}
await rm(path.join(root,'worker.json'),{force:true});await Promise.allSettled([...active.values()]);db.close();
