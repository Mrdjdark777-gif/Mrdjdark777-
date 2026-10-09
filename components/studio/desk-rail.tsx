'use client';
import {BookOpen,Download,Headphones,Home,Radio,Video} from 'lucide-react';
import {useT} from '@/components/i18n-provider';
import {haptic} from '@/lib/client';
import {AndroidMark} from './android-mark';

/**
 * Боковое меню слушателя на ПК (концепция «Студия звука»). На телефоне и
 * планшете его нет: там разделы внизу экрана под пальцем.
 *
 * Сверху — знак канала и разделы, «Главная» первой; у «Эфира» — состояние
 * станции. Внизу — то, ради чего человек приходит на сайт с компьютера:
 * карточка приложения (главный шаг, поэтому крупно) и соцсети, YouTube —
 * отдельной кнопкой: там ролики канала.
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

export function DeskRail({view,onGoto,onAir,app,youtube,socials}:{
 view:string;onGoto:(view:string)=>void;onAir:boolean;
 /** Ссылка на приложение — только в браузере (не внутри самого приложения). */
 app?:{href:string}|null;
 /** Канал на YouTube — своей кнопкой; остальные площадки — значками. */
 youtube?:string|null;
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
   <span className="desk-app-head"><span className="desk-app-mark"><AndroidMark/></span><strong>{t('desk.appTitle')}</strong></span>
   <span className="desk-app-note">{t('desk.appNote')}</span>
   <span className="desk-app-action"><Download size={17}/>{t('desk.appAction')}</span>
  </a>}
  {(youtube||socials)&&<div className="desk-social-block">
   <span className="desk-social-title">{t('desk.socialTitle')}</span>
   {youtube&&<a className="desk-youtube" href={youtube} target="_blank" rel="noopener noreferrer"><YoutubeMark/>{t('desk.youtube')}</a>}
   {socials&&<div className="desk-socials">{socials}</div>}
  </div>}
 </aside>;
}

/** Знак YouTube: красная плашка с треугольником — узнаётся без подписи. */
function YoutubeMark(){
 return <svg className="desk-youtube-mark" viewBox="0 0 28 20" width="28" height="20" aria-hidden="true"><rect width="28" height="20" rx="5" fill="#ff0033"/><path d="M11 5.5v9l8-4.5z" fill="#fff"/></svg>;
}
