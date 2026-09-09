'use client';
import {useEffect,useState} from 'react';
import {Play,Pause,RotateCcw,RotateCw,Loader2,X} from 'lucide-react';
import {nativeCall} from '@/lib/native-client';
import {readProgress,saveProgress} from '@/lib/listening-progress';
import {clock,errorText} from '@/lib/client';
import {useT} from '@/components/i18n-provider';
export type NativePlayerState={id:string;active:boolean;playing:boolean;loading:boolean;position:number;duration:number;rate:number;sleepUntil:number;playbackError?:string};
export function NativePodcastPlayer({src,title,duration=0,onClose}:{src:string;title:string;duration?:number;onClose:()=>void}){
 const {t}=useT(),id=new URL(src,'https://truethrills.com').searchParams.get('id')??'';
 const [now,setNow]=useState(0);
 const [state,setState]=useState<NativePlayerState>({id,active:false,playing:false,loading:true,position:0,duration:duration*1000,rate:1,sleepUntil:0}),[message,setMessage]=useState('');
 async function command(method:string,args:Record<string,unknown>={}){try{setState(await nativeCall<NativePlayerState>('player.'+method,args));setMessage('');}catch(e){setMessage(errorText(e));}}
 useEffect(()=>{
  let active=true,inFlight=false;
  const receive=(next:NativePlayerState)=>{if(!active||next.id!==id)return;setState(next);setNow(Date.now());saveProgress(id,next.position/1000,next.duration/1000);};
  const progress=readProgress().find(p=>p.id===id);
  void nativeCall<NativePlayerState>('player.load',{id,title,...(progress?{position:progress.position*1000}:{})}).then(receive).catch(e=>{if(active)setMessage(errorText(e));});
  const poll=async()=>{if(inFlight||document.hidden)return;inFlight=true;try{receive(await nativeCall<NativePlayerState>('player.state'));}catch(e){if(active)setMessage(errorText(e));}finally{inFlight=false;}};
  const timer=setInterval(()=>void poll(),1000);return()=>{active=false;clearInterval(timer);};
 },[id,title]);
 return <section className="podcast-player" aria-label={t('player.aria',{title})}>
  <img className="podcast-player-logo" src="/brand/logo.png" width="52" height="52" alt=""/><div className="podcast-player-title"><strong>{title}</strong><span>True Thrills</span></div>
  <button className="player-close" aria-label={t('player.close')} onClick={()=>{void nativeCall('player.stop').catch(()=>{});onClose();}}><X size={20}/></button>
  <div className="podcast-transport"><button aria-label={t('player.back15')} onClick={()=>void command('seek',{position:Math.max(0,state.position-15000)})}><RotateCcw size={19}/><span>15</span></button>
  <button className="podcast-toggle" aria-label={state.playing?t('player.pause'):t('player.play')} onClick={()=>void command(state.playing?'pause':'play')}>{state.loading?<Loader2 className="spin" size={22}/>:state.playing?<Pause size={23}/>:<Play size={23}/>}</button>
  <button aria-label={t('player.forward15')} onClick={()=>void command('seek',{position:Math.min(state.duration,state.position+15000)})}><RotateCw size={19}/><span>15</span></button></div>
  <div className="podcast-timeline"><input type="range" aria-label={t('player.seekAria')} min="0" max={state.duration||1} step="100" value={Math.min(state.position,state.duration||0)} disabled={!state.duration} onChange={e=>void command('seek',{position:Number(e.target.value)})}/><div className="podcast-times"><span>{clock(state.position/1000)}</span><span>{state.duration?clock(state.duration/1000):t('player.measuring')}</span></div></div>
  <div className="player-extras"><label>{t('player.rate')} <select value={state.rate} onChange={e=>void command('rate',{rate:Number(e.target.value)})}>{[.75,1,1.25,1.5,1.75,2].map(rate=><option key={rate} value={rate}>{rate}×</option>)}</select></label><label>{t('player.sleep')} <select value={state.sleepUntil>0?'active':'0'} onChange={e=>void command('sleep',{minutes:Number(e.target.value)})}><option value="0">{t('player.sleepOff')}</option>{state.sleepUntil>0&&<option value="active">{Math.max(1,Math.ceil((state.sleepUntil-now)/60000))} {t('player.minutes')}</option>}{[15,30,60].map(m=><option key={m} value={m}>{m} {t('player.minutes')}</option>)}</select></label></div>
  {(message||state.playbackError)&&<p className="podcast-player-message" role="status">{message||errorText(new Error(state.playbackError))}</p>}
 </section>;
}
