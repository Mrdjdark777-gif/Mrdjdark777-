'use client';
import {useEffect,useState} from 'react';
import {readProgress,type Progress} from '@/lib/listening-progress';
import {readSeen} from '@/lib/seen-posts';
import {useT} from '@/components/i18n-provider';
import {clock} from '@/lib/client';
type Item={id:string;kind:string;published:number;createdAt:number;title:string};
export function ListenerHighlights<T extends Item>({items,onOpen}:{items:T[];onOpen:(post:T)=>void}){
 const {t}=useT(),[progress,setProgress]=useState<Progress[]>([]),[seen,setSeen]=useState<string[]>([]);
 // Оба списка лежат в хранилище браузера, поэтому читаем их после первой
 // отрисовки: на сервере localStorage нет, и разметка разъехалась бы.
 useEffect(()=>{
  const update=()=>{setProgress(readProgress());setSeen(readSeen());};
  const timer=setTimeout(update,0);
  window.addEventListener('tt-progress',update);window.addEventListener('tt-seen',update);
  return()=>{clearTimeout(timer);window.removeEventListener('tt-progress',update);window.removeEventListener('tt-seen',update);};
 },[]);
 const visible=items.filter(p=>p.published===1),saved=progress.find(p=>p.position>0&&visible.some(item=>item.id===p.id&&item.kind==='podcast')),resume=visible.find(p=>p.id===saved?.id),newest=[...visible].sort((a,b)=>b.createdAt-a.createdAt)[0],
  // Открытая публикация перестаёт быть новостью и уходит с главной.
  latest=newest&&!seen.includes(newest.id)?newest:undefined;
 return <div className="listener-highlights">{resume&&<button onClick={()=>onOpen(resume)}><span>{t('home.continue')}</span><strong>{resume.title}</strong><small>{clock(saved!.position)} / {clock(saved!.duration)}</small></button>}{latest&&latest.id!==resume?.id&&<button onClick={()=>onOpen(latest)}><span>{t('home.latest')}</span><strong>{latest.title}</strong></button>}</div>;
}
