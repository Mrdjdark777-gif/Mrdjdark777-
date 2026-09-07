import {randomBytes,createHash} from 'node:crypto';
import {buildPushPayload,type PushSubscription} from '@block65/webcrypto-web-push';
import {getDb} from '@/db';
export type Notice={title:string;body:string;url:string;tag:string};
const sql=()=>getDb().$client;
export const tokenHash=(v:string)=>createHash('sha256').update(v).digest('hex');
export function validateSubscription(value:unknown):PushSubscription{
 const s=value as PushSubscription;if(!s||typeof s.endpoint!=='string'||s.endpoint.length>2048)throw new Error('Некорректная подписка');const u=new URL(s.endpoint);
 if(u.protocol!=='https:'||u.port||u.username||u.password||u.hash||!['fcm.googleapis.com','updates.push.services.mozilla.com'].includes(u.hostname))throw new Error('Уведомления поддерживаются в Chrome на Android и Firefox.');
 for(const [key,size] of [['p256dh',65],['auth',16]] as const){const v=s.keys?.[key];if(typeof v!=='string'||!/^[A-Za-z0-9_-]+$/.test(v)||Buffer.from(v,'base64url').length!==size)throw new Error('Некорректный ключ подписки');}
 return {endpoint:u.href,expirationTime:null,keys:{p256dh:s.keys.p256dh,auth:s.keys.auth}};
}
export async function pushKeys(){
 let row=sql().prepare("SELECT value FROM settings WHERE key='push-vapid'").get() as {value:string}|undefined;
 if(!row){const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);const publicKey=Buffer.from(await crypto.subtle.exportKey('raw',pair.publicKey)).toString('base64url'),privateKey=(await crypto.subtle.exportKey('jwk',pair.privateKey)).d!;
  sql().prepare("INSERT OR IGNORE INTO settings(key,value) VALUES('push-vapid',?)").run(JSON.stringify({publicKey,privateKey}));row=sql().prepare("SELECT value FROM settings WHERE key='push-vapid'").get() as {value:string};}
 return JSON.parse(row.value) as {publicKey:string;privateKey:string};
}
export function enqueueNotice(event:string,category:number,notice:Notice,origin:string,ttl:number){
 sql().transaction(()=>{
  const created=sql().prepare('INSERT OR IGNORE INTO push_events(id,created_at) VALUES (?,?)').run(event,Date.now());if(!created.changes)return;
  sql().prepare(`INSERT INTO push_outbox(id,subscription_id,payload,origin,category,expires_at)
   SELECT ?||':'||id,id,?,?,?,? FROM push_subscriptions WHERE (preferences & ?)!=0`).run(event,JSON.stringify(notice),origin,category,Date.now()+ttl*1000,category);
 })();
 startPushWorker();if(process.env.NODE_ENV!=='test')void flushPush().catch(()=>{});
}
export async function sendNotice(subscription:PushSubscription,notice:Notice,origin:string,ttl:number){
 const options=await buildPushPayload({data:JSON.stringify(notice),options:{ttl,urgency:notice.tag.startsWith('live:')?'high':'normal'}},validateSubscription(subscription),{...await pushKeys(),subject:origin});
 return fetch(subscription.endpoint,{...options,redirect:'manual',signal:AbortSignal.timeout(5000)});
}
export async function flushPush(){
 const now=Date.now(),jobs=sql().prepare("SELECT * FROM push_outbox WHERE state='pending' AND available_at<=? AND expires_at>? AND attempts<5 ORDER BY expires_at LIMIT 20").all(now,now) as {id:string;subscription_id:string;payload:string;origin:string;category:number;expires_at:number;attempts:number}[];
 for(let i=0;i<jobs.length;i+=5)await Promise.all(jobs.slice(i,i+5).map(async job=>{
  const claim=sql().prepare("UPDATE push_outbox SET available_at=?,attempts=attempts+1 WHERE id=? AND state='pending' AND available_at<=?").run(Date.now()+30000,job.id,now);if(!claim.changes)return;
  const sub=sql().prepare('SELECT subscription,preferences FROM push_subscriptions WHERE id=?').get(job.subscription_id) as {subscription:string;preferences:number}|undefined;let state='pending';
  if(!sub||!(sub.preferences&job.category))state='cancelled';else try{const r=await sendNotice(JSON.parse(sub.subscription),JSON.parse(job.payload),job.origin,Math.max(1,Math.floor((job.expires_at-Date.now())/1000)));if(r.ok)state='sent';else if([404,410].includes(r.status)){state='expired';sql().prepare('DELETE FROM push_subscriptions WHERE id=?').run(job.subscription_id);}else if(r.status>=300&&r.status<500&&r.status!==429)state='failed';await r.body?.cancel();}catch{}
  if(state==='pending'&&job.attempts>=4)state='failed';sql().prepare('UPDATE push_outbox SET state=?,available_at=? WHERE id=?').run(state,Date.now()+15000*2**job.attempts,job.id);
 }));
 sql().prepare('DELETE FROM push_outbox WHERE expires_at<?').run(Date.now()-86400000);
}
const workerKey=Symbol.for('true-thrills.push-worker');
export function startPushWorker(){
 if(process.env.NODE_ENV==='test'||process.env.NEXT_PHASE==='phase-production-build')return;
 const state=globalThis as typeof globalThis&{[workerKey]?:ReturnType<typeof setInterval>};if(state[workerKey])return;
 state[workerKey]=setInterval(()=>void flushPush().catch(()=>{}),5000);state[workerKey].unref();
}
export function siteOrigin(req:Request){const configured=process.env.PUBLIC_SITE_URL;if(configured){const u=new URL(configured);if(u.protocol!=='https:')throw new Error('PUBLIC_SITE_URL должен начинаться с https://');return u.origin;}return new URL(req.url).origin;}
export function newDeviceToken(){return randomBytes(32).toString('base64url');}
