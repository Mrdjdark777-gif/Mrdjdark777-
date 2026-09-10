'use client';
import {useEffect,useRef,useState} from 'react';
import type Hls from 'hls.js';
import {toast} from 'sonner';
import {api,errorText} from '@/lib/client';
import {hasNativeClient,nativeCall} from '@/lib/native-client';
import {t} from '@/lib/i18n/runtime';
export type ListenPhase='idle'|'connecting'|'waiting'|'playing'|'paused'|'reconnecting'|'blocked'|'ended'|'error';
type Recording={id:string;title:string;state:string;ready:boolean;postId:string|null;listeners?:number};
type NativeState={id:string;playing:boolean;loading:boolean;ended:boolean;liveSupported?:boolean;livePeer?:string;liveToken?:string;playbackError?:string};
const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
export function useLive(){
 const [hosting,setHosting]=useState(''),[connecting,setConnecting]=useState(false),[listeners,setListeners]=useState(0),[status,setStatus]=useState(''),[listening,setListening]=useState(false),[joined,setJoined]=useState(false),[phase,setPhase]=useState<ListenPhase>('idle');
 const [hostStatus,setHostStatus]=useState(''),[hostSeconds,setHostSeconds]=useState(0),[volume,setVolume]=useState(100),[activeId,setActiveId]=useState('');
 const host=useRef(''),starting=useRef(false),recorder=useRef<MediaRecorder|null>(null),queue=useRef(Promise.resolve()),queued=useRef(0),uploadError=useRef<Error|null>(null),stopTask=useRef<Promise<void>|null>(null);
 const audio=useRef<HTMLAudioElement|null>(null),hls=useRef<Hls|null>(null),native=useRef(false),joinedId=useRef(''),generation=useRef(0),peer=useRef<{id:string;token:string}|null>(null);
 const hostTimer=useRef<ReturnType<typeof setInterval>|null>(null),listenTimer=useRef<ReturnType<typeof setInterval>|null>(null),volumeRef=useRef(100);
 function endViewer(next:ListenPhase='idle',message='',stopNative=true){
  generation.current++;joinedId.current='';setActiveId('');if(listenTimer.current)clearInterval(listenTimer.current);hls.current?.destroy();hls.current=null;
  if(peer.current)void api('live',{action:'leave',peer:peer.current.id,token:peer.current.token}).catch(()=>{});peer.current=null;
  if(audio.current){audio.current.onplaying=null;audio.current.onpause=null;audio.current.onended=null;audio.current.onwaiting=null;audio.current.onerror=null;audio.current.pause();audio.current.removeAttribute('src');audio.current.load();}
  if(native.current&&stopNative)void nativeCall('player.stop').catch(()=>{});native.current=false;
  if('mediaSession'in navigator&&!hasNativeClient()){navigator.mediaSession.metadata=null;for(const action of ['play','pause'] as MediaSessionAction[])navigator.mediaSession.setActionHandler(action,null);}
  setListening(false);setJoined(false);setConnecting(false);setPhase(next);setStatus(message);
 }
 function leave(){endViewer();}
 async function stop(){
  if(stopTask.current)return stopTask.current;
  const task=(async()=>{const id=host.current;if(!id)return;setConnecting(true);setHostStatus(t('liveArchive.saving'));
   if(hostTimer.current)clearInterval(hostTimer.current);
   const rec=recorder.current;
   if(rec&&rec.state!=='inactive')await new Promise<void>(resolve=>{rec.addEventListener('stop',()=>resolve(),{once:true});rec.stop();});
   await queue.current;
   await api('live',{action:'stop',id});host.current='';setHosting('');setListeners(0);setHostStatus(uploadError.current?t('liveArchive.partial'):t('liveArchive.processing'));
   if(uploadError.current)toast.error(t('liveArchive.partial'));
  })();stopTask.current=task;
  try{await task;}finally{stopTask.current=null;setConnecting(false);}
 }
 async function start(title:string,stream:MediaStream){
  if(starting.current||host.current)return;starting.current=true;setConnecting(true);setHostStatus(t('liveHook.starting'));
  try{
   if(!MediaRecorder.isTypeSupported('audio/webm;codecs=opus'))throw new Error('#err.liveRecorder');
   const r=await api<{id:string}>('live',{action:'start',title,transport:'hls'});
   host.current=r.id;uploadError.current=null;queue.current=Promise.resolve();queued.current=0;
   const rec=new MediaRecorder(stream,{mimeType:'audio/webm;codecs=opus',audioBitsPerSecond:128000});recorder.current=rec;let seq=0;
   rec.ondataavailable=e=>{if(!e.data.size)return;const n=seq++;queued.current++;
    if(queued.current>45){uploadError.current=new Error('#err.liveUpload');if(rec.state!=='inactive')rec.stop();void api('live',{action:'stop',id:r.id}).catch(()=>{});toast.error(t('liveArchive.partial'));}
    queue.current=queue.current.then(async()=>{try{
     if(uploadError.current)return;
     let error:unknown;
     for(let attempt=0;attempt<5;attempt++){
      try{const response=await fetch('/api/live-stream?id='+r.id+'&seq='+n,{method:'POST',headers:{'Content-Type':'audio/webm'},body:e.data,signal:AbortSignal.timeout(12000)});
       if(!response.ok){const d=await response.json();throw new Error(d.error||'#err.liveUpload');}setHostStatus(t('liveArchive.receiving'));return;
      }catch(e){error=e;setHostStatus(t('liveArchive.retry'));await wait(Math.min(8000,1000*2**attempt));}
     }
     throw error;
    }catch(e){uploadError.current=e instanceof Error?e:new Error('#err.liveUpload');if(rec.state!=='inactive')rec.stop();setHostStatus(t('liveArchive.partial'));toast.error(errorText(e));void api('live',{action:'stop',id:r.id}).catch(()=>{});
    }finally{queued.current--;}});
   };
   rec.onerror=()=>{uploadError.current=new Error('#err.liveRecorder');void stop().catch(e=>toast.error(errorText(e)));};
   rec.start(2000);setHosting(r.id);setHostSeconds(0);setHostStatus(t('liveArchive.receiving'));const began=Date.now();let polling=false;
   hostTimer.current=setInterval(()=>{setHostSeconds(Math.floor((Date.now()-began)/1000));if(polling)return;polling=true;
    void api<Recording>('live-stream?id='+r.id).then(d=>{setListeners(d.listeners||0);if(d.state!=='receiving'&&!stopTask.current)void stop().catch(e=>toast.error(errorText(e)));}).catch(()=>setHostStatus(t('liveArchive.retry'))).finally(()=>{polling=false;});},3000);
  }catch(e){if(host.current){void api('live',{action:'stop',id:host.current}).catch(()=>{});host.current='';setHosting('');}setHostStatus(t('liveHook.startFailed'));toast.error(errorText(e));}finally{starting.current=false;setConnecting(false);}
 }
 async function resume(){try{if(native.current)await nativeCall('player.play');else{if(hls.current&&audio.current&&hls.current.liveSyncPosition)audio.current.currentTime=hls.current.liveSyncPosition;await audio.current?.play();}}catch{setPhase('blocked');setStatus(t('liveHook.tapToEnable'));}}
 function pause(){if(native.current)void nativeCall('player.pause');else audio.current?.pause();}
 async function listen(id:string,title=t('liveHook.title')){
  if(joinedId.current===id)return;endViewer();joinedId.current=id;setActiveId(id);const gen=generation.current;setConnecting(true);setJoined(true);setPhase('connecting');setStatus(t('liveArchive.buffering'));
  try{
   const rec=await api<Recording>('live-stream?id='+id);if(gen!==generation.current)return;
   if(rec.state==='ready'||rec.state==='failed'){endViewer('ended',t('liveArchive.ended'));return;}
   const state=hasNativeClient()?await nativeCall<NativeState>('player.state'):null;if(gen!==generation.current)return;
   const p=state?.id==='live:'+id&&state.livePeer&&state.liveToken?{id:state.livePeer,token:state.liveToken}:await api<{id:string;token:string}>('live',{action:'join',id});
   if(gen!==generation.current){void api('live',{action:'leave',peer:p.id,token:p.token}).catch(()=>{});return;}peer.current=p;
   native.current=!!state?.liveSupported;let attached=false,polling=false,errors=0;
   const attach=async()=>{
    if(attached||gen!==generation.current)return;attached=true;
    if(native.current){await nativeCall('player.live',{id,title,peer:p.id,token:p.token,cover:location.origin+'/api/cover?id=channel'});if(gen!==generation.current)return;await nativeCall('player.volume',{value:volumeRef.current/100});return;}
    const el=new Audio();audio.current=el;el.volume=volumeRef.current/100;
    el.onplaying=()=>{if(gen!==generation.current)return;setListening(true);setConnecting(false);setPhase('playing');setStatus(t('liveHook.listening'));};
    el.onpause=()=>{if(gen!==generation.current)return;setListening(false);setPhase('paused');setStatus(t('liveHook.paused'));};
    el.onwaiting=()=>{if(gen!==generation.current)return;setListening(false);setPhase('reconnecting');setStatus(t('liveArchive.buffering'));};
    el.onended=()=>{if(gen===generation.current)endViewer('ended',t('liveArchive.ended'));};
    const url='/api/live-stream?id='+id+'&file=index.m3u8&peer='+p.id+'&token='+p.token;
    const play=()=>void el.play().catch(()=>{if(gen===generation.current){setConnecting(false);setPhase('blocked');setStatus(t('liveHook.tapToEnable'));}});
    if(el.canPlayType('application/vnd.apple.mpegurl')){el.src=url;play();}
    else {const {default:Hls}=await import('hls.js');if(gen!==generation.current)return;
     if(!Hls.isSupported())throw new Error('#err.playback');
     const client=new Hls({liveSyncDurationCount:3,liveMaxLatencyDurationCount:8,maxBufferLength:30});hls.current=client;
     let recoveries=0;
     client.on(Hls.Events.MANIFEST_PARSED,play);
     client.on(Hls.Events.ERROR,(_event,data)=>{if(gen!==generation.current||!data.fatal)return;if(recoveries++<3){if(data.type===Hls.ErrorTypes.NETWORK_ERROR)client.startLoad();else if(data.type===Hls.ErrorTypes.MEDIA_ERROR)client.recoverMediaError();else endViewer('error',t('liveHook.playFailed'));}else endViewer('error',t('liveHook.playFailed'));});
     client.loadSource(url);client.attachMedia(el);
    }
    if('mediaSession'in navigator){navigator.mediaSession.metadata=new MediaMetadata({title,artist:'True Thrills'});navigator.mediaSession.setActionHandler('play',()=>void resume());navigator.mediaSession.setActionHandler('pause',pause);}
   };
   const poll=async()=>{if(polling||gen!==generation.current)return;polling=true;try{
    const d=await api<Recording>('live-stream?id='+id);if(gen!==generation.current)return;
    if(d.state==='failed'){endViewer('error',t('liveArchive.partial'));return;}
    if(d.ready)await attach();if(gen!==generation.current)return;
    if(native.current&&attached){const s=await nativeCall<NativeState>('player.state');if(gen!==generation.current)return;
     if(s.ended){endViewer('ended',t('liveArchive.ended'));return;}
     if(s.id!=='live:'+id){endViewer('idle','',false);return;}
     setListening(s.playing);setConnecting(s.loading);setPhase(s.playing?'playing':s.loading?'reconnecting':s.ended?'ended':s.playbackError?'error':'paused');
     setStatus(s.playing?t('liveHook.listening'):s.loading?t('liveArchive.buffering'):s.ended?t('liveArchive.ended'):s.playbackError?t('liveHook.playFailed'):t('liveHook.paused'));
    }
    errors=0;
   }catch(e){if(gen!==generation.current)return;if(++errors>=5)endViewer('error',errorText(e));}finally{polling=false;}};
   listenTimer.current=setInterval(()=>void poll(),2000);await poll();
  }catch(e){if(gen===generation.current)endViewer('error',errorText(e));}
 }
 useEffect(()=>{volumeRef.current=volume;if(audio.current)audio.current.volume=volume/100;if(native.current)void nativeCall('player.volume',{value:volume/100}).catch(()=>{});},[volume]);
 useEffect(()=>{const before=(e:BeforeUnloadEvent)=>{if(host.current){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',before);return()=>{generation.current++;window.removeEventListener('beforeunload',before);if(hostTimer.current)clearInterval(hostTimer.current);if(listenTimer.current)clearInterval(listenTimer.current);hls.current?.destroy();audio.current?.pause();if(recorder.current?.state==='recording')recorder.current.stop();};},[]);
 return{hosting,connecting,listeners,status,listening,joined,activeId,phase,hostStatus,hostSeconds,volume,setVolume,level:-60,samples:Array(64).fill(0) as number[],start,stop,listen,leave,resume,pause,unmute:resume};
}
