'use client';
import {useState} from 'react';
import {Search} from 'lucide-react';
import {AUDIO_CATEGORIES,audioCategoryOf,type AudioCategory} from '@/lib/audio-category';
import {useT} from '@/components/i18n-provider';
import {DeskTile,type DeskPost} from './desk-home';

/**
 * Раздел (Аудио, Видео, Истории) на ПК — витрина, а не длинный список
 * (выбор владельца 9 октября: «просто скроллить вниз — пусто»).
 *
 * Сверху строка поиска и переключатели (тип звука в «Аудио», порядок), ниже —
 * сетка плиток всех выпусков раздела, обложки 4:5, как в приложении.
 *
 * Крупной карточки «Последнее» нет ни в одном разделе: 13 октября владелец
 * убрал её из «Аудио», 14 октября — из «Видео» и «Историй» («такое понятие
 * как „последнее“ нужно убрать отовсюду… оставить только список контента»).
 * Новые выпуски и так первыми в сетке.
 *
 * Поиск — свой в каждом разделе (13 октября владелец убрал общую строку из
 * верхней строки: на главной людям нечего искать, а в разделе — есть).
 * У плиток нет «Поделиться»: при большом каталоге значок на каждой плитке
 * выглядит грязно, поделиться можно из плеера и с обложки главной.
 * Телефон и планшет этот компонент не видят: им — прежний список карточек.
 */
type Kind='podcast'|'video'|'story';
type Props<T>={kind:Kind;posts:T[];onOpen:(post:T)=>void};

export function DeskSection<T extends DeskPost&{description?:string}>({kind,posts,onOpen}:Props<T>){
 const {t}=useT();
 const [type,setType]=useState<AudioCategory|'all'>('all');
 const [order,setOrder]=useState<'new'|'old'>('new');
 const [query,setQuery]=useState('');
 const needle=query.trim().toLowerCase();
 // Типы звука — только те, что в разделе есть: пустой переключатель — тупик.
 const types=kind==='podcast'?AUDIO_CATEGORIES.filter(c=>posts.some(p=>audioCategoryOf(p.audioCategory)===c)):[];
 const grid=[...posts].sort((a,b)=>b.createdAt-a.createdAt)
  .filter(p=>(type==='all'||audioCategoryOf(p.audioCategory)===type)&&(!needle||(p.title+' '+(p.description??'')).toLowerCase().includes(needle)));
 if(order==='old')grid.reverse();
 if(!posts.length)return null;
 return <div className={'desk-section is-'+kind}>
 {/* Поиск — в каждом разделе всегда, даже при одном выпуске (владелец,
      13 октября: «почему в разделе видео нет строки поиска?»). Порядок —
      только когда есть что упорядочивать. */}
  <div className="desk-chips" role="toolbar">
   <label className="desk-section-search"><Search size={16}/><input type="search" value={query} placeholder={t('desk.sectionSearch')} aria-label={t('desk.sectionSearch')} onChange={e=>setQuery(e.target.value)}/></label>
   {types.length>1&&<>
    <button type="button" className="desk-chip" aria-pressed={type==='all'} onClick={()=>setType('all')}>{t('desk.seeAll')}</button>
    {types.map(c=><button key={c} type="button" className="desk-chip" aria-pressed={type===c} onClick={()=>setType(c)}>{t('audio.type.'+c)}</button>)}
   </>}
   <span className="desk-chips-grow"/>
   {posts.length>1&&<>
    <button type="button" className="desk-chip" aria-pressed={order==='new'} onClick={()=>setOrder('new')}>{t('catalog.sortNew')}</button>
    <button type="button" className="desk-chip" aria-pressed={order==='old'} onClick={()=>setOrder('old')}>{t('catalog.sortOld')}</button>
   </>}
  </div>
  {needle&&!grid.length&&<p className="desk-results-empty">{t('catalog.nothingFound')}</p>}
  {grid.length>0&&<div className="desk-grid">{grid.map(p=><DeskTile key={p.id} post={p} onOpen={onOpen}/>)}</div>}
 </div>;
}
