'use client';
import {useEffect,useRef,useState} from 'react';
import {EyeOff,MoreHorizontal,Play} from 'lucide-react';
import {homeScene,type ScenePost,type SceneLive} from '@/lib/home-scene';
import {readProgress} from '@/lib/listening-progress';
import {readSeen,readHidden,hideHighlight} from '@/lib/seen-posts';
import {useT} from '@/components/i18n-provider';
import {clock,haptic} from '@/lib/client';

/**
 * Главный кадр: одна сцена во весь первый экран — фотография выпуска, поверх
 * неё снизу метка, название и действие.
 *
 * Фотография настоящая: обложка публикации или обложка эфира. Своей обложки
 * нет — остаётся фирменный тёмный фон с логотипом, и никакого стока: лучше
 * честный тёмный кадр, чем чужая картинка, выдаваемая за материал автора.
 */
const HOLD_MS=500;
export function CinemaHero({posts,live,onOpen,onOpenLive,liveAction}:{posts:ScenePost[];live:SceneLive|null;onOpen:(post:ScenePost)=>void;onOpenLive:()=>void;liveAction:string}){
 const {t}=useT();
 const [device,setDevice]=useState<{progress:ReturnType<typeof readProgress>;seen:string[];hidden:string[]}>({progress:[],seen:[],hidden:[]});
 const [menu,setMenu]=useState<{id:string;title:string}|null>(null);
 const hold=useRef<ReturnType<typeof setTimeout>|null>(null),held=useRef(false);
 // Прогресс, открытые и убранные карточки лежат в хранилище браузера, поэтому
 // читаются после первой отрисовки: на сервере localStorage нет.
 useEffect(()=>{
  const update=()=>setDevice({progress:readProgress(),seen:readSeen(),hidden:readHidden().map(h=>h.id)});
  const timer=setTimeout(update,0);
  for(const event of ['tt-progress','tt-seen','tt-hidden'])window.addEventListener(event,update);
  return()=>{clearTimeout(timer);for(const event of ['tt-progress','tt-seen','tt-hidden'])window.removeEventListener(event,update);};
 },[]);
 useEffect(()=>()=>{if(hold.current)clearTimeout(hold.current);},[]);
 const scene=homeScene({posts,live,progress:device.progress,seen:device.seen,hidden:device.hidden});
 if(scene.kind==='empty')return <section className="scene scene-empty"><div className="scene-shade"/><div className="scene-copy"><span className="scene-label">{t('home.eyebrow')}</span><h2 className="scene-title">{t('home.emptyTitle')}</h2><p className="scene-note">{t('home.emptyNote')}</p></div></section>;

 const isLive=scene.kind==='live';
 const post=isLive?null:scene.post;
 const cover=isLive?(scene.live.cover?'/api/cover?id=live:'+scene.live.id:''):(post!.coverKey?'/api/cover?id='+post!.id:post!.coverUrl||'');
 const title=isLive?scene.live.title:post!.title;
 const label=isLive?t('live.authorOnAir'):scene.kind==='resume'?t('home.continue'):scene.kind==='fresh'?t('home.latest'):t('home.fromArchive');
 const meta=isLive?'':scene.kind==='resume'?clock(scene.position)+' / '+clock(scene.duration)
  :post!.kind==='podcast'&&post!.duration>0?clock(post!.duration)
  :post!.kind==='video'?t('post.video'):post!.kind==='story'?t('post.story'):'';
 const action=isLive?liveAction:post!.kind==='podcast'?(scene.kind==='resume'?t('home.resumeAction'):t('post.listen')):post!.kind==='video'?t('post.watch'):t('post.read');
 const open=()=>{haptic();if(isLive)onOpenLive();else onOpen(post!);};
 // Долгое нажатие по кадру — то же меню, что и «⋯»: убрать сюжет с главной.
 const card={id:post?.id??'',title};
 const press=isLive?{}:{
  onPointerDown:()=>{held.current=false;if(hold.current)clearTimeout(hold.current);hold.current=setTimeout(()=>{held.current=true;haptic();setMenu(card);},HOLD_MS);},
  onPointerUp:()=>{if(hold.current)clearTimeout(hold.current);},
  onPointerLeave:()=>{if(hold.current)clearTimeout(hold.current);},
  onPointerCancel:()=>{if(hold.current)clearTimeout(hold.current);held.current=true;},
  onContextMenu:(e:React.MouseEvent)=>e.preventDefault(),
 };
 return <>
  <section className={'scene'+(isLive?' scene-live':'')+(cover?'':' scene-fallback')} {...press}>
   {cover
    ?<img className="scene-photo" src={cover} alt="" referrerPolicy="no-referrer" onError={e=>{e.currentTarget.closest('.scene')?.classList.add('scene-fallback');e.currentTarget.remove();}}/>
    :<img className="scene-mark" src="/brand/logo.png?v=0.4.1" alt="" width="128" height="128"/>}
   <div className="scene-shade"/>
   <div className="scene-copy">
    <span className="scene-label">{isLive&&<span className="scene-dot"/>}{label}</span>
    <h2 className="scene-title">{title}</h2>
    {meta&&<span className="scene-meta">{meta}</span>}
    <button type="button" className="scene-action" onClick={open}><Play size={19} fill="currentColor"/>{action}</button>
   </div>
   {!isLive&&<button type="button" className="scene-menu" aria-label={t('home.cardMenu')} onClick={e=>{e.stopPropagation();haptic();setMenu(card);}} onPointerDown={e=>e.stopPropagation()}><MoreHorizontal size={22}/></button>}
   {!isLive&&<button type="button" className="scene-open" aria-label={action} onClick={()=>{if(held.current){held.current=false;return;}open();}}/>}
  </section>
  {menu&&<div className="card-menu-backdrop" onClick={()=>setMenu(null)} role="presentation">
   <div className="card-menu" onClick={e=>e.stopPropagation()}>
    <strong>{menu.title}</strong>
    <button className="card-menu-action" onClick={()=>{hideHighlight(menu.id,0);setMenu(null);}}><EyeOff size={18}/>{t('home.hideCard')}</button>
    <button className="quiet-button" onClick={()=>setMenu(null)}>{t('common.cancel')}</button>
   </div>
  </div>}
 </>;
}
