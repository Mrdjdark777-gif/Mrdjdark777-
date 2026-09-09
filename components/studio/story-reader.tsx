'use client';
import {useEffect,useRef,useState} from 'react';
import {useT} from '@/components/i18n-provider';
export function StoryReader({id,body}:{id:string;body:string}){
 const {t}=useT(),[size,setSize]=useState(19),root=useRef<HTMLDivElement>(null);
 function save(font:number){const el=root.current;if(!el)return;try{localStorage.setItem('tt-reading-'+id,JSON.stringify({size:font,ratio:el.scrollTop/Math.max(1,el.scrollHeight-el.clientHeight)}));}catch{}}
 useEffect(()=>{let second=0;const first=requestAnimationFrame(()=>{try{const value=JSON.parse(localStorage.getItem('tt-reading-'+id)||'null');if(!value)return;setSize([16,19,22,26].includes(value.size)?value.size:19);second=requestAnimationFrame(()=>{const el=root.current;if(el)el.scrollTop=Math.max(0,Math.min(1,Number(value.ratio)||0))*(el.scrollHeight-el.clientHeight);});}catch{}});return()=>{cancelAnimationFrame(first);cancelAnimationFrame(second);};},[id]);
 return <><label className="reader-options">{t('reader.size')} <select value={size} onChange={e=>{const next=Number(e.target.value);setSize(next);save(next);}}>{[16,19,22,26].map(value=><option key={value} value={value}>{value}</option>)}</select></label><div ref={root} className="reading-body reader-scroll" style={{fontSize:size}} onScroll={()=>save(size)}>{body}</div></>;
}
