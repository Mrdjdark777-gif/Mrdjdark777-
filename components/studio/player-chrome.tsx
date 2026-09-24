'use client';
import {useEffect,useState,useRef} from 'react';
import {Play,Pause,RotateCcw,RotateCw,Loader2,X,ChevronDown,ChevronUp,MoreHorizontal,Heart,Timer,ChevronRight,Share2} from 'lucide-react';
import {DonationGlow} from '@/components/ui/donation-glow';
import {Waveform} from './waveform';
import {Artwork} from './artwork';
import {Slider} from '@/components/ui/slider';
import {clock,haptic} from '@/lib/client';
import type {Presentation} from '@/lib/player-presentation';
import {pushBackLayer,BACK_MENU,BACK_PLAYER} from '@/lib/back-stack';
import {useT} from '@/components/i18n-provider';
import {swipeAxis,swipeCloses,swipeFade} from '@/lib/swipe';

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
 * по левому краю, форма звука и «Далее»; S06 — круглая обложка записи эфира с
 * кольцом прогресса. Кольцо и полоса показывают один и тот же
 * progress = position / duration и при неизвестной длительности остаются
 * нейтральными, а не изображают ложный процент.
 */
export type PlayerView={
 title:string;cover?:string;position:number;duration:number;playing:boolean;loading:boolean;seekable:boolean;
 rate:number;sleep:number;sleepOptions:{value:string|number;label:string}[];sleepValue:string|number;message?:string;
 presentation:Presentation;kindLabel:string;note?:string;
 postId:string;next?:{id:string;title:string;cover?:string;duration:number}|null;
};
export type PlayerActions={
 toggle:()=>void;seekBy:(seconds:number)=>void;seekTo:(seconds:number)=>void;scrub?:(seconds:number)=>void;
 setRate:(rate:number)=>void;setSleep:(value:string)=>void;close:()=>void;openNext?:(id:string)=>void;share?:()=>void;
 /** Открывает окно выбора площадки поддержки. Нет площадок — нет и сердечка. */
 donate?:()=>void;
};
const RING=2*Math.PI*46;
export function PlayerChrome({view,act,expanded,onExpand,children}:{view:PlayerView;act:PlayerActions;expanded:boolean;onExpand:(next:boolean)=>void;children?:React.ReactNode}){
 const {t}=useT();
 const [menu,setMenu]=useState(false);
 // Описание в плеере обрезано двумя строками: нажатие раскрывает его целиком.
 const [noteOpen,setNoteOpen]=useState(false);
 const [swipe,setSwipe]=useState({x:0});
 const moreRef=useRef<HTMLButtonElement>(null),menuRef=useRef<HTMLDivElement>(null);
 const total=view.duration>0?clock(view.duration):t('player.measuring');
 const type=view.presentation==='type',archive=view.presentation==='archive';
 // Системный Back закрывает сначала меню, потом сворачивает плеер. Слои
 // снимаются вместе с тем, что их открыло, поэтому порядок не расходится
 // с тем, что человек видит.
 useEffect(()=>menu&&expanded?pushBackLayer(BACK_MENU,()=>{setMenu(false);moreRef.current?.focus();return true;}):undefined,[menu,expanded]);
 useEffect(()=>expanded?pushBackLayer(BACK_PLAYER,()=>{onExpand(false);return true;}):undefined,[expanded,onExpand]);
 useEffect(()=>{
  if(!expanded)return;
  if(menu)menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  const key=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();if(menu){setMenu(false);moreRef.current?.focus();}else onExpand(false);}
   if(menu&&['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
    const items=Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')??[]);if(!items.length)return;
    event.preventDefault();const at=items.indexOf(document.activeElement as HTMLElement);
    const next=event.key==='Home'?0:event.key==='End'?items.length-1:(at+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next].focus();
   }
  };
  const outside=(event:PointerEvent)=>{if(menu&&!menuRef.current?.contains(event.target as Node)&&!moreRef.current?.contains(event.target as Node))setMenu(false);};
  document.addEventListener('keydown',key);document.addEventListener('pointerdown',outside);
  return()=>{document.removeEventListener('keydown',key);document.removeEventListener('pointerdown',outside);};
 },[expanded,menu,onExpand]);
 // Один и тот же прогресс для кольца и полосы. Без длительности кольцо
 // остаётся нейтральным: ложный процент хуже, чем его отсутствие.
 const known=view.duration>0&&Number.isFinite(view.duration);
 const sleepSet=String(view.sleepValue)!=='0';
 const sleepLabel=view.sleepOptions.find(o=>String(o.value)===String(view.sleepValue))?.label??'';
 const progress=known?Math.max(0,Math.min(1,view.position/view.duration)):0;
 const toggle=<button className="podcast-toggle" aria-label={view.playing?t('player.pause'):t('player.play')} disabled={view.loading&&!view.playing&&!view.seekable} onClick={act.toggle}>{view.loading?<Loader2 className="spin" size={22}/>:view.playing?<Pause size={23} fill="currentColor"/>:<Play size={23} fill="currentColor"/>}</button>;
 const art=<Artwork className="podcast-player-logo" src={view.cover} fallback={<img className="podcast-player-logo" src="/brand/logo.png?v=0.4.1" alt=""/>}/>;
 const tactile=(event:React.MouseEvent<HTMLElement>)=>{if((event.target as Element).closest('button:not(:disabled),a[href]'))haptic();};
 // Смахивание мини-панели в сторону закрывает плеер. Жест начинается только
 // при заметно горизонтальном движении, иначе обычная прокрутка страницы
 // пальцем поперёк панели утаскивала бы её за собой. Пороги и затухание
 // считает lib/swipe — их проверяет отдельный тест, без браузера.
 // Сдвиг хранится в ref, а не в состоянии: touchend может прийти раньше, чем
 // React перерисует последний touchmove, и обработчик закрытия прочитал бы
 // старое значение — жест «срабатывал» бы через раз.
 const swipeFrom=useRef<{x:number;y:number;dx:number;axis:'horizontal'|'vertical'|'none'}|null>(null);
 const swipeStart=(event:React.TouchEvent)=>{
  const touch=event.touches[0];
  swipeFrom.current={x:touch.clientX,y:touch.clientY,dx:0,axis:'none'};
  setSwipe({x:0});
 };
 const swipeMove=(event:React.TouchEvent)=>{
  const from=swipeFrom.current;if(!from)return;
  const touch=event.touches[0],dx=touch.clientX-from.x,dy=touch.clientY-from.y;
  if(from.axis==='none')from.axis=swipeAxis(dx,dy);
  if(from.axis!=='horizontal')return;
  from.dx=dx;setSwipe({x:dx});
 };
 const swipeEnd=()=>{
  const from=swipeFrom.current;swipeFrom.current=null;
  setSwipe({x:0});
  if(from?.axis==='horizontal'&&swipeCloses(from.dx,window.innerWidth)){haptic();act.close();}
 };
 if(!expanded)return <section className={'podcast-player is-mini'+(swipe.x?' is-swiping':'')}
  style={swipe.x?{transform:'translateX('+swipe.x+'px)',opacity:swipeFade(swipe.x,window.innerWidth)}:undefined}
  onTouchStart={swipeStart} onTouchMove={swipeMove} onTouchEnd={swipeEnd} onTouchCancel={swipeEnd}
  onClickCapture={tactile} aria-label={t('player.aria',{title:view.title})}>
  {children}
  <button type="button" className="mini-open" aria-label={t('player.expand')} onClick={()=>onExpand(true)}>{art}<span className="podcast-player-title"><strong>{view.title}</strong><span className="podcast-clock">{clock(view.position)} / {view.duration>0?clock(view.duration):'--:--'}</span></span></button>
  {toggle}
  <button type="button" className="player-expand" aria-label={t('player.expand')} onClick={()=>onExpand(true)}><ChevronUp size={22}/></button>
 </section>;
 return <section className={'podcast-player is-open is-'+view.presentation} onClickCapture={tactile} aria-label={t('player.aria',{title:view.title})}>
  {children}
  {!archive&&<div className="player-stage" aria-hidden="true">
   <Artwork className="player-stage-photo" src={view.cover} fallback={<img className="player-stage-mark" src="/brand/logo.png?v=0.4.1" alt=""/>}/>
   <span className="player-stage-shade"/>
  </div>}

  <div className="player-sheet-top">
   <button type="button" className="player-collapse tt-pressable" aria-label={t('player.collapse')} onClick={()=>{setMenu(false);onExpand(false);}}><ChevronDown size={22}/></button>
   <span className="player-kind">{view.presentation==='archive'?view.kindLabel:''}</span>
   {/* Ряд задан прямо здесь, а не только в стилях: если страница осталась от
       прежней сборки, кнопки всё равно встанут в строку, а не столбиком.
       Класс player-more на всех трёх — по той же причине: он уже есть в
       прежних стилях, поэтому размер и форма не разъедутся. */}
   <div className="player-sheet-actions" style={{display:'flex',alignItems:'center',gap:2}}>
    {act.donate&&<DonationGlow><button type="button" className="player-more player-donate tt-pressable" aria-label={t('donate.action')} title={t('donate.action')} onClick={()=>{setMenu(false);act.donate!();}}><Heart size={21}/></button></DonationGlow>}
    <button type="button" className="player-more player-close tt-pressable" aria-label={t('player.close')} title={t('player.close')} onClick={()=>{setMenu(false);act.close();}}><X size={22}/></button>
    <button ref={moreRef} type="button" className="player-more player-menu-button tt-pressable" aria-label={t('player.menu')} aria-haspopup="menu" aria-expanded={menu} onClick={()=>setMenu(v=>!v)}><MoreHorizontal size={22}/></button>
   </div>
  </div>

  <div className="player-body">
   {archive&&<div className="player-orb" aria-hidden="true">
    <svg className="player-orb-ring" viewBox="0 0 100 100">
     <circle className="player-orb-track" cx="50" cy="50" r="46"/>
     {known&&<circle className="player-orb-progress" cx="50" cy="50" r="46"
      strokeDasharray={RING} strokeDashoffset={RING*(1-progress)}/>}
    </svg>
    <Artwork src={view.cover} fallback={<img className="player-orb-mark" src="/brand/logo.png?v=0.4.1" alt=""/>}/>
   </div>}
   {type?<>
    <span className="player-tagline">{view.kindLabel}</span>
    <h2 className="player-title">{view.title}</h2>
    {view.note&&<p className={'player-note'+(noteOpen?' is-open':'')} role="button" tabIndex={0}
     onClick={()=>setNoteOpen(v=>!v)}
     onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setNoteOpen(v=>!v);}}}>{view.note}</p>}
    <Waveform key={view.postId} postId={view.postId} progress={view.duration>0?view.position/view.duration:0}/>
   </>:<>
    {/* У записи эфира метка уже стоит в верхней панели: второй раз её не повторяем. */}
    {!archive&&<div className="player-caption">
     <span className="player-brand">True Thrills</span>
     <span className="player-tagline">{view.kindLabel}{view.duration>0?' · '+clock(view.duration):''}</span>
    </div>}
    <h2 className="player-title">{view.title}</h2>
    {view.note&&<p className={'player-note'+(noteOpen?' is-open':'')} role="button" tabIndex={0}
     onClick={()=>setNoteOpen(v=>!v)}
     onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setNoteOpen(v=>!v);}}}>{view.note}</p>}
   </>}

   <div className="podcast-timeline"><Slider aria-label={t('player.seekAria')} aria-valuetext={t('player.seekValue',{position:clock(view.position),duration:clock(view.duration)})} value={[Math.min(view.position,view.duration||0)]} min={0} max={view.duration||1} step={0.1} disabled={!view.seekable} onValueChange={v=>(act.scrub??act.seekTo)(v[0])} onValueCommit={v=>act.seekTo(v[0])}/><div className="podcast-times"><span>{clock(view.position)}</span><span>{total}</span></div></div>
   <div className="podcast-transport"><button onClick={()=>act.seekBy(-15)} disabled={!view.seekable} aria-label={t('player.back15')}><RotateCcw size={19}/><span>15</span></button>{toggle}<button onClick={()=>act.seekBy(15)} disabled={!view.seekable} aria-label={t('player.forward15')}><RotateCw size={19}/><span>15</span></button></div>
   <div className="player-extras">
    <label className="player-extra">
     <span className="player-extra-value">{view.rate}×</span><span>{t('player.rate')}</span>
     <select className="player-extra-select" aria-label={t('player.rate')} value={view.rate} onChange={e=>act.setRate(Number(e.target.value))}>{[.75,1,1.25,1.5,1.75,2].map(value=><option key={value} value={value}>{value}×</option>)}</select>
    </label>
    {/* Выключенный таймер не пишет «Выкл.»: на листе под часами стоит только
        подпись, а само значение появляется, когда таймер действительно заведён. */}
    <label className="player-extra">
     <span className="player-extra-icon"><Timer size={19}/></span>
     {sleepSet&&<span className="player-extra-value">{sleepLabel}</span>}
     <span>{t('player.sleepShort')}</span>
     <select className="player-extra-select" aria-label={t('player.sleep')} value={view.sleepValue} onChange={e=>act.setSleep(e.target.value)}>{view.sleepOptions.map(o=><option key={String(o.value)} value={o.value}>{o.label}</option>)}</select>
    </label>
   </div>
   {view.message&&<p className="podcast-player-message" role="status">{view.message}</p>}
   {type&&view.next&&act.openNext&&<button type="button" className="player-next tt-pressable" onClick={()=>act.openNext!(view.next!.id)}>
    <span className="player-next-label">{t('player.next')}</span>
    <span className="player-next-row">
     <Artwork src={view.next.cover} loading="lazy" fallback={<span className="player-next-mark"/>}/>
     <span className="player-next-copy"><strong>{view.next.title}</strong>{view.next.duration>0&&<span>{clock(view.next.duration)}</span>}</span>
     <ChevronRight size={18}/>
    </span>
   </button>}
  </div>

  {menu&&<div ref={menuRef} className="player-menu" role="menu">
   {act.share&&<button type="button" role="menuitem" onClick={()=>{setMenu(false);act.share!();}}><Share2 size={17}/>{t('share.action')}</button>}
   <button type="button" role="menuitem" onClick={()=>{setMenu(false);act.close();}}><X size={17}/>{t('player.close')}</button>
  </div>}
 </section>;
}
