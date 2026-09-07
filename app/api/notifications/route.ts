import {getDb} from '@/db';
import {failure,originCheck,result} from '@/lib/server';
import {newDeviceToken,pushKeys,sendNotice,siteOrigin,tokenHash,validateSubscription} from '@/lib/push';
export const runtime='nodejs';
const db=()=>getDb().$client;
function device(req:Request){const token=req.headers.get('x-push-token')??'';if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw new Error('Отключи и заново включи уведомления на этом устройстве.');return tokenHash(token);}
export async function GET(req:Request){try{
 const id=new URL(req.url).searchParams.get('id');let current=null;
 if(id)current=db().prepare('SELECT preferences FROM push_subscriptions WHERE id=? AND manage_hash=?').get(id,device(req))??null;
 return result({publicKey:(await pushKeys()).publicKey,current});
 }catch(e){return failure(e);}}
export async function POST(req:Request){try{
 originCheck(req);const d=await req.json() as Record<string,unknown>;
 if(d.action==='subscribe'){
  const sub=validateSubscription(d.subscription),id=tokenHash(sub.endpoint),preferences=Number(d.preferences);if(!Number.isInteger(preferences)||preferences<0||preferences>7)throw new Error('Некорректные настройки');
  await crypto.subtle.importKey('raw',Buffer.from(sub.keys.p256dh,'base64url'),{name:'ECDH',namedCurve:'P-256'},false,[]);
  const prior=db().prepare('SELECT manage_hash FROM push_subscriptions WHERE id=?').get(id) as {manage_hash:string}|undefined;
  if(prior&&prior.manage_hash!==device(req))return result({error:'Подписка принадлежит другому устройству'},403);
  const token=prior?null:newDeviceToken(),manageHash=prior?.manage_hash??tokenHash(token!);
  const saved=db().prepare(`INSERT INTO push_subscriptions(id,manage_hash,subscription,preferences,created_at)
   SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM push_subscriptions WHERE id=?) OR (SELECT COUNT(*) FROM push_subscriptions)<100
   ON CONFLICT(id) DO UPDATE SET preferences=excluded.preferences,subscription=excluded.subscription WHERE push_subscriptions.manage_hash=excluded.manage_hash RETURNING id`).get(id,manageHash,JSON.stringify(sub),preferences,Date.now(),id);
  if(!saved)throw new Error('Лимит пилота — 100 устройств с уведомлениями.');return result({id,token,preferences});
 }
 const id=String(d.id??''),manageHash=device(req),sub=db().prepare('SELECT subscription FROM push_subscriptions WHERE id=? AND manage_hash=?').get(id,manageHash) as {subscription:string}|undefined;
 if(d.action==='unsubscribe'){db().prepare('DELETE FROM push_subscriptions WHERE id=? AND manage_hash=?').run(id,manageHash);return result({ok:true});}
 if(!sub)return result({error:'Подписка не найдена'},404);if(d.action!=='test')throw new Error('Неизвестное действие');
 const claimed=db().prepare('UPDATE push_subscriptions SET tested_at=? WHERE id=? AND manage_hash=? AND tested_at<?').run(Date.now(),id,manageHash,Date.now()-30000);if(!claimed.changes)return result({error:'Повтори проверку через 30 секунд'},429);
 const r=await sendNotice(JSON.parse(sub.subscription),{title:'True Thrills',body:'Проверка уведомлений. Новые эфиры и публикации будут приходить сюда.',url:'/?mode=listen&view=settings',tag:'test'},siteOrigin(req),120);await r.body?.cancel();if(!r.ok)throw new Error('Сервис не принял уведомление. Выключи и включи уведомления заново.');return result({accepted:true});
 }catch(e){return failure(e);}}
