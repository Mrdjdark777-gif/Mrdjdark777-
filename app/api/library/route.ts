import {enqueueNotice,siteOrigin} from '@/lib/push';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { broadcasts, posts, settings } from '@/db/schema';
import { bucket, failure, originCheck, owner, requireOwner, result, setting, userId } from '@/lib/server';
import { parseDonations, parseLinks, parseVideo } from '@/lib/video';
export async function GET(req: Request){try{
  const isOwner=await owner(req),db=getDb();
  const items=await db.select().from(posts).where(isOwner?undefined:eq(posts.published,1)).orderBy(desc(posts.createdAt));
  const live=await db.select().from(broadcasts).where(eq(broadcasts.active,1)).orderBy(desc(broadcasts.heartbeat)).get();
  return result({items,isOwner,needsSetup:!(await setting('owner')),signedIn:!!userId(req),donations:parseDonations(await setting('donations')),links:parseLinks(await setting('links')),live:live&&live.heartbeat>Date.now()-90000?{id:live.id,title:live.title}:null});
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
  if(d.action==='donations'){
    // parseDonations отбрасывает всё, что не HTTPS и не из известного списка платформ.
    const clean=parseDonations(JSON.stringify(d.links??[])),value=clean.length?JSON.stringify(clean):'';
    if(Array.isArray(d.links)&&d.links.length&&!clean.length)throw new Error('#err.donationsUrl');
    await db.insert(settings).values({key:'donations',value}).onConflictDoUpdate({target:settings.key,set:{value}});return result({ok:true});
  }
  if(d.action==='links'){
    // parseLinks отбрасывает всё, что не HTTPS и не из известного списка площадок.
    const clean=parseLinks(JSON.stringify(d.links??[])),value=clean.length?JSON.stringify(clean):'';
    if(Array.isArray(d.links)&&d.links.length&&!clean.length)throw new Error('#err.linksUrl');
    await db.insert(settings).values({key:'links',value}).onConflictDoUpdate({target:settings.key,set:{value}});return result({ok:true});
  }
  if(d.action==='delete'){
    const p=await db.select().from(posts).where(eq(posts.id,String(d.id))).get();
    if(p){await db.delete(posts).where(eq(posts.id,p.id));if(p.audioKey)await bucket().delete(p.audioKey);}return result({ok:true});
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
  const audioKey=kind==='podcast'?String(d.audioKey??''):null;
  if(kind==='podcast'){
    if(!audioKey?.startsWith('audio/'))throw new Error('#err.audioMissing');
    const obj=await bucket().head(audioKey);if(!obj||obj.customMetadata?.owner!==userId(req))throw new Error('#err.audioNotFound');
  }
  const id=d.id?String(d.id):crypto.randomUUID();
  const values={kind,title,description:String(d.description??'').slice(0,2000),body,audioKey,videoUrl,coverUrl,duration:Math.max(0,Math.min(86400,Math.floor(Number(d.duration)||0))),published:d.published?1:0};
  if(d.id)await db.update(posts).set(values).where(eq(posts.id,id));else await db.insert(posts).values({id,...values,createdAt:Date.now()});
  if(values.published)notifyPost({id,...values},req);return result({id});
}catch(e){return failure(e);}}

// Видео идёт в ту же категорию, что и подкаст: это «новый выпуск» для
// подписчика, и старые подписки (preferences=7) продолжают его получать.
const NOTICE={podcast:{category:2,titleKey:'push.newPodcast',view:'podcasts'},video:{category:2,titleKey:'push.newVideo',view:'videos'},story:{category:4,titleKey:'push.newStory',view:'stories'}} as const;
function notifyPost(p:{id:string;kind:string;title:string},req:Request){const n=NOTICE[p.kind as keyof typeof NOTICE]??NOTICE.story;enqueueNotice('post:'+p.id,n.category,{titleKey:n.titleKey,body:p.title,url:'/?mode=listen&view='+n.view+'&post='+encodeURIComponent(p.id),tag:'post:'+p.id},siteOrigin(req),86400);}
