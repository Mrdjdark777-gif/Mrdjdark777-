'use client';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
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
 * строка с типом, названием и кнопками, под строкой — ряд «Новое в True
 * Thrills» целиком. Плитки считают свой размер из высоты окна, поэтому ряд
 * не уходит за край экрана ни на каком окне (выбор владельца 12 октября: ряд
 * целиком на экране, а не крупные плитки с прокруткой). Плеер внизу размер
 * плиток не меняет (13 октября: «когда включаю плеер, иконки становятся
 * значительно меньше… смотрится плохо») — с плеером страница просто
 * докручивается.
 *
 * На обложке — только кнопка действия («Слушать», «Смотреть», «Читать»,
 * «Продолжить») и «Поделиться» в углу; под обложкой — одна строка описания
 * (13 октября владелец так решил вместо прежнего «под обложкой название,
 * поверх ничего»: большое название песни под картинкой путало). Обложка —
 * отдельная картинка 4:1 (2400×600) из студии; нет её — постер или обложка
 * выпуска целиком на размытом фоне.
 *
 * «Новое в True Thrills» — один ряд по центру, не больше восьми плиток, без
 * карусели и стрелок (13 октября владелец так решил). Переключателей по
 * разделам здесь нет: разделы и так в верхней строке («оно там вообще зачем,
 * если эти иконки есть сбоку»). Полок по разделам тоже нет (12 октября: при
 * малом каталоге они стояли почти пустыми).
 * Блока поддержки внизу нет: владелец убрал его 9 октября и оставил это
 * решение 12 октября.
 *
 * Телефон и планшет этот компонент не видят: им — HomeSceneView.
 */
type Live={id:string;title:string;cover:boolean};
export type DeskPost=ScenePost&{audioKey?:string|null;audioCategory?:string|null};

/** Плитка выпуска: карточка с обложкой 4:5 и подписью, открывает выпуск вся
 *  карточка. «Поделиться» на плитке нет (13 октября владелец: на каждой
 *  плитке это «смотрится грязно») — оно в плеере, на обложке главной и на
 *  крупной карточке раздела. */
export function DeskTile<T extends DeskPost>({post,onOpen}:{post:T;onOpen:(p:T)=>void}){
 const {t,tag}=useT();
 const meta=post.duration>0?clock(post.duration):new Date(post.createdAt).toLocaleDateString(tag);
 // Запись эфира без выбранного автором типа — так и подписана, а не «Подкаст».
 const kind=post.kind==='podcast'&&isLiveArchive(post.audioKey)&&!audioCategoryOf(post.audioCategory)?'post.liveArchive':kindTagKey(post);
 return <article className="desk-tile">
  <button type="button" className="desk-tile-open" title={post.title} onClick={()=>{haptic();onOpen(post);}}>
   <span className="desk-cover">
    <Artwork src={coverSrc(post,480)} loading="lazy" decoding="async" referrerPolicy="no-referrer" fallback={<img className="desk-cover-mark" src="/brand/logo.png?v=0.4.1" alt="" width="72" height="72"/>}/>
    <span className="desk-tag">{t(kind)}</span>
    <span className="desk-tile-play" aria-hidden="true"><Play size={16} fill="currentColor"/></span>
   </span>
   <span className="desk-tile-copy"><strong>{post.title}</strong><span className="desk-tile-meta">{meta}</span></span>
  </button>
 </article>;
}

/** Блок плиток: заголовок (справа — переключатели, если есть) и сетка.
 *  Плитки переносятся на следующие ряды — блок показывает всё, что в нём есть. */
export function DeskShelf<T extends DeskPost>({title,posts,onOpen,className,gridRef}:{title:string;posts:T[];onOpen:(p:T)=>void;className?:string;gridRef?:React.Ref<HTMLDivElement>}){
 if(!posts.length)return null;
 return <section className={'desk-shelf'+(className?' '+className:'')} aria-label={title}>
  <div className="desk-shelf-head"><h2>{title}</h2></div>
  <div className="desk-grid" ref={gridRef}>{posts.map(p=><DeskTile key={p.id} post={p} onOpen={onOpen}/>)}</div>
 </section>;
}

/** Сколько плиток в ряду «Новое» самое большее (решение владельца 13 октября). */
export const FRESH_MAX=8;

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
 // Каждый выпуск — один раз, даже если сервер прислал его дважды.
 const published=[...new Map(posts.filter(p=>p.published===1).map(p=>[p.id,p])).values()].sort((a,b)=>b.createdAt-a.createdAt);
 // Выпуск с обложки не повторяется в ряду: он прямо над ним.
 const candidates=published.filter(p=>p.id!==hero?.id).slice(0,FRESH_MAX);
 // Сколько плиток влезает в один ряд — считаем по ширине, до отрисовки
 // кадра: лишние не рисуем вовсе, иначе до них дошёл бы Tab, а глазу их не
 // видно.
 const grid=useRef<HTMLDivElement>(null);
 const [fit,setFit]=useState(FRESH_MAX);
 useLayoutEffect(()=>{
  const el=grid.current;if(!el)return;
  const measure=()=>{
   const tile=(el.firstElementChild as HTMLElement|null)?.getBoundingClientRect().width??0;if(!tile)return;
   const gap=parseFloat(getComputedStyle(el).columnGap)||0;
   setFit(Math.max(1,Math.min(FRESH_MAX,Math.floor((el.clientWidth+gap)/(tile+gap)))));
  };
  measure();const ro=new ResizeObserver(measure);ro.observe(el);return()=>ro.disconnect();
 },[candidates.length]);
 const fresh=candidates.slice(0,fit);
 const freshBlock=<DeskShelf className="desk-fresh" title={t('desk.freshTitle')} posts={fresh} onOpen={p=>onOpen(p)} gridRef={grid}/>;
 return <div className="desk-home">
  {live&&<button type="button" className="desk-onair" onClick={()=>{haptic();onOpenLive();}}>
   <span className="desk-onair-dot" aria-hidden="true"/><Radio size={20}/>
   <span className="desk-onair-copy"><span>{t('live.authorOnAir')}</span><strong>{live.title}</strong></span>
   <span className="desk-onair-action">{liveAction}<ChevronRight size={18}/></span>
  </button>}
  {hero?<section className="desk-hero">
   {/* Обложка — сама кнопка «открыть», а на ней в углу — понятная кнопка
       действия и «Поделиться» (13 октября владелец: «поставить на обложку
       нативную кнопку play, чтоб пользователь сразу понимал, что делать»).
       Кнопки — рядом с кнопкой-обложкой, а не внутри неё: кнопка в кнопке
       ломает и клавиатуру, и щелчок. Тип, длительность и название под
       обложкой больше не пишем — они путали («что за большая надпись под
       обложкой?»); название — у кнопки-обложки для чтения с экрана. */}
   <div className={'desk-banner'+(heroWide?' is-wide':'')}>
    <button type="button" className="desk-banner-hit" aria-label={heroAction+' · '+hero.title} onClick={()=>{haptic();onOpen(hero,!!heroResume);}}>
     {/* Обложка 4:1 из студии — целиком, без обрезки; если рамка из-за
         низкого окна стала шире 4:1, бока закрывает её же размытая копия. */}
     {heroWide?<><img className="desk-banner-blur" src={heroWide} alt="" aria-hidden="true" referrerPolicy="no-referrer"/>
      <img className="desk-banner-wide" src={heroWide} alt="" referrerPolicy="no-referrer"/></>:<>
      {heroCover&&<img className="desk-banner-blur" src={heroCover} alt="" aria-hidden="true" referrerPolicy="no-referrer"/>}
      <Artwork className="desk-banner-art" src={heroCover} referrerPolicy="no-referrer" fallback={<img className="desk-cover-mark" src="/brand/logo.png?v=0.4.1" alt="" width="132" height="132"/>}/></>}
    </button>
    <div className="desk-banner-actions">
     <button type="button" className="desk-cta" onClick={()=>{haptic();onOpen(hero,!!heroResume);}}><Play size={20} fill="currentColor"/>{heroAction}{heroResume&&heroResume.position>0&&<span className="desk-cta-time">· {clock(heroResume.position)}</span>}</button>
     <button type="button" className="desk-banner-share" aria-label={t('share.action')+' · '+hero.title} title={t('share.action')} onClick={()=>{haptic();onShare(hero);}}><Share2 size={19}/></button>
    </div>
   </div>
   <h1 className="desk-sr">{hero.title}</h1>
   {hero.description?<p className="desk-hero-note">{hero.description}</p>:null}
  </section>:<section className="desk-hero is-empty"><h1 className="desk-hero-title">{t('home.emptyTitle')}</h1><p className="desk-hero-note">{t('home.emptyNote')}</p></section>}
  {freshBlock}
  {resume&&!heroResume&&<button type="button" className="desk-resume" onClick={()=>{haptic();onOpen(resume.post,true);}}>
   <Clock size={18}/><span>{t('home.continue')}</span><strong>{resume.post.title}</strong><span className="desk-resume-time">{clock(resume.position)}</span><ChevronRight size={17}/>
  </button>}
 </div>;
}
