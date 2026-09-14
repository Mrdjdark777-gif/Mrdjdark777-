'use client';
import {Play,Pause,RotateCcw,RotateCw,Loader2,X,ChevronDown,ChevronUp} from 'lucide-react';
import {Slider} from '@/components/ui/slider';
import {clock} from '@/lib/client';
import {useT} from '@/components/i18n-provider';

/**
 * Внешний вид плеера выпусков — один на оба плеера, веб и нативный. Сами они
 * различаются только тем, откуда берут состояние: из <audio> или из моста, —
 * а корпус, кнопки и два режима у них общие.
 *
 * Развёрнутый лист занимает экран между шапкой и нижней навигацией; мини-
 * панель прижата к навигации и не закрывает контент. Переключение между ними
 * не пересоздаёт плеер: <audio> у веб-плеера живёт снаружи корпуса и
 * переживает и сворачивание, и переход между вкладками.
 */
export type PlayerView={
 title:string;cover?:string;position:number;duration:number;playing:boolean;loading:boolean;seekable:boolean;
 rate:number;sleep:number;sleepOptions:{value:string|number;label:string}[];sleepValue:string|number;message?:string;
};
export type PlayerActions={
 toggle:()=>void;seekBy:(seconds:number)=>void;seekTo:(seconds:number)=>void;scrub?:(seconds:number)=>void;
 setRate:(rate:number)=>void;setSleep:(value:string)=>void;close:()=>void;
};
export function PlayerChrome({view,act,expanded,onExpand,children}:{view:PlayerView;act:PlayerActions;expanded:boolean;onExpand:(next:boolean)=>void;children?:React.ReactNode}){
 const {t}=useT();
 const toggle=<button className="podcast-toggle" aria-label={view.playing?t('player.pause'):t('player.play')} disabled={view.loading&&!view.playing&&!view.seekable} onClick={act.toggle}>{view.loading?<Loader2 className="spin" size={22}/>:view.playing?<Pause size={23} fill="currentColor"/>:<Play size={23} fill="currentColor"/>}</button>;
 const art=<img className="podcast-player-logo" src={view.cover??'/brand/logo.png?v=0.4.1'} alt="" onError={e=>{e.currentTarget.src='/brand/logo.png?v=0.4.1';}}/>;
 if(!expanded)return <section className="podcast-player is-mini" aria-label={t('player.aria',{title:view.title})}>
  {children}
  <button type="button" className="mini-open" aria-label={t('player.expand')} onClick={()=>onExpand(true)}>{art}<span className="podcast-player-title"><strong>{view.title}</strong><span className="podcast-clock">{clock(view.position)} / {view.duration>0?clock(view.duration):'--:--'}</span></span></button>
  {toggle}
  <button type="button" className="player-expand" aria-label={t('player.expand')} onClick={()=>onExpand(true)}><ChevronUp size={22}/></button>
 </section>;
 return <section className="podcast-player is-open" aria-label={t('player.aria',{title:view.title})}>
  {children}
  <div className="player-sheet-top">
   <button type="button" className="player-collapse" aria-label={t('player.collapse')} onClick={()=>onExpand(false)}><ChevronDown size={22}/></button>
   <button type="button" className="player-close" aria-label={t('player.close')} onClick={act.close}><X size={20}/></button>
  </div>
  {art}
  <div className="podcast-player-title"><strong>{view.title}</strong><span className="podcast-clock">{clock(view.position)} / {view.duration>0?clock(view.duration):t('player.measuring')}</span></div>
  <div className="podcast-timeline"><Slider aria-label={t('player.seekAria')} aria-valuetext={t('player.seekValue',{position:clock(view.position),duration:clock(view.duration)})} value={[Math.min(view.position,view.duration||0)]} min={0} max={view.duration||1} step={0.1} disabled={!view.seekable} onValueChange={v=>(act.scrub??act.seekTo)(v[0])} onValueCommit={v=>act.seekTo(v[0])}/><div className="podcast-times"><span>{clock(view.position)}</span><span>{view.duration>0?clock(view.duration):t('player.measuring')}</span></div></div>
  <div className="podcast-transport"><button onClick={()=>act.seekBy(-15)} disabled={!view.seekable} aria-label={t('player.back15')}><RotateCcw size={19}/><span>15</span></button>{toggle}<button onClick={()=>act.seekBy(15)} disabled={!view.seekable} aria-label={t('player.forward15')}><RotateCw size={19}/><span>15</span></button></div>
  <div className="player-extras"><label>{t('player.rate')} <select value={view.rate} onChange={e=>act.setRate(Number(e.target.value))}>{[.75,1,1.25,1.5,1.75,2].map(value=><option key={value} value={value}>{value}×</option>)}</select></label><label>{t('player.sleep')} <select value={view.sleepValue} onChange={e=>act.setSleep(e.target.value)}>{view.sleepOptions.map(o=><option key={String(o.value)} value={o.value}>{o.label}</option>)}</select></label></div>
  {view.message&&<p className="podcast-player-message" role="status">{view.message}</p>}
 </section>;
}
