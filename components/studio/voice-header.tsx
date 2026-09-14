'use client';
import {ArrowUpRight,Play,Headphones,Video,BookOpen} from 'lucide-react';
import {clock} from '@/lib/client';
import {useT} from '@/components/i18n-provider';

/**
 * S03 — редакционная шапка раздела подкастов. Это верхняя часть раздела, а не
 * вторая главная: сразу под ней идёт настоящий каталог с поиском, сортировкой
 * и фильтром записей эфира, и человек не остаётся без старых публикаций ради
 * одной красивой карточки.
 *
 * Карточка нового выпуска открывает реальную публикацию — самую свежую
 * опубликованную в разделе. Если публиковать нечего, карточки нет: ставить
 * вместо неё пример нельзя.
 */
const ICON={podcast:Headphones,video:Video,story:BookOpen} as const;
export type VoiceEpisode={id:string;title:string;duration:number};
export type VoiceColumn={kind:'podcast'|'video'|'story';label:string;go:()=>void};

export function VoiceHeader({latest,onOpen,columns,haptic=()=>{}}:{
 latest:VoiceEpisode|null;onOpen:(episode:VoiceEpisode)=>void;columns:VoiceColumn[];haptic?:()=>void;
}){
 const {t}=useT();
 return <header className="voice-head">
  <div className="voice-headline">
   <h1 className="voice-title">{t('voice.headline')}<span className="voice-stop" aria-hidden="true"/></h1>
   <p className="voice-kicker">{t('voice.kicker')}</p>
  </div>

  {latest&&<button type="button" className="voice-card tt-pressable" onClick={()=>{haptic();onOpen(latest);}}>
   <span className="voice-card-tag">{t('voice.newEpisode')}<ArrowUpRight size={15}/></span>
   <strong className="voice-card-title">{latest.title}</strong>
   <span className="voice-card-meta">{t('post.listen')}{latest.duration>0?' · '+clock(latest.duration):''}</span>
   <span className="voice-card-play" aria-hidden="true"><Play size={20} fill="currentColor"/></span>
  </button>}

  <div className="voice-columns">
   {columns.map(column=>{const Icon=ICON[column.kind];
    return <button key={column.kind} type="button" className="voice-column tt-pressable" onClick={()=>{haptic();column.go();}}>
     <Icon size={22} className="voice-column-icon"/>
     <strong>{column.label}</strong>
    </button>;})}
  </div>
 </header>;
}
