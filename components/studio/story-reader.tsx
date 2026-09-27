'use client';
import './story-reader.css';
import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,Bookmark,BookmarkCheck,List,Minus,Plus,Settings2,Trash2,X} from 'lucide-react';
import {pushBackLayer,BACK_MENU} from '@/lib/back-stack';
import {useT} from '@/components/i18n-provider';
import {haptic} from '@/lib/client';

/**
 * Читалка во весь экран, с листанием по страницам.
 *
 * Страницы делает сам браузер: текст льётся в колонки шириной ровно в полосу
 * чтения (CSS multi-column), а лента сдвигается на целую колонку. Переносы,
 * абзацы и висячие строки браузер считает сам — это разбивка по тексту, а не
 * деление на куски по количеству букв.
 *
 * Место хранится долей прочитанного, а не номером страницы: сменил размер
 * шрифта — страниц стало другое количество, а доля осталась прежней.
 */

type Mark={ratio:number;text:string;at:number};
type Prefs={size:number;theme:Theme;serif:boolean;dim:number};
type Theme='day'|'sepia'|'night'|'black';
type Turn={from:number;dir:'fwd'|'back';key:number};

const THEMES:Theme[]=['day','sepia','night','black'];
const SIZES=[16,18,20,22,25,28];
const LEAD=1.7;
const PREFS_KEY='tt-reader-prefs-v1';
const DEFAULTS:Prefs={size:20,theme:'night',serif:true,dim:0};

const readPrefs=():Prefs=>{try{
 const v=JSON.parse(localStorage.getItem(PREFS_KEY)||'null');
 if(!v||typeof v!=='object')return DEFAULTS;
 return {size:SIZES.includes(v.size)?v.size:DEFAULTS.size,
  theme:THEMES.includes(v.theme)?v.theme:DEFAULTS.theme,
  serif:typeof v.serif==='boolean'?v.serif:DEFAULTS.serif,
  dim:Number.isFinite(v.dim)?Math.min(.7,Math.max(0,v.dim)):0};
}catch{return DEFAULTS;}};

const readSaved=(id:string):{ratio?:number;marks?:Mark[]}=>{try{
 const v=JSON.parse(localStorage.getItem('tt-reading-'+id)||'null');
 return v&&typeof v==='object'?v:{};
}catch{return {};}};

export function StoryReader({id,title,description,body,onClose}:{
 id:string;title:string;description?:string;body:string;onClose:()=>void;
}){
 const {t}=useT();
 const stage=useRef<HTMLDivElement>(null),flow=useRef<HTMLDivElement>(null);
 const [prefs,setPrefs]=useState<Prefs>(DEFAULTS);
 const [page,setPage]=useState(0),[pages,setPages]=useState(1),[step,setStep]=useState(0);
 const [chrome,setChrome]=useState(true);
 const [sheet,setSheet]=useState<'none'|'settings'|'marks'>('none');
 const [marks,setMarks]=useState<Mark[]>([]);
 const [turn,setTurn]=useState<Turn|null>(null);
 const wanted=useRef(0),insets=useRef<{top:number;bottom:number}|null>(null),turnId=useRef(0);
 const [loaded,setLoaded]=useState(false);
 const paragraphs=useMemo(()=>body.split(/\n+/).map(p=>p.trim()).filter(Boolean),[body]);

 // Сброса loaded здесь нет намеренно: читалка смонтирована с key по id, и на
 // другую историю она заходит новым экземпляром, а не сменой поля.
 useEffect(()=>{const timer=setTimeout(()=>{
   setPrefs(readPrefs());const s=readSaved(id);
   setMarks(Array.isArray(s.marks)?s.marks:[]);
   wanted.current=Math.min(1,Math.max(0,Number(s.ratio)||0));
   setLoaded(true);},0);
  return()=>clearTimeout(timer);},[id]);

 // Системные часы и панели убирает полноэкранный режим браузера: в приложении
 // он доходит до оболочки, и та прячет панели Android. Просьбу нельзя подать
 // откуда угодно — браузер требует, чтобы её вызвало действие человека,
 // поэтому пробуем при открытии и обязательно повторяем по нажатию.
 const goFull=useCallback(()=>{try{
  const el=document.documentElement;
  if(!document.fullscreenElement&&el.requestFullscreen)void el.requestFullscreen().catch(()=>{});
 }catch{}},[]);
 useEffect(()=>{goFull();
  return()=>{try{if(document.fullscreenElement)void document.exitFullscreen().catch(()=>{});}catch{}};},[goFull]);

 const savePrefs=useCallback((next:Prefs)=>{setPrefs(next);
  try{localStorage.setItem(PREFS_KEY,JSON.stringify(next));}catch{}},[]);
 const saveMarks=useCallback((next:Mark[],ratio:number)=>{setMarks(next);
  try{localStorage.setItem('tt-reading-'+id,JSON.stringify({ratio,marks:next}));}catch{}},[id]);

 useLayoutEffect(()=>{
  const measure=()=>{
   const box=stage.current,line=flow.current;if(!box||!line)return;
   const pad=Math.round(Math.min(34,Math.max(16,box.clientWidth*0.07)));
   const col=Math.max(120,box.clientWidth-pad*2),gap=pad*2;
   line.style.setProperty('--tt-col',col+'px');
   line.style.setProperty('--tt-gap',gap+'px');
   // Высота полосы подгоняется под целое число строк: иначе колонка обрывается
   // посреди строки и внизу страницы висит половина букв.
   //
   // Отступы сверху и снизу берутся из стилей ОДИН раз и запоминаются. Считать
   // их заново нельзя: после первой подгонки у полосы стоит своя высота, и её
   // собственный размер — это уже высота всего текста, а не свободного места.
   if(!insets.current){const css=getComputedStyle(line);
    insets.current={top:parseFloat(css.top)||0,bottom:parseFloat(css.bottom)||0};}
   const lead=prefs.size*LEAD;
   const free=box.clientHeight-insets.current.top-insets.current.bottom;
   const fits=Math.max(1,Math.floor(free/lead));
   line.style.bottom='auto';
   line.style.height=Math.round(fits*lead)+'px';
   const total=Math.max(1,Math.round((line.scrollWidth+gap)/(col+gap)));
   setStep(col+gap);setPages(total);
   const next=Math.round(Math.min(1,Math.max(0,wanted.current))*(total-1));
   setPage(Number.isFinite(next)?next:0);
  };
  const box=stage.current;if(!box)return;
  measure();
  const observer=new ResizeObserver(measure);observer.observe(box);
  return()=>observer.disconnect();
 // loaded в зависимостях не случайно: разбивку надо пересчитать и вернуться на
 // сохранённое место ровно тогда, когда это место прочитано из хранилища.
 },[body,prefs.size,prefs.serif,loaded]);

 const ratio=pages>1?page/(pages-1):0;
 useEffect(()=>{if(!loaded)return;
  try{localStorage.setItem('tt-reading-'+id,JSON.stringify({ratio,marks}));}catch{}},[id,loaded,ratio,marks]);

 // Переворот страницы. Верхний слой — уходящая страница: вперёд она
 // поднимается от левого корешка и уходит влево, назад — от правого и вправо.
 // Под ней уже лежит новая, поэтому номер меняется сразу.
 const go=useCallback((next:number)=>{
  const limit=Math.min(pages-1,Math.max(0,next));
  setPage(prev=>{
   if(limit===prev)return prev;
   turnId.current+=1;
   setTurn({from:prev,dir:limit>prev?'fwd':'back',key:turnId.current});
   wanted.current=pages>1?limit/(pages-1):0;
   return limit;});
 },[pages]);

 useEffect(()=>sheet==='none'?undefined:pushBackLayer(BACK_MENU,()=>{setSheet('none');return true;}),[sheet]);

 // Листать можно и нажатием по краю, и смахиванием. Одного нажатия мало:
 // человек ищет свайп первым делом и без него решает, что страница не
 // переключается вовсе.
 const touch=useRef<{x:number;y:number;moved:boolean}|null>(null);
 const down=(e:React.PointerEvent<HTMLDivElement>)=>{
  touch.current={x:e.clientX,y:e.clientY,moved:false};
  e.currentTarget.setPointerCapture?.(e.pointerId);
 };
 const move=(e:React.PointerEvent<HTMLDivElement>)=>{
  const from=touch.current;if(!from)return;
  if(Math.abs(e.clientX-from.x)>10||Math.abs(e.clientY-from.y)>10)from.moved=true;
 };
 const up=(e:React.PointerEvent<HTMLDivElement>)=>{
  const from=touch.current;touch.current=null;if(!from)return;
  const dx=e.clientX-from.x,dy=e.clientY-from.y;
  if(Math.abs(dx)>=40&&Math.abs(dx)>Math.abs(dy)){haptic();go(page+(dx<0?1:-1));return;}
  // Смахивание, которое не дотянуло до порога, страницу не листает и по
  // краям не срабатывает: иначе палец, дрогнувший при пролистывании, открывал
  // бы соседнюю страницу.
  if(from.moved)return;
  const box=e.currentTarget.getBoundingClientRect();
  const x=(e.clientX-box.left)/box.width;
  if(x<.3){haptic();go(page-1);return;}
  if(x>.7){haptic();go(page+1);return;}
  goFull();setChrome(v=>!v);
 };

 const here=marks.find(m=>Math.abs(m.ratio-ratio)<.004);
 const toggleMark=()=>{haptic();
  if(here){saveMarks(marks.filter(m=>m!==here),ratio);return;}
  const line=flow.current;
  const text=(()=>{
   if(!line||!step)return '';
   const base=line.getBoundingClientRect().left;
   for(const node of Array.from(line.querySelectorAll<HTMLElement>('p'))){
    if(Math.round((node.getBoundingClientRect().left-base)/step)===page)return node.textContent??'';
   }
   return line.querySelector('p')?.textContent??'';
  })();
  saveMarks([{ratio,text:text.trim().slice(0,90),at:Date.now()},...marks].slice(0,50),ratio);
 };

 const flowStyle=(at:number):React.CSSProperties=>({transform:'translateX(-'+at*step+'px)',
  fontSize:prefs.size,lineHeight:LEAD,
  fontFamily:prefs.serif?'Georgia,\'Times New Roman\',serif':'var(--font-ui)'});
 const text=<>
  <h1 className="tt-reader-title">{title}</h1>
  {description&&<p className="tt-reader-intro">{description}</p>}
  {paragraphs.map((para,index)=><p key={index}>{para}</p>)}
 </>;

 return <div className={'tt-reader tt-reader-'+prefs.theme} data-chrome={chrome?'on':'off'}>
  <div className="tt-reader-stage" ref={stage} onPointerDown={down} onPointerMove={move} onPointerUp={up}
   onPointerCancel={()=>{touch.current=null;}}>
   <div className="tt-reader-flow" ref={flow} style={flowStyle(page)}>{text}</div>
   {turn&&<div key={turn.key} className={'tt-reader-turn is-'+turn.dir} aria-hidden="true"
    onAnimationEnd={()=>setTurn(null)}>
    <div className="tt-reader-turn-face"><div className="tt-reader-flow is-copy" style={flowStyle(turn.from)}>{text}</div></div>
    <div className="tt-reader-turn-back"/>
   </div>}
   <span className="tt-reader-folio">{page+1}</span>
   {prefs.dim>0&&<div className="tt-reader-dim" aria-hidden="true" style={{opacity:prefs.dim}}/>}
  </div>

  <header className="tt-reader-top">
   <button type="button" className="tt-reader-icon tt-pressable" aria-label={t('common.back')} onClick={onClose}><ArrowLeft size={20}/></button>
   <span className="tt-reader-heading">{title}</span>
   <button type="button" className="tt-reader-icon tt-pressable" aria-label={here?t('reader.removeBookmark'):t('reader.addBookmark')} aria-pressed={!!here} onClick={toggleMark}>{here?<BookmarkCheck size={20}/>:<Bookmark size={20}/>}</button>
   <button type="button" className="tt-reader-icon tt-pressable" aria-label={t('reader.bookmarks')} onClick={()=>{haptic();setSheet('marks');}}><List size={20}/>{marks.length>0&&<span className="tt-reader-count">{marks.length}</span>}</button>
   <button type="button" className="tt-reader-icon tt-pressable" aria-label={t('reader.settings')} onClick={()=>{haptic();setSheet('settings');}}><Settings2 size={20}/></button>
  </header>

  <footer className="tt-reader-bottom">
   <input className="tt-reader-slider" type="range" min={0} max={Math.max(0,pages-1)} value={page}
    aria-label={t('reader.page',{page:String(page+1),total:String(pages)})}
    onChange={e=>go(Number(e.target.value))}/>
   <span className="tt-reader-page">{page+1} / {pages}</span>
  </footer>

  {sheet!=='none'&&<div className="tt-reader-sheet" role="dialog" aria-modal="true">
   <div className="tt-reader-sheet-head">
    <strong>{sheet==='settings'?t('reader.settings'):t('reader.bookmarks')}</strong>
    <button type="button" className="tt-reader-icon tt-pressable" aria-label={t('common.cancel')} onClick={()=>setSheet('none')}><X size={19}/></button>
   </div>
   {sheet==='settings'?<div className="tt-reader-settings">
    <div className="tt-reader-row">
     <span>{t('reader.theme')}</span>
     <div className="tt-reader-themes">{THEMES.map(name=>
      <button key={name} type="button" className={'tt-reader-theme is-'+name+(prefs.theme===name?' is-active':'')}
       aria-label={t('reader.theme'+name[0].toUpperCase()+name.slice(1))} aria-pressed={prefs.theme===name}
       onClick={()=>{haptic();savePrefs({...prefs,theme:name});}}>Aa</button>)}</div>
    </div>
    <div className="tt-reader-row">
     <span>{t('reader.size')}</span>
     <div className="tt-reader-steps">
      <button type="button" className="tt-pressable" aria-label={t('reader.smaller')} onClick={()=>{const i=SIZES.indexOf(prefs.size);savePrefs({...prefs,size:SIZES[Math.max(0,i-1)]});}}><Minus size={17}/></button>
      <b>{prefs.size}</b>
      <button type="button" className="tt-pressable" aria-label={t('reader.bigger')} onClick={()=>{const i=SIZES.indexOf(prefs.size);savePrefs({...prefs,size:SIZES[Math.min(SIZES.length-1,i+1)]});}}><Plus size={17}/></button>
     </div>
    </div>
    <div className="tt-reader-row">
     <span>{t('reader.font')}</span>
     <div className="tt-reader-chips">
      <button type="button" className={prefs.serif?'is-active':''} onClick={()=>savePrefs({...prefs,serif:true})}>{t('reader.fontSerif')}</button>
      <button type="button" className={prefs.serif?'':'is-active'} onClick={()=>savePrefs({...prefs,serif:false})}>{t('reader.fontSans')}</button>
     </div>
    </div>
    <div className="tt-reader-row">
     <span>{t('reader.brightness')}</span>
     <input className="tt-reader-slider" type="range" min={0} max={70} value={Math.round(prefs.dim*100)}
      aria-label={t('reader.brightness')} onChange={e=>savePrefs({...prefs,dim:Number(e.target.value)/100})}/>
    </div>
   </div>:<div className="tt-reader-marks">
    {marks.length===0?<p className="tt-reader-note">{t('reader.noBookmarks')}</p>:marks.map(mark=>
     <button key={mark.at} type="button" className="tt-reader-mark tt-pressable" onClick={()=>{
      haptic();go(Math.round(mark.ratio*(pages-1)));setSheet('none');setChrome(false);}}>
      <b>{Math.round(mark.ratio*100)}%</b><span>{mark.text}</span>
      <i role="button" tabIndex={0} aria-label={t('reader.removeBookmark')}
       onClick={e=>{e.stopPropagation();saveMarks(marks.filter(m=>m!==mark),ratio);}}
       onKeyDown={e=>{if(e.key==='Enter'){e.stopPropagation();saveMarks(marks.filter(m=>m!==mark),ratio);}}}><Trash2 size={16}/></i>
     </button>)}
   </div>}
  </div>}
 </div>;
}
