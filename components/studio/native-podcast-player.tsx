'use client';
import {useEffect,useState,type RefObject} from 'react';
import {nativeCall} from '@/lib/native-client';
import {readProgress,saveProgress} from '@/lib/listening-progress';
import {errorText} from '@/lib/client';
import {PlayerChrome} from './player-chrome';
import {presentation} from '@/lib/player-presentation';
import {useT} from '@/components/i18n-provider';
export type NativePlayerState={id:string;active:boolean;playing:boolean;loading:boolean;position:number;duration:number;rate:number;sleepUntil:number;playbackError?:string};
export function NativePodcastPlayer({src,title,duration=0,cover,note,archived,supportUrl,onShare,resume=false,next,onNext,autoplay=true,expanded=true,onExpand=()=>{},onClose}:{src:string;title:string;duration?:number;cover?:string;note?:string;archived?:boolean;supportUrl?:string;onShare?:()=>void;resume?:boolean;next?:{id:string;title:string;cover?:string;duration:number}|null;onNext?:(id:string)=>void;audioRef?:RefObject<HTMLAudioElement|null>;autoplay?:boolean;expanded?:boolean;onExpand?:(next:boolean)=>void;onClose:()=>void}){
 const {t}=useT(),id=new URL(src,'https://truethrills.com').searchParams.get('id')??'';
 const [now,setNow]=useState(0);
 const [state,setState]=useState<NativePlayerState>({id,active:false,playing:false,loading:true,position:0,duration:duration*1000,rate:1,sleepUntil:0}),[message,setMessage]=useState('');
 async function command(method:string,args:Record<string,unknown>={}){try{setState(await nativeCall<NativePlayerState>('player.'+method,args));setMessage('');}catch(e){setMessage(errorText(e));}}
 useEffect(()=>{
  let active=true,inFlight=false;
  const receive=(next:NativePlayerState)=>{if(!active||next.id!==id)return;setState(next);setNow(Date.now());saveProgress(id,next.position/1000,next.duration/1000);};
  // С места — только по просьбе со строки «Продолжить».
  const progress=resume?readProgress().find(p=>p.id===id):undefined;
  void nativeCall<NativePlayerState>('player.load',{id,title,autoplay,...(cover?{cover:new URL(cover,location.origin).toString()}:{}),...(progress?{position:progress.position*1000}:{})}).then(receive).catch(e=>{if(active)setMessage(errorText(e));});
  const poll=async()=>{if(inFlight||document.hidden)return;inFlight=true;try{receive(await nativeCall<NativePlayerState>('player.state'));}catch(e){if(active)setMessage(errorText(e));}finally{inFlight=false;}};
  const timer=setInterval(()=>void poll(),1000);return()=>{active=false;clearInterval(timer);};
 },[id,title,cover,autoplay,resume]);
 const remaining=state.sleepUntil>0?Math.max(1,Math.ceil((state.sleepUntil-now)/60000)):0;
 return <PlayerChrome expanded={expanded} onExpand={onExpand}
  view={{title,cover,note,supportUrl,postId:id,next,presentation:presentation({archived,cover}),kindLabel:archived?t('post.liveArchive'):t('post.podcast'),
   position:state.position/1000,duration:state.duration/1000,playing:state.playing,loading:state.loading,seekable:state.duration>0,rate:state.rate,sleep:remaining,
   sleepValue:state.sleepUntil>0?'active':'0',message:message||(state.playbackError?errorText(new Error(state.playbackError)):''),
   sleepOptions:[{value:'0',label:t('player.sleepOff')},...(state.sleepUntil>0?[{value:'active',label:remaining+' '+t('player.minutes')}]:[]),...[15,30,60].map(m=>({value:m,label:m+' '+t('player.minutes')}))]}}
  act={{toggle:()=>void command(state.playing?'pause':'play'),seekBy:s=>void command('seek',{position:Math.max(0,Math.min(state.duration,state.position+s*1000))}),
   seekTo:s=>void command('seek',{position:Math.max(0,Math.min(state.duration,s*1000))}),setRate:rate=>void command('rate',{rate}),
   setSleep:value=>void command('sleep',{minutes:value==='active'?remaining:Number(value)}),
   close:()=>{void nativeCall('player.stop').catch(()=>{});onClose();},openNext:onNext,share:onShare}}/>;
}
