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
export function failure(e: unknown){const msg=e instanceof Error?e.message:'#err.request';return result({error:msg},msg==='#err.ownerOnly'?403:400);}
export function bucket(){return localBucket();}
export async function hash(s: string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(b=>b.toString(16).padStart(2,'0')).join('');}
