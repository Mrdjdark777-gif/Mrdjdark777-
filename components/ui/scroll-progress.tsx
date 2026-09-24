'use client';
import * as React from 'react';
import {ArrowDown} from 'lucide-react';
import {motion,useScroll,useSpring,useReducedMotion,useMotionValueEvent,type HTMLMotionProps} from 'motion/react';
import {cn} from '@/lib/utils';

type ScrollProgressProps=React.ComponentProps<'div'>&{
 progressProps?:HTMLMotionProps<'div'>;
 /** Existing scrollable element, e.g. StoryReader. Omit to wrap children. */
 containerRef?:React.RefObject<HTMLDivElement|null>;
 label?:string;
};
export function ScrollProgress({ref,className,children,progressProps,containerRef:external,label='Прогресс чтения',...props}:ScrollProgressProps){
 const own=React.useRef<HTMLDivElement>(null),container=external??own;
 const wrapped=!external&&children!==undefined;
 React.useImperativeHandle(ref,()=>container.current as HTMLDivElement);
 const {scrollYProgress}=useScroll(external||wrapped?{container}:undefined);
 const spring=useSpring(scrollYProgress,{stiffness:250,damping:40,bounce:0});
 const reduced=useReducedMotion();
 const [percent,setPercent]=React.useState(0);
 useMotionValueEvent(scrollYProgress,'change',v=>setPercent(Math.round(Math.max(0,Math.min(1,v))*100)));
 React.useEffect(()=>{
  const el=external||wrapped?container.current:document.scrollingElement;
  if(!el)return;let frame=0;
  const measure=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const max=el.scrollHeight-el.clientHeight;scrollYProgress.set(max<=1?1:Math.max(0,Math.min(1,el.scrollTop/max)));});};
  const observer=new ResizeObserver(measure);observer.observe(el);Array.from(el.children).forEach(x=>observer.observe(x));
  const mutations=new MutationObserver(measure);mutations.observe(el,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['style','class']});
  el.addEventListener('scroll',measure,{passive:true});el.addEventListener('load',measure,true);window.addEventListener('resize',measure);measure();
  return()=>{cancelAnimationFrame(frame);observer.disconnect();mutations.disconnect();el.removeEventListener('scroll',measure);el.removeEventListener('load',measure,true);window.removeEventListener('resize',measure);};
 },[container,external,wrapped,scrollYProgress]);
 return <><motion.div {...progressProps} data-slot="scroll-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
  style={{...progressProps?.style,scaleX:reduced?scrollYProgress:spring}}
  className={cn('fixed inset-x-0 top-0 z-50 h-1 origin-left bg-[#6FE7DE]',progressProps?.className)}/>
 {wrapped&&<div {...props} ref={own} data-slot="scroll-progress-container" className={cn('h-full overflow-y-auto',className)}>{children}</div>}</>;
}
export const Component=()=>{const reduced=useReducedMotion();return <div className="absolute inset-0"><div className="relative h-full w-full overflow-hidden rounded-xl"><ScrollProgress progressProps={{className:'absolute'}}>
 <div className="flex size-full items-center justify-center bg-[#111719] text-white"><p className="flex items-center gap-2 font-medium">Листайте вниз <motion.span animate={reduced?undefined:{y:[3,-3,3]}} transition={{duration:1.25,repeat:Infinity,ease:'easeInOut'}}><ArrowDown className="size-5"/></motion.span></p></div>
 {[0,1,2,3].map(i=><div key={i} className={i%2?'size-full bg-[#111719]':'size-full bg-[#19312F]'}/>)}</ScrollProgress></div></div>;};
