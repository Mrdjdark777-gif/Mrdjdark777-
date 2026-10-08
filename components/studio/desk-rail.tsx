'use client';
import {BookOpen,Headphones,Home,Radio,Video} from 'lucide-react';
import {useT} from '@/components/i18n-provider';
import {haptic} from '@/lib/client';
import {HeartBeam} from '@/components/ui/heart-beam';
import {AndroidMark} from './android-mark';

/**
 * Боковое меню слушателя на ПК (концепция «Студия звука»). На телефоне и
 * планшете его нет: там разделы внизу экрана под пальцем.
 *
 * Сверху — знак канала и разделы, «Главная» первой; у «Эфира» — состояние
 * станции. Внизу — то, что на телефоне живёт в конце главной: поддержка,
 * ссылка на приложение, соцсети. На ПК главная занята выпусками, а меню видно
 * с любого экрана.
 */
const ITEMS=[
 {id:'home',key:'nav.home',Icon:Home},
 {id:'podcasts',key:'nav.podcasts',Icon:Headphones},
 {id:'videos',key:'nav.videos',Icon:Video},
 {id:'stories',key:'nav.stories',Icon:BookOpen},
 {id:'live',key:'nav.live',Icon:Radio},
] as const;

export function DeskRail({view,onGoto,onAir,onSupport,app,socials}:{
 view:string;onGoto:(view:string)=>void;onAir:boolean;
 /** Окно выбора площадки поддержки; нет площадок — нет и кнопки. */
 onSupport?:()=>void;
 /** Ссылка на приложение — только в браузере (не внутри самого приложения). */
 app?:{href:string;version:string}|null;
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
  <div className="desk-support">
   <strong>{t('home.supportTitle')}</strong>
   <p>{t('home.supportNote')}</p>
   {onSupport?<button type="button" className="desk-cta desk-support-button" onClick={()=>{haptic();onSupport();}}><HeartBeam size={18}/>{t('header.support')}</button>
    :<p className="desk-support-off">{t('donate.unavailable')}</p>}
  </div>
  {app&&<a className="desk-app" href={app.href} download><AndroidMark/><span>{t('app.download')}</span><em>{app.version}</em></a>}
  {socials&&<div className="desk-socials">{socials}</div>}
 </aside>;
}
