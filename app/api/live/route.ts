import {requireRecordingCapacity} from '@/lib/live-recording';
import {enqueueNotice,siteOrigin} from '@/lib/push';
import { and, desc, eq, gt, lt } from 'drizzle-orm';
import { getDb } from '@/db';
import { liveRecordings, broadcasts, peers } from '@/db/schema';
import { failure, hash, originCheck, requireOwner, result, userId } from '@/lib/server';
export async function GET(req: Request){try{
  const q=new URL(req.url).searchParams,db=getDb();
  if(q.has('status')){const live=await db.select().from(broadcasts).where(and(eq(broadcasts.active,1),gt(broadcasts.heartbeat,Date.now()-90000))).orderBy(desc(broadcasts.heartbeat)).get();return result({live:live?{id:live.id,title:live.title}:null});}
  if(q.get('host')){await requireOwner(req);const b=await db.select().from(broadcasts).where(eq(broadcasts.id,q.get('host')!)).get();return result({active:!!b?.active,peers:await db.select({id:peers.id,offer:peers.offer,answer:peers.answer,heartbeat:peers.heartbeat}).from(peers).where(and(eq(peers.broadcastId,q.get('host')!),gt(peers.heartbeat,Date.now()-90000)))});}
  const p=await db.select().from(peers).where(eq(peers.id,q.get('peer')??'')).get();
  if(!p||p.tokenHash!==await hash(req.headers.get('x-peer-token')??''))return result({error:'#err.sessionGone'},404);
  const live=await db.select().from(broadcasts).where(eq(broadcasts.id,p.broadcastId)).get();return result({answer:p.answer,active:!!live?.active&&live.heartbeat>Date.now()-90000});
}catch(e){return failure(e);}}
export async function POST(req: Request){try{
  originCheck(req);const d=await req.json() as Record<string,unknown>,db=getDb(),now=Date.now();
  if(['start','stop','heartbeat','answer'].includes(String(d.action))){
    await requireOwner(req);
    if(d.action==='start'){
      if(d.transport==='hls')await requireRecordingCapacity();
      if(!String(d.title??'').trim())throw new Error('#err.liveTitle');
      const current=await db.select().from(broadcasts).where(and(eq(broadcasts.active,1),gt(broadcasts.heartbeat,now-90000))).get();if(current)throw new Error('#err.liveBusy');
      await db.update(broadcasts).set({active:0});await db.delete(peers);
      const id=crypto.randomUUID();await db.insert(broadcasts).values({id,title:String(d.title).slice(0,160),ownerId:userId(req)!,heartbeat:now,active:1});if(d.transport==='hls')await db.insert(liveRecordings).values({id,ownerId:userId(req)!,title:String(d.title).slice(0,160),createdAt:now,updatedAt:now});enqueueNotice('live:'+id,1,{titleKey:'push.liveTitle',body:String(d.title).slice(0,160),url:'/?mode=listen&view=live&broadcast='+id,tag:'live:'+id},siteOrigin(req),120);return result({id});
    }
    if(d.action==='stop'){await db.update(liveRecordings).set({state:'closing'}).where(and(eq(liveRecordings.id,String(d.id)),eq(liveRecordings.state,'receiving')));await db.update(broadcasts).set({active:0}).where(eq(broadcasts.id,String(d.id)));return result({ok:true});}
    if(d.action==='heartbeat'){const b=await db.select().from(broadcasts).where(eq(broadcasts.id,String(d.id))).get();if(!b?.active)return result({error:'#err.liveGone'},409);await db.update(broadcasts).set({heartbeat:now}).where(eq(broadcasts.id,String(d.id)));if(Array.isArray(d.connected)){for(const id of d.connected.slice(0,8)){if(typeof id==='string')await db.update(peers).set({heartbeat:now}).where(and(eq(peers.id,id),eq(peers.broadcastId,b.id)));}}await db.delete(peers).where(lt(peers.heartbeat,now-60000));return result({ok:true});}
    if(String(d.answer??'').length>40000)throw new Error('#err.badAnswer');await db.update(peers).set({answer:String(d.answer)}).where(eq(peers.id,String(d.peer)));return result({ok:true});
  }
  if(d.action==='join'){
    const live=await db.select().from(broadcasts).where(eq(broadcasts.id,String(d.id))).get();if(!live?.active||live.heartbeat<now-90000)throw new Error('#err.liveGone');
    const active=await db.select({id:peers.id}).from(peers).where(and(eq(peers.broadcastId,live.id),gt(peers.heartbeat,now-90000)));if(active.length>=8)throw new Error('#err.liveFull');
    const hls=await db.select().from(liveRecordings).where(eq(liveRecordings.id,live.id)).get();
    const offer=hls?'hls':String(d.offer??'');if(offer.length>40000)throw new Error('#err.badOffer');const parsed=hls?{type:'offer',sdp:''}:JSON.parse(offer);if(parsed.type!=='offer'||typeof parsed.sdp!=='string')throw new Error('#err.badOffer');
    const id=crypto.randomUUID(),token=crypto.randomUUID();await db.insert(peers).values({id,broadcastId:live.id,tokenHash:await hash(token),offer,heartbeat:now});return result({id,token});
  }
  const p=await db.select().from(peers).where(eq(peers.id,String(d.peer))).get();if(!p||p.tokenHash!==await hash(String(d.token??'')))return result({error:'#err.sessionGone'},404);
  if(d.action==='leave')await db.delete(peers).where(eq(peers.id,p.id));else await db.update(peers).set({heartbeat:now}).where(eq(peers.id,p.id));return result({ok:true});
}catch(e){return failure(e);}}
