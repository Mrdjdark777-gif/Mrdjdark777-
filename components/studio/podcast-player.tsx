'use client';
import {useEffect,useRef,useState,type RefObject} from 'react';
import {Play,Pause,RotateCcw,RotateCw,Loader2,X} from 'lucide-react';
import {Slider} from '@/components/ui/slider';
import {clock,errorText} from '@/lib/client';
import {prepareAudioFile} from '@/lib/prepare-audio';
import {hasNativeClient} from '@/lib/native-client';
import {NativePodcastPlayer} from './native-podcast-player';
import {readProgress,saveProgress} from '@/lib/listening-progress';
import {useT} from '@/components/i18n-provider';

function WebPodcastPlayer({src,title,duration:initialDuration=0,cover,audioRef,onClose}:{src:string;title:string;duration?:number;cover?:string;audioRef:RefObject<HTMLAudioElement|null>;onClose:()=>void}){
 const postId=new URL(src,'https://truethrills.com').searchParams.get('id')??'';
 const restored=useRef(false),lastSaved=useRef(0);
 const [rate,setRate]=useState(1),[sleep,setSleep]=useState(0),[isRepairing,setIsRepairing]=useState(false);
 useEffect(()=>{if(!sleep)return;const timer=setTimeout(()=>{local.current?.pause();setSleep(0);},sleep*60000);return()=>clearTimeout(timer);},[sleep]);
 const {t}=useT();
 const [duration,setDuration]=useState(initialDuration),[position,setPosition]=useState(0),[playing,setPlaying]=useState(false),[loading,setLoading]=useState(true),[seekable,setSeekable]=useState(false),[message,setMessage]=useState('');
 const local=useRef<HTMLAudioElement|null>(null),repairing=useRef(false),attempted=useRef(false),controller=useRef<AbortController|null>(null),objectUrl=useRef(''),wanted=useRef(true),scrubbing=useRef(false),alive=useRef(true);
 const session=()=>{
  const el=local.current;if(!el||!('mediaSession'in navigator))return;
  const art=cover?new URL(cover,location.origin).toString():location.origin+'/icon-512.png?v=0.4.1';
  navigator.mediaSession.metadata=new MediaMetadata({title,artist:'True Thrills',album:t('player.album'),artwork:[{src:art,sizes:cover?'':'512x512',type:cover?'':'image/png'}]});
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
  repairing.current=true;setIsRepairing(true);attempted.current=true;setLoading(true);setMessage(t('player.preparingSeek'));
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
  finally{repairing.current=false;if(alive.current)setIsRepairing(false);}
 }
 useEffect(()=>{alive.current=true;const el=local.current;if(el){el.src=src;el.load();void play();}return()=>{alive.current=false;controller.current?.abort();if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);if(el)saveProgress(postId,el.currentTime,Number.isFinite(el.duration)?el.duration:initialDuration);el?.pause();if('mediaSession'in navigator){for(const action of ['play','pause','seekbackward','seekforward','seekto'] as const)navigator.mediaSession.setActionHandler(action,null);navigator.mediaSession.metadata=null;navigator.mediaSession.playbackState='none';}if(audioRef.current===el)audioRef.current=null;};},[src]);
 function metadata(){const el=local.current;if(!el||el.readyState===0)return;if(Number.isFinite(el.duration)&&el.duration>0){if(!restored.current){restored.current=true;const progress=readProgress().find(p=>p.id===postId);if(progress&&progress.position<el.duration-2)el.currentTime=progress.position;}setDuration(el.duration);setSeekable(true);setLoading(false);mediaPosition();}else if(!attempted.current)void repair();}
 return <section className="podcast-player" aria-label={t('player.aria',{title})}>
  <img className="podcast-player-logo" src="/brand/logo.png?v=0.4.1" width="52" height="52" alt=""/>
  <div className="podcast-player-title"><strong>{title}</strong><span>True Thrills</span></div>
  <button className="player-close" onClick={onClose} aria-label={t('player.close')}><X size={20}/></button>
  <audio ref={el=>{local.current=el;audioRef.current=el;}} preload="metadata" onLoadedMetadata={metadata} onDurationChange={metadata}
   onPlaying={()=>{setPlaying(true);setLoading(false);session();if('mediaSession'in navigator)navigator.mediaSession.playbackState='playing';}}
   onPause={()=>{setPlaying(false);if('mediaSession'in navigator)navigator.mediaSession.playbackState='paused';}}
   onTimeUpdate={()=>{const el=local.current;if(el&&!scrubbing.current&&Number.isFinite(el.currentTime))setPosition(el.currentTime);if(el&&Date.now()-lastSaved.current>5000){lastSaved.current=Date.now();saveProgress(postId,el.currentTime,Number.isFinite(el.duration)?el.duration:initialDuration);}mediaPosition();}}
   onWaiting={()=>setLoading(true)} onCanPlay={()=>{if(!repairing.current)setLoading(false);}}
   onEnded={()=>{wanted.current=false;setPlaying(false);setPosition(local.current?.duration||0);}}
   onError={()=>{setLoading(false);setMessage(t('player.unavailable'));}}/>
  <div className="podcast-transport"><button onClick={()=>seek((local.current?.currentTime??0)-15)} disabled={!seekable} aria-label={t('player.back15')}><RotateCcw size={19}/><span>15</span></button>
   <button className="podcast-toggle" aria-label={playing?t('player.pause'):t('player.play')} disabled={isRepairing} onClick={()=>{if(playing){wanted.current=false;local.current?.pause();}else{wanted.current=true;void play();}}}>{loading?<Loader2 className="spin" size={22}/>:playing?<Pause size={23}/>:<Play size={23}/>}</button>
   <button onClick={()=>seek((local.current?.currentTime??0)+15)} disabled={!seekable} aria-label={t('player.forward15')}><RotateCw size={19}/><span>15</span></button></div>
  <div className="podcast-timeline"><Slider aria-label={t('player.seekAria')} aria-valuetext={t('player.seekValue',{position:clock(position),duration:clock(duration)})} value={[Math.min(position,duration||0)]} min={0} max={duration||1} step={0.1} disabled={!seekable} onValueChange={v=>{scrubbing.current=true;setPosition(v[0]);}} onValueCommit={v=>{scrubbing.current=false;seek(v[0]);}}/><div className="podcast-times"><span>{clock(position)}</span><span>{duration>0?clock(duration):t('player.measuring')}</span></div></div>
  <div className="player-extras"><label>{t('player.rate')} <select value={rate} onChange={e=>{const value=Number(e.target.value);setRate(value);if(local.current)local.current.playbackRate=value;mediaPosition();}}>{[.75,1,1.25,1.5,1.75,2].map(value=><option key={value} value={value}>{value}×</option>)}</select></label><label>{t('player.sleep')} <select value={sleep} onChange={e=>setSleep(Number(e.target.value))}><option value="0">{t('player.sleepOff')}</option>{[15,30,60].map(value=><option key={value} value={value}>{value} {t('player.minutes')}</option>)}</select></label></div>
  {message&&<p className="podcast-player-message" role="status">{message}</p>}
 </section>;
}

export function PodcastPlayer(props:Parameters<typeof WebPodcastPlayer>[0]){return hasNativeClient()?<NativePodcastPlayer {...props}/>:<WebPodcastPlayer {...props}/>;}
