'use client';
import './home-soft.css';
import {useEffect,useRef,useState} from 'react';
import {BookOpen,ChevronRight,Clock,EyeOff,Headphones,Play,Video,MoreHorizontal,X} from 'lucide-react';
import {Dialog,DialogContent,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {pushBackLayer,BACK_MENU} from '@/lib/back-stack';
import {homeScene,type ScenePost} from '@/lib/home-scene';
import {hideResume,readProgress,readResumeHidden} from '@/lib/listening-progress';
import {readSeen,readHidden,hideHighlight} from '@/lib/seen-posts';
import {useT} from '@/components/i18n-provider';
import {clock,haptic,coverSrc} from '@/lib/client';
import {Artwork} from './artwork';

/** Главная по эталону владельца: кадр с надписью сверху и кнопкой снизу,
 * карусель свежего, строка архива, карточка поддержки с площадками.
 * Навигация, плеер и видимость публикаций работают как раньше.
 */
const HOLD_MS=500;
type Live={id:string;title:string;cover:boolean};
const coverOf=(p:ScenePost)=>coverSrc(p);

export function HomeSceneView<T extends ScenePost>({posts,live,onOpen,onOpenLive,onBrowse,liveAction,archive,support,links,appLink,pinned,noHero}:{
 posts:T[];live:Live|null;onOpen:(post:T,resume?:boolean)=>void;onOpenLive:()=>void;onBrowse?:()=>void;liveAction:string;
 archive?:React.ReactNode;support:React.ReactNode;links?:React.ReactNode;appLink?:React.ReactNode;pinned?:string|null;
 /** Публикации, которые не встают в кадр сами: записи эфиров. */
 noHero?:string[];
}){
 const {t}=useT();
 const [device,setDevice]=useState<{progress:ReturnType<typeof readProgress>;seen:string[];hidden:string[]}>({progress:[],seen:[],hidden:[]});
 const [menu,setMenu]=useState<{id:string;title:string}|null>(null);
 const hold=useRef<ReturnType<typeof setTimeout>|null>(null),held=useRef(false);
 // Прогресс, открытые и убранные карточки лежат в хранилище устройства,
 // поэтому читаются после первой отрисовки: на сервере localStorage нет.
 useEffect(()=>{
  const update=()=>{const off=readResumeHidden();
   setDevice({progress:readProgress().filter(p=>!off.includes(p.id)),seen:readSeen(),hidden:readHidden().map(h=>h.id)});};
  const timer=setTimeout(update,0);
  for(const event of ['tt-progress','tt-seen','tt-hidden'])window.addEventListener(event,update);
  return()=>{clearTimeout(timer);for(const event of ['tt-progress','tt-seen','tt-hidden'])window.removeEventListener(event,update);};
 },[]);
 useEffect(()=>()=>{if(hold.current)clearTimeout(hold.current);},[]);
 useEffect(()=>menu?pushBackLayer(BACK_MENU,()=>{setMenu(null);return true;}):undefined,[menu]);
 const picked=homeScene({posts,progress:device.progress,seen:device.seen,hidden:device.hidden,pinned,noHero});

 // homeScene отдаёт свой узкий тип; открывать нужно исходную публикацию со
 // всеми полями, поэтому находим её по id.
 const hero=picked.hero?posts.find(p=>p.id===picked.hero!.id)??null:null;
 const resume=picked.resume?{...picked.resume,post:posts.find(p=>p.id===picked.resume!.post.id)!}:null;
 const ICON={podcast:Headphones,video:Video,story:BookOpen} as const;
 // Свежее — то, чего ещё нет в кадре и в строке «Продолжить»: повторять
 // один и тот же выпуск в двух местах подряд незачем.
 const shown=new Set([hero?.id,resume?.post.id].filter(Boolean) as string[]);
 const latest=posts.filter(p=>p.published===1&&!shown.has(p.id)&&!device.hidden.includes(p.id))
  .sort((a,b)=>b.createdAt-a.createdAt).slice(0,12);
 const heroCover=hero?coverOf(hero):'';
 const heroResume=resume?.post.id===hero?.id?resume:null;
 const heroAction=heroResume?t('home.continue'):hero?.kind==='podcast'?t('post.listen'):hero?.kind==='video'?t('post.watch'):t('post.read');
 // Надстрочная надпись в кадре — вид публикации, он уже записан заглавными
 // в словарях. Отдельной «темы» у выпусков нет, выдумывать её нельзя.
 const heroKind=hero?.kind==='video'?t('post.video'):hero?.kind==='story'?t('post.story'):t('post.podcast');
 // Полоса под кнопкой показывает настоящее место в выпуске, а не оформление:
 // нет длительности — нет и полосы.
 const heroPart=heroResume&&heroResume.duration>0?Math.min(1,Math.max(0,heroResume.position/heroResume.duration)):0;
 const press=hero?{
  onPointerDown:(e:React.PointerEvent)=>{if(e.button!==0)return;held.current=false;if(hold.current)clearTimeout(hold.current);hold.current=setTimeout(()=>{held.current=true;haptic();setMenu({id:hero.id,title:hero.title});},HOLD_MS);},
  onPointerUp:()=>{if(hold.current)clearTimeout(hold.current);},
  onPointerLeave:()=>{if(hold.current)clearTimeout(hold.current);},
  onPointerCancel:()=>{if(hold.current)clearTimeout(hold.current);held.current=true;},
  onContextMenu:(e:React.MouseEvent)=>e.preventDefault(),
 }:{};
 return <div className="immersion tt-soft-home">
  <section className={'scene'+(heroCover?'':' scene-fallback')} {...press}>
   <Artwork className="scene-photo" src={heroCover} referrerPolicy="no-referrer" fallback={<img className="scene-mark" src="/brand/logo.png?v=0.4.1" alt="" width="132" height="132"/>}/>
   <div className="scene-shade" aria-hidden="true"/>
   {hero?<>
    <button type="button" className="scene-menu tt-pressable" aria-label={t('player.menu')} onPointerDown={e=>e.stopPropagation()} onClick={()=>{haptic();setMenu({id:hero.id,title:hero.title});}}><MoreHorizontal size={20}/></button>
    {/* Надпись сверху, кнопка снизу: между ними остаётся видимая обложка.
        Когда всё стояло внизу одной стопкой, текст ложился на снимок, а сам
        снимок обрезался сверху и от него оставалась полоса. */}
    <div className="scene-copy">
     <span className="soft-eyebrow">{heroKind}</span>
     <h2 className="scene-title">{hero.title}</h2>
    </div>
    <div className="soft-hero-foot">
     <button type="button" className="scene-action" onClick={()=>{if(held.current){held.current=false;return;}haptic();onOpen(hero,!!heroResume);}}><Play size={19} fill="currentColor"/>{heroAction}</button>
     {heroResume&&heroResume.duration>0&&<div className="soft-hero-progress">
      <span className="soft-hero-time">{clock(heroResume.position)} / {clock(heroResume.duration)}</span>
      <span className="soft-hero-track" aria-hidden="true"><span className="soft-hero-fill" style={{width:(heroPart*100).toFixed(1)+'%'}}/></span>
     </div>}
    </div>
   </>:<div className="scene-copy"><h2 className="scene-title">{t('home.emptyTitle')}</h2><p className="scene-meta">{t('home.emptyNote')}</p></div>}
  </section>

  {/* Всё, что не кадр, собрано в одну обёртку. На телефоне она прозрачна
      (display:contents) и порядок блоков ровно тот же, что был. На мониторе
      она становится правой колонкой рядом с кадром: сеткой это не собиралось
      — правых блоков переменное число, и растянутый на все строки кадр
      наплодил бы пустых строк с промежутками между ними. */}
  <div className="scene-side">
  {/* Описание канала на мониторе живёт здесь, а не поверх фотографии: там оно
      мелкое и лежит на снимке, а правая колонка на небольшом канале пустует. */}
  <p className="side-intro">{t('home.channelIntro')}</p>
  {/* Под кадром — одна строка, а не стопка. Идёт эфир — он и стоит здесь, он
      важнее и заканчивается; нет эфира — строка «Продолжить». Раньше сюда
      сходились обе сразу, и экран превращался в лестницу из плашек. */}
  {live?<button type="button" className="live-strip tt-pressable" onClick={()=>{haptic();onOpenLive();}}>
   <span className="live-dot" aria-hidden="true"/><span className="live-strip-copy"><strong>{live.title}</strong><span>{t('live.authorOnAir')}</span></span>
   <span className="live-strip-action">{liveAction}<ChevronRight size={17}/></span>
  </button>:resume&&!heroResume?<div className="resume-wrap">
   <button type="button" className="resume-row tt-pressable" onClick={()=>{haptic();onOpen(resume.post,true);}}>
    <Clock size={18}/><span className="resume-copy"><span className="resume-label">{t('home.continue')}</span>
    <span className="resume-sep" aria-hidden="true">·</span><span className="resume-time">{clock(resume.position)}</span></span>
   </button>
   {/* Строку можно убрать: выпуск могли включить случайно или больше к нему не
       возвращаться, а деться от неё было некуда. */}
   <button type="button" className="resume-close tt-pressable" aria-label={t('home.continueHide')} title={t('home.continueHide')}
    onClick={()=>{haptic();hideResume(resume.post.id);}}><X size={17}/></button>
  </div>:null}

  {latest.length>0&&<section className="soft-catalog" aria-label={t('home.freshList')}>
   <div className="soft-catalog-head">
    <h3>{t('home.freshList')}</h3>
    {onBrowse&&<button type="button" className="soft-all tt-pressable" onClick={()=>{haptic();onBrowse();}}>{t('home.all')}<ChevronRight size={17}/></button>}
   </div>
   <ul className="soft-carousel" aria-label={t('home.freshList')}>
    {latest.map(p=>{const Icon=ICON[p.kind as keyof typeof ICON]??Headphones;
     return <li key={p.id}><button type="button" className="soft-episode tt-pressable" onClick={()=>{haptic();onOpen(p);}}>
      <span className="soft-art"><Artwork src={coverOf(p)} loading="lazy" referrerPolicy="no-referrer" fallback={<Icon size={36}/>}/><span className="soft-play" aria-hidden="true">{p.kind==='story'?<BookOpen size={19}/>:<Play size={19}/>}</span></span>
      <strong>{p.title}</strong><span className="soft-meta"><Icon size={14}/>{p.kind==='podcast'?t('post.podcast'):p.kind==='video'?t('post.video'):t('post.story')}{p.duration>0?' · '+clock(p.duration):''}</span>
     </button></li>;})}
   </ul>
  </section>}
  {/* Архив эфиров — вход в раздел, а не выпуск. Карточкой в карусели он
      выглядел как публикация, которую можно включить; строкой во всю ширину
      он читается тем, чем является. */}
  {archive&&<div className="soft-archive-row">{archive}</div>}
  {appLink&&<div className="soft-app-link">{appLink}</div>}
  {/* Последний блок содержимого; глобальный плеер и вкладки живут снаружи. */}
  <section className="soft-support">
   {support}
   {links&&<div className="soft-socials"><span className="soft-socials-label">{t('home.socialsLabel')}</span>{links}</div>}
  </section>
  {/* Место под глобальный мини-плеер: он висит поверх и иначе накрыл бы поддержку. */}
  <div className="soft-tail" aria-hidden="true"/>
  </div>

  <Dialog open={!!menu} onOpenChange={open=>{if(!open)setMenu(null);}}>
   <DialogContent aria-describedby={undefined}>
    <DialogHeader><DialogTitle>{menu?.title}</DialogTitle></DialogHeader>
    <button className="card-menu-action" onClick={()=>{if(menu)hideHighlight(menu.id,0);setMenu(null);}}><EyeOff size={18}/>{t('home.hideCard')}</button>
    <button className="quiet-button" onClick={()=>setMenu(null)}>{t('common.cancel')}</button>
   </DialogContent>
  </Dialog>
 </div>;
}
