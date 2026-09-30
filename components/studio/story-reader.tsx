'use client';
import './story-reader.css';
import type { CSSProperties } from 'react';
import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,Bookmark,BookmarkCheck,List,Minus,Plus,Settings2,Trash2,X} from 'lucide-react';
import {pushBackLayer,BACK_MENU} from '@/lib/back-stack';
import {useT} from '@/components/i18n-provider';
import {useUsage} from '@/hooks/use-usage';
import {haptic} from '@/lib/client';
import {blocksOf,paginate,type Kind,type Page} from '@/lib/page-text';
import {createCurl,GONE,type Curl} from '@/lib/page-curl';

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
/**
 * Геометрия страницы на экране.
 *
 * `scale` — во сколько раз показанная страница крупнее той, по которой считалась
 * разбивка. Разбивка считается один раз, по самой тесной полосе чтения, какая
 * бывает у этой истории; когда места становится больше (ушли панели читалки, а
 * за ними системные часы Android), та же самая страница просто растягивается.
 * Иначе строк на странице становилось больше, текст перебивался заново, и на
 * полном экране человек видел уже другой кусок — ровно то, на что пожаловался
 * владелец.
 */
type Frame={width:number;height:number;left:number;top:number;lead:number;scale:number};

const THEMES:Theme[]=['day','sepia','night','black'];
const SIZES=[16,18,20,22,25,28];
/**
 * Высота строки сетки в долях размера шрифта.
 *
 * Было 1.7 — между строками оставалось столько воздуха, что страница читалась
 * разреженной, а текста на ней помещалось мало. 1.45 — обычная книжная
 * плотность: строки уже не слипаются, но и не расползаются.
 */
const LEAD=1.45;
/**
 * Наименьшее поле слева и справа от текста, в пикселях.
 *
 * Увеличение на полном экране упиралось ровно в ширину экрана, и поля
 * съедались в ноль: сверху воздух был, по бокам буквы прижимались к самой
 * кромке. Теперь предел увеличения считается по ширине за вычетом этих полей.
 */
const SIDE=20;
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
/** С какой доли оборота палец «дожимает» страницу, а не возвращает обратно.
 *  Доля считается от полного оборота в две ширины экрана, поэтому треть экрана
 *  под пальцем — это уже шестая часть оборота. */
const COMMIT=0.11;
/** Сколько идёт доводка целого оборота.
 *  Целый оборот кончается не на единице, а на GONE — там лист уходит за
 *  корешок, — поэтому на видимый ход приходится около семисот миллисекунд. */
const RUN_MS=1500;

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
 useUsage(id,true);
 const stage=useRef<HTMLDivElement>(null),sheetRef=useRef<HTMLDivElement>(null);
 const fullGauge=useRef<HTMLSpanElement>(null);
 const headerRef=useRef<HTMLElement>(null);
 const [headerHeight,setHeaderHeight]=useState(112);
 const seekPointer=useRef<number|null>(null);
 useLayoutEffect(()=>{const el=headerRef.current;if(!el)return;
  const update=()=>setHeaderHeight(el.offsetHeight);update();
  const observer=new ResizeObserver(update);observer.observe(el,{box:'border-box'});return()=>observer.disconnect();
 },[]);
 const glCanvas=useRef<HTMLCanvasElement>(null);
 const [prefs,setPrefs]=useState<Prefs>(DEFAULTS);
 const [pages,setPages]=useState<Page[]>([[]]);
 const [page,setPage]=useState(0);
 const [frame,setFrame]=useState<Frame>({width:0,height:0,left:0,top:0,lead:0,scale:1});
 const [chrome,setChrome]=useState(true);
 const [sheet,setSheet]=useState<'none'|'settings'|'marks'>('none');
 const [marks,setMarks]=useState<Mark[]>([]);
 const [flip,setFlip]=useState<Flip|null>(null);
 const live=useRef<Flip|null>(null);
 const slide=useRef<HTMLDivElement>(null);
 const touch=useRef<{pointerId:number;x:number;y:number;dir:0|1|-1;moved:boolean;at:number;speed:number}|null>(null);
 const part=useRef(0),raf=useRef(0);
 const wanted=useRef(0),insets=useRef<{top:number;bottom:number}|null>(null);
 const [loaded,setLoaded]=useState(false);
 const curl=useRef<Curl|null>(null);
 const [webgl,setWebgl]=useState(false);
 const shots=useRef<Map<string,HTMLCanvasElement>>(new Map());
 const blocks=useMemo(()=>blocksOf(title,description,body),[title,description,body]);
 /** Примета текущего вида страницы: от неё зависит каждый снимок. */
 const look=`${prefs.size}|${prefs.serif}|${prefs.theme}|${frame.width}|${frame.height}|${frame.top}|${frame.left}|${frame.lead}|${pages.length}`;

 // Сброса loaded здесь нет намеренно: читалка смонтирована с key по id, и на
 // другую историю она заходит новым экземпляром, а не сменой поля.
 useEffect(()=>{const timer=setTimeout(()=>{
   setPrefs(readPrefs());const s=readSaved(id);
   setMarks(Array.isArray(s.marks)?s.marks.filter((m):m is Mark=>!!m&&typeof m==='object'&&Number.isFinite(m.ratio)&&m.ratio>=0&&m.ratio<=1&&typeof m.text==='string'&&Number.isFinite(m.at)).slice(0,50):[]);
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

 /** Шрифт на экране. От того, которым считалась разбивка, отличается только
  *  увеличением: страница растянулась — буквы вместе с ней. Разбивке этот
  *  шрифт не показывают, иначе она поехала бы следом за экраном. */
 const shown=useMemo(()=>{
  const k=frame.scale||1;
  const size=(kind:Kind)=>fonts.size(kind)*k;
  return {size,
   css:(kind:Kind)=>(kind==='title'?'700 ':kind==='intro'?'italic ':'')+size(kind)+'px '+fonts.family};
 },[fonts,frame.scale]);

 // Разбивка. Полосу мерит холст тем же шрифтом, каким она нарисована в
 // разметке: свой перенос строк без настоящей мерки — это догадка.
 useLayoutEffect(()=>{
  const measure=()=>{
   const box=stage.current;if(!box)return;
   const pad=Math.round(Math.min(34,Math.max(16,box.clientWidth*0.07)));
   const width=Math.max(120,box.clientWidth-pad*2);
   {
    // Отступы полосы чтения спрашиваем у настоящих стилей, а не считаем сами:
    // с панелями и без панелей они разные, и правило живёт в одном месте — в
    // CSS. Раньше верхний отступ считался как высота шапки, и на полном экране
    // текст оставался стоять там, где была шапка, оставив над собой пустую
    // полосу.
    const line=sheetRef.current;
    const css=line?getComputedStyle(line):null;
    insets.current={
     top:css?parseFloat(css.top)||headerHeight+12:headerHeight+12,
     bottom:css?parseFloat(css.bottom)||72:insets.current?.bottom??72};}
   const lead=prefs.size*LEAD;
   const free=box.clientHeight-insets.current.top-insets.current.bottom;
   // Страница набирается под ПОЛНЫЙ ЭКРАН — читают именно на нём, и там она
   // обязана быть набрана до краёв, без пустых полей сверху и снизу. Когда
   // панели возвращаются, та же самая страница ужимается, чтобы поместиться.
   // Текст при этом не меняется ни в ту, ни в другую сторону.
   //
   // Высоту полного экрана берём у мерки, а не у замера по факту. Замер по
   // факту не годится: пока панели на экране, полного экрана ещё не было, а
   // когда они уходят, опора поменялась бы задним числом и текст перебился бы
   // заново — ровно то, на что владелец и жаловался.
   const full=fullGauge.current?.getBoundingClientRect().height||free;
   const rows=Math.max(1,Math.floor(full/lead));
   const gauge=document.createElement('canvas').getContext('2d');
   const laid=paginate(blocks,{
    width,rows,
    measure:(text,kind)=>{
     if(!gauge)return text.length*fonts.size(kind)*0.5;
     gauge.font=fonts.css(kind);
     return gauge.measureText(text).width;},
    height:kind=>kind==='title'?TITLE_ROWS:1,
    after:()=>1});
   shots.current.clear();
   setPages(laid);
   // Во сколько раз показать. По высоте — насколько полоса шире опорной; по
   // ширине — чтобы строки не вылезли за края экрана вместе со шрифтом.
   // Во сколько раз показать страницу. Меньше единицы — когда панели вернулись
   // и места стало меньше опорного: страница ужимается. Больше единицы —
   // когда осталась мелочь от округления; расти дальше не даёт ширина экрана.
   const grow=Math.min(free/Math.max(1,rows*lead),
    Math.max(1,box.clientWidth-SIDE*2)/Math.max(1,width));
   const shownWidth=width*grow;
   // Строки занимают всю высоту полосы: страница набрана под неё и точка.
   // Остаток от округления делится поровну сверху и снизу, но это уже единицы
   // точек, а не пустые полосы.
   const shownLead=Math.min(free/Math.max(1,rows),lead*grow);
   // Увеличение упирается в ширину экрана раньше, чем в высоту: буквы нельзя
   // растить бесконечно, иначе строки полезут за края. Остаток высоты делим
   // поровну сверху и снизу — страница встаёт посередине свободной полосы, а
   // не жмётся к её верху. Разметка делает то же самое (justify-content:center),
   // и холст обязан совпасть с ней до пикселя.
   const slack=Math.max(0,free-rows*shownLead);
   setFrame({width:shownWidth,height:rows*shownLead,left:(box.clientWidth-shownWidth)/2,
    top:insets.current.top+slack/2,lead:shownLead,scale:grow});
   const next=Math.round(Math.min(1,Math.max(0,wanted.current))*(laid.length-1));
   setPage(Number.isFinite(next)?Math.min(laid.length-1,Math.max(0,next)):0);
  };
  const box=stage.current;if(!box)return;
  measure();
  const observer=new ResizeObserver(measure);observer.observe(box);
  document.fonts?.addEventListener('loadingdone',measure);
  return()=>{observer.disconnect();document.fonts?.removeEventListener('loadingdone',measure);};
 // loaded в зависимостях не случайно: разбивку надо пересчитать и вернуться на
 // сохранённое место ровно тогда, когда это место прочитано из хранилища.
 },[blocks,prefs.size,prefs.serif,fonts,loaded,headerHeight,chrome]);

 const total=pages.length;
 const ratio=total>1?page/(total-1):0;
 useEffect(()=>{if(!loaded)return;
  try{localStorage.setItem('tt-reading-'+id,JSON.stringify({ratio,marks}));}catch{}},[id,loaded,ratio,marks]);

 // Поверхность изгиба живёт вместе с читалкой, а не с каждым оборотом: собирать
 // программу шейдера на каждое нажатие — это подвисание на первом кадре.
 //
 // Собирается она РОВНО ОДИН РАЗ, на всё время работы читалки. Раньше при смене
 // оформления слой пересобирался, а прежний перед этим намеренно терял контекст
 // — и второй раз контекст на том же холсте уже не выдавался. После первой же
 // смены оформления оборот умирал до конца сеанса: холст прятался, страница
 // листалась запасным способом, и владелец видел, что «анимация рушится».
 useEffect(()=>{
  const node=glCanvas.current;if(!node)return;
  const made=createCurl(node,toRgb(getComputedStyle(node).getPropertyValue('--tt-paper')));
  curl.current=made;setWebgl(!!made);
  if(!made)return;
  const observer=new ResizeObserver(()=>made.resize());observer.observe(node);
  const lost=()=>{curl.current=null;setWebgl(false);};
  node.addEventListener('webglcontextlost',lost);
  return()=>{observer.disconnect();node.removeEventListener('webglcontextlost',lost);made.destroy();curl.current=null;};
 },[]);

 // Оформление меняет только цвет бумаги — это отдельное действие, без пересборки.
 useEffect(()=>{
  const node=glCanvas.current;if(!node)return;
  curl.current?.paper(toRgb(getComputedStyle(node).getPropertyValue('--tt-paper')));
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
   ctx.font=shown.css(line.kind);
   ctx.letterSpacing=line.kind==='title'?(-shown.size(line.kind)*0.02)+'px':'0px';
   ctx.fillStyle=line.kind==='intro'?soft:ink;
   ctx.fillText(line.text,frame.left,y+line.rows*frame.lead/2);
   y+=line.rows*frame.lead;
  }
 },[shown,frame,pages]);

 /**
  * Запасной кадр — без WebGL. Страница съезжает в сторону оборота и тает.
  * Пишется прямо в стиль узла, мимо React: перерисовывать дерево со всеми
  * строками шестьдесят раз в секунду нельзя.
  */
 const slideFrame=useCallback((p:number)=>{
  const node=slide.current,now=live.current;if(!node||!now)return;
  const gone=Math.min(1,Math.max(0,p/GONE));
  node.style.transform='translateX('+(now.dir===1?-gone*38:gone*38).toFixed(2)+'%)';
  node.style.opacity=(1-gone).toFixed(3);
 },[]);

 /** Кадр оборота. Куда рисовать — решает наличие WebGL. */
 const bend=useCallback((p:number)=>{
  const now=live.current;if(!now)return;
  const gl=curl.current;
  if(gl){gl.draw(Math.min(1,Math.max(0,p)),now.dir===1);return;}
  slideFrame(p);
 },[slideFrame]);

 const stopRun=useCallback(()=>{if(raf.current)cancelAnimationFrame(raf.current);raf.current=0;},[]);

 /** Доводка: лист сам доходит до цели. Мягкое начало и мягкий конец — иначе
  *  страница дёргается в руках. */
 const run=useCallback((to:number,done:()=>void)=>{
  stopRun();
  const from=part.current,gap=to-from;
  if(Math.abs(gap)<0.001||window.matchMedia('(prefers-reduced-motion: reduce)').matches){part.current=to;bend(to);done();return;}
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

 // Смена настроек переcчитывает разбивку: номера страниц становятся другими, и
 // лист, заведённый под прежнюю разбивку, показывал бы уже не то. Такой оборот
 // прекращается сразу, а не доигрывается.
 useEffect(()=>{
  touch.current=null;
  if(!live.current)return;
  stopRun();part.current=0;put(null);
 },[pages,frame,fonts,prefs.theme,stopRun,put]);


 /** Лист доехал: либо страница перевернулась, либо легла обратно.
  *  Куда он ехал, берём не из текущего состояния, а из того листа, которому
  *  доводка принадлежала: быстрый рывок успевает закончиться раньше, чем
  *  React успевает отрисовать начало оборота. */
 const land=useCallback((now:Flip,turned:boolean)=>{
  if(turned){wanted.current=total>1?now.to/(total-1):0;setPage(now.to);}
  part.current=0;put(null);
 },[total,put]);

 /** Завести оборот: нарисовать обе страницы на холсты и отдать их шейдеру. */
 /**
  * Готовый снимок страницы. Снимки держатся заранее нарисованными: раньше обе
  * страницы рисовались в тот самый кадр, когда палец только тронул экран, и
  * холст при этом ещё и заново заводился под нужный размер. Из-за этого начало
  * оборота дёргалось — первый кадр приходил с запозданием.
  */
 const sheetFor=useCallback((index:number)=>{
  // Ключ — не только номер страницы, но и всё, от чего зависит её вид. Иначе
  // после смены размера или оформления можно успеть завести оборот раньше, чем
  // кэш почистится, и на лист попал бы снимок от прежних настроек.
  const key=look+'|'+index;
  const have=shots.current.get(key);
  if(have)return have;
  const node=document.createElement('canvas');
  paint(index,node);
  shots.current.set(key,node);
  return node;
 },[paint,look]);

 // Соседние страницы рисуются заранее, в спокойную минуту. Кэш сбрасывается
 // вместе с разбивкой и оформлением: иначе на экран попал бы снимок от прежнего
 // размера шрифта.
 useEffect(()=>{
  shots.current.clear();
  if(!loaded||!frame.width)return;
  const timer=setTimeout(()=>{
   for(const at of [page,page+1,page-1])
    if(at>=0&&at<pages.length)sheetFor(at);
  },0);
  return()=>clearTimeout(timer);
 },[page,pages,frame,fonts,loaded,sheetFor]);

 const begin=useCallback((next:Flip)=>{
  const gl=curl.current;
  if(gl)gl.pages(sheetFor(next.from),sheetFor(next.to));
  part.current=0;put(next);
 },[sheetFor,put]);

 // Нажатие по краю и перемотка ползунком заводят тот же лист, что и палец,
 // только гнёт его не палец, а доводка.
 const go=useCallback((next:number)=>{
  const limit=Math.min(total-1,Math.max(0,next));
  if(limit===page||live.current)return;
  begin({from:page,to:limit,dir:limit>page?1:-1,auto:true});
 },[page,total,begin]);

 // Scrubbing is immediate: never queue a page-turn animation for every input event.
 const seek=useCallback((next:number)=>{
  if(!Number.isFinite(next))return;
  stopRun();touch.current=null;part.current=0;put(null);
  const target=Math.min(total-1,Math.max(0,Math.round(next)));
  wanted.current=total>1?target/(total-1):0;setPage(target);
 },[total,stopRun,put]);
 const seekAt=(x:number,element:HTMLElement)=>{
  const r=element.getBoundingClientRect();
  seek(Math.min(1,Math.max(0,(x-r.left-9)/Math.max(1,r.width-18)))*(total-1));
 };

 // Полосы и холст встают на место после отрисовки, поэтому первый кадр задаём
 // здесь же: иначе лист мигнул бы плоским кадром. Сам собой оборот идёт только
 // когда его завели нажатием или ползунком; лист под пальцем ведёт палец.
 useLayoutEffect(()=>{
  if(!flip)return;
  bend(part.current);
  if(flip.auto&&!raf.current)run(GONE,()=>land(flip,true));
 // bend и run пересобираются при смене страницы, но перезапускать из-за них
 // уже идущий оборот нельзя: он бы начинался заново.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[flip,webgl]);
 useEffect(()=>stopRun,[stopRun]);

 useEffect(()=>sheet==='none'?undefined:pushBackLayer(BACK_MENU,()=>{setSheet('none');return true;}),[sheet]);

 // Страница идёт за пальцем: сколько протянул — на столько лист и повёрнут.
 // Отпустил на полпути — сама решит, довернуться или лечь обратно; держишь
 // палец — стоит под тем углом, под каким ты её держишь.
 const down=(e:React.PointerEvent<HTMLDivElement>)=>{
  if(live.current||touch.current||sheet!=='none'||!e.isPrimary||e.button!==0)return;
  touch.current={pointerId:e.pointerId,x:e.clientX,y:e.clientY,dir:0,moved:false,at:performance.now(),speed:0};
  try{e.currentTarget.setPointerCapture?.(e.pointerId);}catch{/* Pointer may already have been cancelled by the host. */}
 };
 const move=(e:React.PointerEvent<HTMLDivElement>)=>{
  const from=touch.current;if(!from||from.pointerId!==e.pointerId)return;
  const dx=e.clientX-from.x,dy=e.clientY-from.y;
  if(!from.moved&&(Math.abs(dx)>6||Math.abs(dy)>6))from.moved=true;
  if(!from.dir){
   // Порог низкий намеренно: при десяти пикселях лист заводился не с каждого
   // движения, и владелец говорил, что перелистывание срабатывает не всегда.
   if(Math.abs(dx)<5||Math.abs(dx)<=Math.abs(dy))return;
   const dir=dx<0?1:-1 as 1|-1;
   const to=page+dir;
   if(to<0||to>total-1)return;          // за краем книги листать нечего
   from.dir=dir;stopRun();
   begin({from:page,to,dir,auto:false});
  }
  if(!live.current)return;
  const box=e.currentTarget.getBoundingClientRect();
  // Смещение берётся со знаком. По модулю оно росло и тогда, когда палец
  // возвращался обратно через точку начала: лист продолжал заворачиваться,
  // хотя рука шла в другую сторону.
  //
  // Делится на две ширины, а не на одну: свободный край листа проходит путь от
  // правого края экрана за левый, то есть две ширины, и палец обязан вести его
  // ровно за собой, а не вдвое быстрее себя. Полный оборот дотягивает доводка
  // после отпускания — так же, как в книгах на телефоне.
  const along=from.dir===1?-dx:dx;
  // Дальше GONE тянуть нечего: лист уже за корешком, и картинка не меняется.
  const next=Math.min(GONE,Math.max(0,along/(box.width*2)));
  // Скорость пальца запоминается для рывка: короткий быстрый жест обязан
  // перевернуть страницу, даже если палец прошёл всего ничего.
  const now=performance.now();
  if(now>from.at)from.speed=(next-part.current)/(now-from.at)*1000;
  from.at=now;
  part.current=next;
  bend(part.current);
 };
 const up=(e:React.PointerEvent<HTMLDivElement>)=>{
  const from=touch.current;if(!from||from.pointerId!==e.pointerId)return;touch.current=null;
  if(from.dir&&live.current){
   // Дотянул больше трети оборота — лист доворачивается; меньше — ложится
   // обратно, и номер не меняется.
   // Либо дотянул, либо дёрнул: быстрый рывок доворачивает страницу и с
   // половины порога. Без этого короткое резкое движение не срабатывало.
   const done=part.current>=COMMIT||(performance.now()-from.at<120&&from.speed>0.5&&part.current>COMMIT*0.35);
   const now=live.current;
   // Доводка идёт не до конца оборота, а до той доли, на которой лист уходит
   // за корешок. Дальше на экране не меняется ничего, и последняя треть хода
   // была просто ожиданием перед неподвижной картинкой.
   run(done?GONE:0,()=>land(now,done));
   return;
  }
  if(from.moved)return;
  const box=e.currentTarget.getBoundingClientRect();
  const x=(e.clientX-box.left)/box.width;
  // Вибрации на перелистывании нет намеренно: владелец сказал, что толчок в
  // конце оборота сбивает ощущение бумаги. На кнопках она осталась — там это
  // отклик на нажатие, а не на движение страницы.
  if(x<.3){go(page-1);return;}
  if(x>.7){go(page+1);return;}
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
     style={{height:line.rows*frame.lead,font:shown.css(line.kind)}}>{line.text}</div>)}
  </div>;

 return <div className={'tt-reader tt-reader-'+prefs.theme} data-chrome={chrome?'on':'off'}
  style={{'--tt-reader-top':headerHeight+'px'} as CSSProperties}>
  <div className="tt-reader-stage" ref={stage} onPointerDown={down} onPointerMove={move} onPointerUp={up}
   onPointerCancel={e=>{
    if(touch.current?.pointerId!==e.pointerId)return;
    const now=live.current;touch.current=null;
    if(now)run(0,()=>land(now,false));}}
   onLostPointerCapture={e=>{
    if(touch.current?.pointerId!==e.pointerId)return;
    const now=live.current;touch.current=null;
    if(now)run(0,()=>land(now,false));}}>
   {/* Страница в покое. Во время оборота её место занимает холст: показывать
       обе сразу значило бы двойной текст на просвете. */}
   {!flip&&sheetOf(page,false)}
   {/* Холст изгиба стоит всегда: собирать программу шейдера на каждое нажатие
       — это подвисание на первом кадре оборота. Видим он только в обороте. */}
   <canvas className="tt-reader-gl" ref={glCanvas} aria-hidden="true"
    data-on={flip&&webgl?'yes':'no'}/>
   {/* Запасной оборот — там, где WebGL нет. Бумага там не гнётся: без шейдера
       это честнее, чем подделка. Уходящая страница просто съезжает и тает над
       новой.

       Раньше здесь был оборот из шестнадцати полос, и каждая полоса несла свою
       копию страницы со своими координатами. После того как страницы стали
       построчными, координаты копий перестали сходиться со сценой, и на экране
       получалась каша из кусков — ровно то, что владелец назвал «рушит всё по
       пикселям». Показывать сломанный запасной оборот хуже, чем показать
       простой и верный. */}
   {flip&&!webgl&&<>
    {sheetOf(flip.to,true)}
    <div className="tt-reader-slide" ref={slide} aria-hidden="true">{sheetOf(flip.from,true)}</div>
   </>}
   {/* Мерка полного экрана: по ней считается разбивка. См. story-reader.css. */}
   <span className="tt-reader-gauge" ref={fullGauge} aria-hidden="true"/>
   <span className="tt-reader-folio">{page+1}</span>
  </div>
  {/* Прогресс виден вместе с управлением; режим чтения скрывает его. */}
  <div className="tt-reader-progress" role="progressbar" aria-label={t('reader.progress')}
   aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio*100)}>
   <span style={{transform:'scaleX('+ratio.toFixed(4)+')'}}/>
  </div>

  {/* Вуаль яркости лежит поверх всей читалки — вместе с панелями и листом
      настроек. Гасить только текст, оставляя панели яркими, незачем: глаза
      слепит именно светлое пятно на тёмном экране. Остального приложения она
      не касается: читалка — отдельный слой. */}
  {!prefs.autoDim&&prefs.dim>0&&<div className="tt-reader-dim" aria-hidden="true" style={{opacity:prefs.dim}}/>}

  <header className="tt-reader-top" ref={headerRef}>
   <button type="button" className="tt-reader-icon tt-pressable" aria-label={t('common.back')} onClick={onClose}><ArrowLeft size={20}/></button>
   <span className="tt-reader-heading">{title}</span>
   <button type="button" className="tt-reader-icon tt-pressable" aria-label={here?t('reader.removeBookmark'):t('reader.addBookmark')} aria-pressed={!!here} onClick={toggleMark}>{here?<BookmarkCheck size={20}/>:<Bookmark size={20}/>}</button>
   <button type="button" className="tt-reader-icon tt-pressable" aria-label={t('reader.bookmarks')} onClick={()=>{haptic();setSheet('marks');}}><List size={20}/>{marks.length>0&&<span className="tt-reader-count">{marks.length}</span>}</button>
   <button type="button" className="tt-reader-icon tt-pressable" aria-label={t('reader.settings')} onClick={()=>{haptic();setSheet('settings');}}><Settings2 size={20}/></button>
  </header>

  <footer className="tt-reader-bottom">
   <div className="tt-reader-seek" onPointerDown={e=>{
     if(!e.isPrimary||e.button!==0||total<2)return;
     e.preventDefault();seekPointer.current=e.pointerId;
     e.currentTarget.querySelector('input')?.focus({preventScroll:true});
     e.currentTarget.setPointerCapture(e.pointerId);seekAt(e.clientX,e.currentTarget);
    }} onPointerMove={e=>{if(seekPointer.current===e.pointerId)seekAt(e.clientX,e.currentTarget);}}
    onPointerUp={e=>{if(seekPointer.current===e.pointerId){seekAt(e.clientX,e.currentTarget);seekPointer.current=null;}}}
    onPointerCancel={()=>{seekPointer.current=null;}} onLostPointerCapture={()=>{seekPointer.current=null;}}>
    <div className="tt-reader-seek-rail" aria-hidden="true">
     <span className="tt-reader-seek-fill" style={{width:(ratio*100)+'%'}}/>
     <span className="tt-reader-seek-thumb" style={{left:(ratio*100)+'%'}}/>
    </div>
    <input type="range" min={0} max={Math.max(0,total-1)} step={1} value={page} disabled={total<2}
     aria-label={t('reader.page',{page:String(page+1),total:String(total)})}
     onChange={e=>seek(Number(e.target.value))}/>
   </div>
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
       onChange={e=>{haptic('heavy');savePrefs({...prefs,autoDim:e.target.checked});}}/>
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
    {/* Переход по закладке — сразу, без оборота.
        Через оборот он не работал вовсе: `go` только заводит лист, а страница
        меняется в конце доводки — и следом тут же прячется панель. Смена
        панелей пересчитывает полосу чтения, пересчёт гасит начатый оборот, и
        страница не менялась никогда. Со стороны это выглядело так, что
        закладки не работают. Прыжок ставит страницу сам и ничего не ждёт. */}
    {marks.length===0?<p className="tt-reader-note">{t('reader.noBookmarks')}</p>:marks.map(mark=>
     <button key={mark.at} type="button" className="tt-reader-mark tt-pressable" onClick={()=>{
      seek(Math.round(mark.ratio*(total-1)));setSheet('none');setChrome(false);}}>
      <b>{Math.round(mark.ratio*100)}%</b><span>{mark.text}</span>
      <i role="button" tabIndex={0} aria-label={t('reader.removeBookmark')}
       onClick={e=>{e.stopPropagation();saveMarks(marks.filter(m=>m!==mark),ratio);}}
       onKeyDown={e=>{if(e.key==='Enter'){e.stopPropagation();saveMarks(marks.filter(m=>m!==mark),ratio);}}}><Trash2 size={16}/></i>
     </button>)}
   </div>}
  </div>}
 </div>;
}
