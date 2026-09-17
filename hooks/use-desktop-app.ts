'use client';
import {useEffect,useState} from 'react';
import {isDesktopApp} from '@/lib/desktop-shell';

/**
 * true — страница открыта внутри оконного приложения на ПК, а не в браузере.
 *
 * На сервере и в первом клиентском рендере возвращает false, чтобы разметка
 * совпала и гидрация не ругалась; мост проверяется в эффекте.
 */
export function useDesktopApp(){
 const [desktop,setDesktop]=useState(false);
 useEffect(()=>{const apply=()=>setDesktop(isDesktopApp());apply();},[]);
 return desktop;
}
