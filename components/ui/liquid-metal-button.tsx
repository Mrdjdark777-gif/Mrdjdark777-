'use client';
import {liquidMetalFragmentShader,ShaderMount} from '@paper-design/shaders';
import {Sparkles} from 'lucide-react';
import {useEffect,useRef,useState,type ReactNode,type CSSProperties,type MouseEvent} from 'react';
import {cn} from '@/lib/utils';
import './liquid-metal-button.css';

type Props={label?:string;onClick?:()=>void;viewMode?:'text'|'icon';icon?:ReactNode;size?:number;interactive?:boolean;href?:string;className?:string;variant?:'dark'|'teal';disabled?:boolean;};
/** Preserves the existing icon/size/interactive API. Decorative mode never nests a button. */
export function LiquidMetalButton({label='Открыть',onClick,viewMode='text',icon,size=46,interactive=true,href,className,variant='dark',disabled=false}:Props){
 const root=useRef<HTMLElement|null>(null),surface=useRef<HTMLDivElement>(null),mount=useRef<ShaderMount|null>(null),hover=useRef(false),visible=useRef(true),reduced=useRef(false);
 const timers=useRef<ReturnType<typeof setTimeout>[]>([]),sequence=useRef(0);
 const [ripples,setRipples]=useState<{id:number;x:number;y:number}[]>([]);
 useEffect(()=>{
  const el=surface.current;if(!el)return;
  const media=window.matchMedia('(prefers-reduced-motion: reduce)');reduced.current=media.matches;
  const speed=()=>mount.current?.setSpeed(document.hidden||!visible.current||reduced.current?0:hover.current?1:.35);
  try{mount.current=new ShaderMount(el,liquidMetalFragmentShader,{u_repetition:4,u_softness:.5,u_shiftRed:.3,u_shiftBlue:.3,u_distortion:0,u_contour:0,u_angle:45,u_scale:8,u_shape:1,u_offsetX:.1,u_offsetY:-.1},undefined,media.matches?0:.35,0,1,180000);}catch{el.replaceChildren();}
  const changed=()=>{reduced.current=media.matches;speed();};
  const observer=new IntersectionObserver(entries=>{visible.current=entries[0]?.isIntersecting??false;speed();});observer.observe(el);
  media.addEventListener('change',changed);document.addEventListener('visibilitychange',speed);speed();
  return()=>{observer.disconnect();media.removeEventListener('change',changed);document.removeEventListener('visibilitychange',speed);timers.current.forEach(clearTimeout);timers.current=[];mount.current?.dispose();mount.current=null;};
 },[]);
 function click(e:MouseEvent<HTMLElement>){if(disabled){e.preventDefault();return;}if(!reduced.current){const box=e.currentTarget.getBoundingClientRect(),id=sequence.current++;const x=e.detail===0?box.width/2:e.clientX-box.left,y=e.detail===0?box.height/2:e.clientY-box.top;setRipples(v=>[...v.slice(-3),{id,x,y}]);mount.current?.setSpeed(2.4);timers.current.push(setTimeout(()=>{mount.current?.setSpeed(document.hidden||!visible.current||reduced.current?0:hover.current?1:.35);},300),setTimeout(()=>setRipples(v=>v.filter(r=>r.id!==id)),600));}onClick?.();}
 const content=<><div ref={surface} className="tt-metal-shader" aria-hidden="true"/><span className="tt-metal-fill" aria-hidden="true"/><span className="tt-metal-content">{icon??(viewMode==='icon'?<Sparkles size={18}/>:null)}{viewMode==='text'&&<span>{label}</span>}</span>{ripples.map(r=><span key={r.id} aria-hidden="true" className="tt-metal-ripple" style={{left:r.x,top:r.y}}/>)}</>;
 const shared={className:cn('tt-metal',viewMode==='icon'&&'tt-metal-icon',variant==='teal'&&'tt-metal-teal',className),style:{'--tt-metal-size':`${size}px`} as CSSProperties};
 if(!interactive)return <span {...shared} aria-hidden="true">{content}</span>;
 const handlers={onClick:click,onPointerEnter:()=>{hover.current=true;if(!reduced.current&&!document.hidden)mount.current?.setSpeed(1);},onPointerLeave:()=>{hover.current=false;if(!reduced.current)mount.current?.setSpeed(document.hidden?0:.35);}};
 if(href&&!disabled)return <a {...shared} {...handlers} ref={el=>{root.current=el;}} href={href} target="_blank" rel="noopener noreferrer" aria-label={label}>{content}</a>;
 return <button {...shared} {...handlers} ref={el=>{root.current=el;}} type="button" disabled={disabled} aria-label={label}>{content}</button>;
}
