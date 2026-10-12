'use client';
import {useEffect,useState} from 'react';
import {ChevronRight,Clock,Play,Radio,Share2} from 'lucide-react';
import {homeScene,heroPicture,type ScenePost} from '@/lib/home-scene';
import {audioCategoryOf,kindTagKey} from '@/lib/audio-category';
import {isLiveArchive} from '@/lib/player-presentation';
import {readProgress,readResumeHidden} from '@/lib/listening-progress';
import {useT} from '@/components/i18n-provider';
import {clock,haptic,coverSrc} from '@/lib/client';
import {Artwork} from './artwork';

/**
 * Главная слушателя на ПК (концепция «Студия звука», выбрана владельцем
 * 8 октября; первый экран переделан 9 октября, каталог — 12 октября).
 *
 * Первый экран — ровно высота окна: сверху обложка во всю ширину, под ней
 * строка с типом, названием и кнопками, под строкой — первый ряд блока
 * «Новое в True Thrills» целиком. Плитки считают свой размер из высоты окна,
 * поэтому ряд не уходит за край экрана ни на каком окне (выбор владельца
 * 12 октября: ряд целиком на экране, а не крупные плитки с прокруткой).
 *
 * Поверх обложки ничего не кладём: на ней своя надпись (выбор владельца —
 * «под обложкой, поверх ничего»). Обложка — отдельная картинка 4:1 (2400×600) из
 * студии; нет её — постер или обложка выпуска целиком на размытом фоне.
 *
 * «Новое в True Thrills» — один блок на весь каталог с переключателями
 * Все / Аудио / Видео / Истории / Архив эфиров (выбор владельца 12 октября
 * вместо полок по разделам: при малом каталоге полки стояли почти пустыми).
 * Переключатель есть, только если в его группе что-то опубликовано.
 * Блока поддержки внизу нет: владелец убрал его 9 октября и оставил это
 * решение 12 октября.
 *
 * Телефон и планшет этот компонент не видят: им — HomeSceneView.
 */
type Live={id:string;title:string;cover:boolean};
export type DeskPost=ScenePost&{audioKey?:string|null;audioCategory?:string|null};

/** Плитка выпуска: карточка с обложкой и подписью. Открывает выпуск вся
 *  карточка; «Поделиться» — отдельная кнопка рядом, не внутри первой, и
 *  видна всегда, а не только под мышью: с клавиатуры и пальцем тоже. */
export function DeskTile<T extends DeskPost>({post,onOpen,onShare,wide}:{post:T;onOpen:(p:T)=>void;onShare?:(p:T)=>void;wide?:boolean}){
 const {t,tag}=useT();
 const meta=post.duration>0?clock(post.duration):new Date(post.createdAt).toLocaleDateString(tag);
 // Запись эфира без выбранного автором типа — так и подписана, а не «Подкаст».
 const kind=post.kind==='podcast'&&isLiveArchive(post.audioKey)&&!audioCategoryOf(post.audioCategory)?'post.liveArchive':kindTagKey(post);
 return <article className={'desk-tile'+(wide?' is-wide':'')}>
  <button type="button" className="desk-tile-open" title={post.title} onClick={()=>{haptic();onOpen(post);}}>
   <span className="desk-cover">
    <Artwork src={coverSrc(post,wide?640:480)} loading="lazy" decoding="async" referrerPolicy="no-referrer" fallback={<img className="desk-cover-mark" src="/brand/logo.png?v=0.4.1" alt="" width="72" height="72"/>}/>
    <span className="desk-tag">{t(kind)}</span>
    <span className="desk-tile-play" aria-hidden="true"><Play size={16} fill="currentColor"/></span>
   </span>
   <span className="desk-tile-copy"><strong>{post.title}</strong><span className="desk-tile-meta">{meta}</span></span>
  </button>
  {onShare&&<button type="button" className="desk-tile-share" aria-label={t('share.action')+' · '+post.title} title={t('share.action')} onClick={()=>{haptic();onShare(post);}}><Share2 size={14}/></button>}
 </article>;
}

/** Блок плиток: заголовок (справа — переключатели, если есть) и сетка.
 *  Плитки переносятся на следующие ряды — блок показывает всё, что в нём есть. */
export function DeskShelf<T extends DeskPost>({title,posts,onOpen,onShare,tools,className}:{title:string;posts:T[];onOpen:(p:T)=>void;onShare?:(p:T)=>void;tools?:React.ReactNode;className?:string}){
 if(!posts.length)return null;
 return <section className={'desk-shelf'+(className?' '+className:'')} aria-label={title}>
  <div className="desk-shelf-head"><h2>{title}</h2>{tools}</div>
  <div className="desk-grid">{posts.map(p=><DeskTile key={p.id} post={p} onOpen={onOpen} onShare={onShare}/>)}</div>
 </section>;
}

type Group='podcast'|'video'|'story'|'archive';
const GROUPS:{id:Group;key:string}[]=[{id:'podcast',key:'nav.podcasts'},{id:'video',key:'nav.videos'},{id:'story',key:'nav.stories'},{id:'archive',key:'live.archiveTitle'}];

export function DeskHome<T extends DeskPost>({posts,live,liveAction,onOpen,onOpenLive,onShare,pinned,poster,wide,noHero}:{
 posts:T[];live:Live|null;liveAction:string;onOpen:(post:T,resume?:boolean)=>void;onOpenLive:()=>void;
 onShare:(post:T)=>void;pinned?:string|null;poster?:{post:string;src:string}|null;wide?:{post:string;src:string}|null;noHero?:string[];
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
 const heroWide=hero&&wide&&wide.post===hero.id?wide.src:'';
 const heroAction=heroResume?t('home.continue'):hero?.kind==='podcast'?t('post.listen'):hero?.kind==='video'?t('post.watch'):t('post.read');
 const [group,setGroup]=useState<Group|'all'>('all');
 const archives=new Set(noHero??[]);
 const groupOf=(p:T):Group=>archives.has(p.id)?'archive':p.kind as Group;
 // Каждый выпуск — один раз, даже если сервер прислал его дважды.
 const published=[...new Map(posts.filter(p=>p.published===1).map(p=>[p.id,p])).values()].sort((a,b)=>b.createdAt-a.createdAt);
 const groups=GROUPS.filter(g=>published.some(p=>groupOf(p)===g.id));
 const active=groups.some(g=>g.id===group)?group:'all';
 // Выпуск с обложки не повторяется в блоке, пока смотрят всё подряд: он прямо
 // над блоком. В выбранной группе он есть — иначе его там не найти.
 const fresh=published.filter(p=>active==='all'?p.id!==hero?.id:groupOf(p)===active);
 const chips=groups.length>1&&<div className="desk-chips" role="toolbar" aria-label={t('desk.freshTitle')}>
  <button type="button" className="desk-chip" aria-pressed={active==='all'} onClick={()=>setGroup('all')}>{t('desk.seeAll')}</button>
  {groups.map(g=><button key={g.id} type="button" className="desk-chip" aria-pressed={active===g.id} onClick={()=>setGroup(g.id)}>{t(g.key)}</button>)}
 </div>;
 const freshBlock=<DeskShelf className="desk-fresh" title={t('desk.freshTitle')} posts={fresh} onOpen={p=>onOpen(p)} onShare={onShare} tools={chips||undefined}/>;
 return <div className="desk-home">
  {live&&<button type="button" className="desk-onair" onClick={()=>{haptic();onOpenLive();}}>
   <span className="desk-onair-dot" aria-hidden="true"/><Radio size={20}/>
   <span className="desk-onair-copy"><span>{t('live.authorOnAir')}</span><strong>{live.title}</strong></span>
   <span className="desk-onair-action">{liveAction}<ChevronRight size={18}/></span>
  </button>}
  {hero?<section className="desk-hero">
   <button type="button" className={'desk-banner'+(heroWide?' is-wide':'')} aria-label={heroAction+' · '+hero.title} onClick={()=>{haptic();onOpen(hero,!!heroResume);}}>
    {/* Обложка 4:1 из студии — целиком, без обрезки; если рамка из-за
        низкого окна стала шире 4:1, бока закрывает её же размытая копия. */}
    {heroWide?<><img className="desk-banner-blur" src={heroWide} alt="" aria-hidden="true" referrerPolicy="no-referrer"/>
     <img className="desk-banner-wide" src={heroWide} alt="" referrerPolicy="no-referrer"/></>:<>
     {heroCover&&<img className="desk-banner-blur" src={heroCover} alt="" aria-hidden="true" referrerPolicy="no-referrer"/>}
     <Artwork className="desk-banner-art" src={heroCover} referrerPolicy="no-referrer" fallback={<img className="desk-cover-mark" src="/brand/logo.png?v=0.4.1" alt="" width="132" height="132"/>}/></>}
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
  {freshBlock}
  {resume&&!heroResume&&<button type="button" className="desk-resume" onClick={()=>{haptic();onOpen(resume.post,true);}}>
   <Clock size={18}/><span>{t('home.continue')}</span><strong>{resume.post.title}</strong><span className="desk-resume-time">{clock(resume.position)}</span><ChevronRight size={17}/>
  </button>}
 </div>;
}
