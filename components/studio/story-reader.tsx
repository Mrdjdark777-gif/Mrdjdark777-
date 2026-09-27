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
type Prefs={size:number;theme:Theme;serif:boolean;dim:number;autoDim:boolean};
type Theme='day'|'sepia'|'night'|'black';
/** Переворот страницы: откуда, куда и в какую сторону гнётся лист. Насколько
 *  он согнут, в состоянии не живёт: это доля от нуля до единицы, её правит
 *  палец кадр за кадром, и держать её в состоянии значило бы перерисовывать
 *  React шестьдесят раз в секунду вместе со всеми полосами текста. */
type Flip={from:number;to:number;dir:1|-1;auto:boolean};

const THEMES:Theme[]=['day','sepia','night','black'];
const SIZES=[16,18,20,22,25,28];
const LEAD=1.7;
const PREFS_KEY='tt-reader-prefs-v1';
const DEFAULTS:Prefs={size:20,theme:'night',serif:true,dim:0,autoDim:true};
/**
 * Во сколько полос режется лист. Изгиб — это ломаная из полос: чем их больше,
 * тем мягче дуга. Каждая полоса несёт свою копию текста, поэтому у длинного
 * рассказа звеньев становится меньше — но изгиб остаётся всегда.
 *
 * Раньше здесь стоял порог, за которым изгиб просто выключался. Порог был в
 * сто шестьдесят абзацев, в проверочном рассказе их сорок — и настоящий
 * рассказ владельца молча листался жёстким листом, хотя проверки были зелёные.
 */
const stripCount=(paragraphs:number)=>paragraphs<=160?16:paragraphs<=500?10:6;
/** Полный оборот листа и наибольший прогиб посреди оборота, в градусах. */
const TURNED=170,BEND=70;
/** С какой доли оборота палец «дожимает» страницу, а не возвращает обратно. */
const COMMIT=0.3;
/** Сколько идёт доводка целого оборота. */
const RUN_MS=900;

const readPrefs=():Prefs=>{try{
 const v=JSON.parse(localStorage.getItem(PREFS_KEY)||'null');
 if(!v||typeof v!=='object')return DEFAULTS;
 return {size:SIZES.includes(v.size)?v.size:DEFAULTS.size,
  theme:THEMES.includes(v.theme)?v.theme:DEFAULTS.theme,
  serif:typeof v.serif==='boolean'?v.serif:DEFAULTS.serif,
  autoDim:typeof v.autoDim==='boolean'?v.autoDim:DEFAULTS.autoDim,
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
 const [flip,setFlip]=useState<Flip|null>(null);
 const live=useRef<Flip|null>(null);
 const strips=useRef<(HTMLDivElement|null)[]>([]),shades=useRef<(HTMLDivElement|null)[]>([]);
 const part=useRef(0),raf=useRef(0);
 const wanted=useRef(0),insets=useRef<{top:number;bottom:number}|null>(null);
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

 const count=stripCount(paragraphs.length);

 /**
  * Изгиб листа.
  *
  * Лист разрезан на узкие вертикальные полосы. Каждая следующая повёрнута чуть
  * сильнее предыдущей и поставлена туда, где кончилась предыдущая, — ломаная
  * из шестнадцати звеньев читается как гладкая дуга. Так бумага и гнётся: длина
  * листа не меняется, меняется его кривизна.
  *
  * Прогиб набирает силу к свободному краю (у корешка бумага почти плоская) и
  * посреди оборота он наибольший, а к началу и к концу сходит на нет: лист
  * ложится плоско и на стол, и на предыдущую страницу.
  *
  * Всё это делается прямо в стилях узлов, мимо React. Перерисовывать дерево с
  * шестнадцатью копиями текста каждый кадр нельзя — этого не выдержит ни один
  * телефон.
  */
 const curl=useCallback((p:number)=>{
  const box=stage.current,now=live.current;if(!box||!now)return;
  const width=box.clientWidth,span=width/count,forward=now.dir===1;
  // Поворот отстаёт от пальца: у настоящей книги лист сначала приподнимается
  // и гнётся, а на ребро встаёт только под конец. Прямая пропорция ставила
  // его ребром уже на середине хода, и лист пропадал из виду.
  const turn=(forward?-1:1)*Math.pow(Math.min(1,p),1.25)*TURNED;
  const bend=(forward?-1:1)*Math.sin(Math.min(1,p)*Math.PI)*BEND;
  // Вес звена: у корешка прогиб почти нулевой, у свободного края наибольший.
  let total=0;const weights:number[]=[];
  for(let i=0;i<count;i++){const t=(i+0.5)/count;const w=t*t;weights.push(w);total+=w;}
  let angle=turn,x=forward?0:width,z=0;
  for(let i=0;i<count;i++){
   const node=strips.current[i];
   const flat=forward?i*span:width-i*span;
   const radians=angle*Math.PI/180;
   if(node)node.style.transform='translate3d('+(x-flat).toFixed(2)+'px,0,'+z.toFixed(2)+'px) rotateY('+angle.toFixed(2)+'deg)';
   const shade=shades.current[i];
   // Чем сильнее звено отвёрнуто от читателя, тем глубже на нём тень.
   if(shade)shade.style.opacity=(Math.min(1,(1-Math.cos(radians))/2)*0.82).toFixed(3);
   x+=(forward?1:-1)*span*Math.cos(radians);
   z+=(forward?-1:1)*span*Math.sin(radians);
   angle+=bend*weights[i]/total;
  }
 },[count]);

 const stopRun=useCallback(()=>{if(raf.current)cancelAnimationFrame(raf.current);raf.current=0;},[]);

 /** Доводка: лист сам доходит до цели. Мягкое начало и мягкий конец — иначе
  *  страница дёргается в руках. */
 const run=useCallback((to:number,done:()=>void)=>{
  stopRun();
  const from=part.current,gap=to-from;
  if(Math.abs(gap)<0.001){done();return;}
  const ms=Math.max(180,RUN_MS*Math.abs(gap)),start=performance.now();
  const step=(now:number)=>{
   const t=Math.min(1,(now-start)/ms);
   const eased=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
   part.current=from+gap*eased;curl(part.current);
   if(t<1){raf.current=requestAnimationFrame(step);return;}
   raf.current=0;done();
  };
  raf.current=requestAnimationFrame(step);
 },[curl,stopRun]);

 const put=useCallback((next:Flip|null)=>{live.current=next;setFlip(next);},[]);

 /** Лист доехал: либо страница перевернулась, либо легла обратно.
  *  Куда он ехал, берём не из текущего состояния, а из того листа, которому
  *  доводка принадлежала: быстрый рывок успевает закончиться раньше, чем
  *  React успевает отрисовать начало оборота. */
 const land=useCallback((now:Flip,turned:boolean)=>{
  if(turned){wanted.current=pages>1?now.to/(pages-1):0;setPage(now.to);}
  part.current=0;put(null);
 },[pages,put]);

 // Нажатие по краю и перемотка ползунком заводят тот же лист, что и палец,
 // только гнёт его не палец, а доводка.
 const go=useCallback((next:number)=>{
  const limit=Math.min(pages-1,Math.max(0,next));
  if(limit===page||live.current)return;
  part.current=0;
  put({from:page,to:limit,dir:limit>page?1:-1,auto:true});
 },[page,pages,put]);

 // Полосы появляются в дереве после отрисовки, поэтому первый изгиб задаём
 // здесь же: иначе лист мигнул бы плоским кадром. Сам собой оборот идёт
 // только когда его завели нажатием или ползунком; лист под пальцем никуда
 // не едет — его ведёт палец.
 useLayoutEffect(()=>{
  if(!flip)return;
  curl(part.current);
  if(flip.auto&&!raf.current)run(1,()=>land(flip,true));
 // curl и run пересобираются при смене страницы, но перезапускать из-за них
 // уже идущий оборот нельзя: он бы начинался заново.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[flip]);
 useEffect(()=>stopRun,[stopRun]);

 useEffect(()=>sheet==='none'?undefined:pushBackLayer(BACK_MENU,()=>{setSheet('none');return true;}),[sheet]);

 // Страница идёт за пальцем: сколько протянул — на столько лист и повёрнут.
 // Отпустил на полпути — сама решит, довернуться или лечь обратно; держишь
 // палец — стоит под тем углом, под каким ты её держишь.
 const touch=useRef<{x:number;y:number;dir:0|1|-1;moved:boolean}|null>(null);
 const down=(e:React.PointerEvent<HTMLDivElement>)=>{
  if(live.current)return;
  touch.current={x:e.clientX,y:e.clientY,dir:0,moved:false};
  e.currentTarget.setPointerCapture?.(e.pointerId);
 };
 const move=(e:React.PointerEvent<HTMLDivElement>)=>{
  const from=touch.current;if(!from)return;
  const dx=e.clientX-from.x,dy=e.clientY-from.y;
  if(!from.moved&&(Math.abs(dx)>8||Math.abs(dy)>8))from.moved=true;
  if(!from.dir){
   if(Math.abs(dx)<10||Math.abs(dx)<=Math.abs(dy))return;
   const dir=dx<0?1:-1 as 1|-1;
   const to=page+dir;
   if(to<0||to>pages-1)return;          // за краем книги листать нечего
   from.dir=dir;stopRun();part.current=0;
   put({from:page,to,dir,auto:false});
   return;
  }
  if(!live.current)return;
  const box=e.currentTarget.getBoundingClientRect();
  part.current=Math.min(1,Math.abs(dx)/(box.width*1.02));
  curl(part.current);
 };
 const up=(e:React.PointerEvent<HTMLDivElement>)=>{
  const from=touch.current;touch.current=null;if(!from)return;
  if(from.dir&&live.current){
   // Дотянул больше трети оборота — лист доворачивается; меньше — ложится
   // обратно, и номер не меняется.
   const done=part.current>=COMMIT;
   const now=live.current;
   if(done)haptic();
   run(done?1:0,()=>land(now,done));
   return;
  }
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
   {/* Под листом лежит та страница, на которую он открывается. Когда лист
       ложится обратно, под ним снова прежняя. */}
   <div className="tt-reader-flow" ref={flow} style={flowStyle(flip?flip.to:page)}>{text}</div>
   {/* Гнущийся лист. Каждая полоса — своё окно в ту же страницу: она
       показывает свой кусок текста и поворачивается на свой угол. Изнанка —
       чистая бумага того же оформления, иначе на середине оборота полоса
       просто исчезала бы. */}
   {flip&&<div className={'tt-reader-turn is-'+(flip.dir===1?'fwd':'back')} aria-hidden="true">
    {Array.from({length:count},(_,i)=><div key={i} className="tt-reader-strip"
      ref={node=>{strips.current[i]=node;}}
      style={{left:(flip.dir===1?i:count-1-i)*(100/count)+'%',width:'calc('+(100/count)+'% + 1.5px)',
       transformOrigin:flip.dir===1?'0 50%':'100% 50%'} as React.CSSProperties}>
     <div className="tt-reader-strip-face">
      <div className="tt-reader-strip-inner" style={{width:count*100+'%',left:(flip.dir===1?-i:-(count-1-i))*100+'%'}}>
       <div className="tt-reader-flow is-copy" style={flowStyle(flip.from)}>{text}</div>
      </div>
      <div className="tt-reader-strip-shade" ref={node=>{shades.current[i]=node;}}/>
     </div>
     <div className="tt-reader-strip-back"/>
    </div>)}
   </div>}
   <span className="tt-reader-folio">{page+1}</span>
  </div>
  {/* Вуаль яркости лежит поверх всей читалки — вместе с панелями и листом
      настроек. Гасить только текст, оставляя панели яркими, незачем: глаза
      слепит именно светлое пятно на тёмном экране. Остального приложения она
      не касается: читалка — отдельный слой. */}
  {!prefs.autoDim&&prefs.dim>0&&<div className="tt-reader-dim" aria-hidden="true" style={{opacity:prefs.dim}}/>}

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
    {/* Переключатель нарисован разметкой, а не свойством appearance: оно
        доходит не до каждого движка, и на телефоне владельца вместо тумблера
        оставалась системная галочка. Сам флажок спрятан, но остаётся
        настоящим — клавиатура и экранные дикторы работают как прежде. */}
    <label className="tt-reader-row">
     <span>{t('reader.systemBrightness')}</span>
     <span className="tt-reader-switch">
      <input type="checkbox" checked={prefs.autoDim}
       onChange={e=>savePrefs({...prefs,autoDim:e.target.checked})}/>
      <span className="tt-reader-switch-track" aria-hidden="true"/>
     </span>
    </label>
    <div className="tt-reader-row">
     <span>{t('reader.brightness')}</span>
     {/* Вправо — светлее. Хранится обратная величина — сила затемнения, —
         поэтому ползунок её переворачивает. */}
     <input className="tt-reader-slider" type="range" min={0} max={70} value={70-Math.round(prefs.dim*100)}
      disabled={prefs.autoDim} aria-label={t('reader.brightness')}
      onChange={e=>savePrefs({...prefs,dim:(70-Number(e.target.value))/100})}/>
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
