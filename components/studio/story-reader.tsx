'use client';
import './story-reader.css';
import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,Bookmark,BookmarkCheck,Headphones,List,Minus,Pause,Plus,Settings2,Trash2,X} from 'lucide-react';
import {pushBackLayer,BACK_MENU} from '@/lib/back-stack';
import {useT} from '@/components/i18n-provider';
import {haptic} from '@/lib/client';

/**
 * Читалка на весь экран, с листанием по страницам.
 *
 * Прежняя была окном поверх раздела: текст в нём прокручивался, занимал
 * половину экрана и не имел ни тем, ни закладок. Здесь читается так, как
 * читают в читалках: страница за страницей, во весь экран, с оформлением под
 * освещение и с местом, куда можно вернуться.
 *
 * Страницы делает сам браузер: текст льётся в колонки шириной ровно в экран
 * (CSS multi-column), а мы сдвигаем ленту на целую колонку. Это честная
 * разбивка по тексту, а не деление на куски по количеству букв: перенос слов,
 * абзацы и висячие строки браузер считает сам.
 *
 * Место хранится долей прочитанного, а не номером страницы: сменил размер
 * шрифта — страниц стало другое количество, а доля осталась прежней.
 */

type Bookmarkted={ratio:number;text:string;at:number};
type Saved={ratio?:number;marks?:Bookmarkted[];size?:number};
type Prefs={size:number;lead:number;theme:Theme;serif:boolean;dim:number};
type Theme='day'|'sepia'|'night'|'black';

const THEMES:Theme[]=['day','sepia','night','black'];
const SIZES=[16,18,20,22,25,28];
const LEADS=[1.5,1.7,1.9,2.1];
const PREFS_KEY='tt-reader-prefs-v1';
const DEFAULTS:Prefs={size:20,lead:1.7,theme:'night',serif:true,dim:0};

const readPrefs=():Prefs=>{try{
 const v=JSON.parse(localStorage.getItem(PREFS_KEY)||'null');
 if(!v||typeof v!=='object')return DEFAULTS;
 return {size:SIZES.includes(v.size)?v.size:DEFAULTS.size,
  lead:LEADS.includes(v.lead)?v.lead:DEFAULTS.lead,
  theme:THEMES.includes(v.theme)?v.theme:DEFAULTS.theme,
  serif:typeof v.serif==='boolean'?v.serif:DEFAULTS.serif,
  dim:Number.isFinite(v.dim)?Math.min(.7,Math.max(0,v.dim)):0};
}catch{return DEFAULTS;}};

const readSaved=(id:string):Saved=>{try{
 const v=JSON.parse(localStorage.getItem('tt-reading-'+id)||'null');
 return v&&typeof v==='object'?v:{};
}catch{return {};}};

/** Текст режется на абзацы и предложения: предложение — единица чтения вслух
 *  и единица подсветки, по ней же находится страница. */
function sentences(body:string){
 const out:{p:number;text:string}[]=[];
 body.split(/\n+/).forEach((para,p)=>{
  const trimmed=para.trim();
  if(!trimmed)return;
  const parts=trimmed.match(/[^.!?…]+[.!?…]*\s*/g)??[trimmed];
  for(const part of parts){const text=part.trim();if(text)out.push({p,text});}
 });
 return out;
}

export function StoryReader({id,title,description,body,onClose}:{
 id:string;title:string;description?:string;body:string;onClose:()=>void;
}){
 const {t}=useT();
 const stage=useRef<HTMLDivElement>(null),flow=useRef<HTMLDivElement>(null);
 const [prefs,setPrefs]=useState<Prefs>(DEFAULTS);
 const [page,setPage]=useState(0),[pages,setPages]=useState(1);
 const [step,setStep]=useState(0);
 const [chrome,setChrome]=useState(true);
 const [sheet,setSheet]=useState<'none'|'settings'|'marks'>('none');
 const [marks,setMarks]=useState<Bookmarkted[]>([]);
 const [speaking,setSpeaking]=useState(false),[spoken,setSpoken]=useState(-1);
 const [rate,setRate]=useState(1),[voices,setVoices]=useState<SpeechSynthesisVoice[]>([]),[voice,setVoice]=useState('');
 // Доля прочитанного — единственная опора. Номер страницы ею не является:
 // сменил размер шрифта — страниц стало другое количество. Держим её в ref,
 // потому что пересчёт разбивки должен видеть её сразу, не дожидаясь отрисовки.
 const wanted=useRef(0),insets=useRef<{top:number;bottom:number}|null>(null);
 const [loaded,setLoaded]=useState(false);
 const lines=useMemo(()=>sentences(body),[body]);

 // Настройки, место и закладки лежат в хранилище устройства, поэтому читаются
 // после первой отрисовки: на сервере localStorage нет. До этого момента
 // читалка ничего не записывает — иначе первый же пустой прогон затёр бы
 // сохранённое место и закладки.
 // Сброса loaded здесь нет намеренно: читалка смонтирована с key по id, и на
 // другую историю она заходит новым экземпляром, а не сменой поля.
 useEffect(()=>{const timer=setTimeout(()=>{
   setPrefs(readPrefs());const s=readSaved(id);
   setMarks(Array.isArray(s.marks)?s.marks:[]);
   wanted.current=Math.min(1,Math.max(0,Number(s.ratio)||0));
   setLoaded(true);},0);
  return()=>clearTimeout(timer);},[id]);

 const savePrefs=useCallback((next:Prefs)=>{setPrefs(next);
  try{localStorage.setItem(PREFS_KEY,JSON.stringify(next));}catch{}},[]);
 const saveMarks=useCallback((next:Bookmarkted[],ratio:number)=>{setMarks(next);
  try{localStorage.setItem('tt-reading-'+id,JSON.stringify({ratio,marks:next}));}catch{}},[id]);

 // Ширина колонки равна ширине полосы чтения, промежуток между колонками —
 // двойное поле. Пересчёт нужен при каждом изменении, которое меняет разбивку:
 // поворот экрана, размер шрифта, интерлиньяж, гарнитура.
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
   // На этом и ловилась ошибка: со второго пересчёта весь рассказ умещался в
   // две страницы.
   if(!insets.current){const css=getComputedStyle(line);
    insets.current={top:parseFloat(css.top)||0,bottom:parseFloat(css.bottom)||0};}
   const lead=prefs.size*prefs.lead;
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
 // loaded в зависимостях не случайно: разбивку надо пересчитать и вернуться
 // на сохранённое место ровно тогда, когда это место прочитано из хранилища.
 },[body,prefs.size,prefs.lead,prefs.serif,loaded]);

 const ratio=pages>1?page/(pages-1):0;
 useEffect(()=>{if(!loaded)return;
  try{localStorage.setItem('tt-reading-'+id,JSON.stringify({ratio,marks}));}catch{}},[id,loaded,ratio,marks]);

 // Любой переход на другую страницу сразу переписывает долю прочитанного:
 // она и есть место, к которому читалка вернётся после смены шрифта.
 const go=useCallback((next:number)=>{
  const limit=Math.min(pages-1,Math.max(0,next));
  wanted.current=pages>1?limit/(pages-1):0;
  setPage(limit);},[pages]);

 // Системная кнопка «назад» закрывает сначала лист, потом читалку. Слой листа
 // выше слоя читалки, поэтому порядок получается сам.
 useEffect(()=>sheet==='none'?undefined:pushBackLayer(BACK_MENU,()=>{setSheet('none');return true;}),[sheet]);

 // Чтение вслух. Голос берётся у устройства: он работает без сети и без
 // оплаты. Подсветка идёт по предложениям, страница переворачивается сама,
 // когда озвучка уходит за её край.
 useEffect(()=>{const synth=typeof window!=='undefined'?window.speechSynthesis:undefined;if(!synth)return;
  const load=()=>setVoices(synth.getVoices());load();
  synth.addEventListener('voiceschanged',load);
  return()=>{synth.removeEventListener('voiceschanged',load);synth.cancel();};},[]);
 useEffect(()=>()=>{try{window.speechSynthesis?.cancel();}catch{}},[]);

 const pageOf=useCallback((index:number)=>{
  const line=flow.current;if(!line||!step)return 0;
  const node=line.querySelector<HTMLElement>('[data-s="'+index+'"]');if(!node)return 0;
  const left=node.getBoundingClientRect().left-line.getBoundingClientRect().left;
  return Math.max(0,Math.round(left/step));
 },[step]);

 const speakFrom=useCallback((from:number)=>{
  const synth=window.speechSynthesis;if(!synth)return;
  synth.cancel();
  let index=from;
  const next=()=>{
   if(index>=lines.length){setSpeaking(false);setSpoken(-1);return;}
   const say=new SpeechSynthesisUtterance(lines[index].text);
   const picked=voices.find(v=>v.voiceURI===voice);
   if(picked)say.voice=picked;
   say.rate=rate;
   const mine=index;
   say.onstart=()=>{setSpoken(mine);const target=pageOf(mine);setPage(prev=>target!==prev?target:prev);};
   say.onend=()=>{index+=1;next();};
   say.onerror=()=>{setSpeaking(false);setSpoken(-1);};
   synth.speak(say);
  };
  setSpeaking(true);next();
 },[lines,pageOf,rate,voice,voices]);

 const stopSpeaking=useCallback(()=>{try{window.speechSynthesis?.cancel();}catch{}
  setSpeaking(false);setSpoken(-1);},[]);

 // Нажатие по краям листает, по середине — прячет и показывает панели. Так
 // устроены все читалки, и палец не ищет кнопок.
 const tap=(e:React.MouseEvent<HTMLDivElement>)=>{
  const box=e.currentTarget.getBoundingClientRect();
  const x=(e.clientX-box.left)/box.width;
  if(x<.32){haptic();go(page-1);return;}
  if(x>.68){haptic();go(page+1);return;}
  setChrome(v=>!v);
 };
 const swipe=useRef<{x:number;y:number}|null>(null);
 const here=marks.find(m=>Math.abs(m.ratio-ratio)<.004);

 const toggleMark=()=>{haptic();
  if(here){saveMarks(marks.filter(m=>m!==here),ratio);return;}
  const line=flow.current;
  const first=line?.querySelector<HTMLElement>('[data-s]');
  const text=(()=>{
   if(!line||!step)return '';
   for(const node of Array.from(line.querySelectorAll<HTMLElement>('[data-s]'))){
    const left=node.getBoundingClientRect().left-line.getBoundingClientRect().left;
    if(Math.round(left/step)===page)return node.textContent??'';
   }
   return first?.textContent??'';
  })();
  saveMarks([{ratio,text:text.trim().slice(0,90),at:Date.now()},...marks].slice(0,50),ratio);
 };

 const shade=prefs.theme;
 return <div className={'tt-reader tt-reader-'+shade} data-chrome={chrome?'on':'off'}>
  <div className="tt-reader-stage" ref={stage}
   onClick={tap}
   onPointerDown={e=>{swipe.current={x:e.clientX,y:e.clientY};}}
   onPointerUp={e=>{const from=swipe.current;swipe.current=null;if(!from)return;
    const dx=e.clientX-from.x,dy=e.clientY-from.y;
    if(Math.abs(dx)<48||Math.abs(dx)<Math.abs(dy))return;
    haptic();go(page+(dx<0?1:-1));}}>
   <div className="tt-reader-flow" ref={flow}
    style={{transform:'translateX(-'+page*step+'px)',fontSize:prefs.size,lineHeight:prefs.lead,
     fontFamily:prefs.serif?'Georgia,\'Times New Roman\',serif':'var(--font-ui)'}}>
    <h1 className="tt-reader-title">{title}</h1>
    {description&&<p className="tt-reader-intro">{description}</p>}
    {lines.map((line,index)=><span key={index} data-s={index}
     className={'tt-reader-line'+(index===spoken?' is-spoken':'')+(index===0||lines[index-1].p!==line.p?' is-first':'')}>{line.text} </span>)}
   </div>
   {prefs.dim>0&&<div className="tt-reader-dim" aria-hidden="true" style={{opacity:prefs.dim}}/>}
  </div>

  <header className="tt-reader-top">
   <button type="button" className="tt-reader-icon tt-pressable" aria-label={t('common.back')} onClick={()=>{stopSpeaking();onClose();}}><ArrowLeft size={20}/></button>
   <span className="tt-reader-heading">{title}</span>
   <button type="button" className="tt-reader-icon tt-pressable" aria-label={here?t('reader.removeBookmark'):t('reader.addBookmark')} aria-pressed={!!here} onClick={toggleMark}>{here?<BookmarkCheck size={20}/>:<Bookmark size={20}/>}</button>
   <button type="button" className="tt-reader-icon tt-pressable" aria-label={t('reader.bookmarks')} onClick={()=>{haptic();setSheet('marks');}}><List size={20}/>{marks.length>0&&<span className="tt-reader-count">{marks.length}</span>}</button>
   <button type="button" className="tt-reader-icon tt-pressable" aria-label={t('reader.settings')} onClick={()=>{haptic();setSheet('settings');}}><Settings2 size={20}/></button>
  </header>

  <footer className="tt-reader-bottom">
   <button type="button" className={'tt-reader-speak tt-pressable'+(speaking?' is-on':'')}
    aria-label={speaking?t('reader.stopListen'):t('reader.listen')}
    onClick={()=>{haptic();if(speaking){stopSpeaking();return;}
     const start=lines.findIndex((_,i)=>pageOf(i)>=page);speakFrom(start<0?0:start);}}>
    {speaking?<Pause size={18}/>:<Headphones size={18}/>}
   </button>
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
     <span>{t('reader.lineHeight')}</span>
     <div className="tt-reader-chips">{LEADS.map(value=>
      <button key={value} type="button" className={prefs.lead===value?'is-active':''} onClick={()=>savePrefs({...prefs,lead:value})}>{value.toFixed(1)}</button>)}</div>
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
    <div className="tt-reader-row">
     <span>{t('reader.speed')}</span>
     <div className="tt-reader-chips">{[0.8,1,1.2,1.5].map(value=>
      <button key={value} type="button" className={rate===value?'is-active':''} onClick={()=>{stopSpeaking();setRate(value);}}>{value}×</button>)}</div>
    </div>
    {voices.length>0?<label className="tt-reader-row">
     <span>{t('reader.voice')}</span>
     <select value={voice} onChange={e=>{stopSpeaking();setVoice(e.target.value);}}>
      <option value="">{t('reader.voiceDefault')}</option>
      {voices.map(v=><option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}
     </select>
    </label>:<p className="tt-reader-note">{t('reader.voiceMissing')}</p>}
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
