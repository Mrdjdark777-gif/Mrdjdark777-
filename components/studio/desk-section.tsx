'use client';
import {useLayoutEffect,useRef,useState} from 'react';
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
/** live — архив эфиров на вкладке «Эфир» (14 октября): та же витрина, что
 *  в «Аудио», но без типов звука; на плитках описание и дата записи. */
type Kind='podcast'|'video'|'story'|'live';
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
 const search=kind==='live'?t('live.archiveSearch'):t('desk.sectionSearch');
 // Архив эфиров (14 октября владелец: «плашки… немного меньше, чтоб они
 // помещались на экран… адаптивным, чтоб на любом размере дисплея это
 // выглядело одинаково»): ширина плитки считается от высоты окна так, чтобы
 // карточка эфира и первый ряд записей целиком стояли на первом экране.
 // Плеер внизу в расчёт не входит — как и на главной: с ним страница
 // докручивается на его высоту, а плитки не прыгают.
 const gridRef=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{
  const g=gridRef.current;if(kind!=='live'||!g)return;
  const count=g.children.length;
  const fit=()=>{
   const top=g.getBoundingClientRect().top+window.scrollY;
   const copy=(g.querySelector('.desk-tile-copy') as HTMLElement|null)?.offsetHeight??110;
   const cover=window.innerHeight-top-copy-20;
   const want=Math.min(240,Math.max(140,cover*0.8));
   // Ряд заполняет ширину ровно: колонок столько, чтобы плитка была не
   // больше рассчитанной, — без рваного зазора справа.
   const gap=20,width=g.clientWidth;
   let n=Math.max(1,Math.ceil((width+gap)/(want+gap)));
   if(n>1&&(width-(n-1)*gap)/n<140)n--;
   // Записей меньше, чем влезает в ряд, — растягивать нечего: плитки своего размера.
   g.style.setProperty('--live-tile',(count<n?Math.floor(want):Math.floor((width-(n-1)*gap)/n))+'px');
  };
  fit();
  const ro=new ResizeObserver(fit);ro.observe(document.documentElement);
  window.addEventListener('resize',fit);
  return ()=>{ro.disconnect();window.removeEventListener('resize',fit);};
 },[kind,grid.length]);
 if(!posts.length)return null;
 return <div className={'desk-section is-'+kind}>
 {/* Поиск — в каждом разделе всегда, даже при одном выпуске (владелец,
      13 октября: «почему в разделе видео нет строки поиска?»). Порядок —
      только когда есть что упорядочивать. */}
  <div className="desk-chips" role="toolbar">
   <label className="desk-section-search"><Search size={16}/><input type="search" value={query} placeholder={search} aria-label={search} onChange={e=>setQuery(e.target.value)}/></label>
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
  {grid.length>0&&<div className="desk-grid" ref={gridRef}>{grid.map(p=><DeskTile key={p.id} post={p} onOpen={onOpen} note={kind==='live'}/>)}</div>}
 </div>;
}
