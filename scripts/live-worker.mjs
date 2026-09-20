#!/usr/bin/env node
// Dedicated systemd process; never ties a broadcast or archive to a Next request.
import Database from 'better-sqlite3';
import {spawn,execFileSync} from 'node:child_process';
import {createReadStream} from 'node:fs';
import {mkdir,readFile,writeFile,rename,stat,rm} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
const root=path.resolve(process.env.LIVE_DIR||'data/live'),storage=path.resolve(process.env.STORAGE_DIR||'data/storage');
await mkdir(root,{recursive:true,mode:0o700});await mkdir(path.join(storage,'audio'),{recursive:true});
execFileSync('ffmpeg',['-version'],{stdio:'ignore'});execFileSync('ffprobe',['-version'],{stdio:'ignore'});
const db=new Database(process.env.DATABASE_PATH||'data/truethrills.db');db.pragma('busy_timeout = 5000');db.pragma('journal_mode = WAL');
const active=new Map(),children=new Set();let quitting=false,peaksTask=null,cancelPeaks=null;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function atomic(file,data){const tmp=file+'.tmp';await writeFile(tmp,data,{mode:0o600});await rename(tmp,file);}
// Та же контрольная сумма, что пишет lib/storage.ts при обычной загрузке:
// запись эфира попадает в хранилище мимо него, и без этого проверка бэкапа
// могла бы сверить у неё только размер.
async function sha256(file){const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}
async function processRecording(row){
 console.log(JSON.stringify({event:'live-open',id:row.id,title:String(row.title).slice(0,80),state:row.state}));
 const dir=path.join(root,row.id),generation='g-'+randomUUID(),out=path.join(dir,generation);await mkdir(out,{recursive:true,mode:0o700});
 const archive=path.join(out,'archive.m4a');
 const args=['-hide_banner','-loglevel','error','-nostdin','-y','-protocol_whitelist','file,pipe','-f','matroska','-i','pipe:0',
  '-map','0:a:0','-vn','-c:a','aac','-b:a','192k','-ar','48000','-ac','2','-f','hls','-hls_time','3','-hls_list_size','0','-hls_flags','temp_file','-hls_segment_filename',path.join(out,'seg-%06d.ts'),path.join(out,'index.m3u8'),
  '-map','0:a:0','-vn','-c:a','aac','-b:a','192k','-ar','48000','-ac','2','-movflags','+faststart',archive];
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
   // Эфир закрывается сам, если студия 90 секунд ничего не прислала. Раньше
   // это происходило молча: в журнале не оставалось ни строки, и понять,
   // почему эфир «прервался сам», было нечем. Теперь причина записывается.
   const silence=Date.now()-current.updated_at,age=Date.now()-current.created_at;
   if(current.state==='receiving'&&(silence>90000||age>8*3600000)){
    console.log(JSON.stringify({event:'live-idle-close',id:row.id,reason:silence>90000?'no-data-90s':'max-duration-8h',
     silenceSeconds:Math.round(silence/1000),onAirSeconds:Math.round(age/1000),chunks:seq}));
    db.transaction(()=>{db.prepare("UPDATE live_recordings SET state='closing' WHERE id=? AND state='receiving'").run(row.id);db.prepare('UPDATE broadcasts SET active=0 WHERE id=?').run(row.id);})();
   }else if(current.state!=='receiving'){
    console.log(JSON.stringify({event:'live-stopped',id:row.id,state:current.state,chunks:seq,onAirSeconds:Math.round(age/1000),studioReason:current.error||null}));
    break;
   }
   await delay(250);
  }
  if(quitting){ff.stdin.destroy();ff.kill('SIGTERM');await exit;return;} // Retain chunks; restart rebuilds both outputs.
  console.log(JSON.stringify({event:'live-processing',id:row.id,chunks:seq}));
  db.prepare("UPDATE live_recordings SET state='processing' WHERE id=?").run(row.id);
  ff.stdin.end();const timeout=setTimeout(()=>ff.kill('SIGKILL'),120000);const rc=await exit;clearTimeout(timeout);
  if(rc!==0||seq===0)throw new Error(errorText||'No audio received');
  const duration=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',archive],{encoding:'utf8',timeout:15000}).trim());
  if(!Number.isFinite(duration)||duration<=0)throw new Error('Invalid archive duration');
  const key='audio/live-'+row.id,final=path.join(storage,key);await rename(archive,final);
  const size=(await stat(final)).size;
  const digest=await sha256(final);
  await atomic(final+'.meta.json',JSON.stringify({contentType:'audio/mp4',customMetadata:{owner:row.owner_id},size,etag:digest,sha256:digest}));
  db.transaction(()=>{
   // Обложка, выбранная при запуске эфира, становится обложкой выпуска.
   // Раньше она жила только на странице эфира, и сохранённый подкаст оставался
   // без картинки.
   // Обложка и описание эфира становятся обложкой и описанием записи: автор
   // рассказывает, о чём эфир, один раз — перед включением.
   const broadcast=db.prepare('SELECT cover_key,description FROM broadcasts WHERE id=?').get(row.id);
   const cover=broadcast?.cover_key??null,note=broadcast?.description??'';
   db.prepare("INSERT INTO posts(id,kind,title,description,body,audio_key,duration,published,created_at) VALUES(?,'podcast',?,?,'','',0,1,?) ON CONFLICT(id) DO NOTHING").run(row.id,row.title,note,row.created_at);
   db.prepare('UPDATE posts SET audio_key=?,duration=?,cover_key=?,description=? WHERE id=?').run(key,Math.round(duration),cover,note,row.id);
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
// Куски от студии и нарезка HLS раньше не удалялись никогда: час эфира
// оставлял около 115 МБ рядом с 58 МБ выпуска, и каждый бэкап их копировал.
// Но удалять сразу нельзя. Плейлист доживает конец эфира намеренно: слушатель,
// подключённый в последнюю минуту, дотягивает по нему остаток, а закрытый
// выпуск отзывает и запись (это проверяет live-archive-integration). Поэтому
// ждём паузу и только потом сносим каталог целиком.
const CLEANUP_AFTER_MS=30*60*1000;
async function cleanupFinished(){
 const ready=db.prepare("SELECT id FROM live_recordings WHERE state='ready' AND playlist IS NOT NULL AND updated_at < ?").all(Date.now()-CLEANUP_AFTER_MS);
 for(const {id} of ready){
  if(active.has(id))continue;
  try{
   // Сначала база, потом файлы: так запрос между двумя шагами получит честный
   // 404, а не ошибку чтения наполовину удалённого каталога.
   db.prepare('UPDATE live_recordings SET playlist=NULL WHERE id=?').run(id);
   await rm(path.join(root,id),{recursive:true,force:true});
   console.log(JSON.stringify({event:'live-cleaned',id}));
  }catch(e){console.error(JSON.stringify({event:'cleanup-failed',id,error:String(e.message).slice(0,200)}));}
 }
}
// Форма звука для плеера. Тяжёлый decode нельзя делать ни в запросе, ни на
// телефоне, поэтому пики считает этот же воркер — по одному файлу за проход,
// в свободное от эфира время, и складывает в кэш по контрольной сумме файла.
// Старые выпуски заполняются тем же проходом, отдельной миграции не нужно.
const PEAK_COUNT=96,PEAK_MAX_BYTES=400*1024*1024,PEAK_TIMEOUT_MS=120000,PEAK_RETRY_MS=3600000,PEAK_ALPHABET='0123456789abcdefghijklmnopqrstuvwxyz';
function peaksFromPcm(pcm,count){
 const silent=PEAK_ALPHABET[0].repeat(count);
 if(pcm.length===0)return silent;
 const bars=new Array(count).fill(0);
 for(let i=0;i<pcm.length;i++){const bar=Math.min(count-1,Math.floor(i*count/pcm.length));const value=Math.abs(pcm[i]);if(value>bars[bar])bars[bar]=value;}
 const loudest=Math.max(...bars);
 if(loudest<=0)return silent;
 return bars.map(v=>PEAK_ALPHABET[Math.max(0,Math.min(35,Math.round(Math.sqrt(v/loudest)*35)))]).join('');
}
async function measurePeaks(){
 let interrupted=false,encoder=null;
 const cancel=()=>{interrupted=true;encoder?.kill('SIGKILL');};
 cancelPeaks=cancel;
 // Берём выпуск, у которого пиков ещё нет или файл с тех пор заменили.
 const row=db.prepare(`SELECT p.audio_key AS key FROM posts p
   LEFT JOIN audio_peaks a ON a.audio_key=p.audio_key
   WHERE p.audio_key IS NOT NULL AND p.audio_key<>''
     AND (a.audio_key IS NULL OR (a.peaks='' AND a.updated_at < ?))
   LIMIT 1`).get(Date.now()-PEAK_RETRY_MS);
 if(!row){if(cancelPeaks===cancel)cancelPeaks=null;return false;}
 const key=row.key,file=path.join(storage,key);
 const mark=(state,peaks,digest,error)=>db.prepare('INSERT INTO audio_peaks(audio_key,sha256,peaks,state,updated_at,error) VALUES(?,?,?,?,?,?) ON CONFLICT(audio_key) DO UPDATE SET sha256=excluded.sha256,peaks=excluded.peaks,state=excluded.state,updated_at=excluded.updated_at,error=excluded.error').run(key,digest??'',peaks??'',state,Date.now(),error??null);
 try{
  const info=await stat(file);
  if(info.size>PEAK_MAX_BYTES)throw new Error('Audio too large for analysis');
  const digest=await sha256(file);
  if(interrupted||quitting)return false;
  const existing=db.prepare('SELECT sha256,peaks FROM audio_peaks WHERE audio_key=?').get(key);
  if(existing&&existing.peaks&&existing.sha256===digest)return true;
  const pcm=await new Promise((resolve,reject)=>{
   const ff=spawn('ffmpeg',['-hide_banner','-v','error','-nostdin','-i',file,'-map','0:a:0','-vn','-f','s16le','-acodec','pcm_s16le','-ac','1','-ar','4000','pipe:1'],{stdio:['ignore','pipe','pipe']});
   encoder=ff;
   children.add(ff);ff.once('close',()=>children.delete(ff));
   const chunks=[];let bytes=0,message='',limitError='';
   const timer=setTimeout(()=>{limitError='Analysis timed out';ff.kill('SIGKILL');},PEAK_TIMEOUT_MS);timer.unref();
   ff.stdout.on('data',b=>{bytes+=b.length;if(bytes>64*1024*1024){limitError='Decoded audio exceeds analysis limit';ff.kill('SIGKILL');}else chunks.push(b);});
   ff.stderr.on('data',b=>{message=(message+b.toString()).slice(-500);});
   ff.on('error',e=>{clearTimeout(timer);reject(e);});
   ff.on('close',code=>{clearTimeout(timer);if(code!==0||limitError)reject(new Error(limitError||message||'Analysis failed with code '+code));else resolve(Buffer.concat(chunks));});
  });
  if(interrupted||quitting)return false;
  const samples=new Int16Array(pcm.buffer,pcm.byteOffset,Math.floor(pcm.length/2));
  const peaks=peaksFromPcm(samples,PEAK_COUNT);
  mark('ready',peaks,digest,null);
  console.log(JSON.stringify({event:'peaks-ready',key,bars:PEAK_COUNT}));
 }catch(error){
  if(interrupted||quitting)return false;
  mark('error','','',String(error.message).slice(0,300));
  console.error(JSON.stringify({event:'peaks-failed',key,error:String(error.message).slice(0,200)}));
 }finally{if(cancelPeaks===cancel)cancelPeaks=null;}
 return true;
}

for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{quitting=true;cancelPeaks?.();for(const child of children){child.stdin?.destroy();child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),3000);timer.unref();}});
while(!quitting){
 await atomic(path.join(root,'worker.json'),JSON.stringify({at:Date.now()}));
 const recordings=db.prepare("SELECT * FROM live_recordings WHERE state IN ('receiving','closing','processing')").all();
 if(recordings.length)cancelPeaks?.();
 for(const row of recordings){
  if(!active.has(row.id)){const task=processRecording(row).finally(()=>active.delete(row.id));active.set(row.id,task);}
 }
 await cleanupFinished();
 // Пики считаются только когда эфир не занимает процесс: звук важнее картинки.
 // Анализ не задерживает heartbeat и запуск нового эфира. При появлении
 // записи он прерывается без error/retry штрафа и возобновится позже.
 if(active.size===0&&!peaksTask)peaksTask=measurePeaks().catch(e=>console.error(JSON.stringify({event:'peaks-task-failed',error:String(e.message).slice(0,200)}))).finally(()=>{peaksTask=null;});
 await delay(1000);
}
await rm(path.join(root,'worker.json'),{force:true});await Promise.allSettled([...active.values(),peaksTask]);db.close();
