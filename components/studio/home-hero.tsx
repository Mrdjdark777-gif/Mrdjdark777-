'use client';
import {useEffect,useRef,useState} from 'react';
import {EyeOff,MoreHorizontal,Play} from 'lucide-react';
import {readProgress,type Progress} from '@/lib/listening-progress';
import {readSeen,readHidden,hideHighlight,type Hidden} from '@/lib/seen-posts';
import {useT} from '@/components/i18n-provider';
import {clock,haptic} from '@/lib/client';
type Item={id:string;kind:string;published:number;createdAt:number;title:string;duration:number;coverKey:string|null;coverUrl:string|null};
type Live={id:string;title:string;cover:boolean};
// Карточка главной вместе с меткой того состояния, которое скрывает «убрать с
// главной»: для «продолжить слушать» это место остановки в секундах, для
// «последней публикации» — время выхода выпуска.
type Card={id:string;at:number;title:string};
const HOLD_MS=500,DRIFT_S=5;
/**
 * Большая карточка наверху главной. Пока идёт эфир — он; иначе выпуск, на
 * котором слушатель остановился, а если такого нет — последняя публикация,
 * которую он ещё не открывал. Меню «⋯» (и долгое нажатие) убирает карточку с
 * главной; вернуться к выпуску всегда можно из его раздела.
 */
export function HomeHero<T extends Item>({items,onOpen,live,onOpenLive,liveLabel,liveEyebrow,liveNote}:{items:T[];onOpen:(post:T)=>void;live:Live|null;onOpenLive:()=>void;liveLabel:string;liveEyebrow:string;liveNote:string}){
 const {t}=useT(),[progress,setProgress]=useState<Progress[]>([]),[seen,setSeen]=useState<string[]>([]),[hidden,setHidden]=useState<Hidden[]>([]),[menu,setMenu]=useState<Card|null>(null);
 const hold=useRef<ReturnType<typeof setTimeout>|null>(null),held=useRef(false);
 // Все три списка лежат в хранилище браузера, поэтому читаем их после первой
 // отрисовки: на сервере localStorage нет, и разметка разъехалась бы.
 useEffect(()=>{
  const update=()=>{setProgress(readProgress());setSeen(readSeen());setHidden(readHidden());};
  const timer=setTimeout(update,0);
  for(const event of ['tt-progress','tt-seen','tt-hidden'])window.addEventListener(event,update);
  return()=>{clearTimeout(timer);for(const event of ['tt-progress','tt-seen','tt-hidden'])window.removeEventListener(event,update);};
 },[]);
 useEffect(()=>()=>{if(hold.current)clearTimeout(hold.current);},[]);
 if(live)return <section className="hero-card is-live"><div className="hero-copy"><span className="hero-eyebrow"><span className="hero-dot"/>{liveEyebrow}</span><h2 className="hero-title">{live.title}</h2><p className="hero-note">{liveNote}</p><button type="button" className="primary-button hero-action" onClick={()=>{haptic();onOpenLive();}}>{liveLabel}<Play size={18} fill="currentColor"/></button></div><div className="hero-art"><img src={live.cover?'/api/cover?id=live:'+live.id:'/brand/logo.png?v=0.4.1'} alt="" width="112" height="112"/></div></section>;
 // Допуск в несколько секунд: фоновый плеер и веб-плеер сообщают место
 // остановки с небольшой разницей, и карточка не должна всплывать из-за неё.
 const isHidden=(card:Card)=>hidden.some(h=>h.id===card.id&&Math.abs(h.at-card.at)<=DRIFT_S);
 const visible=items.filter(p=>p.published===1),saved=progress.find(p=>p.position>0&&visible.some(item=>item.id===p.id&&item.kind==='podcast')),resume=visible.find(p=>p.id===saved?.id),newest=[...visible].sort((a,b)=>b.createdAt-a.createdAt)[0],
  // Открытая публикация перестаёт быть новостью и уходит с главной.
  latest=newest&&!seen.includes(newest.id)?newest:undefined,
  resumeCard=resume&&saved?{id:resume.id,at:Math.round(saved.position),title:resume.title}:undefined,
  latestCard=latest?{id:latest.id,at:latest.createdAt,title:latest.title}:undefined;
 const pick=resumeCard&&!isHidden(resumeCard)?{card:resumeCard,post:resume!,eyebrow:t('home.continue'),meta:clock(saved!.position)+' / '+clock(saved!.duration)}
  :latestCard&&!isHidden(latestCard)?{card:latestCard,post:latest!,eyebrow:t('home.latest'),meta:latest!.kind==='podcast'&&latest!.duration>0?clock(latest!.duration):''}:null;
 if(!pick)return null;
 const {card,post}=pick,action=post.kind==='podcast'?t('post.listen'):post.kind==='video'?t('post.watch'):t('post.read');
 // Долгое нажатие открывает меню, обычное — сам выпуск. Флаг held гасит клик,
 // который браузер всё равно пришлёт после отпускания пальца.
 const press={
  onPointerDown:()=>{held.current=false;if(hold.current)clearTimeout(hold.current);hold.current=setTimeout(()=>{held.current=true;haptic();setMenu(card);},HOLD_MS);},
  onPointerUp:()=>{if(hold.current)clearTimeout(hold.current);},
  onPointerLeave:()=>{if(hold.current)clearTimeout(hold.current);},
  onPointerCancel:()=>{if(hold.current)clearTimeout(hold.current);held.current=true;},
  onContextMenu:(e:React.MouseEvent)=>e.preventDefault(),
  onClick:()=>{if(held.current){held.current=false;return;}onOpen(post);},
 };
 return <>
  <section className="hero-card" {...press}>
   <div className="hero-copy"><span className="hero-eyebrow">{pick.eyebrow}</span><h2 className="hero-title">{post.title}</h2>{pick.meta&&<span className="hero-meta">{pick.meta}</span>}<button type="button" className="primary-button hero-action" onClick={e=>{e.stopPropagation();haptic();onOpen(post);}}>{action}<Play size={18} fill="currentColor"/></button></div>
   <div className="hero-art"><img src={post.coverKey?'/api/cover?id='+post.id:post.coverUrl||'/brand/logo.png?v=0.4.1'} alt="" width="112" height="112" referrerPolicy="no-referrer"/></div>
   <button type="button" className="hero-menu" aria-label={t('home.cardMenu')} onClick={e=>{e.stopPropagation();haptic();setMenu(card);}} onPointerDown={e=>e.stopPropagation()}><MoreHorizontal size={22}/></button>
  </section>
  {menu&&<div className="card-menu-backdrop" onClick={()=>setMenu(null)} role="presentation">
   <div className="card-menu" onClick={e=>e.stopPropagation()}>
    <strong>{menu.title}</strong>
    <button className="card-menu-action" onClick={()=>{hideHighlight(menu.id,menu.at);setMenu(null);}}><EyeOff size={18}/>{t('home.hideCard')}</button>
    <button className="quiet-button" onClick={()=>setMenu(null)}>{t('common.cancel')}</button>
   </div>
  </div>}
 </>;
}
