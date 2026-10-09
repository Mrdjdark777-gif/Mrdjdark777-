'use client';
import {BookOpen,Download,Headphones,Home,Radio,Video} from 'lucide-react';
import {useT} from '@/components/i18n-provider';
import {haptic} from '@/lib/client';
import {AppQr} from './app-qr';

/**
 * Боковое меню слушателя на ПК (концепция «Студия звука»). На телефоне и
 * планшете его нет: там разделы внизу экрана под пальцем.
 *
 * Сверху — знак канала и разделы, «Главная» первой; у «Эфира» — состояние
 * станции. Внизу — то, ради чего человек приходит на сайт с компьютера:
 * карточка приложения (главный шаг, поэтому крупно, с QR-кодом: навёл камеру
 * телефона — APK скачался на телефон) и соцсети. YouTube и TikTok —
 * плашками с логотипом: там ролики канала; остальные площадки — значками.
 *
 * Поддержки в меню нет: владелец убрал карточку 9 октября («слишком броская»).
 * Поддержать можно сердечком вверху справа.
 */
const ITEMS=[
 {id:'home',key:'nav.home',Icon:Home},
 {id:'podcasts',key:'nav.podcasts',Icon:Headphones},
 {id:'videos',key:'nav.videos',Icon:Video},
 {id:'stories',key:'nav.stories',Icon:BookOpen},
 {id:'live',key:'nav.live',Icon:Radio},
] as const;

export function DeskRail({view,onGoto,onAir,app,youtube,tiktok,socials}:{
 view:string;onGoto:(view:string)=>void;onAir:boolean;
 /** Ссылка на приложение — только в браузере (не внутри самого приложения). */
 app?:{href:string}|null;
 /** YouTube и TikTok — плашками с логотипом; остальные площадки — значками. */
 youtube?:string|null;
 tiktok?:string|null;
 socials?:React.ReactNode;
}){
 const {t}=useT();
 return <aside className="desk-rail" aria-label={t('nav.aria')}>
  <button type="button" className="desk-brand" onClick={()=>{haptic();onGoto('home');}} aria-label={t('nav.home')}>
   <img src="/brand/logo.png?v=0.4.1" width="40" height="40" alt=""/><span>True Thrills</span>
  </button>
  <nav className="desk-nav">
   {ITEMS.map(({id,key,Icon})=><button key={id} type="button" className="desk-nav-item" data-active={view===id?'true':undefined} aria-current={view===id?'page':undefined} onClick={()=>{haptic();onGoto(id);}}>
    <Icon size={20}/><span>{t(key)}</span>
    {id==='live'&&<span className={'desk-live-pill'+(onAir?' is-on':'')}>{onAir?t('live.weAreOnAir'):t('live.noBroadcast')}</span>}
   </button>)}
  </nav>
  <div className="desk-rail-grow"/>
  {app&&<a className="desk-app" href={app.href} download>
   <strong className="desk-app-title">{t('desk.appTitle')}</strong>
   <span className="desk-app-head">
    <span className="desk-app-qr"><AppQr href={app.href} label={t('desk.appQr')}/></span>
    <span className="desk-app-scan">{t('desk.appScan')}</span>
   </span>
   <span className="desk-app-action"><Download size={17}/>{t('desk.appAction')}</span>
  </a>}
  {(youtube||tiktok||socials)&&<div className="desk-social-block">
   <span className="desk-social-title">{t('desk.socialTitle')}</span>
   {youtube&&<a className="desk-youtube desk-brand-link" href={youtube} target="_blank" rel="noopener noreferrer"><YoutubeMark/><span className="desk-brand-full">{t('desk.youtube')}</span><span className="desk-brand-short">YouTube</span></a>}
   {tiktok&&<a className="desk-tiktok desk-brand-link" href={tiktok} target="_blank" rel="noopener noreferrer"><TiktokMark/><span className="desk-brand-full">{t('desk.tiktok')}</span><span className="desk-brand-short">TikTok</span></a>}
   {socials&&<div className="desk-socials">{socials}</div>}
  </div>}
 </aside>;
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
