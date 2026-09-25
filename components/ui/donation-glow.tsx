'use client';
import {useEffect,useState,type ReactNode} from 'react';
import {BorderBeam} from './border-beam-button';
import './donation-glow.css';

/** Сколько секунд луч живёт после появления экрана. */
const REST_AFTER=6000;

/**
 * Свечение вокруг всего, что связано с поддержкой автора: сердечка в шапке,
 * плашки в эфире, кнопки в плеере и площадок в окне выбора.
 *
 * Держим его в одном месте намеренно. Поддержка — единственное, о чём канал
 * просит, и просит редко; если подсветку расставлять по месту, она разойдётся
 * по виду и начнёт спорить сама с собой.
 *
 * Луч не крутится вечно. В первой версии он вращался раз в две секунды и
 * переливался цветом без остановки — на телефоне это единственное, что на
 * главной двигалось быстро, и владелец увидел мельтешение в углу глаза.
 * Теперь он показывается при появлении экрана и через несколько секунд
 * затихает: акцент остаётся, движение — нет. Перелив цвета выключен совсем.
 *
 * Обёртка — обычный блок, поэтому в строке плашек и в сетке площадок она
 * должна вести себя как сама кнопка: за это отвечает класс tt-glow.
 *
 * Уважение к «уменьшить движение» встроено в сам компонент: при этой
 * настройке луч не крутится вовсе.
 */
export function DonationGlow({children,plate=false,className}:{children:ReactNode;plate?:boolean;className?:string}){
 const [awake,setAwake]=useState(true);
 useEffect(()=>{const timer=setTimeout(()=>setAwake(false),REST_AFTER);return()=>clearTimeout(timer);},[]);
 return <BorderBeam
  className={'tt-glow'+(plate?' tt-glow-plate':'')+(className?' '+className:'')}
  size={plate?'md':'sm'} colorVariant="colorful" theme="dark" glowSize={plate?1:.8}
  staticColors active={awake}>
  {children}
 </BorderBeam>;
}
