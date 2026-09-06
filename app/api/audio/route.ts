import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { posts } from '@/db/schema';
import { bucket, failure, owner, requireOwner, result, userId } from '@/lib/server';
const MAX=80*1024*1024;
export async function POST(req: Request){try{
  await requireOwner(req);const mime=(req.headers.get('content-type')??'').split(';')[0];
  if(!['audio/webm','audio/mp4','audio/mpeg','audio/wav','audio/x-wav','audio/ogg','audio/flac','audio/aac'].includes(mime))throw new Error('Поддерживаются MP3, WAV, M4A, WebM, OGG и FLAC');
  const size=Number(req.headers.get('x-upload-size')??req.headers.get('content-length'));
  if(!Number.isSafeInteger(size)||size<=0||size>MAX)throw new Error('Укажите размер файла: от 1 байта до 80 МБ');if(!req.body)throw new Error('Пустой файл');
  const fixed=new FixedLengthStream(size);
  const key='audio/'+crypto.randomUUID();
  await Promise.all([req.body.pipeTo(fixed.writable),bucket().put(key,fixed.readable,{httpMetadata:{contentType:mime},customMetadata:{owner:userId(req)!}})]);return result({key});
}catch(e){return failure(e);}}
export async function GET(req: Request){try{
  const id=new URL(req.url).searchParams.get('id')??'';
  const p=await getDb().select().from(posts).where(eq(posts.id,id)).get();
  if(!p?.audioKey||(!p.published&&!await owner(req)))return new Response('Не найдено',{status:404});
  const obj=await bucket().get(p.audioKey,{range:req.headers});if(!obj)return new Response('Не найдено',{status:404});
  const h=new Headers({'Accept-Ranges':'bytes','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});obj.writeHttpMetadata(h);h.set('ETag',obj.httpEtag);
  const range=obj.range;if(range&&'offset' in range&&'length' in range){const start=range.offset??0,length=range.length??obj.size;h.set('Content-Range',`bytes ${start}-${start+length-1}/${obj.size}`);h.set('Content-Length',String(length));return new Response(obj.body,{status:206,headers:h});}
  h.set('Content-Length',String(obj.size));return new Response(obj.body,{headers:h});
}catch(e){return failure(e);}}
