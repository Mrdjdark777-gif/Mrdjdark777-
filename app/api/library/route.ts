import {enqueueNotice,siteOrigin} from '@/lib/push';
import { desc, eq ,inArray} from 'drizzle-orm';
import { getDb } from '@/db';
import { broadcasts, liveRecordings, posts, settings } from '@/db/schema';
import { bucket, failure, originCheck, owner, requireOwner, result, setting, userId } from '@/lib/server';
import { parseDonations, parseLinks, parseVideo } from '@/lib/video';
export async function GET(req: Request){try{
  const isOwner=await owner(req),db=getDb();
  const items=await db.select().from(posts).where(isOwner?undefined:eq(posts.published,1)).orderBy(desc(posts.createdAt));
  const live=await db.select({id:broadcasts.id,title:broadcasts.title,description:broadcasts.description,heartbeat:broadcasts.heartbeat,startedAt:liveRecordings.createdAt,coverKey:broadcasts.coverKey}).from(broadcasts).leftJoin(liveRecordings,eq(liveRecordings.id,broadcasts.id)).where(eq(broadcasts.active,1)).orderBy(desc(broadcasts.heartbeat)).get();
  // Запись только что закончившегося эфира появляется не сразу: воркер её
  // сшивает и перекодирует. Пока это идёт, слушателю честнее сказать «запись
  // готовится», чем показывать пустой архив, будто записей не было вовсе.
  const pending=await db.select({id:liveRecordings.id}).from(liveRecordings)
    .where(inArray(liveRecordings.state,['receiving','closing','processing'])).get();
  return result({archivePending:!!pending,items,isOwner,needsSetup:!(await setting('owner')),signedIn:!!userId(req),donations:parseDonations(await setting('donations')),links:parseLinks(await setting('links')),pinned:(await setting('heroPost'))||null,calmArt:((await setting('calmArt'))||'').replace(/^cover\//,'')||null,live:live&&live.heartbeat>Date.now()-90000?{id:live.id,title:live.title,description:live.description,startedAt:live.startedAt,cover:!!live.coverKey}:null});
}catch(e){return failure(e);}}
export async function POST(req: Request){try{
  originCheck(req);const d=await req.json() as Record<string,unknown>,db=getDb();
  if(d.action==='setup'){
    const id=userId(req);if(!id)return result({error:'#err.signIn'},401);
    // Bootstrap only while platform audience is owner-private; bind permanently before sharing.
    await db.insert(settings).values({key:'owner',value:id}).onConflictDoNothing();
    if(!await owner(req))return result({error:'#err.studioClaimed'},403);
    return result({ok:true});
  }
  await requireOwner(req);
  // Картинка круга покоя. Держится отдельным ключом, а не переиспользует фон
  // канала: одна картинка для уведомления и другая для дыхания — разные вещи.
  if(d.action==='calmArt'){
    const key=String(d.key??'').trim();
    if(key){if(!key.startsWith('cover/'))throw new Error('#err.coverUpload');const obj=await bucket().head(key);if(!obj||obj.customMetadata?.owner!==userId(req))throw new Error('#err.coverNotFound');}
    await db.insert(settings).values({key:'calmArt',value:key}).onConflictDoUpdate({target:settings.key,set:{value:key}});return result({ok:true});
  }
  if(d.action==='channelArt'){
    const key=String(d.key??'').trim();
    if(key){if(!key.startsWith('cover/'))throw new Error('#err.coverUpload');const obj=await bucket().head(key);if(!obj||obj.customMetadata?.owner!==userId(req))throw new Error('#err.coverNotFound');}
    await db.insert(settings).values({key:'channelArt',value:key}).onConflictDoUpdate({target:settings.key,set:{value:key}});return result({ok:true});
  }
  if(d.action==='donations'){
    // parseDonations отбрасывает всё, что не HTTPS и не из известного списка платформ.
    const clean=parseDonations(JSON.stringify(d.links??[])),value=clean.length?JSON.stringify(clean):'';
    if(Array.isArray(d.links)&&d.links.length&&!clean.length)throw new Error('#err.donationsUrl');
    await db.insert(settings).values({key:'donations',value}).onConflictDoUpdate({target:settings.key,set:{value}});return result({ok:true});
  }
  // Кадр главной держит публикация, выбранная автором: иначе выложенные
  // следом истории вытесняют видео, ради которого всё затевалось. Пустая
  // строка снимает закрепление, чужой id не сохраняется.
  if(d.action==='pin'){
    const id=String(d.id??'');
    let value='';
    if(id){
      const p=await db.select().from(posts).where(eq(posts.id,id)).get();
      if(!p)throw new Error('#err.notFound');
      if(!p.published)throw new Error('#err.pinDraft');
      value=id;
    }
    await db.insert(settings).values({key:'heroPost',value}).onConflictDoUpdate({target:settings.key,set:{value}});return result({ok:true});
  }
  if(d.action==='links'){
    // parseLinks отбрасывает всё, что не HTTPS и не из известного списка площадок.
    const clean=parseLinks(JSON.stringify(d.links??[])),value=clean.length?JSON.stringify(clean):'';
    if(Array.isArray(d.links)&&d.links.length&&!clean.length)throw new Error('#err.linksUrl');
    await db.insert(settings).values({key:'links',value}).onConflictDoUpdate({target:settings.key,set:{value}});return result({ok:true});
  }
  if(d.action==='delete'){
    const p=await db.select().from(posts).where(eq(posts.id,String(d.id))).get();
    if(p){
      await db.delete(posts).where(eq(posts.id,p.id));
      if(p.audioKey)await bucket().delete(p.audioKey);
      // Обложка выпуска-архива и обложка эфира — один и тот же файл: воркер
      // переносит её на выпуск при публикации. Снять ссылку нужно до удаления
      // файла, иначе в базе остаётся указатель в пустоту — на нём спотыкалась
      // проверка бэкапа, а уборка молча уносила и сам эфир.
      if(p.coverKey){await db.update(broadcasts).set({coverKey:null}).where(eq(broadcasts.coverKey,p.coverKey));await bucket().delete(p.coverKey);}
    }return result({ok:true});
  }
  if(d.action==='visibility'){const p=await db.update(posts).set({published:d.published?1:0}).where(eq(posts.id,String(d.id))).returning().get();if(p?.published)notifyPost(p,req);return result({ok:true});}
  const title=String(d.title??'').trim(),kind=String(d.kind??'');
  if(!title||title.length>160)throw new Error('#err.titleLength');
  if(!['podcast','story','video'].includes(kind))throw new Error('#err.badKind');
  const body=String(d.body??'');if(body.length>150000)throw new Error('#err.storyTooLong');if(kind==='story'&&!body.trim())throw new Error('#err.storyEmpty');
  let videoUrl:string|null=null;
  if(kind==='video'){
    videoUrl=String(d.videoUrl??'').trim();
    if(!parseVideo(videoUrl))throw new Error('#err.videoUrl');
    if(videoUrl.length>2000)throw new Error('#err.videoUrlLong');
  }
  const coverUrl=String(d.coverUrl??'').trim()||null;
  if(coverUrl){const u=new URL(coverUrl);if(coverUrl.length>2000||u.protocol!=='https:'||u.username||u.password)throw new Error('#err.coverUrl');}
  const coverKey=String(d.coverKey??'').trim()||null;
  if(coverKey){if(!coverKey.startsWith('cover/'))throw new Error('#err.coverUpload');const obj=await bucket().head(coverKey);if(!obj||obj.customMetadata?.owner!==userId(req))throw new Error('#err.coverNotFound');}
  const audioKey=kind==='podcast'?String(d.audioKey??''):null;
  if(kind==='podcast'){
    if(!audioKey?.startsWith('audio/'))throw new Error('#err.audioMissing');
    const obj=await bucket().head(audioKey);if(!obj||obj.customMetadata?.owner!==userId(req))throw new Error('#err.audioNotFound');
  }
  const id=d.id?String(d.id):crypto.randomUUID();
  const values={kind,title,description:String(d.description??'').slice(0,2000),body,audioKey,videoUrl,coverUrl,coverKey,duration:Math.max(0,Math.min(86400,Math.floor(Number(d.duration)||0))),published:d.published?1:0};
  // Правка несуществующего выпуска раньше проходила молча: update менял ноль
  // строк, маршрут отвечал «сохранено», а студия закрывала окно и теряла
  // набранный текст. Теперь такой id — ошибка, и правка остаётся на экране.
  if(d.id){if(!await db.update(posts).set(values).where(eq(posts.id,id)).returning().get())throw new Error('#err.notFound');}
  else await db.insert(posts).values({id,...values,createdAt:Date.now()});
  if(values.published)notifyPost({id,...values},req);return result({id});
}catch(e){return failure(e);}}

// Видео идёт в ту же категорию, что и подкаст: это «новый выпуск» для
// подписчика, и старые подписки (preferences=7) продолжают его получать.
const NOTICE={podcast:{category:2,titleKey:'push.newPodcast',view:'podcasts'},video:{category:2,titleKey:'push.newVideo',view:'videos'},story:{category:4,titleKey:'push.newStory',view:'stories'}} as const;
function notifyPost(p:{id:string;kind:string;title:string},req:Request){const n=NOTICE[p.kind as keyof typeof NOTICE]??NOTICE.story;enqueueNotice('post:'+p.id,n.category,{titleKey:n.titleKey,body:p.title,url:'/?mode=listen&view='+n.view+'&post='+encodeURIComponent(p.id),tag:'post:'+p.id},siteOrigin(req),86400);}
