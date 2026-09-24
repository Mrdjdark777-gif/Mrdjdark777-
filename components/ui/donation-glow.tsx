'use client';
import type {ReactNode} from 'react';
import {BorderBeam} from './border-beam-button';
import './donation-glow.css';

/**
 * Свечение вокруг всего, что связано с поддержкой автора: сердечка в шапке,
 * плашек на главной и в эфире, кнопки в плеере и площадок в окне выбора.
 *
 * Держим его в одном месте намеренно. Поддержка — единственное, о чём канал
 * просит, и просит редко; если подсветку расставлять по месту, она разойдётся
 * по виду и начнёт спорить сама с собой.
 *
 * Обёртка — обычный блок, поэтому в строке плашек и в сетке площадок она
 * должна вести себя как сама кнопка: за это отвечает класс tt-glow.
 *
 * Уважение к «уменьшить движение» встроено в сам компонент: при этой
 * настройке луч не крутится.
 */
export function DonationGlow({children,plate=false,className}:{children:ReactNode;plate?:boolean;className?:string}){
 return <BorderBeam
  className={'tt-glow'+(plate?' tt-glow-plate':'')+(className?' '+className:'')}
  size={plate?'md':'sm'} colorVariant="colorful" theme="dark" glowSize={plate?1:.8}>
  {children}
 </BorderBeam>;
}
