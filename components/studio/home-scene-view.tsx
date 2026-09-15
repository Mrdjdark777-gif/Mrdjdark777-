'use client';
import {useEffect,useRef,useState} from 'react';
import {BookOpen,ChevronRight,Clock,EyeOff,Headphones,Play,Video,MoreHorizontal} from 'lucide-react';
import {Dialog,DialogContent,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {pushBackLayer,BACK_MENU} from '@/lib/back-stack';
import {homeScene,freshSections,type ScenePost} from '@/lib/home-scene';
import {readProgress} from '@/lib/listening-progress';
import {readSeen,readHidden,hideHighlight} from '@/lib/seen-posts';
import {useT} from '@/components/i18n-provider';
import {clock,haptic} from '@/lib/client';
import {Artwork} from './artwork';

/**
 * Главная S01 «Погружение»: фотография во всю ширину, поверх неё снизу —
 * название выпуска, метаданные и действие; под кадром строка «Продолжить»,
 * три фото-плитки разделов и поддержка.
 *
 * Фотографии настоящие: обложка публикации или обложка эфира. Своей обложки
 * нет — остаётся фирменный тёмный фон с логотипом. Сток не подставляем: лучше
 * честный тёмный кадр, чем чужая картинка, выданная за материал автора.
 *
 * Идущий эфир не подменяет публикацию в кадре: он приходит отдельной живой
 * строкой над плитками, чтобы выпуск под пальцем не менялся неожиданно.
 */
const HOLD_MS=500;
type Live={id:string;title:string;cover:boolean};
const coverOf=(p:ScenePost)=>p.coverKey?'/api/cover?id='+p.id:p.coverUrl||'';

export function HomeSceneView<T extends ScenePost>({posts,live,onOpen,onOpenLive,liveAction,support,sections,pinned}:{
 posts:T[];live:Live|null;onOpen:(post:T)=>void;onOpenLive:()=>void;liveAction:string;
 support:React.ReactNode;pinned?:string|null;
 sections:{kind:'podcast'|'video'|'story';label:string;go:()=>void}[];
}){
 const {t}=useT();
 const [device,setDevice]=useState<{progress:ReturnType<typeof readProgress>;seen:string[];hidden:string[]}>({progress:[],seen:[],hidden:[]});
 const [menu,setMenu]=useState<{id:string;title:string}|null>(null);
 const hold=useRef<ReturnType<typeof setTimeout>|null>(null),held=useRef(false);
 // Прогресс, открытые и убранные карточки лежат в хранилище устройства,
 // поэтому читаются после первой отрисовки: на сервере localStorage нет.
 useEffect(()=>{
  const update=()=>setDevice({progress:readProgress(),seen:readSeen(),hidden:readHidden().map(h=>h.id)});
  const timer=setTimeout(update,0);
  for(const event of ['tt-progress','tt-seen','tt-hidden'])window.addEventListener(event,update);
  return()=>{clearTimeout(timer);for(const event of ['tt-progress','tt-seen','tt-hidden'])window.removeEventListener(event,update);};
 },[]);
 useEffect(()=>()=>{if(hold.current)clearTimeout(hold.current);},[]);
 useEffect(()=>menu?pushBackLayer(BACK_MENU,()=>{setMenu(null);return true;}):undefined,[menu]);
 const picked=homeScene({posts,progress:device.progress,seen:device.seen,hidden:device.hidden,pinned});
 const fresh=freshSections({posts,seen:device.seen,hidden:device.hidden,heroId:picked.hero?.id??null});
 // homeScene отдаёт свой узкий тип; открывать нужно исходную публикацию со
 // всеми полями, поэтому находим её по id.
 const hero=picked.hero?posts.find(p=>p.id===picked.hero!.id)??null:null;
 const resume=picked.resume?{...picked.resume,post:posts.find(p=>p.id===picked.resume!.post.id)!}:null;
 const ICON={podcast:Headphones,video:Video,story:BookOpen} as const;
 // Плитка раздела показывает обложку самой свежей публикации этого типа —
 // настоящую, а не отдельную декоративную картинку.
 const tileCover=(kind:string)=>{
  const newest=posts.filter(p=>p.published===1&&p.kind===kind).sort((a,b)=>b.createdAt-a.createdAt)[0];
  return newest?coverOf(newest):'';
 };
 const heroCover=hero?coverOf(hero):'';
 const heroAction=hero?.kind==='podcast'?t('post.listen'):hero?.kind==='video'?t('post.watch'):t('post.read');
 const heroMeta=hero?(hero.kind==='podcast'?(hero.duration>0?clock(hero.duration):t('post.podcast')):hero.kind==='video'?t('post.video'):t('post.story')):'';
 const press=hero?{
  onPointerDown:(e:React.PointerEvent)=>{if(e.button!==0)return;held.current=false;if(hold.current)clearTimeout(hold.current);hold.current=setTimeout(()=>{held.current=true;haptic();setMenu({id:hero.id,title:hero.title});},HOLD_MS);},
  onPointerUp:()=>{if(hold.current)clearTimeout(hold.current);},
  onPointerLeave:()=>{if(hold.current)clearTimeout(hold.current);},
  onPointerCancel:()=>{if(hold.current)clearTimeout(hold.current);held.current=true;},
  onContextMenu:(e:React.MouseEvent)=>e.preventDefault(),
 }:{};
 return <div className="immersion">
  <section className={'scene'+(heroCover?'':' scene-fallback')} {...press}>
   <Artwork className="scene-photo" src={heroCover} referrerPolicy="no-referrer" fallback={<img className="scene-mark" src="/brand/logo.png?v=0.4.1" alt="" width="132" height="132"/>}/>
   <div className="scene-shade" aria-hidden="true"/>
   <p className="scene-intro">{t('home.channelIntro')}</p>
   {hero?<>
    <button type="button" className="scene-menu tt-pressable" aria-label={t('player.menu')} onPointerDown={e=>e.stopPropagation()} onClick={()=>{haptic();setMenu({id:hero.id,title:hero.title});}}><MoreHorizontal size={20}/></button>
    <div className="scene-copy">
     <h2 className="scene-title">{hero.title}</h2>
     {heroMeta&&<span className="scene-meta">{heroMeta}</span>}
     <button type="button" className="scene-action" onClick={()=>{if(held.current){held.current=false;return;}haptic();onOpen(hero);}}><Play size={19} fill="currentColor"/>{heroAction}</button>
    </div>
   </>:<div className="scene-copy"><h2 className="scene-title">{t('home.emptyTitle')}</h2><p className="scene-meta">{t('home.emptyNote')}</p></div>}
  </section>

  {resume&&<button type="button" className="resume-row tt-pressable" onClick={()=>{haptic();onOpen(resume.post);}}>
   <Clock size={18}/><span className="resume-copy"><span className="resume-label">{t('home.continue')}</span>
   <span className="resume-sep" aria-hidden="true">·</span><span className="resume-time">{clock(resume.position)}</span></span><ChevronRight size={18}/>
  </button>}

  {live&&<button type="button" className="live-strip tt-pressable" onClick={()=>{haptic();onOpenLive();}}>
   <span className="live-dot" aria-hidden="true"/><span className="live-strip-copy"><strong>{live.title}</strong><span>{t('live.authorOnAir')}</span></span>
   <span className="live-strip-action">{liveAction}<ChevronRight size={17}/></span>
  </button>}

  <div className="section-tiles">
   {sections.map(s=>{const Icon=ICON[s.kind],cover=tileCover(s.kind);
    return <button key={s.kind} type="button" className={'section-tile'+(cover?'':' section-tile-plain')} onClick={()=>{haptic();s.go();}}>
     <Artwork src={cover} loading="lazy" referrerPolicy="no-referrer" fallback={<Icon className="section-tile-icon" size={26}/>}/>
     <span className="section-tile-shade" aria-hidden="true"/>
     <span className="section-tile-copy"><strong>{s.label}</strong>{fresh.has(s.kind)&&<span className="section-tile-new">{t('home.fresh')}</span>}</span>
    </button>;})}
  </div>

  {support}

  <Dialog open={!!menu} onOpenChange={open=>{if(!open)setMenu(null);}}>
   <DialogContent aria-describedby={undefined}>
    <DialogHeader><DialogTitle>{menu?.title}</DialogTitle></DialogHeader>
    <button className="card-menu-action" onClick={()=>{if(menu)hideHighlight(menu.id,0);setMenu(null);}}><EyeOff size={18}/>{t('home.hideCard')}</button>
    <button className="quiet-button" onClick={()=>setMenu(null)}>{t('common.cancel')}</button>
   </DialogContent>
  </Dialog>
 </div>;
}
