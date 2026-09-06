import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { settings } from '@/db/schema';
export function userId(req: Request) { return req.headers.get('oai-authenticated-user-id'); }
export async function setting(key: string) { return (await getDb().select().from(settings).where(eq(settings.key,key)).get())?.value ?? ''; }
export async function owner(req: Request) { const id=userId(req); return !!id && id===await setting('owner'); }
export function originCheck(req: Request) {const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)throw new Error('Недопустимый источник запроса');}
export async function requireOwner(req: Request) {originCheck(req);if(!await owner(req))throw new Error('Доступ только для автора');}
export function result(data: unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store'}});}
export function failure(e: unknown){const msg=e instanceof Error?e.message:'Не удалось выполнить запрос';return result({error:msg},msg.includes('автора')?403:400);}
export function bucket(){if(!env.BUCKET)throw new Error('Хранилище аудио недоступно');return env.BUCKET;}
export async function hash(s: string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(b=>b.toString(16).padStart(2,'0')).join('');}
