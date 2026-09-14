'use client';
import {useState} from 'react';
import {Play,Pause,RotateCcw,RotateCw,Loader2,X,ChevronDown,ChevronUp,MoreHorizontal,Heart,Timer,ChevronRight} from 'lucide-react';
import {Waveform} from './waveform';
import {Slider} from '@/components/ui/slider';
import {clock} from '@/lib/client';
import type {Presentation} from '@/lib/player-presentation';
import {useT} from '@/components/i18n-provider';

/**
 * Внешний вид плеера выпусков — один на оба плеера, веб и нативный. Сами они
 * различаются только тем, откуда берут состояние: из <audio> или из моста, —
 * а корпус, кнопки и два режима у них общие.
 *
 * Развёрнутый плеер с листа — экран целиком: фотография сверху затухает в
 * угольный низ, сверху свернуть и меню, нижней навигации нет. Мини-панель
 * по-прежнему прижата к навигации и не закрывает контент. Переключение между
 * ними не пересоздаёт плеер: <audio> у веб-плеера живёт снаружи корпуса и
 * переживает и сворачивание, и переход между вкладками.
 *
 * Представление приходит готовым (см. lib/player-presentation): здесь только
 * разметка. S02 — фотография и serif по центру; S04 — крупный узкий заголовок
 * по левому краю, форма звука и «Далее». S06 достраивается следующим шагом и
 * пока показывается корпусом S04.
 */
export type PlayerView={
 title:string;cover?:string;position:number;duration:number;playing:boolean;loading:boolean;seekable:boolean;
 rate:number;sleep:number;sleepOptions:{value:string|number;label:string}[];sleepValue:string|number;message?:string;
 presentation:Presentation;kindLabel:string;note?:string;supportUrl?:string;
 postId:string;next?:{id:string;title:string;cover?:string;duration:number}|null;
};
export type PlayerActions={
 toggle:()=>void;seekBy:(seconds:number)=>void;seekTo:(seconds:number)=>void;scrub?:(seconds:number)=>void;
 setRate:(rate:number)=>void;setSleep:(value:string)=>void;close:()=>void;openNext?:(id:string)=>void;
};
export function PlayerChrome({view,act,expanded,onExpand,children}:{view:PlayerView;act:PlayerActions;expanded:boolean;onExpand:(next:boolean)=>void;children?:React.ReactNode}){
 const {t}=useT();
 const [menu,setMenu]=useState(false);
 const total=view.duration>0?clock(view.duration):t('player.measuring');
 const type=view.presentation==='type';
 const toggle=<button className="podcast-toggle" aria-label={view.playing?t('player.pause'):t('player.play')} disabled={view.loading&&!view.playing&&!view.seekable} onClick={act.toggle}>{view.loading?<Loader2 className="spin" size={22}/>:view.playing?<Pause size={23} fill="currentColor"/>:<Play size={23} fill="currentColor"/>}</button>;
 const art=<img className="podcast-player-logo" src={view.cover??'/brand/logo.png?v=0.4.1'} alt="" onError={e=>{e.currentTarget.src='/brand/logo.png?v=0.4.1';}}/>;
 if(!expanded)return <section className="podcast-player is-mini" aria-label={t('player.aria',{title:view.title})}>
  {children}
  <button type="button" className="mini-open" aria-label={t('player.expand')} onClick={()=>onExpand(true)}>{art}<span className="podcast-player-title"><strong>{view.title}</strong><span className="podcast-clock">{clock(view.position)} / {view.duration>0?clock(view.duration):'--:--'}</span></span></button>
  {toggle}
  <button type="button" className="player-expand" aria-label={t('player.expand')} onClick={()=>onExpand(true)}><ChevronUp size={22}/></button>
 </section>;
 return <section className={'podcast-player is-open is-'+view.presentation} aria-label={t('player.aria',{title:view.title})}>
  {children}
  <div className="player-stage" aria-hidden="true">
   {view.cover?<img className="player-stage-photo" src={view.cover} alt="" onError={e=>{e.currentTarget.parentElement?.classList.add('player-stage-plain');e.currentTarget.remove();}}/>:<img className="player-stage-mark" src="/brand/logo.png?v=0.4.1" alt=""/>}
   <span className="player-stage-shade"/>
  </div>

  <div className="player-sheet-top">
   <button type="button" className="player-collapse tt-pressable" aria-label={t('player.collapse')} onClick={()=>onExpand(false)}><ChevronDown size={22}/></button>
   <span className="player-kind">{view.presentation==='archive'?view.kindLabel:''}</span>
   <button type="button" className="player-more tt-pressable" aria-label={t('player.menu')} aria-expanded={menu} onClick={()=>setMenu(v=>!v)}><MoreHorizontal size={22}/></button>
  </div>

  <div className="player-body">
   {type?<>
    <span className="player-tagline">{view.kindLabel}</span>
    <h2 className="player-title">{view.title}</h2>
    {view.note&&<p className="player-note">{view.note}</p>}
    <Waveform key={view.postId} postId={view.postId} progress={view.duration>0?view.position/view.duration:0}/>
   </>:<>
    <div className="player-caption">
     <span className="player-brand">True Thrills</span>
     <span className="player-tagline">{view.kindLabel}{view.duration>0?' · '+clock(view.duration):''}</span>
    </div>
    <h2 className="player-title">{view.title}</h2>
    {view.note&&<p className="player-note">{view.note}</p>}
   </>}

   <div className="podcast-timeline"><Slider aria-label={t('player.seekAria')} aria-valuetext={t('player.seekValue',{position:clock(view.position),duration:clock(view.duration)})} value={[Math.min(view.position,view.duration||0)]} min={0} max={view.duration||1} step={0.1} disabled={!view.seekable} onValueChange={v=>(act.scrub??act.seekTo)(v[0])} onValueCommit={v=>act.seekTo(v[0])}/><div className="podcast-times"><span>{clock(view.position)}</span><span>{total}</span></div></div>
   <div className="podcast-transport"><button onClick={()=>act.seekBy(-15)} disabled={!view.seekable} aria-label={t('player.back15')}><RotateCcw size={19}/><span>15</span></button>{toggle}<button onClick={()=>act.seekBy(15)} disabled={!view.seekable} aria-label={t('player.forward15')}><RotateCw size={19}/><span>15</span></button></div>
   <div className="player-extras">
    <label className="player-extra"><select value={view.rate} onChange={e=>act.setRate(Number(e.target.value))}>{[.75,1,1.25,1.5,1.75,2].map(value=><option key={value} value={value}>{value}×</option>)}</select><span>{t('player.rate')}</span></label>
    <label className="player-extra"><span className="player-extra-icon"><Timer size={19}/></span><select value={view.sleepValue} onChange={e=>act.setSleep(e.target.value)}>{view.sleepOptions.map(o=><option key={String(o.value)} value={o.value}>{o.label}</option>)}</select><span>{t('player.sleepShort')}</span></label>
   </div>
   {view.message&&<p className="podcast-player-message" role="status">{view.message}</p>}
   {type&&view.next&&act.openNext&&<button type="button" className="player-next tt-pressable" onClick={()=>act.openNext!(view.next!.id)}>
    <span className="player-next-label">{t('player.next')}</span>
    <span className="player-next-row">
     {view.next.cover?<img src={view.next.cover} alt="" loading="lazy" onError={e=>e.currentTarget.remove()}/>:<span className="player-next-mark"/>}
     <span className="player-next-copy"><strong>{view.next.title}</strong>{view.next.duration>0&&<span>{clock(view.next.duration)}</span>}</span>
     <ChevronRight size={18}/>
    </span>
   </button>}
  </div>

  {menu&&<div className="player-menu" role="menu">
   {view.supportUrl&&<a role="menuitem" href={view.supportUrl} target="_blank" rel="noopener noreferrer" onClick={()=>setMenu(false)}><Heart size={17}/>{t('header.support')}</a>}
   <button type="button" role="menuitem" onClick={()=>{setMenu(false);act.close();}}><X size={17}/>{t('player.close')}</button>
  </div>}
 </section>;
}
