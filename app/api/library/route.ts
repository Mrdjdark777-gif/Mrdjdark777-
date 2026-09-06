import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { broadcasts, posts, settings } from '@/db/schema';
import { bucket, failure, originCheck, owner, requireOwner, result, setting, userId } from '@/lib/server';
export async function GET(req: Request){try{
  const isOwner=await owner(req),db=getDb();
  const items=await db.select().from(posts).where(isOwner?undefined:eq(posts.published,1)).orderBy(desc(posts.createdAt));
  const live=await db.select().from(broadcasts).where(eq(broadcasts.active,1)).orderBy(desc(broadcasts.heartbeat)).get();
  return result({items,isOwner,needsSetup:!(await setting('owner')),signedIn:!!userId(req),donation:await setting('donation'),live:live&&live.heartbeat>Date.now()-90000?{id:live.id,title:live.title}:null});
}catch(e){return failure(e);}}
export async function POST(req: Request){try{
  originCheck(req);const d=await req.json() as Record<string,unknown>,db=getDb();
  if(d.action==='setup'){
    const id=userId(req);if(!id)return result({error:'Войдите в аккаунт'},401);
    // Bootstrap only while platform audience is owner-private; bind permanently before sharing.
    await db.insert(settings).values({key:'owner',value:id}).onConflictDoNothing();
    if(!await owner(req))return result({error:'Студия уже закреплена за автором'},403);
    return result({ok:true});
  }
  await requireOwner(req);
  if(d.action==='donation'){
    const value=String(d.url??'').trim();if(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password)throw new Error('Нужна платёжная ссылка HTTPS');}
    await db.insert(settings).values({key:'donation',value}).onConflictDoUpdate({target:settings.key,set:{value}});return result({ok:true});
  }
  if(d.action==='delete'){
    const p=await db.select().from(posts).where(eq(posts.id,String(d.id))).get();
    if(p){await db.delete(posts).where(eq(posts.id,p.id));if(p.audioKey)await bucket().delete(p.audioKey);}return result({ok:true});
  }
  if(d.action==='visibility'){await db.update(posts).set({published:d.published?1:0}).where(eq(posts.id,String(d.id)));return result({ok:true});}
  const title=String(d.title??'').trim(),kind=String(d.kind??'');
  if(!title||title.length>160)throw new Error('Укажите название до 160 символов');
  if(!['podcast','story'].includes(kind))throw new Error('Неверный тип публикации');
  const body=String(d.body??'');if(body.length>150000)throw new Error('История слишком длинная');if(kind==='story'&&!body.trim())throw new Error('Добавьте текст истории');
  const audioKey=kind==='podcast'?String(d.audioKey??''):null;
  if(kind==='podcast'){
    if(!audioKey?.startsWith('audio/'))throw new Error('Добавьте аудиозапись');
    const obj=await bucket().head(audioKey);if(!obj||obj.customMetadata?.owner!==userId(req))throw new Error('Аудиофайл не найден');
  }
  const id=d.id?String(d.id):crypto.randomUUID();
  const values={kind,title,description:String(d.description??'').slice(0,2000),body,audioKey,duration:Math.max(0,Math.min(86400,Math.floor(Number(d.duration)||0))),published:d.published?1:0};
  if(d.id)await db.update(posts).set(values).where(eq(posts.id,id));else await db.insert(posts).values({id,...values,createdAt:Date.now()});
  return result({id});
}catch(e){return failure(e);}}
