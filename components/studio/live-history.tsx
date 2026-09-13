'use client';
import {useEffect,useRef,useState} from 'react';
// Бегущая полоса уровня за последние секунды. У эфира нет будущего, поэтому
// рисовать дорожку целиком, как у записанного трека, нечем — вместо этого
// полоса показывает то, что уже прозвучало, и уезжает влево.
const SLOTS=56,TICK_MS=100,EMPTY=Array<number>(SLOTS).fill(0);
export function LiveHistory({levels,active}:{levels:number[];active:boolean}){
 const [bars,setBars]=useState<number[]>(EMPTY);
 // Спектр приходит десятки раз в секунду. Держим последний кадр в ref и
 // сдвигаем полосу по таймеру: иначе каждый кадр звука перерисовывал бы все
 // столбики и грел телефон впустую.
 const latest=useRef<number[]>(EMPTY);
 useEffect(()=>{latest.current=levels;},[levels]);
 useEffect(()=>{
  if(!active)return;
  const timer=setInterval(()=>{
   // Берём самую громкую полосу кадра: так виден удар, а не усреднённая каша.
   let peak=0;for(const value of latest.current)if(value>peak)peak=value;
   setBars(prev=>[...prev.slice(1),peak]);
  },TICK_MS);
  return()=>clearInterval(timer);
 },[active]);
 // Пока звука нет, полоса ровная: пусть лучше молчит, чем показывает прошлое.
 const shown=active?bars:EMPTY;
 return <div className="live-history" aria-hidden="true">{shown.map((value,i)=>
  <span key={i} style={{height:(6+Math.min(1,value)*94).toFixed(1)+'%',opacity:(0.35+0.65*i/(SLOTS-1)).toFixed(2)}}/>)}</div>;
}
