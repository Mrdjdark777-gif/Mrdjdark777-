import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,renameSync,writeFileSync,statfsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {eq,and,gt,desc} from 'drizzle-orm';
import {getDb} from '@/db';
import {broadcasts,liveRecordings,posts,peers} from '@/db/schema';
import {failure,requireOwner,result,owner,hash} from '@/lib/server';
import {liveId,liveRoot} from '@/lib/live-recording';
export const runtime='nodejs';
export async function GET(req:Request){try{
 const q=new URL(req.url).searchParams,id=q.get('id')||'',db=getDb();
 if(q.has('list')){await requireOwner(req);return result({recordings:await db.select().from(liveRecordings).orderBy(desc(liveRecordings.createdAt)).limit(25).all()});}
 if(!liveId(id))return result({error:'#err.notFound'},404);
 const recording=await db.select().from(liveRecordings).where(eq(liveRecordings.id,id)).get();
 if(!recording)return result({error:'#err.notFound'},404);
 const post=recording.postId?await db.select().from(posts).where(eq(posts.id,recording.postId)).get():null;
 const privileged=await owner(req);
 if(recording.state==='ready'&&!post?.published&&!privileged)return result({error:'#err.notFound'},404);
 const file=q.get('file');
 if(!file)return result({id,title:recording.title,state:recording.state,ready:!!recording.playlist,postId:recording.postId,
  ...(privileged?{bytes:recording.bytes,received:recording.nextSequence,error:recording.error,listeners:(await db.select().from(peers).where(and(eq(peers.broadcastId,id),gt(peers.heartbeat,Date.now()-90000))).all()).length}:{})});
 if(file==='index.m3u8'){
  const peerId=q.get('peer'),token=q.get('token');
  if(peerId&&token){const peer=await db.select().from(peers).where(and(eq(peers.id,peerId),eq(peers.broadcastId,id))).get();if(peer?.tokenHash===await hash(token))await db.update(peers).set({heartbeat:Date.now()}).where(eq(peers.id,peerId));}

  if(!recording.playlist)return result({error:'#err.livePreparing'},503,{'Retry-After':'2'});
  const playlist=await readFile(path.join(liveRoot(),id,recording.playlist),'utf8');
  const generation=recording.playlist.split('/')[0];
  const body=playlist.split('\n').map(line=>line&&!line.startsWith('#')?'?id='+id+'&file='+generation+'/'+line:line).join('\n');
  return new Response(body,{headers:{'Content-Type':'application/vnd.apple.mpegurl','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }
 if(!/^g-[a-f0-9-]{36}\/seg-\d{6}\.ts$/.test(file))return result({error:'#err.notFound'},404);
 const bytes=await readFile(path.join(liveRoot(),id,file));
 return new Response(bytes,{headers:{'Content-Type':'video/mp2t','Cache-Control':'private, max-age=30','X-Content-Type-Options':'nosniff'}});
}catch{return result({error:'#err.notFound'},404);}}
export async function POST(req:Request){try{
 await requireOwner(req);const q=new URL(req.url).searchParams,id=q.get('id')||'';
 if(!liveId(id))throw new Error('#err.notFound');
 if(q.has('retry')){const db=getDb();const row=await db.select().from(liveRecordings).where(eq(liveRecordings.id,id)).get();if(row?.state!=='failed'||!row.nextSequence)throw new Error('#err.liveSequence');await db.update(liveRecordings).set({state:'closing',error:null}).where(and(eq(liveRecordings.id,id),eq(liveRecordings.state,'failed')));return result({ok:true});}
 const seq=Number(q.get('seq'));if(!Number.isSafeInteger(seq)||seq<0||seq>=14400)throw new Error('#err.liveLimit');
 if(!req.body)throw new Error('#err.uploadEmpty');
 const reader=req.body.getReader(),parts:Uint8Array[]=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1024*1024){await reader.cancel();throw new Error('#err.uploadSize');}parts.push(value);}
 if(!size)throw new Error('#err.uploadEmpty');const bytes=Buffer.concat(parts),digest=createHash('sha256').update(bytes).digest('hex');
 const db=getDb();
 return db.transaction(tx=>{
  const row=tx.select().from(liveRecordings).where(eq(liveRecordings.id,id)).get();if(!row)throw new Error('#err.notFound');
  const dir=path.join(liveRoot(),id,'chunks'),file=path.join(dir,String(seq).padStart(6,'0')+'.webm');
  if(seq<row.nextSequence){if(!existsSync(file)||createHash('sha256').update(readFileSync(file)).digest('hex')!==digest)throw new Error('#err.liveSequence');return result({ok:true,received:row.nextSequence});}
  if(row.state!=='receiving'||seq!==row.nextSequence)throw new Error('#err.liveSequence');
  if(Date.now()-row.createdAt>8*3600000||row.bytes+size>1024**3)throw new Error('#err.liveLimit');
  const fs=statfsSync(liveRoot());if(fs.bavail*fs.bsize<1024**3)throw new Error('#err.liveDisk');
  if(seq===0&&bytes.subarray(0,4).toString('hex')!=='1a45dfa3')throw new Error('#err.uploadType');
  mkdirSync(dir,{recursive:true,mode:0o700});const temp=file+'.tmp';writeFileSync(temp,bytes,{mode:0o600,flush:true});renameSync(temp,file);
  tx.update(liveRecordings).set({nextSequence:seq+1,bytes:row.bytes+size,updatedAt:Date.now()}).where(eq(liveRecordings.id,id)).run();
  tx.update(broadcasts).set({heartbeat:Date.now()}).where(eq(broadcasts.id,id)).run();
  return result({ok:true,received:seq+1});
 });
}catch(e){return failure(e);}}
