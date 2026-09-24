'use client';

import {useEffect, useRef, useState, type ReactNode, type CSSProperties} from 'react';
import {Home, Compass, Bell} from 'lucide-react';
import {cn} from '@/lib/utils';
import './limelight-nav.css';

export type NavItem = {
  id: string | number;
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  className?: string;
  badge?: ReactNode;
};
export type LimelightNavProps = {
  items?: NavItem[];
  activeId?: string | number;
  defaultActiveIndex?: number;
  onTabChange?: (index: number) => void;
  className?: string;
  limelightClassName?: string;
  iconContainerClassName?: string;
  iconClassName?: string;
  'aria-label'?: string;
};
const defaults: NavItem[] = [
  {id:'home', icon:<Home/>, label:'Главная'},
  {id:'explore', icon:<Compass/>, label:'Обзор'},
  {id:'notifications', icon:<Bell/>, label:'Уведомления'},
];

/** Controlled by activeId in the app; standalone demos can use local selection. */
export function LimelightNav({items=defaults, activeId, defaultActiveIndex=0,
  onTabChange, className, limelightClassName, iconContainerClassName,
  iconClassName, 'aria-label': ariaLabel='Основная навигация'}: LimelightNavProps) {
  const [selected, setSelected] = useState<string|number|undefined>(()=>items[defaultActiveIndex]?.id);
  const current = activeId === undefined ? selected : activeId;
  const navRef = useRef<HTMLElement>(null);
  const lightRef = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<string|number, HTMLButtonElement>());
  // Stable signature avoids restarting observers on unrelated parent renders.
  const ids = JSON.stringify(items.map(item=>item.id));
  useEffect(()=>{
    const nav = navRef.current;
    const light = lightRef.current;
    if (!nav || !light) return;
    let frame = 0;
    const measure = ()=>{
      const item = current === undefined ? undefined : buttons.current.get(current);
      if (!item) {light.style.opacity='0'; return;}
      const vertical = getComputedStyle(nav).flexDirection.startsWith('column');
      light.dataset.orientation = vertical ? 'vertical' : 'horizontal';
      light.style.transform = `translate(${vertical ? item.offsetLeft : item.offsetLeft+item.offsetWidth/2-22}px, ${vertical ? item.offsetTop+item.offsetHeight/2-22 : item.offsetTop}px)`;
      light.style.opacity='1';
    };
    const schedule = ()=>{cancelAnimationFrame(frame); frame=requestAnimationFrame(measure);};
    measure();
    frame=requestAnimationFrame(()=>{light.dataset.ready='true';});
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    observer?.observe(nav);
    buttons.current.forEach(button=>observer?.observe(button));
    window.addEventListener('resize',schedule);
    return ()=>{cancelAnimationFrame(frame);observer?.disconnect();window.removeEventListener('resize',schedule);};
  },[current,ids]);
  if (!items.length) return null;
  return <nav ref={navRef} aria-label={ariaLabel} className={cn('tt-limelight-nav',className)}>
    {items.map((item,index)=><button key={item.id} type="button"
      ref={node=>{if(node) buttons.current.set(item.id,node);else buttons.current.delete(item.id);}}
      className={cn('tt-limelight-item',iconContainerClassName,item.className)}
      data-active={current===item.id} aria-current={current===item.id?'page':undefined}
      aria-label={item.label}
      onClick={()=>{if(activeId===undefined)setSelected(item.id);onTabChange?.(index);item.onClick?.();}}>
      {iconClassName ? <span className={iconClassName}>{item.icon}</span> : item.icon}
      <span>{item.label}</span>{item.badge}
    </button>)}
    <div ref={lightRef} aria-hidden="true" className={cn('tt-limelight',limelightClassName)}
      style={{opacity:0} as CSSProperties}><div className="tt-limelight-cone"/></div>
  </nav>;
}
