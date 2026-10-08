'use client';
import {useEffect,useState} from 'react';
import {ChevronRight,Clock,Play,Radio,Share2} from 'lucide-react';
import {homeScene,heroPicture,type ScenePost} from '@/lib/home-scene';
import {kindTagKey} from '@/lib/audio-category';
import {readProgress,readResumeHidden} from '@/lib/listening-progress';
import {useT} from '@/components/i18n-provider';
import {clock,haptic,coverSrc} from '@/lib/client';
import {Artwork} from './artwork';

/**
 * Главная слушателя на ПК (концепция «Студия звука», выбрана владельцем
 * 8 октября): широкий баннер с постером, под ним строка с типом, названием и
 * кнопками, ниже — полки выпусков по одному ряду.
 *
 * Постер показывается целиком, без обрезки, — на нём своя надпись, и поверх
 * неё мы ничего не кладём (то же правило, что на телефоне). Бока баннера
 * заполняет размытая копия той же картинки.
 *
 * Телефон и планшет этот компонент не видят: им — HomeSceneView.
 */
type Live={id:string;title:string;cover:boolean};
export type DeskPost=ScenePost&{audioKey?:string|null};

export function DeskTile<T extends DeskPost>({post,onOpen}:{post:T;onOpen:(p:T)=>void}){
 const {t,tag}=useT();
 const meta=post.duration>0?clock(post.duration):new Date(post.createdAt).toLocaleDateString(tag);
 return <button type="button" className="desk-tile" title={post.title} onClick={()=>{haptic();onOpen(post);}}>
  <span className="desk-cover">
   <Artwork src={coverSrc(post,480)} loading="lazy" decoding="async" referrerPolicy="no-referrer" fallback={<img className="desk-cover-mark" src="/brand/logo.png?v=0.4.1" alt="" width="72" height="72"/>}/>
   <span className="desk-tag">{t(kindTagKey(post))}</span>
   <span className="desk-tile-play" aria-hidden="true"><Play size={16} fill="currentColor"/></span>
  </span>
  <strong>{post.title}</strong>
  <span className="desk-tile-meta">{meta}</span>
 </button>;
}

/** Полка — один ряд плиток: лишние уходят за край ряда, а не во второй ряд. */
export function DeskShelf<T extends DeskPost>({title,posts,onOpen,onAll,allLabel}:{title:string;posts:T[];onOpen:(p:T)=>void;onAll?:()=>void;allLabel?:string}){
 if(!posts.length)return null;
 return <section className="desk-shelf" aria-label={title}>
  <div className="desk-shelf-head"><h2>{title}</h2>{onAll&&<button type="button" className="desk-shelf-all" onClick={()=>{haptic();onAll();}}>{allLabel}<ChevronRight size={16}/></button>}</div>
  <div className="desk-row">{posts.map(p=><DeskTile key={p.id} post={p} onOpen={onOpen}/>)}</div>
 </section>;
}

export function DeskHome<T extends DeskPost>({posts,live,liveAction,onOpen,onOpenLive,onShare,onGoto,pinned,poster,noHero}:{
 posts:T[];live:Live|null;liveAction:string;onOpen:(post:T,resume?:boolean)=>void;onOpenLive:()=>void;
 onShare:(post:T)=>void;onGoto:(view:string)=>void;pinned?:string|null;poster?:{post:string;src:string}|null;noHero?:string[];
}){
 const {t}=useT();
 const [progress,setProgress]=useState<ReturnType<typeof readProgress>>([]);
 // Прогресс лежит в хранилище устройства — читаем после первой отрисовки.
 useEffect(()=>{
  const update=()=>{const off=readResumeHidden();setProgress(readProgress().filter(p=>!off.includes(p.id)));};
  const timer=setTimeout(update,0);window.addEventListener('tt-progress',update);
  return()=>{clearTimeout(timer);window.removeEventListener('tt-progress',update);};
 },[]);
 const picked=homeScene({posts,progress,seen:[],hidden:[],pinned,noHero});
 const hero=picked.hero?posts.find(p=>p.id===picked.hero!.id)??null:null;
 const resume=picked.resume?{...picked.resume,post:posts.find(p=>p.id===picked.resume!.post.id)!}:null;
 const heroResume=resume?.post.id===hero?.id?resume:null;
 const heroCover=hero?heroPicture(hero.id,poster,coverSrc(hero)):'';
 const heroAction=heroResume?t('home.continue'):hero?.kind==='podcast'?t('post.listen'):hero?.kind==='video'?t('post.watch'):t('post.read');
 const archives=new Set(noHero??[]);
 const published=posts.filter(p=>p.published===1).sort((a,b)=>b.createdAt-a.createdAt);
 const fresh=published.filter(p=>p.id!==hero?.id).slice(0,12);
 const ofKind=(kind:string)=>published.filter(p=>p.kind===kind&&!archives.has(p.id)).slice(0,12);
 const records=published.filter(p=>archives.has(p.id)).slice(0,12);
 return <div className="desk-home">
  {live&&<button type="button" className="desk-onair" onClick={()=>{haptic();onOpenLive();}}>
   <span className="desk-onair-dot" aria-hidden="true"/><Radio size={20}/>
   <span className="desk-onair-copy"><span>{t('live.authorOnAir')}</span><strong>{live.title}</strong></span>
   <span className="desk-onair-action">{liveAction}<ChevronRight size={18}/></span>
  </button>}
  {hero?<section className="desk-hero">
   <button type="button" className="desk-banner" aria-label={heroAction+' · '+hero.title} onClick={()=>{haptic();onOpen(hero,!!heroResume);}}>
    {heroCover&&<img className="desk-banner-blur" src={heroCover} alt="" aria-hidden="true" referrerPolicy="no-referrer"/>}
    <Artwork className="desk-banner-art" src={heroCover} referrerPolicy="no-referrer" fallback={<img className="desk-cover-mark" src="/brand/logo.png?v=0.4.1" alt="" width="132" height="132"/>}/>
   </button>
   <div className="desk-hero-bar">
    <div className="desk-hero-copy">
     <span className="desk-eyebrow">{t(kindTagKey(hero))}{hero.duration>0?' · '+clock(hero.duration):''}</span>
     <h1 className="desk-hero-title">{hero.title}</h1>
     {hero.description&&<p className="desk-hero-note">{hero.description}</p>}
    </div>
    <div className="desk-hero-actions">
     <button type="button" className="desk-cta" onClick={()=>{haptic();onOpen(hero,!!heroResume);}}><Play size={18} fill="currentColor"/>{heroAction}{heroResume&&heroResume.position>0&&<span className="desk-cta-time">· {clock(heroResume.position)}</span>}</button>
     <button type="button" className="desk-ghost" onClick={()=>{haptic();onShare(hero);}}><Share2 size={17}/>{t('share.action')}</button>
    </div>
   </div>
  </section>:<section className="desk-hero is-empty"><h1 className="desk-hero-title">{t('home.emptyTitle')}</h1><p className="desk-hero-note">{t('home.emptyNote')}</p></section>}
  {resume&&!heroResume&&<button type="button" className="desk-resume" onClick={()=>{haptic();onOpen(resume.post,true);}}>
   <Clock size={18}/><span>{t('home.continue')}</span><strong>{resume.post.title}</strong><span className="desk-resume-time">{clock(resume.position)}</span><ChevronRight size={17}/>
  </button>}
  <DeskShelf title={t('home.freshList')} posts={fresh} onOpen={p=>onOpen(p)}/>
  <DeskShelf title={t('nav.podcasts')} posts={ofKind('podcast')} onOpen={p=>onOpen(p)} onAll={()=>onGoto('podcasts')} allLabel={t('desk.seeAll')}/>
  <DeskShelf title={t('nav.videos')} posts={ofKind('video')} onOpen={p=>onOpen(p)} onAll={()=>onGoto('videos')} allLabel={t('desk.seeAll')}/>
  <DeskShelf title={t('nav.stories')} posts={ofKind('story')} onOpen={p=>onOpen(p)} onAll={()=>onGoto('stories')} allLabel={t('desk.seeAll')}/>
  <DeskShelf title={t('live.archiveTitle')} posts={records} onOpen={p=>onOpen(p)} onAll={()=>onGoto('live')} allLabel={t('desk.seeAll')}/>
 </div>;
}
