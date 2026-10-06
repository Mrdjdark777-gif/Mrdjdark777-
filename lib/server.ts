import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { settings } from '@/db/schema';
import { localBucket } from '@/lib/storage';
import { sessionUserId } from '@/lib/auth';
export function userId(req: Request) { return sessionUserId(req); }
export async function setting(key: string) { return (await getDb().select().from(settings).where(eq(settings.key,key)).get())?.value ?? ''; }
export async function owner(req: Request) { const id=userId(req); return !!id && id===await setting('owner'); }
export function originCheck(req: Request) {
  const origin=req.headers.get('origin');if(!origin)return;
  // Compare host only, not scheme: behind an nginx reverse proxy the
  // scheme Next.js infers for req.url can differ from what the browser
  // sent as Origin even for a legitimate same-site request, since scheme
  // detection depends on proxy headers rather than the Host header.
  let originHost:string;try{originHost=new URL(origin).host;}catch{throw new Error('#err.badOrigin');}
  const host=req.headers.get('host');
  if(!host||originHost!==host)throw new Error('#err.badOrigin');
}
export async function requireOwner(req: Request) {originCheck(req);if(!await owner(req))throw new Error('#err.ownerOnly');}
export function result(data: unknown,status=200,extraHeaders?:Record<string,string>){return Response.json(data,{status,headers:{'Cache-Control':'no-store',...extraHeaders}});}
export function failure(e: unknown){const msg=e instanceof Error?e.message:'#err.request';return result({error:msg},msg==='#err.ownerOnly'?403:msg==='#err.requestTooLarge'?413:400);}
/** Пределы тел небольших запросов. Раньше тело читалось целиком (req.json),
 *  и только потом что-то проверялось: публичный маршрут можно было завалить
 *  мегабайтами, а nginx пропускает до 320M — это предел для аудио. */
export const BODY_SMALL=16*1024,BODY_LIVE=64*1024,BODY_STORY=1024*1024;
/** Тело читается потоком и обрывается, как только перевалит за предел:
 *  ни заявленный, ни настоящий размер больше предела в память не попадает. */
export async function readText(req: Request,limit: number){
  const declared=Number(req.headers.get('content-length'));
  if(Number.isFinite(declared)&&declared>limit)throw new Error('#err.requestTooLarge');
  if(!req.body)return '';
  const reader=req.body.getReader(),parts:Uint8Array[]=[];let size=0;
  for(;;){
    const {done,value}=await reader.read();if(done)break;
    size+=value.byteLength;
    if(size>limit){await reader.cancel().catch(()=>{});throw new Error('#err.requestTooLarge');}
    parts.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(parts));
}
/** JSON-объект из тела с пределом размера; всё, что не объект, — ошибка запроса. */
export async function readJson(req: Request,limit: number){
  const text=await readText(req,limit);let d:unknown;
  try{d=JSON.parse(text);}catch{throw new Error('#err.request');}
  if(!d||typeof d!=='object'||Array.isArray(d))throw new Error('#err.request');
  return d as Record<string,unknown>;
}
export function bucket(){return localBucket();}
export async function hash(s: string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(b=>b.toString(16).padStart(2,'0')).join('');}
