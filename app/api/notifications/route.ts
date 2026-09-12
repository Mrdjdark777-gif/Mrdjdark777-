import {getDb} from '@/db';
import {failure,originCheck,result} from '@/lib/server';
import {newDeviceToken,pushKeys,renderNotice,sendFcmNotice,sendNotice,siteOrigin,tokenHash,validateFcmToken,validateSubscription} from '@/lib/push';
import {DEFAULT_LOCALE,isLocale,localeFromHeader} from '@/lib/i18n';
export const runtime='nodejs';
const db=()=>getDb().$client;
function device(req:Request){const token=req.headers.get('x-push-token')??'';if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw new Error('#err.resubscribe');return tokenHash(token);}
export async function GET(req:Request){try{
 const id=new URL(req.url).searchParams.get('id');let current=null;
 if(id)current=db().prepare('SELECT preferences FROM push_subscriptions WHERE id=? AND manage_hash=?').get(id,device(req))??null;
 return result({publicKey:(await pushKeys()).publicKey,current});
 }catch(e){return failure(e);}}
export async function POST(req:Request){try{
 originCheck(req);const d=await req.json() as Record<string,unknown>;
 if(d.action==='subscribe'){
  const kind=d.kind==='fcm'?'fcm':'webpush';
  let id:string,subJson:string;
  if(kind==='fcm'){const fcmToken=validateFcmToken(d.token);id=tokenHash(fcmToken);subJson=JSON.stringify({token:fcmToken});}
  else{const sub=validateSubscription(d.subscription);id=tokenHash(sub.endpoint);subJson=JSON.stringify(sub);await crypto.subtle.importKey('raw',Buffer.from(sub.keys.p256dh,'base64url'),{name:'ECDH',namedCurve:'P-256'},false,[]);}
  const preferences=Number(d.preferences);if(!Number.isInteger(preferences)||preferences<0||preferences>7)throw new Error('#err.badPreferences');
  // Язык уведомлений — язык устройства: веб-клиент присылает свой активный,
  // Android-мост — язык системы. Заголовок запроса остаётся запасным вариантом.
  const locale=isLocale(d.locale)?d.locale:localeFromHeader(req.headers.get('accept-language'));
  const prior=db().prepare('SELECT manage_hash FROM push_subscriptions WHERE id=?').get(id) as {manage_hash:string}|undefined;
  if(prior&&prior.manage_hash!==device(req))return result({error:'#err.subscriptionOther'},403);
  const token=prior?null:newDeviceToken(),manageHash=prior?.manage_hash??tokenHash(token!);
  const saved=db().transaction(()=>{
   if(kind==='fcm'&&typeof d.previousId==='string'&&d.previousId&&d.previousId!==id){
    const removed=db().prepare("DELETE FROM push_subscriptions WHERE id=? AND manage_hash=? AND kind='fcm'").run(d.previousId,device(req));
    if(!removed.changes)throw new Error('#err.subscriptionOther');
   }
   const row=db().prepare(`INSERT INTO push_subscriptions(id,manage_hash,subscription,kind,locale,preferences,created_at)
   SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM push_subscriptions WHERE id=?) OR (SELECT COUNT(*) FROM push_subscriptions)<100
   ON CONFLICT(id) DO UPDATE SET preferences=excluded.preferences,subscription=excluded.subscription,locale=excluded.locale WHERE push_subscriptions.manage_hash=excluded.manage_hash RETURNING id`).get(id,manageHash,subJson,kind,locale,preferences,Date.now(),id);
  if(!row)throw new Error('#err.deviceLimit');return row;})();
  if(!saved)throw new Error('#err.deviceLimit');return result({id,token,preferences});
 }
 const id=String(d.id??''),manageHash=device(req),sub=db().prepare('SELECT subscription,kind,locale FROM push_subscriptions WHERE id=? AND manage_hash=?').get(id,manageHash) as {subscription:string;kind:string;locale:string}|undefined;
 if(d.action==='unsubscribe'){db().prepare('DELETE FROM push_subscriptions WHERE id=? AND manage_hash=?').run(id,manageHash);return result({ok:true});}
 if(!sub)return result({error:'#err.subscriptionMissing'},404);if(d.action!=='test')throw new Error('#err.unknownAction');
 const claimed=db().prepare('UPDATE push_subscriptions SET tested_at=? WHERE id=? AND manage_hash=? AND tested_at<?').run(Date.now(),id,manageHash,Date.now()-30000);if(!claimed.changes)return result({error:'#err.testTooSoon'},429);
 const notice=renderNotice({titleKey:'push.testTitle',bodyKey:'push.testBody',url:'/?mode=listen&view=settings',tag:'test'},isLocale(sub.locale)?sub.locale:DEFAULT_LOCALE);
 const r=sub.kind==='fcm'?await sendFcmNotice(JSON.parse(sub.subscription).token,notice):await sendNotice(JSON.parse(sub.subscription),notice,siteOrigin(req),120);
 await r.body?.cancel();if(!r.ok)throw new Error('#err.testRejected');return result({accepted:true});
 }catch(e){return failure(e);}}
