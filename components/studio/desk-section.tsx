'use client';
import {useState} from 'react';
import {BookOpen,Headphones,Play,Share2,Video} from 'lucide-react';
import {AUDIO_CATEGORIES,audioCategoryOf,kindTagKey,type AudioCategory} from '@/lib/audio-category';
import {useT} from '@/components/i18n-provider';
import {clock,haptic,coverSrc} from '@/lib/client';
import {Artwork} from './artwork';
import {DeskTile,type DeskPost} from './desk-home';

/**
 * Раздел (Аудио, Видео, Истории) на ПК — витрина, а не длинный список
 * (выбор владельца 9 октября: «просто скроллить вниз — пусто»).
 *
 * Сверху крупно последний выпуск раздела: обложка слева, название, описание
 * и кнопки справа. Ниже переключатели — тип звука в «Аудио» и порядок — и
 * сетка плиток. Видео — плитками 16:9, остальное — 4:5, как на главной.
 *
 * Поиск здесь не нужен: строка поиска на ПК общая, вверху экрана.
 * Телефон и планшет этот компонент не видят: им — прежний список карточек.
 */
type Kind='podcast'|'video'|'story';
type Props<T>={kind:Kind;posts:T[];onOpen:(post:T)=>void;onShare:(post:T)=>void};

export function DeskSection<T extends DeskPost&{description?:string}>({kind,posts,onOpen,onShare}:Props<T>){
 const {t}=useT();
 const [type,setType]=useState<AudioCategory|'all'>('all');
 const [order,setOrder]=useState<'new'|'old'>('new');
 const newest=[...posts].sort((a,b)=>b.createdAt-a.createdAt);
 const featured=newest[0];
 // Типы звука — только те, что в разделе есть: пустой переключатель — тупик.
 const types=kind==='podcast'?AUDIO_CATEGORIES.filter(c=>posts.some(p=>audioCategoryOf(p.audioCategory)===c)):[];
 const shown=newest.filter(p=>type==='all'||audioCategoryOf(p.audioCategory)===type);
 if(order==='old')shown.reverse();
 // Крупный выпуск не повторяется в сетке, пока смотрят всё подряд от новых.
 const grid=type==='all'&&order==='new'?shown.slice(1):shown;
 const action=kind==='podcast'?t('post.listen'):kind==='video'?t('post.watch'):t('post.read');
 const Icon=kind==='podcast'?Headphones:kind==='video'?Video:BookOpen;
 if(!featured)return null;
 return <div className={'desk-section is-'+kind}>
  <section className="desk-feature" aria-label={t('desk.latest')}>
   <button type="button" className="desk-feature-cover" aria-label={action+' · '+featured.title} onClick={()=>{haptic();onOpen(featured);}}>
    <Artwork src={coverSrc(featured,1280)} referrerPolicy="no-referrer" fallback={<span className="desk-feature-mark"><Icon size={48}/></span>}/>
    <span className="desk-tile-play" aria-hidden="true"><Play size={20} fill="currentColor"/></span>
   </button>
   <div className="desk-feature-copy">
    <span className="desk-eyebrow">{t('desk.latest')} · {t(kindTagKey(featured))}{featured.duration>0?' · '+clock(featured.duration):''}</span>
    <h1 className="desk-feature-title">{featured.title}</h1>
    {!!featured.description&&<p className="desk-feature-note">{featured.description}</p>}
    <div className="desk-hero-actions">
     <button type="button" className="desk-cta" onClick={()=>{haptic();onOpen(featured);}}><Play size={18} fill="currentColor"/>{action}</button>
     <button type="button" className="desk-ghost" onClick={()=>{haptic();onShare(featured);}}><Share2 size={17}/>{t('share.action')}</button>
    </div>
   </div>
  </section>
  {(posts.length>1||types.length>1)&&<div className="desk-chips" role="toolbar">
   {types.length>1&&<>
    <button type="button" className="desk-chip" aria-pressed={type==='all'} onClick={()=>setType('all')}>{t('desk.seeAll')}</button>
    {types.map(c=><button key={c} type="button" className="desk-chip" aria-pressed={type===c} onClick={()=>setType(c)}>{t('audio.type.'+c)}</button>)}
   </>}
   <span className="desk-chips-grow"/>
   <button type="button" className="desk-chip" aria-pressed={order==='new'} onClick={()=>setOrder('new')}>{t('catalog.sortNew')}</button>
   <button type="button" className="desk-chip" aria-pressed={order==='old'} onClick={()=>setOrder('old')}>{t('catalog.sortOld')}</button>
  </div>}
  {grid.length>0&&<div className="desk-grid">{grid.map(p=><DeskTile key={p.id} post={p} wide={kind==='video'} onOpen={onOpen}/>)}</div>}
 </div>;
}
