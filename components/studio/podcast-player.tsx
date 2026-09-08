'use client';
import {useEffect,useRef,useState,type RefObject} from 'react';
import {Play,Pause,RotateCcw,RotateCw,Loader2,X} from 'lucide-react';
import {Slider} from '@/components/ui/slider';
import {clock,errorText} from '@/lib/client';
import {prepareAudioFile} from '@/lib/prepare-audio';
import {useT} from '@/components/i18n-provider';

export function PodcastPlayer({src,title,duration:initialDuration=0,audioRef,onClose}:{src:string;title:string;duration?:number;audioRef:RefObject<HTMLAudioElement|null>;onClose:()=>void}){
 const {t}=useT();
 const [duration,setDuration]=useState(initialDuration),[position,setPosition]=useState(0),[playing,setPlaying]=useState(false),[loading,setLoading]=useState(true),[seekable,setSeekable]=useState(false),[message,setMessage]=useState('');
 const local=useRef<HTMLAudioElement|null>(null),repairing=useRef(false),attempted=useRef(false),controller=useRef<AbortController|null>(null),objectUrl=useRef(''),wanted=useRef(true),scrubbing=useRef(false),alive=useRef(true);
 const session=()=>{
  const el=local.current;if(!el||!('mediaSession'in navigator))return;
  navigator.mediaSession.metadata=new MediaMetadata({title,artist:'True Thrills',album:t('player.album'),artwork:[{src:location.origin+'/icon-512.png?v=0.4.1',sizes:'512x512',type:'image/png'}]});
  navigator.mediaSession.setActionHandler('play',()=>{wanted.current=true;void play();});
  navigator.mediaSession.setActionHandler('pause',()=>{wanted.current=false;el.pause();});
  navigator.mediaSession.setActionHandler('seekbackward',d=>seek(el.currentTime-(d.seekOffset??15)));
  navigator.mediaSession.setActionHandler('seekforward',d=>seek(el.currentTime+(d.seekOffset??15)));
  navigator.mediaSession.setActionHandler('seekto',d=>{if(d.seekTime!==undefined)seek(d.seekTime);});
 };
 const mediaPosition=()=>{const el=local.current;if(el&&'mediaSession'in navigator&&Number.isFinite(el.duration)&&el.duration>0){try{navigator.mediaSession.setPositionState({duration:el.duration,playbackRate:el.playbackRate,position:Math.min(el.duration,Math.max(0,el.currentTime))});}catch{}}};
 async function play(){try{await local.current?.play();if(alive.current)setMessage('');}catch(e){if(alive.current&&!repairing.current&&!(e instanceof DOMException&&e.name==='AbortError')){setLoading(false);setMessage(t('player.tapToPlay'));}}}
 function seek(seconds:number){const el=local.current;if(!el||!Number.isFinite(el.duration)||el.duration<=0)return;const target=Math.min(el.duration,Math.max(0,seconds));try{el.currentTime=target;setPosition(target);mediaPosition();}catch{setMessage(t('player.seekFailed'));}}
 async function repair(){
  if(repairing.current)return;const el=local.current;if(!el)return;
  repairing.current=true;attempted.current=true;setLoading(true);setMessage(t('player.preparingSeek'));
  const resumeAt=Number.isFinite(el.currentTime)?el.currentTime:0;el.pause();
  const abort=new AbortController();controller.current=abort;
  try{
   const response=await fetch(src,{signal:abort.signal});if(!response.ok)throw new Error(t('player.loadFailed'));
   const size=Number(response.headers.get('content-length'));if(size>80*1024*1024)throw new Error(t('player.tooBig'));
   const result=await prepareAudioFile(await response.blob(),abort.signal);if(abort.signal.aborted||!alive.current)return;
   objectUrl.current=URL.createObjectURL(result.blob);setDuration(result.duration);el.src=objectUrl.current;el.load();
   el.currentTime=Math.min(resumeAt,result.duration);setMessage('');
   if(wanted.current)void play();
  }catch(e){if(!abort.signal.aborted&&alive.current){setMessage(errorText(e));setLoading(false);}}
  finally{repairing.current=false;}
 }
 useEffect(()=>{alive.current=true;const el=local.current;if(el){el.src=src;el.load();void play();}return()=>{alive.current=false;controller.current?.abort();if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);el?.pause();if(audioRef.current===el)audioRef.current=null;};},[src]);
 function metadata(){const el=local.current;if(!el||el.readyState===0)return;if(Number.isFinite(el.duration)&&el.duration>0){setDuration(el.duration);setSeekable(true);setLoading(false);mediaPosition();}else if(!attempted.current)void repair();}
 return <section className="podcast-player" aria-label={t('player.aria',{title})}>
  <img className="podcast-player-logo" src="/brand/logo.png?v=0.4.1" width="52" height="52" alt=""/>
  <div className="podcast-player-title"><strong>{title}</strong><span>True Thrills</span></div>
  <button className="player-close" onClick={onClose} aria-label={t('player.close')}><X size={20}/></button>
  <audio ref={el=>{local.current=el;audioRef.current=el;}} preload="metadata" onLoadedMetadata={metadata} onDurationChange={metadata}
   onPlaying={()=>{setPlaying(true);setLoading(false);session();if('mediaSession'in navigator)navigator.mediaSession.playbackState='playing';}}
   onPause={()=>{setPlaying(false);if('mediaSession'in navigator)navigator.mediaSession.playbackState='paused';}}
   onTimeUpdate={()=>{const el=local.current;if(el&&!scrubbing.current&&Number.isFinite(el.currentTime))setPosition(el.currentTime);mediaPosition();}}
   onWaiting={()=>setLoading(true)} onCanPlay={()=>{if(!repairing.current)setLoading(false);}}
   onEnded={()=>{wanted.current=false;setPlaying(false);setPosition(local.current?.duration||0);}}
   onError={()=>{setLoading(false);setMessage(t('player.unavailable'));}}/>
  <div className="podcast-transport"><button onClick={()=>seek((local.current?.currentTime??0)-15)} disabled={!seekable} aria-label={t('player.back15')}><RotateCcw size={19}/><span>15</span></button>
   <button className="podcast-toggle" aria-label={playing?t('player.pause'):t('player.play')} disabled={repairing.current} onClick={()=>{if(playing){wanted.current=false;local.current?.pause();}else{wanted.current=true;void play();}}}>{loading?<Loader2 className="spin" size={22}/>:playing?<Pause size={23}/>:<Play size={23}/>}</button>
   <button onClick={()=>seek((local.current?.currentTime??0)+15)} disabled={!seekable} aria-label={t('player.forward15')}><RotateCw size={19}/><span>15</span></button></div>
  <div className="podcast-timeline"><Slider aria-label={t('player.seekAria')} aria-valuetext={t('player.seekValue',{position:clock(position),duration:clock(duration)})} value={[Math.min(position,duration||0)]} min={0} max={duration||1} step={0.1} disabled={!seekable} onValueChange={v=>{scrubbing.current=true;setPosition(v[0]);}} onValueCommit={v=>{scrubbing.current=false;seek(v[0]);}}/><div className="podcast-times"><span>{clock(position)}</span><span>{duration>0?clock(duration):t('player.measuring')}</span></div></div>
  {message&&<p className="podcast-player-message" role="status">{message}</p>}
 </section>;
}
