'use client';
import {useCallback,useEffect,useRef} from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import type {EmblaCarouselType,EmblaOptionsType} from 'embla-carousel';
import {nearOf,scaleOf,litOf} from '@/lib/device-tilt';

/**
 * Карусель свежего — барабан: бросил пальцем, она крутится сама, бросил ещё
 * раз — крутится дальше, и встаёт точно на карточку.
 *
 * Почему не родная прокрутка. Лента была полосой с прокруткой, выложенной
 * трижды, и на краю среднего круга прокрутка молча перескакивала на круг
 * назад. Перескок — это своя запись в прокрутку, а она гасит инерцию браузера
 * насмерть, поэтому делать его можно только в тишине между бросками. Значит,
 * один непрерывный бросок обязан уместиться в запас до края. Не умещался:
 * Chromium второй бросок подряд разгоняет — на голой ленте он прошёл 2340
 * точек, — а запаса у трёх кругов было около 1400. Замер на нашей странице:
 * старт 3467, край 4830, второй бросок доехал ровно до 4830 и встал. Это и
 * было «листнул быстро и заново — зависает», и в рамках той схемы это не
 * чинилось: больше кругов — это 60–84 плитки со своими слоями видеокарты.
 *
 * Здесь круг замкнут иначе. Embla двигает ленту переносом и переставляет
 * крайние карточки на другой конец, поэтому края нет вовсе, а плиток ровно
 * столько, сколько выпусков. Инерцию считает сам Embla; замер тем же броском:
 * три броска подряд, каждый докатывается после отпускания, третий — на тысячу
 * с лишним точек.
 *
 * Свободный бросок, а не «через карточки». В режиме привязки Embla нарочно
 * гасит силу вдвое и лента проезжает втрое меньше. Здесь бросок свободный, а
 * точку остановки после отпускания подводим к ближайшей карточке: лента
 * тормозит плавно и встаёт на карточку, как барабан на сектор.
 */
const OPTIONS:EmblaOptionsType={
 loop:true,
 dragFree:true,
 // Первая карточка — на отступе страницы, как и было: 16 точек от края.
 align:()=>16,
 // Отличить нажатие на карточку от броска: сдвиг больше 10 точек — бросок, и
 // карточка не откроется.
 dragThreshold:10,
};

export function useDrum(){
 const [emblaRef,api]=useEmblaCarousel(OPTIONS);
 // Своя ссылка на ту же полосу: на неё пишет наклон телефона (--tx, --ty), а
 // карточки наследуют переменные.
 const view=useRef<HTMLElement|null>(null);
 const setView=useCallback((node:HTMLElement|null)=>{view.current=node;emblaRef(node);},[emblaRef]);

 useEffect(()=>{
  if(!api)return;
  const still=typeof window!=='undefined'&&!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // Где у каждой карточки середина обложки внутри её ячейки. Снимается при
  // сборке и при смене размера, а не на каждом кадре: на кадре мы только
  // считаем, ничего у браузера не спрашивая.
  let parts:{card:HTMLElement|null;art:HTMLElement|null;mid:number}[]=[];
  let half=1;
  const remember=(a:EmblaCarouselType)=>{
   half=Math.max(1,a.rootNode().clientWidth/2);
   // Место середины обложки — от начала ленты. offsetLeft считается от
   // ближайшего позиционированного предка, а это может быть и лента, и что-то
   // между: первая версия складывала место ячейки с местом обложки, которое
   // уже было отсчитано от ленты, — и крупной выходила карточка далеко за
   // краем экрана. Поэтому идём по цепочке предков до самой ленты.
   const reel=a.containerNode();
   const along=(node:HTMLElement)=>{let x=0,at:HTMLElement|null=node;
    while(at&&at!==reel){x+=at.offsetLeft;at=at.offsetParent as HTMLElement|null;}
    return x;};
   parts=a.slideNodes().map(li=>{
    const card=li.querySelector<HTMLElement>('.soft-episode'),art=li.querySelector<HTMLElement>('.soft-art');
    return {card,art,mid:art?along(art)+art.offsetWidth/2:along(li)+li.offsetWidth/2};
   });
  };

  /**
   * Середина ленты крупнее и ярче — непрерывно, на каждом кадре движения.
   *
   * Прежде масштаб менялся только когда лента вставала, и владелец увидел ровно
   * это: «увеличивается не мгновенно, а с опозданием». Лента замирала, и лишь
   * тогда средняя карточка начинала расти. Теперь масштаб следует за положением:
   * карточка крупнеет, проходя середину, и в момент остановки уже имеет свой
   * размер.
   *
   * Масштаб и прозрачность композитор делает над готовым слоем. Рябь, которую
   * владелец видел раньше, давали поворот и объёмный режим (perspective) — их
   * в карточке нет и проверка не пускает их обратно.
   */
  const paint=(a:EmblaCarouselType)=>{
   if(still)return;
   const e=a.internalEngine();
   // Ровно то число, на которое Embla сейчас сдвинул ленту на экране:
   // offsetLocation — сглаженное положение, его и рисует перенос. location —
   // это уже цель шага, и по нему выделялась бы не та карточка: первая
   // проверка так и нашла крупной карточку далеко за краем экрана.
   const at=e.offsetLocation.get();
   // Карточку, переставленную на другой конец круга, Embla сдвигает на длину
   // круга. Без этой поправки она считалась бы там, где стояла до перестановки.
   const shift=new Map<number,number>();
   for(const point of e.slideLooper.loopPoints){const by=point.target();if(by)shift.set(point.index,by);}
   for(let i=0;i<parts.length;i++){
    const part=parts[i];
    if(!part)continue;
    const centre=part.mid+at+(shift.get(i)??0);
    const near=nearOf(centre,half,half);
    const scale=scaleOf(near).toFixed(3),lit=litOf(near).toFixed(3);
    if(part.art&&part.art.dataset.near!==scale){part.art.style.setProperty('--near',scale);part.art.dataset.near=scale;}
    if(part.card&&part.card.dataset.lit!==lit){part.card.style.setProperty('--lit',lit);part.card.dataset.lit=lit;}
   }
  };

  // Барабан встаёт на сектор: точка остановки свободного броска подводится к
  // ближайшей карточке. Ход ленты от этого не короче — меняется лишь, где она
  // встанет.
  const land=(a:EmblaCarouselType)=>{a.internalEngine().scrollTo.distance(0,true);};

  // Круг Embla включает сам, только если карточек хватает на него. Признак
  // нужен проверкам и стилям, поэтому берётся у движка, а не из числа выпусков.
  const ready=(a:EmblaCarouselType)=>{
   a.rootNode().dataset.loop=a.internalEngine().options.loop?'yes':'no';
   remember(a);paint(a);
  };

  ready(api);
  api.on('reInit',ready).on('resize',ready).on('scroll',paint).on('pointerUp',land);
  return()=>{api.off('reInit',ready).off('resize',ready).off('scroll',paint).off('pointerUp',land);};
 },[api]);

 return {setView,view,api};
}
