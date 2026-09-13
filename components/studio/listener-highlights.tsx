'use client';
import {useEffect,useRef,useState} from 'react';
import {readProgress,type Progress} from '@/lib/listening-progress';
import {readSeen,readHidden,hideHighlight,type Hidden} from '@/lib/seen-posts';
import {useT} from '@/components/i18n-provider';
import {clock,haptic} from '@/lib/client';
import {EyeOff} from 'lucide-react';
type Item={id:string;kind:string;published:number;createdAt:number;title:string};
// Карточка главной вместе с меткой того состояния, которое скрывает долгое
// нажатие: для «продолжить слушать» это место остановки в секундах, для
// «последней публикации» — время выхода выпуска.
type Card={id:string;at:number;title:string};
const HOLD_MS=500,DRIFT_S=5;
export function ListenerHighlights<T extends Item>({items,onOpen}:{items:T[];onOpen:(post:T)=>void}){
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
 // Допуск в несколько секунд: фоновый плеер и веб-плеер сообщают место
 // остановки с небольшой разницей, и карточка не должна всплывать из-за неё.
 const isHidden=(card:Card)=>hidden.some(h=>h.id===card.id&&Math.abs(h.at-card.at)<=DRIFT_S);
 // Долгое нажатие открывает меню, обычное — сам выпуск. Флаг held гасит клик,
 // который браузер всё равно пришлёт после отпускания пальца.
 const press=(card:Card,post:T)=>({
  onPointerDown:()=>{held.current=false;if(hold.current)clearTimeout(hold.current);hold.current=setTimeout(()=>{held.current=true;haptic();setMenu(card);},HOLD_MS);},
  onPointerUp:()=>{if(hold.current)clearTimeout(hold.current);},
  onPointerLeave:()=>{if(hold.current)clearTimeout(hold.current);},
  onPointerCancel:()=>{if(hold.current)clearTimeout(hold.current);held.current=true;},
  onContextMenu:(e:React.MouseEvent)=>e.preventDefault(),
  onClick:()=>{if(held.current){held.current=false;return;}onOpen(post);},
 });
 const visible=items.filter(p=>p.published===1),saved=progress.find(p=>p.position>0&&visible.some(item=>item.id===p.id&&item.kind==='podcast')),resume=visible.find(p=>p.id===saved?.id),newest=[...visible].sort((a,b)=>b.createdAt-a.createdAt)[0],
  // Открытая публикация перестаёт быть новостью и уходит с главной.
  latest=newest&&!seen.includes(newest.id)?newest:undefined,
  resumeCard=resume&&saved?{id:resume.id,at:Math.round(saved.position),title:resume.title}:undefined,
  latestCard=latest?{id:latest.id,at:latest.createdAt,title:latest.title}:undefined,
  showResume=resumeCard&&!isHidden(resumeCard),showLatest=latestCard&&latestCard.id!==resume?.id&&!isHidden(latestCard);
 return <>{(showResume||showLatest)&&<div className="listener-highlights">
  {showResume&&<button {...press(resumeCard,resume!)}><span>{t('home.continue')}</span><strong>{resume!.title}</strong><small>{clock(saved!.position)} / {clock(saved!.duration)}</small></button>}
  {showLatest&&<button {...press(latestCard,latest!)}><span>{t('home.latest')}</span><strong>{latest!.title}</strong></button>}
 </div>}
 {menu&&<div className="card-menu-backdrop" onClick={()=>setMenu(null)} role="presentation">
  <div className="card-menu" onClick={e=>e.stopPropagation()}>
   <strong>{menu.title}</strong>
   <button className="card-menu-action" onClick={()=>{hideHighlight(menu.id,menu.at);setMenu(null);}}><EyeOff size={18}/>{t('home.hideCard')}</button>
   <button className="quiet-button" onClick={()=>setMenu(null)}>{t('common.cancel')}</button>
  </div>
 </div>}</>;
}
