import {isIP} from 'node:net';
import {getDb} from '@/db';
import {requireOwner} from '@/lib/server';
import {makeCommunity,RULES} from './service.mjs';
const COOKIE='__Host-tt-member';let service;
const get=()=>service??=makeCommunity({db:getDb().$client,rateSecret:process.env.COMMUNITY_RATE_SECRET});
// Адрес политики и адрес для связи автор заполняет в студии, а не в
// окружении сервера: ради одной строки ходить на сервер по SSH незачем.
// Переменные окружения остаются старшими — ими можно переопределить всё.
function config(){
 const site=(process.env.PUBLIC_SITE_URL||'').replace(/\/+$/,'');
 const privacy=process.env.COMMUNITY_PRIVACY_URL||(site?site+'/privacy':'');
 const contact=process.env.COMMUNITY_CONTACT_EMAIL||stored('legalContact');
 const controller=stored('legalName');
 let valid=false;
 try{valid=new URL(privacy).protocol==='https:'&&/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact)&&!privacy.includes('CHANGE_ME')&&!contact.includes('CHANGE_ME')&&!!controller.trim();}catch{}
 return {enabled:process.env.COMMUNITY_ENABLED==='true'&&valid,privacy,contact,rules:RULES};
}
// Настройки канала лежат в той же базе. Читаем напрямую и прощаем отсутствие
// таблицы: до первой установки её может не быть.
function stored(key){try{return getDb().$client.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value||'';}catch{return '';}}
function token(req){return req.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'';}
// Без PUBLIC_SITE_URL проверять источник не с чем. Это настройка сервера, а
// не ошибка гостя, и в журнале она должна называться своим именем.
function origin(req){let configured;try{configured=new URL(process.env.PUBLIC_SITE_URL||'');}catch{throw Error('configuration');}
 if(configured.protocol!=='https:')throw Error('configuration');
 if(req.headers.get('origin')!==configured.origin)throw Error('origin');}
function ip(req){const s=req.headers.get('x-real-ip');if(process.env.TRUST_PROXY!=='true'||!isIP(s||''))throw Error('configuration');return s;}
function reply(data,status=200,cookie){const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',...(cookie!==undefined?{'Set-Cookie':COOKIE+'='+cookie+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age='+(cookie?'604800':'0')}: {})};return Response.json(data,{status,headers});}
async function body(req){if(!req.body)throw Error('invalid_input');const reader=req.body.getReader(),parts=[];let n=0;try{while(true){const r=await reader.read();if(r.done)break;n+=r.value.length;if(n>4096){await reader.cancel();throw Error('invalid_input');}parts.push(r.value);}}finally{reader.releaseLock();}try{return JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw Error('invalid_input');}}
export async function handle(req,action){try{
 const t=token(req),q=new URL(req.url).searchParams;
 if(req.method==='GET'){
  // «me» спрашивают при каждой загрузке экрана, в том числе когда сообщество
  // не включено и служба даже не может подняться. Такой ответ — не ошибка:
  // отвечаем «выключено, участника нет», не засоряя журнал сервера.
  if(action==='me'){const c=config();let member=null;try{member=get().me(t);}catch{}return reply({...c,member});}
  if(action==='queue'){await requireOwner(req);return reply({items:get().queue()});}
  if(action==='export')return reply(get().exportData(t));
  if(action==='blocks')return reply({items:get().blocks(t)});
  if(action==='comments'){if(!config().enabled)throw Error('disabled');return reply(get().list(t,q.get('live')));}
 }
 if(req.method==='POST'){
  origin(req);const b=await body(req);
  if(action==='moderate'){await requireOwner(req);return reply(get().moderate(b));}
  // Access to deletion, export and logout survives feature shutdown.
  if(action==='delete'){if(b.confirm!==true)throw Error('invalid_input');return reply(get().erase(t),200,'');}
  if(action==='logout')return reply(get().logout(t),200,'');
  if(action==='login'){const r=get().login(ip(req),b.code);return reply({ok:true},200,r.token);}
  if(!config().enabled)throw Error('disabled');
  if(action==='register'){const r=get().signup(ip(req),b.rules);return reply({code:r.code,member:r.member},201,r.token);}
  if(action==='post')return reply(get().post(t,b));
  if(action==='report')return reply(get().report(t,b.id,b.reason));
  if(action==='block')return reply(get().block(t,b.id,b.on!==false));
  if(action==='remove')return reply(get().removeOwn(t,b.id));
 }
 return reply({error:'not_found'},404);
 }catch(e){const name=e instanceof Error?e.message:'internal';const codes={origin:403,'#err.ownerOnly':403,unauthorized:401,banned:403,disabled:503,invalid_input:400,invalid_comment:400,invalid_code:401,rules_required:400,reason_required:400,rate_limit:429,not_found:404,live_ended:409,conflict:409};if(Object.hasOwn(codes,name))return reply({error:name},codes[name]);console.error('community:',/^[a-z_]+$/.test(name)?name:'internal');return reply({error:'temporarily_unavailable'},503);}}
