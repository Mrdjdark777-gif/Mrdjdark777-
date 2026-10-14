'use client';
import {useEffect,useRef,useState} from 'react';
import {BookOpen,Download,Headphones,Home,Radio,Smartphone,Video,BellRing,MoonStar,ShieldCheck} from 'lucide-react';
import {useT} from '@/components/i18n-provider';
import {haptic} from '@/lib/client';
import {AppQr} from './app-qr';

/**
 * Навигация сайта на ПК (концепция «Студия звука»). На телефоне и планшете
 * этого нет: там разделы внизу экрана под пальцем.
 *
 * 13 октября владелец убрал боковое меню совсем: разделы — в верхней строке
 * по центру («переместить по центру экрана, чтоб они были прям видны»), а
 * колонка, где остались только QR-код и соцсети, «пустая, смотрится тупо и
 * грустно». Теперь:
 * - знак канала — слева в верхней строке, разделы — по центру (DeskTabs);
 * - «Приложение» — кнопкой справа в верхней строке: открывает QR-код
 *   (DeskAppButton), так он есть на первом экране любой страницы;
 * - под «Новое» на главной — полоса приложения: фирменный QR-код, что даёт
 *   приложение, кнопка скачивания и соцсети (DeskAppBand). YouTube и TikTok —
 *   плашками с логотипом: там ролики канала; остальные площадки — значками.
 *
 * Поддержки здесь нет: владелец убрал карточку 9 октября («слишком броская»).
 * Поддержать можно сердечком вверху справа.
 */
const ITEMS=[
 {id:'home',key:'nav.home',Icon:Home},
 {id:'podcasts',key:'nav.podcasts',Icon:Headphones},
 {id:'videos',key:'nav.videos',Icon:Video},
 {id:'stories',key:'nav.stories',Icon:BookOpen},
 {id:'live',key:'nav.live',Icon:Radio},
] as const;

/** Разделы сайта — кнопками в одну линию по центру верхней строки. «Главная»
 *  первой; у «Эфира» — состояние станции. */
export function DeskTabs({view,onGoto,onAir}:{view:string;onGoto:(view:string)=>void;onAir:boolean}){
 const {t}=useT();
 return <nav className="desk-tabs" aria-label={t('nav.aria')}>
  {ITEMS.map(({id,key,Icon})=><button key={id} type="button" className="desk-tab" data-active={view===id?'true':undefined} aria-current={view===id?'page':undefined} onClick={()=>{haptic();onGoto(id);}}>
   <Icon size={18}/><span>{t(key)}</span>
   {id==='live'&&<span className={'desk-live-pill'+(onAir?' is-on':'')}>{onAir?t('live.weAreOnAir'):t('live.noBroadcast')}</span>}
  </button>)}
 </nav>;
}

/** Знак канала слева в верхней строке — ведёт на главную. */
export function DeskBrand({onGoto}:{onGoto:(view:string)=>void}){
 const {t}=useT();
 return <button type="button" className="desk-brand" onClick={()=>{haptic();onGoto('home');}} aria-label={t('nav.home')}>
  <img src="/brand/logo.png?v=0.4.1" width="40" height="40" alt=""/><span>True Thrills</span>
 </button>;
}

/** «Приложение» в верхней строке: окошко с QR-кодом и кнопкой скачивания.
 *  Закрывается по Escape, по второму нажатию и по щелчку мимо. */
export function DeskAppButton({href}:{href:string}){
 const {t}=useT();
 const [open,setOpen]=useState(false);
 const box=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  if(!open)return;
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false);};
  const away=(e:PointerEvent)=>{if(!box.current?.contains(e.target as Node))setOpen(false);};
  window.addEventListener('keydown',key);window.addEventListener('pointerdown',away);
  return()=>{window.removeEventListener('keydown',key);window.removeEventListener('pointerdown',away);};
 },[open]);
 return <div className="desk-app-pop" ref={box}>
  <button type="button" className="desk-app-button" aria-expanded={open} aria-haspopup="dialog" onClick={()=>{haptic();setOpen(v=>!v);}}><Smartphone size={18}/><span>{t('desk.appButton')}</span></button>
  {open&&<div className="desk-app-panel" role="dialog" aria-label={t('desk.appTitle')}>
   <span className="desk-qr-card"><AppQr href={href} label={t('desk.appQr')}/></span>
   <strong>{t('desk.appTitle')}</strong>
   <span className="desk-app-scan">{t('desk.appScan')}</span>
   <a className="desk-app-action" href={href} download><Download size={17}/>{t('desk.appAction')}</a>
   {/* Приложение ставится не из Google Play, и Android показывает окно «Play
       Защита» — для человека со стороны оно выглядит как «вирус». Три шага,
       что нажать (14 октября владелец: подсказка только здесь, в окне
       кнопки «Приложение», больше нигде). */}
   <div className="desk-app-steps">
    <span>{t('desk.installTitle')}</span>
    <ol>{(['desk.install1','desk.install2','desk.install3'] as const).map(k=><li key={k}>{t(k)}</li>)}</ol>
   </div>
  </div>}
 </div>;
}

/** Полоса под «Новое» на главной: приложение (QR-код, что оно даёт,
 *  скачивание) и соцсети. В программе для ПК приложения не предлагаем —
 *  остаются соцсети. Все три пункта «что даёт» — то, что приложение делает
 *  на самом деле: звук в фоне (Media3), уведомления об эфирах и выпусках,
 *  без рекламы. */
export function DeskAppBand({app,youtube,tiktok,socials}:{
 /** Ссылка на приложение — только в браузере (не внутри самого приложения). */
 app?:{href:string}|null;
 youtube?:string|null;
 tiktok?:string|null;
 socials?:React.ReactNode;
}){
 const {t}=useT();
 if(!app&&!youtube&&!tiktok&&!socials)return null;
 return <section className={'desk-app-band'+(app?'':' is-social-only')} aria-label={app?t('desk.appTitle'):t('desk.socialTitle')}>
  {app&&<>
   <span className="desk-qr-card is-band"><AppQr href={app.href} label={t('desk.appQr')}/></span>
   <div className="desk-band-copy">
    <span className="desk-band-eyebrow">{t('desk.appTitle')}</span>
    <h2>{t('desk.appHeadline')}</h2>
    <ul className="desk-band-points">
     <li><MoonStar size={18}/>{t('desk.appPoint1')}</li>
     <li><BellRing size={18}/>{t('desk.appPoint2')}</li>
     <li><ShieldCheck size={18}/>{t('desk.appPoint3')}</li>
    </ul>
    <div className="desk-band-actions">
     <a className="desk-app-action" href={app.href} download><Download size={17}/>{t('desk.appAction')}</a>
     <span className="desk-app-scan">{t('desk.appScan')}</span>
    </div>
   </div>
  </>}
  {(youtube||tiktok||socials)&&<div className="desk-social-block">
   <span className="desk-band-eyebrow">{t('desk.socialTitle')}</span>
   {youtube&&<a className="desk-youtube desk-brand-link" href={youtube} target="_blank" rel="noopener noreferrer"><YoutubeMark/><span>{t('desk.youtube')}</span></a>}
   {tiktok&&<a className="desk-tiktok desk-brand-link" href={tiktok} target="_blank" rel="noopener noreferrer"><TiktokMark/><span>{t('desk.tiktok')}</span></a>}
   {socials&&<div className="desk-socials">{socials}</div>}
  </div>}
 </section>;
}

/** Знак TikTok: нота с голубой и розовой тенью на чёрном — узнаётся без подписи.
 *  Контур ноты — из набора Simple Icons (CC0). */
function TiktokMark(){
 const d='M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z';
 return <svg className="desk-tiktok-mark" viewBox="0 0 28 20" width="28" height="20" aria-hidden="true"><rect width="28" height="20" rx="5" fill="#000"/>
  <g transform="translate(7.2 3) scale(0.58)"><path d={d} fill="#25f4ee" transform="translate(-1 -0.6)"/><path d={d} fill="#fe2c55" transform="translate(1 0.6)"/><path d={d} fill="#fff"/></g></svg>;
}

/** Знак YouTube: красная плашка с треугольником — узнаётся без подписи. */
function YoutubeMark(){
 return <svg className="desk-youtube-mark" viewBox="0 0 28 20" width="28" height="20" aria-hidden="true"><rect width="28" height="20" rx="5" fill="#ff0033"/><path d="M11 5.5v9l8-4.5z" fill="#fff"/></svg>;
}
