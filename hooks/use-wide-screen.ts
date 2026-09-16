'use client';
import {useEffect,useState} from 'react';

/**
 * true — экран от 1024px, то есть студия на ПК.
 *
 * Нужен там, где разметка одна на телефон и на ПК, а оформление — нет:
 * металлические круги вокруг иконок держат по одному WebGL-контексту каждый,
 * и на телефоне это лишний расход батареи и риск для старого WebView.
 *
 * На сервере и в первом клиентском рендере возвращает false, чтобы разметка
 * совпала и гидрация не ругалась; переключается в эффекте.
 */
export const WIDE_SCREEN_QUERY='(min-width: 1024px)';
export function useWideScreen(){
 const [wide,setWide]=useState(false);
 useEffect(()=>{
  if(typeof window.matchMedia!=='function')return;
  const mq=window.matchMedia(WIDE_SCREEN_QUERY);
  const apply=()=>setWide(mq.matches);
  apply();
  mq.addEventListener?.('change',apply);
  return ()=>mq.removeEventListener?.('change',apply);
 },[]);
 return wide;
}
