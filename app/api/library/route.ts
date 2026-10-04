import {enqueueNotice,siteOrigin} from '@/lib/push';
import {audioCategoryOf} from '@/lib/audio-category';
import { desc, eq ,inArray,like} from 'drizzle-orm';
import { getDb } from '@/db';
import { broadcasts, liveRecordings, posts, settings } from '@/db/schema';
import { bucket, failure, originCheck, owner, requireOwner, result, setting, userId } from '@/lib/server';
import { unlinkIfUnused } from '@/lib/media-unlink';
import { LIVE_BUSY_STATES } from '@/lib/live-states.mjs';
import { parseDonations, parseLinks, parseVideo } from '@/lib/video';
/**
 * Постер главной — только если он загружен для того выпуска, что сейчас
 * закреплён. `v` — версия для адреса картинки: адрес у постера один, и без
 * версии телефон показывал бы прежний.
 */
async function posterOf(){
  const key=await setting('heroArt'),post=await setting('heroArtPost');
  if(!key||!post||post!==await setting('heroPost'))return null;
  return {post,v:key.replace(/^cover\//,'')};
}
export async function GET(req: Request){try{
  const isOwner=await owner(req),db=getDb();
  const items=await db.select().from(posts).where(isOwner?undefined:eq(posts.published,1)).orderBy(desc(posts.createdAt));
  const usage=isOwner?await db.select().from(settings).where(like(settings.key,'usage:%')):[];
  const counts=new Map(usage.map(row=>[row.key.slice(6),Number(row.value)||0]));
  const live=await db.select({id:broadcasts.id,title:broadcasts.title,description:broadcasts.description,heartbeat:broadcasts.heartbeat,startedAt:liveRecordings.createdAt,coverKey:broadcasts.coverKey}).from(broadcasts).leftJoin(liveRecordings,eq(liveRecordings.id,broadcasts.id)).where(eq(broadcasts.active,1)).orderBy(desc(broadcasts.heartbeat)).get();
  // Запись только что закончившегося эфира появляется не сразу: воркер её
  // сшивает и перекодирует. Пока это идёт, слушателю честнее сказать «запись
  // готовится», чем показывать пустой архив, будто записей не было вовсе.
  const pending=await db.select({id:liveRecordings.id}).from(liveRecordings)
    .where(inArray(liveRecordings.state,[...LIVE_BUSY_STATES])).get();
  return result({archivePending:!!pending,items:isOwner?items.map(p=>({...p,...(p.kind!=='video'?{usageCount:counts.get(p.id)??0}:{})})):items,isOwner,needsSetup:!(await setting('owner')),signedIn:!!userId(req),donations:parseDonations(await setting('donations')),links:parseLinks(await setting('links')),pinned:(await setting('heroPost'))||null,poster:await posterOf(),...(isOwner?{legal:{name:await setting('legalName'),contact:await setting('legalContact')}}:{}),calmArt:((await setting('calmArt'))||'').replace(/^cover\//,'')||null,live:live&&live.heartbeat>Date.now()-90000?{id:live.id,title:live.title,description:live.description,startedAt:live.startedAt,cover:!!live.coverKey}:null});
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
  // Ответственный за данные и адрес для связи. Их показывают политика
  // конфиденциальности и правила, и без них оба документа не действуют —
  // поэтому хранятся они там же, где остальные настройки канала, а не в
  // окружении сервера: автор должен мочь заполнить их сам.
  if(d.action==='legal'){
    const name=String(d.name??'').trim(),contact=String(d.contact??'').trim();
    if(name&&(name.length<2||name.length>120))throw new Error('#err.legalName');
    if(contact&&(contact.length>160||!/^[^@\s,;:<>"']+@[^@\s,;:<>"']+\.[a-zA-Z]{2,}$/.test(contact)))throw new Error('#err.legalContact');
    await db.insert(settings).values({key:'legalName',value:name}).onConflictDoUpdate({target:settings.key,set:{value:name}});
    await db.insert(settings).values({key:'legalContact',value:contact}).onConflictDoUpdate({target:settings.key,set:{value:contact}});
    return result({ok:true});
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
  // Постер главной и то, что открывает нажатие на него. Постер рисуется под
  // кадр 15:7 и держится отдельно от обложки выпуска: обложка 4:5 нужна
  // карусели, каталогу и плееру, а постер — только кадру.
  //
  // Постер привязан к выпуску, для которого его загрузили. Выбрал другой
  // выпуск и не загрузил новый постер — в кадре обложка нового выпуска, а не
  // чужая афиша с чужим названием. Пустой id возвращает кадру обычный выбор.
  if(d.action==='hero'){
    const id=String(d.id??'');
    const put=(key:string,value:string)=>db.insert(settings).values({key,value}).onConflictDoUpdate({target:settings.key,set:{value}});
    if(!id){await put('heroPost','');await put('heroArt','');await put('heroArtPost','');return result({ok:true});}
    const p=await db.select().from(posts).where(eq(posts.id,id)).get();
    if(!p)throw new Error('#err.notFound');
    if(!p.published)throw new Error('#err.pinDraft');
    if(typeof d.key==='string'){
      const key=d.key.trim();
      if(key){if(!key.startsWith('cover/'))throw new Error('#err.coverUpload');const obj=await bucket().head(key);if(!obj||obj.customMetadata?.owner!==userId(req))throw new Error('#err.coverNotFound');}
      await put('heroArt',key);await put('heroArtPost',key?id:'');
    }
    await put('heroPost',id);return result({ok:true});
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
      // Сначала снимаем ссылку, потом решаем судьбу файла. Обложка бывает
      // общей у нескольких архивов — при старте эфира переиспользуется
      // обложка предыдущего, — и безусловное удаление файла оставляло
      // соседний выпуск с ключом, по которому приходит 404.
      await db.delete(settings).where(eq(settings.key,'usage:'+p.id));
      await db.delete(posts).where(eq(posts.id,p.id));
      await unlinkIfUnused(p.audioKey);
      await unlinkIfUnused(p.coverKey);
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
  // Тип аудиоматериала. Прислан — обязан быть одним из трёх. Не прислан вовсе
  // (студия старой версии правит запись) — остаётся сохранённый: правка
  // названия не должна стирать выбранный тип. Публиковать аудио без типа
  // нельзя: новая запись и запись, у которой тип сняли, его требуют. Старую
  // опубликованную запись без типа старая студия сохранить может — иначе
  // правка подписи у неё сломалась бы до обновления студии.
  let audioCategory:string|null=null;
  const sentCategory=Object.prototype.hasOwnProperty.call(d,'audioCategory');
  if(kind==='podcast'){
   if(sentCategory&&d.audioCategory!==null&&d.audioCategory!==''){
    audioCategory=audioCategoryOf(d.audioCategory);
    if(!audioCategory)throw new Error('#err.audioCategoryBad');
   }else if(!sentCategory&&d.id){
    const was=await db.select({c:posts.audioCategory}).from(posts).where(eq(posts.id,String(d.id))).get();
    audioCategory=audioCategoryOf(was?.c);
   }
   if(d.published&&!audioCategory&&(sentCategory||!d.id))throw new Error('#err.audioCategory');
  }
  const id=d.id?String(d.id):crypto.randomUUID();
  const values={kind,title,audioCategory,description:String(d.description??'').slice(0,2000),body,audioKey,videoUrl,coverUrl,coverKey,duration:Math.max(0,Math.min(86400,Math.floor(Number(d.duration)||0))),published:d.published?1:0};
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
