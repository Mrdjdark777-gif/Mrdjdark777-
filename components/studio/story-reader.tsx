'use client';
import './story-reader.css';
import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,Bookmark,BookmarkCheck,List,Minus,Plus,Settings2,Trash2,X} from 'lucide-react';
import {pushBackLayer,BACK_MENU} from '@/lib/back-stack';
import {useT} from '@/components/i18n-provider';
import {haptic} from '@/lib/client';
import {blocksOf,paginate,type Kind,type Page} from '@/lib/page-text';
import {createCurl,type Curl} from '@/lib/page-curl';

/**
 * Читалка во весь экран, с листанием по страницам.
 *
 * Страницы считает сама читалка, а не колонки CSS. Так было не всегда: пока
 * разбивку делал браузер, границы страниц были видны, но не названы, — а изгиб
 * листа на WebGL берёт страницу картинкой, и нарисовать её можно только зная
 * состав страницы построчно. Разбор один и тот же для настоящего текста на
 * экране и для картинки: иначе на первом кадре оборота буквы дрогнули бы.
 *
 * В покое на экране настоящий текст в разметке — его можно выделить, его читает
 * экранный диктор. Холст с изгибом появляется только на время оборота.
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
 *  React шестьдесят раз в секунду. */
type Flip={from:number;to:number;dir:1|-1;auto:boolean};
/** Полоса чтения: где она стоит и какой у неё шаг строки. Одна и та же мерка
 *  идёт и в разметку, и на холст. */
type Frame={width:number;height:number;left:number;top:number;lead:number};

const THEMES:Theme[]=['day','sepia','night','black'];
const SIZES=[16,18,20,22,25,28];
const LEAD=1.7;
const PREFS_KEY='tt-reader-prefs-v1';
const DEFAULTS:Prefs={size:20,theme:'night',serif:true,dim:0,autoDim:true};
/**
 * Насколько крупнее название рассказа и сколько строк сетки занимает его строка.
 *
 * Одна строка, а не две: на две строки сетки название расползалось так, что
 * между его собственными строками зияла дыра в целую строку текста — это было
 * видно на снимке. Буквы крупнее своей клетки, и это нормально для заголовка:
 * плотная выключка у крупного кегля читается как замысел, а не как теснота.
 */
const TITLE_SCALE=1.5,TITLE_ROWS=1;
/**
 * Во сколько полос режется лист на запасном обороте — том, что остаётся без
 * WebGL. Изгиб там — ломаная из полос: чем их больше, тем мягче дуга, но каждая
 * полоса несёт свою копию страницы, поэтому число ограничено.
 */
const STRIPS=16;
/** Полный оборот листа и наибольший прогиб посреди оборота, в градусах. */
const TURNED=170,BEND=62;
/** С какой доли оборота палец «дожимает» страницу, а не возвращает обратно. */
const COMMIT=0.3;
/** Сколько идёт доводка целого оборота. */
const RUN_MS=1150;

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

/** Цвет из стилей в три доли от нуля до единицы — шейдеру нужен именно такой. */
const toRgb=(value:string):[number,number,number]=>{
 const probe=document.createElement('span');
 probe.style.color=value.trim()||'#000';
 document.body.appendChild(probe);
 const parsed=getComputedStyle(probe).color.match(/[\d.]+/g);
 probe.remove();
 if(!parsed||parsed.length<3)return [0.06,0.07,0.09];
 return [Number(parsed[0])/255,Number(parsed[1])/255,Number(parsed[2])/255];
};

export function StoryReader({id,title,description,body,onClose}:{
 id:string;title:string;description?:string;body:string;onClose:()=>void;
}){
 const {t}=useT();
 const stage=useRef<HTMLDivElement>(null),sheetRef=useRef<HTMLDivElement>(null);
 const glCanvas=useRef<HTMLCanvasElement>(null);
 const [prefs,setPrefs]=useState<Prefs>(DEFAULTS);
 const [pages,setPages]=useState<Page[]>([[]]);
 const [page,setPage]=useState(0);
 const [frame,setFrame]=useState<Frame>({width:0,height:0,left:0,top:0,lead:0});
 const [chrome,setChrome]=useState(true);
 const [sheet,setSheet]=useState<'none'|'settings'|'marks'>('none');
 const [marks,setMarks]=useState<Mark[]>([]);
 const [flip,setFlip]=useState<Flip|null>(null);
 const live=useRef<Flip|null>(null);
 const strips=useRef<(HTMLDivElement|null)[]>([]),shades=useRef<(HTMLDivElement|null)[]>([]);
 const turnBox=useRef<HTMLDivElement>(null);
 const part=useRef(0),raf=useRef(0);
 const wanted=useRef(0),insets=useRef<{top:number;bottom:number}|null>(null);
 const [loaded,setLoaded]=useState(false);
 const curl=useRef<Curl|null>(null);
 const [webgl,setWebgl]=useState(false);
 const paper=useRef<(HTMLCanvasElement|null)[]>([null,null]);
 const blocks=useMemo(()=>blocksOf(title,description,body),[title,description,body]);

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

 /** Начертание для своего вида строки. Одна и та же строка идёт и в стиль
  *  разметки, и в холст: разойдутся они — на первом кадре оборота дрогнут
  *  буквы. */
 const fonts=useMemo(()=>{
  const family=prefs.serif
   ?"Georgia,'Times New Roman',serif"
   :(typeof document==='undefined'?'sans-serif'
     :getComputedStyle(document.documentElement).getPropertyValue('--font-ui').trim()||'sans-serif');
  const size=(kind:Kind)=>kind==='title'?Math.round(prefs.size*TITLE_SCALE):prefs.size;
  return {family,size,
   css:(kind:Kind)=>(kind==='title'?'700 ':kind==='intro'?'italic ':'')+size(kind)+'px '+family};
 },[prefs.serif,prefs.size]);

 // Разбивка. Полосу мерит холст тем же шрифтом, каким она нарисована в
 // разметке: свой перенос строк без настоящей мерки — это догадка.
 useLayoutEffect(()=>{
  const measure=()=>{
   const box=stage.current;if(!box)return;
   const pad=Math.round(Math.min(34,Math.max(16,box.clientWidth*0.07)));
   const width=Math.max(120,box.clientWidth-pad*2);
   if(!insets.current){
    const line=sheetRef.current;
    const css=line?getComputedStyle(line):null;
    insets.current={top:css?parseFloat(css.top)||0:0,bottom:css?parseFloat(css.bottom)||0:0};}
   const lead=prefs.size*LEAD;
   const free=box.clientHeight-insets.current.top-insets.current.bottom;
   const rows=Math.max(1,Math.floor(free/lead));
   const gauge=document.createElement('canvas').getContext('2d');
   const laid=paginate(blocks,{
    width,rows,
    measure:(text,kind)=>{
     if(!gauge)return text.length*fonts.size(kind)*0.5;
     gauge.font=fonts.css(kind);
     return gauge.measureText(text).width;},
    height:kind=>kind==='title'?TITLE_ROWS:1,
    after:()=>1});
   setPages(laid);
   setFrame({width,height:rows*lead,left:pad,top:insets.current.top,lead});
   const next=Math.round(Math.min(1,Math.max(0,wanted.current))*(laid.length-1));
   setPage(Number.isFinite(next)?Math.min(laid.length-1,Math.max(0,next)):0);
  };
  const box=stage.current;if(!box)return;
  measure();
  const observer=new ResizeObserver(measure);observer.observe(box);
  return()=>observer.disconnect();
 // loaded в зависимостях не случайно: разбивку надо пересчитать и вернуться на
 // сохранённое место ровно тогда, когда это место прочитано из хранилища.
 },[blocks,prefs.size,fonts,loaded]);

 const total=pages.length;
 const ratio=total>1?page/(total-1):0;
 useEffect(()=>{if(!loaded)return;
  try{localStorage.setItem('tt-reading-'+id,JSON.stringify({ratio,marks}));}catch{}},[id,loaded,ratio,marks]);

 // Поверхность изгиба живёт вместе с читалкой, а не с каждым оборотом: собирать
 // программу шейдера на каждое нажатие — это подвисание на первом кадре.
 // Оформление меняет цвет бумаги, поэтому при смене оформления она пересобирается.
 useEffect(()=>{
  const node=glCanvas.current;if(!node)return;
  const paperColor=toRgb(getComputedStyle(node).getPropertyValue('--tt-paper'));
  const made=createCurl(node,paperColor);
  curl.current=made;setWebgl(!!made);
  if(!made)return;
  const observer=new ResizeObserver(()=>made.resize());observer.observe(node);
  return()=>{observer.disconnect();made.destroy();curl.current=null;};
 },[prefs.theme]);

 /** Рисует страницу на холсте — ровно теми же строками и в тех же местах, где
  *  они стоят в разметке. */
 const paint=useCallback((index:number,target:HTMLCanvasElement)=>{
  const box=stage.current;if(!box)return;
  const density=Math.min(window.devicePixelRatio||1,2);
  const wide=box.clientWidth,high=box.clientHeight;
  target.width=Math.max(1,Math.round(wide*density));
  target.height=Math.max(1,Math.round(high*density));
  const ctx=target.getContext('2d');if(!ctx)return;
  ctx.setTransform(density,0,0,density,0,0);
  const css=getComputedStyle(box);
  ctx.fillStyle=css.getPropertyValue('--tt-paper').trim()||'#000';
  ctx.fillRect(0,0,wide,high);
  const ink=css.getPropertyValue('--tt-ink').trim()||'#fff';
  const soft=css.getPropertyValue('--tt-soft').trim()||ink;
  ctx.textBaseline='middle';
  let y=frame.top;
  for(const line of pages[index]??[]){
   ctx.font=fonts.css(line.kind);
   ctx.fillStyle=line.kind==='intro'?soft:ink;
   ctx.fillText(line.text,frame.left,y+line.rows*frame.lead/2);
   y+=line.rows*frame.lead;
  }
 },[fonts,frame,pages]);

 /**
  * Запасной изгиб — для устройств без WebGL.
  *
  * Лист разрезан на узкие вертикальные полосы. Каждая следующая повёрнута чуть
  * сильнее предыдущей и поставлена туда, где кончилась предыдущая, — ломаная
  * читается как дуга. Это грубее шейдера, но лучше, чем страница, которая
  * просто подменяется.
  */
 const stripBend=useCallback((p:number)=>{
  const box=stage.current,now=live.current;if(!box||!now)return;
  const width=box.clientWidth,span=width/STRIPS,forward=now.dir===1;
  const turn=(forward?-1:1)*Math.pow(Math.min(1,p),1.45)*TURNED;
  const bend=(forward?-1:1)*Math.sin(Math.min(1,p)*Math.PI)*BEND;
  let sum=0;const weights:number[]=[];
  for(let i=0;i<STRIPS;i++){const t=(i+0.5)/STRIPS;const w=t*t;weights.push(w);sum+=w;}
  let angle=turn,x=forward?0:width,z=0;
  for(let i=0;i<STRIPS;i++){
   const node=strips.current[i];
   const flat=forward?i*span:width-i*span;
   const radians=angle*Math.PI/180;
   if(node)node.style.transform='translate3d('+(x-flat).toFixed(2)+'px,0,'+z.toFixed(2)+'px) rotateY('+angle.toFixed(2)+'deg)';
   const shade=shades.current[i];
   if(shade)shade.style.opacity=(Math.min(1,(1-Math.cos(radians))/2)*0.58).toFixed(3);
   x+=(forward?1:-1)*span*Math.cos(radians);
   z+=(forward?-1:1)*span*Math.sin(radians);
   angle+=bend*weights[i]/sum;
  }
  // Тень, которую поднятый лист роняет на страницу под собой. Ширина — сколько
  // лист ещё закрывает, сила — насколько он поднят: плоский лист тени не даёт,
  // вставший на ребро уже не роняет её на страницу.
  const under=turnBox.current;
  if(under){
   const lift=Math.sin(Math.min(1,p)*Math.PI);
   const cover=Math.max(0,Math.cos(turn*Math.PI/180))*width;
   under.style.setProperty('--tt-a',(lift*0.55).toFixed(3));
   under.style.setProperty('--tt-w',cover.toFixed(1)+'px');
  }
 },[]);

 /** Кадр оборота. Куда рисовать — решает наличие WebGL. */
 const bend=useCallback((p:number)=>{
  const now=live.current;if(!now)return;
  const gl=curl.current;
  if(gl){gl.draw(Math.min(1,Math.max(0,p)),now.dir===1);return;}
  stripBend(p);
 },[stripBend]);

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
   // Косинусная кривая мягче кубической: ни рывка в начале, ни удара в конце.
   const eased=-(Math.cos(Math.PI*t)-1)/2;
   part.current=from+gap*eased;bend(part.current);
   if(t<1){raf.current=requestAnimationFrame(step);return;}
   raf.current=0;done();
  };
  raf.current=requestAnimationFrame(step);
 },[bend,stopRun]);

 const put=useCallback((next:Flip|null)=>{live.current=next;setFlip(next);},[]);

 /** Лист доехал: либо страница перевернулась, либо легла обратно.
  *  Куда он ехал, берём не из текущего состояния, а из того листа, которому
  *  доводка принадлежала: быстрый рывок успевает закончиться раньше, чем
  *  React успевает отрисовать начало оборота. */
 const land=useCallback((now:Flip,turned:boolean)=>{
  if(turned){wanted.current=total>1?now.to/(total-1):0;setPage(now.to);}
  part.current=0;put(null);
 },[total,put]);

 /** Завести оборот: нарисовать обе страницы на холсты и отдать их шейдеру. */
 const begin=useCallback((next:Flip)=>{
  const gl=curl.current;
  if(gl){
   const from=paper.current[0]??(paper.current[0]=document.createElement('canvas'));
   const to=paper.current[1]??(paper.current[1]=document.createElement('canvas'));
   paint(next.from,from);paint(next.to,to);
   gl.pages(from,to);
  }
  part.current=0;put(next);
 },[paint,put]);

 // Нажатие по краю и перемотка ползунком заводят тот же лист, что и палец,
 // только гнёт его не палец, а доводка.
 const go=useCallback((next:number)=>{
  const limit=Math.min(total-1,Math.max(0,next));
  if(limit===page||live.current)return;
  begin({from:page,to:limit,dir:limit>page?1:-1,auto:true});
 },[page,total,begin]);

 // Полосы и холст встают на место после отрисовки, поэтому первый кадр задаём
 // здесь же: иначе лист мигнул бы плоским кадром. Сам собой оборот идёт только
 // когда его завели нажатием или ползунком; лист под пальцем ведёт палец.
 useLayoutEffect(()=>{
  if(!flip)return;
  bend(part.current);
  if(flip.auto&&!raf.current)run(1,()=>land(flip,true));
 // bend и run пересобираются при смене страницы, но перезапускать из-за них
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
   if(to<0||to>total-1)return;          // за краем книги листать нечего
   from.dir=dir;stopRun();
   begin({from:page,to,dir,auto:false});
   return;
  }
  if(!live.current)return;
  const box=e.currentTarget.getBoundingClientRect();
  part.current=Math.min(1,Math.abs(dx)/(box.width*1.02));
  bend(part.current);
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
  const lines=pages[page]??[];
  const text=(lines.find(line=>line.kind==='para')??lines[0])?.text??'';
  saveMarks([{ratio,text:text.trim().slice(0,90),at:Date.now()},...marks].slice(0,50),ratio);
 };

 /** Одна страница в разметке. Настоящий текст, а не картинка: его выделяют,
  *  его читает экранный диктор. */
 const sheetOf=(index:number,copy:boolean)=>
  <div className={'tt-reader-page'+(copy?' is-copy':'')} ref={copy?undefined:sheetRef}
   style={{left:frame.left,width:frame.width}} aria-hidden={copy?true:undefined}>
   {(pages[index]??[]).map((line,at)=>
    <div key={at} className={'tt-reader-line is-'+line.kind}
     style={{height:line.rows*frame.lead,font:fonts.css(line.kind)}}>{line.text}</div>)}
  </div>;

 return <div className={'tt-reader tt-reader-'+prefs.theme} data-chrome={chrome?'on':'off'}>
  <div className="tt-reader-stage" ref={stage} onPointerDown={down} onPointerMove={move} onPointerUp={up}
   onPointerCancel={()=>{touch.current=null;}}>
   {/* Страница в покое. Во время оборота её место занимает холст: показывать
       обе сразу значило бы двойной текст на просвете. */}
   {!flip&&sheetOf(page,false)}
   {/* Холст изгиба стоит всегда: собирать программу шейдера на каждое нажатие
       — это подвисание на первом кадре оборота. Видим он только в обороте. */}
   <canvas className="tt-reader-gl" ref={glCanvas} aria-hidden="true"
    data-on={flip&&webgl?'yes':'no'}/>
   {/* Запасной оборот из полос — там, где WebGL нет. Каждая полоса — своё окно
       в ту же страницу. Изнанка — чистая бумага того же оформления, иначе на
       середине оборота полоса просто исчезала бы. */}
   {flip&&!webgl&&<>
    {sheetOf(flip.to,true)}
    <div className={'tt-reader-turn is-'+(flip.dir===1?'fwd':'back')} ref={turnBox} aria-hidden="true">
     {Array.from({length:STRIPS},(_,i)=><div key={i} className="tt-reader-strip"
       ref={node=>{strips.current[i]=node;}}
       style={{left:(flip.dir===1?i:STRIPS-1-i)*(100/STRIPS)+'%',width:'calc('+(100/STRIPS)+'% + 1.5px)',
        transformOrigin:flip.dir===1?'0 50%':'100% 50%'} as React.CSSProperties}>
      <div className="tt-reader-strip-face">
       <div className="tt-reader-strip-inner" style={{width:STRIPS*100+'%',left:(flip.dir===1?-i:-(STRIPS-1-i))*100+'%'}}>
        {sheetOf(flip.from,true)}
       </div>
       <div className="tt-reader-strip-shade" ref={node=>{shades.current[i]=node;}}/>
      </div>
      <div className="tt-reader-strip-back"/>
     </div>)}
    </div>
   </>}
   <span className="tt-reader-folio">{page+1}</span>
  </div>
  {/* Сколько прочитано — тонкой полосой поверх всего. Она видна и когда
      панели убраны: в нижней строке номер страницы есть только с панелями. */}
  <div className="tt-reader-progress" role="progressbar" aria-label={t('reader.progress')}
   aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio*100)}>
   <span style={{transform:'scaleX('+ratio.toFixed(4)+')'}}/>
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
   <input className="tt-reader-slider" type="range" min={0} max={Math.max(0,total-1)} value={page}
    aria-label={t('reader.page',{page:String(page+1),total:String(total)})}
    onChange={e=>go(Number(e.target.value))}/>
   <span className="tt-reader-page-count">{page+1} / {total}</span>
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
      haptic();go(Math.round(mark.ratio*(total-1)));setSheet('none');setChrome(false);}}>
      <b>{Math.round(mark.ratio*100)}%</b><span>{mark.text}</span>
      <i role="button" tabIndex={0} aria-label={t('reader.removeBookmark')}
       onClick={e=>{e.stopPropagation();saveMarks(marks.filter(m=>m!==mark),ratio);}}
       onKeyDown={e=>{if(e.key==='Enter'){e.stopPropagation();saveMarks(marks.filter(m=>m!==mark),ratio);}}}><Trash2 size={16}/></i>
     </button>)}
   </div>}
  </div>}
 </div>;
}
