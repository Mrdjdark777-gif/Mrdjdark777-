'use client';
import {useMemo,useSyncExternalStore} from 'react';
import qrcode from 'qrcode-generator';

/**
 * QR-код ссылки на приложение для Android — для человека за компьютером:
 * навёл камеру телефона, и APK скачивается сразу на телефон.
 *
 * Адрес собирается в браузере из адреса самого сайта и пути к текущему APK,
 * поэтому код всегда ведёт на ту сборку, что лежит на этом сервере, и сам
 * меняется с новой версией.
 *
 * Оформление в цветах канала (13 октября владелец попросил «в цветовой гамме
 * сайта и приложения, по середине — свой логотип, ещё стильнее, чем у
 * TikTok»):
 * - модули — круглые точки, тёмные на светлой плашке: так код читает любая
 *   камера, в том числе старые сканеры без поддержки инверсии. Точки почти
 *   во всю клетку (радиус 0,47): с более мелкими слабые распознаватели на
 *   мелком снимке теряли код (замер 13 октября: 0,42 — 6 из 9 размеров,
 *   0,47 — 9 из 9);
 * - часть точек — тёмная бирюза канала. Она достаточно тёмная, чтобы сканер
 *   считал её «чёрной»: светлая бирюза сайта (#6FE7DE) на белом читается как
 *   пустое место и ломает код;
 * - три угловых метки — скруглённые рамки с бирюзовой серединой;
 * - в центре — логотип канала. Под него убраны точки, а коррекция ошибок —
 *   уровень H (до 30% кода можно закрыть), логотип закрывает около 7%.
 * Читаемость проверяет tests/browser/desk-layout.mjs: снимает код с экрана и
 * распознаёт его.
 */
const noop=()=>()=>{};
const INK='#0b1416',TEAL='#0d6f68';

export function AppQr({href,label,className}:{href:string;label:string;className?:string}){
 // Адрес сайта известен только в браузере: на сервере кода нет, плашка пустая.
 const origin=useSyncExternalStore(noop,()=>location.origin,()=>'');
 const art=useMemo(()=>{
  if(!origin)return null;
  const url=new URL(href,origin).href;
  const qr=qrcode(0,'H');
  qr.addData(url);
  qr.make();
  const n=qr.getModuleCount();
  // Угловые метки рисуются отдельно — их точки пропускаем.
  const finder=(r:number,c:number)=>(r<7&&c<7)||(r<7&&c>=n-7)||(r>=n-7&&c<7);
  // Место под логотип — квадрат в центре, нечётной стороны.
  const hole=Math.max(7,Math.round(n*0.27))|1,h0=(n-hole)/2;
  const inHole=(r:number,c:number)=>r>=h0-0.5&&r<h0+hole-0.5&&c>=h0-0.5&&c<h0+hole-0.5;
  let ink='',teal='';
  for(let r=0;r<n;r++)for(let c=0;c<n;c++){
   if(!qr.isDark(r,c)||finder(r,c)||inHole(r,c))continue;
   const dot=`M${c+0.5} ${r+0.03}a.47 .47 0 1 1 0 .94a.47 .47 0 1 1 0-.94z`;
   // Бирюзовые точки — по узору, а не случайно: код одинаков при каждой отрисовке.
   if((r*7+c*13)%9===0)teal+=dot;else ink+=dot;
  }
  return {n,url,ink,teal,hole,h0};
 },[href,origin]);
 // Поле вокруг кода — 2 модуля: остальное даёт светлая плашка.
 return <span className={'desk-qr'+(className?' '+className:'')} role="img" aria-label={label} data-qr-url={art?.url}>
  {art&&<svg viewBox={`-2 -2 ${art.n+4} ${art.n+4}`} aria-hidden="true">
   <path d={art.ink} fill={INK}/>
   <path d={art.teal} fill={TEAL}/>
   {[[0,0],[art.n-7,0],[0,art.n-7]].map(([x,y])=><g key={x+'-'+y}>
    <rect x={x+0.5} y={y+0.5} width="6" height="6" rx="1.9" fill="none" stroke={INK} strokeWidth="1"/>
    <rect x={x+2} y={y+2} width="3" height="3" rx="0.9" fill={TEAL}/>
   </g>)}
   <circle cx={art.n/2} cy={art.n/2} r={art.hole/2-0.15} fill="#fff"/>
   <image href="/brand/logo.png?v=0.4.1" x={art.h0+0.45} y={art.h0+0.45} width={art.hole-0.9} height={art.hole-0.9} style={{clipPath:'circle(50%)'}} preserveAspectRatio="xMidYMid slice"/>
  </svg>}
 </span>;
}
