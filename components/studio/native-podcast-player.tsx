'use client';
import {useEffect,useState,type RefObject} from 'react';
import {nativeCall} from '@/lib/native-client';
import {readProgress,saveProgress} from '@/lib/listening-progress';
import {errorText} from '@/lib/client';
import {PlayerChrome} from './player-chrome';
import {presentation} from '@/lib/player-presentation';
import {useT} from '@/components/i18n-provider';
import type {PlayFrom} from './play-from';
export type NativePlayerState={id:string;active:boolean;playing:boolean;loading:boolean;position:number;duration:number;rate:number;sleepUntil:number;playbackError?:string};
export function NativePodcastPlayer({src,title,duration=0,cover,note,archived,onDonate,onShare,from='begin',next,onNext,autoplay=true,expanded=true,onExpand=()=>{},onClose}:{src:string;title:string;duration?:number;cover?:string;note?:string;archived?:boolean;onDonate?:()=>void;onShare?:()=>void;from?:PlayFrom;next?:{id:string;title:string;cover?:string;duration:number}|null;onNext?:(id:string)=>void;audioRef?:RefObject<HTMLAudioElement|null>;autoplay?:boolean;expanded?:boolean;onExpand?:(next:boolean)=>void;onClose:()=>void}){
 const {t}=useT(),id=new URL(src,'https://truethrills.com').searchParams.get('id')??'';
 const [now,setNow]=useState(0);
 const [state,setState]=useState<NativePlayerState>({id,active:false,playing:false,loading:true,position:0,duration:duration*1000,rate:1,sleepUntil:0}),[message,setMessage]=useState('');
 async function command(method:string,args:Record<string,unknown>={}){try{setState(await nativeCall<NativePlayerState>('player.'+method,args));setMessage('');}catch(e){setMessage(errorText(e));}}
 useEffect(()=>{
  let active=true,inFlight=false;
  // Первый ответ — эхо загрузки: плеер ещё не встал на нужное место и отдаёт
  // ноль. Записывать его как «остановился в начале» нельзя, иначе сохранённое
  // место стиралось каждым открытием выпуска.
  let started=false;
  const receive=(next:NativePlayerState)=>{if(!active||next.id!==id)return;setState(next);setNow(Date.now());
   if(started)saveProgress(id,next.position/1000,next.duration/1000);else started=true;};
  // Место решает страница и присылает его явно. Нативный плеер помнит своё
  // последнее место сам, и пока веб молчал, он это место и подставлял: выпуск,
  // открытый из каталога, продолжался с середины. Молчим только при 'keep' —
  // там экран пересоздали, а звук всё это время шёл, и трогать его нельзя.
  const saved=from==='resume'?readProgress().find(p=>p.id===id):undefined;
  const position=from==='keep'?undefined:from==='resume'?Math.max(0,saved?.position??0)*1000:0;
  void nativeCall<NativePlayerState>('player.load',{id,title,autoplay,...(cover?{cover:new URL(cover,location.origin).toString()}:{}),...(position===undefined?{}:{position})}).then(receive).catch(e=>{if(active)setMessage(errorText(e));});
  const poll=async()=>{if(inFlight||document.hidden)return;inFlight=true;try{receive(await nativeCall<NativePlayerState>('player.state'));}catch(e){if(active)setMessage(errorText(e));}finally{inFlight=false;}};
  const timer=setInterval(()=>void poll(),1000);return()=>{active=false;clearInterval(timer);};
 },[id,title,cover,autoplay,from]);
 const remaining=state.sleepUntil>0?Math.max(1,Math.ceil((state.sleepUntil-now)/60000)):0;
 return <PlayerChrome expanded={expanded} onExpand={onExpand}
  view={{title,cover,note,postId:id,next,presentation:presentation({archived,cover}),kindLabel:archived?t('post.liveArchive'):t('post.podcast'),
   position:state.position/1000,duration:state.duration/1000,playing:state.playing,loading:state.loading,seekable:state.duration>0,rate:state.rate,sleep:remaining,
   sleepValue:state.sleepUntil>0?'active':'0',message:message||(state.playbackError?errorText(new Error(state.playbackError)):''),
   sleepOptions:[{value:'0',label:t('player.sleepOff')},...(state.sleepUntil>0?[{value:'active',label:remaining+' '+t('player.minutes')}]:[]),...[15,30,60].map(m=>({value:m,label:m+' '+t('player.minutes')}))]}}
  act={{toggle:()=>void command(state.playing?'pause':'play'),seekBy:s=>void command('seek',{position:Math.max(0,Math.min(state.duration,state.position+s*1000))}),
   seekTo:s=>void command('seek',{position:Math.max(0,Math.min(state.duration,s*1000))}),setRate:rate=>void command('rate',{rate}),
   setSleep:value=>void command('sleep',{minutes:value==='active'?remaining:Number(value)}),
   close:()=>{void nativeCall('player.stop').catch(()=>{});onClose();},openNext:onNext,share:onShare,donate:onDonate}}/>;
}
