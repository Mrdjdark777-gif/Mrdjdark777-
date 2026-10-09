'use client';
import {useMemo,useSyncExternalStore} from 'react';
import qrcode from 'qrcode-generator';

/**
 * QR-код ссылки на приложение для Android — для человека за компьютером:
 * навёл камеру телефона, и APK скачивается сразу на телефон.
 *
 * Адрес собирается в браузере из адреса самого сайта и пути к текущему APK,
 * поэтому код всегда ведёт на ту сборку, что лежит на этом сервере, и сам
 * меняется с новой версией. Уровень коррекции M: код читается и с экрана
 * под углом, и при бликах.
 */
const noop=()=>()=>{};

export function AppQr({href,label}:{href:string;label:string}){
 // Адрес сайта известен только в браузере: на сервере кода нет, плашка пустая.
 const origin=useSyncExternalStore(noop,()=>location.origin,()=>'');
 const path=useMemo(()=>{
  if(!origin)return null;
  const url=new URL(href,origin).href;
  const qr=qrcode(0,'M');
  qr.addData(url);
  qr.make();
  const n=qr.getModuleCount();let d='';
  for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(qr.isDark(r,c))d+=`M${c} ${r}h1v1h-1z`;
  return {d,n,url};
 },[href,origin]);
 // Поле вокруг кода — 2 модуля: остальное даёт белая плашка, на которой он стоит.
 // Размер задаёт вёрстка (.desk-qr): на низком окне код меньше.
 return <span className="desk-qr" role="img" aria-label={label} data-qr-url={path?.url}>
  {path&&<svg viewBox={`-2 -2 ${path.n+4} ${path.n+4}`} shapeRendering="crispEdges" aria-hidden="true"><path d={path.d} fill="#0b0e10"/></svg>}
 </span>;
}
