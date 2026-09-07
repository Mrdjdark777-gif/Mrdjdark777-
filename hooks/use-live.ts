'use client';
import {useEffect,useRef,useState} from 'react';
import {toast} from 'sonner';
import {stereoDescription} from '@/lib/opus-stereo';
import {api,errorText} from '@/lib/client';
const config:RTCConfiguration={iceServers:[{urls:'stun:stun.l.google.com:19302'}]};
async function gather(pc:RTCPeerConnection){if(pc.iceGatheringState==='complete')return;await new Promise<void>(resolve=>{const done=()=>{clearTimeout(timer);pc.removeEventListener('icegatheringstatechange',check);resolve();};const check=()=>{if(pc.iceGatheringState==='complete')done();};const timer=setTimeout(done,10000);pc.addEventListener('icegatheringstatechange',check);});}
export type ListenPhase='idle'|'connecting'|'waiting'|'playing'|'paused'|'reconnecting'|'blocked'|'ended'|'error';
export function useLive(){
 const [hosting,setHosting]=useState(''),[connecting,setConnecting]=useState(false),[listeners,setListeners]=useState(0),[status,setStatus]=useState(''),[listening,setListening]=useState(false),[joined,setJoined]=useState(false),[phase,setPhase]=useState<ListenPhase>('idle');
 const [hostStatus,setHostStatus]=useState(''),[hostSeconds,setHostSeconds]=useState(0),[volume,setVolume]=useState(100),[level,setLevel]=useState(-60),[samples,setSamples]=useState<number[]>(Array(64).fill(0));
 const joinedId=useRef('');
 const host=useRef(''),starting=useRef(false),pcs=useRef(new Map<string,RTCPeerConnection>()),viewer=useRef<RTCPeerConnection|null>(null),peer=useRef<{id:string;token:string}|null>(null),audio=useRef<HTMLAudioElement|null>(null),hostTimer=useRef<ReturnType<typeof setInterval>|null>(null),listenTimer=useRef<ReturnType<typeof setInterval>|null>(null),elapsedTimer=useRef<ReturnType<typeof setInterval>|null>(null),meterTimer=useRef<ReturnType<typeof setInterval>|null>(null),context=useRef<AudioContext|null>(null),generation=useRef(0),volumeRef=useRef(100);
 volumeRef.current=volume;
 function endViewer(next:ListenPhase='idle',message=''){
  joinedId.current='';generation.current++;if(listenTimer.current)clearInterval(listenTimer.current);if(meterTimer.current)clearInterval(meterTimer.current);viewer.current?.close();viewer.current=null;
  if(peer.current)void api('live',{action:'leave',peer:peer.current.id,token:peer.current.token}).catch(()=>{});peer.current=null;
  if(audio.current){audio.current.onplaying=null;audio.current.onpause=null;audio.current.onerror=null;audio.current.pause();audio.current.srcObject=null;}
  void context.current?.close().catch(()=>{});context.current=null;setListening(false);setJoined(false);setConnecting(false);setPhase(next);setStatus(message);setLevel(-60);setSamples(Array(64).fill(0));
 }
 function leave(){endViewer();}
 async function stop(){const id=host.current;host.current='';setHosting('');if(hostTimer.current)clearInterval(hostTimer.current);if(elapsedTimer.current)clearInterval(elapsedTimer.current);pcs.current.forEach(p=>p.close());pcs.current.clear();setListeners(0);setHostStatus('Эфир завершён');if(id)await api('live',{action:'stop',id});}
 async function start(title:string,s:MediaStream){
  if(starting.current||host.current)return;starting.current=true;setConnecting(true);setHostStatus('Запускаем эфир…');
  try{
   const r=await api<{id:string}>('live',{action:'start',title});host.current=r.id;setHosting(r.id);setHostStatus('Эфир запущен');setHostSeconds(0);const began=Date.now();elapsedTimer.current=setInterval(()=>setHostSeconds(Math.floor((Date.now()-began)/1000)),1000);
   let polling=false,errors=0;
   const poll=async()=>{if(polling||host.current!==r.id)return;polling=true;try{
    await api('live',{action:'heartbeat',id:r.id,connected:[...pcs.current].filter(([,pc])=>pc.connectionState==='connected').map(([id])=>id)});const data=await api<{active:boolean;peers:{id:string;offer:string;answer:string|null}[]}>('live?host='+encodeURIComponent(r.id));if(host.current!==r.id)return;errors=0;setHostStatus('Эфир запущен');if(!data.active){await stop();return;}
    const ids=new Set<string>(data.peers.map(p=>p.id));pcs.current.forEach((pc,id)=>{if(!ids.has(id)){pc.close();pcs.current.delete(id);}});
    for(const p of data.peers){if(pcs.current.has(p.id))continue;const pc=new RTCPeerConnection(config);pcs.current.set(p.id,pc);s.getTracks().forEach(t=>pc.addTrack(t,s));
     pc.onconnectionstatechange=()=>{if(host.current===r.id)setListeners([...pcs.current.values()].filter(x=>x.connectionState==='connected').length);};
     void(async()=>{try{await pc.setRemoteDescription(JSON.parse(p.offer));await pc.setLocalDescription(stereoDescription(await pc.createAnswer()));await gather(pc);if(host.current===r.id)await api('live',{action:'answer',peer:p.id,answer:JSON.stringify(pc.localDescription)});}catch{pc.close();pcs.current.delete(p.id);}})();
    }
    setListeners([...pcs.current.values()].filter(p=>p.connectionState==='connected').length);
   }catch{if(host.current!==r.id)return;errors++;setHostStatus('Восстанавливаем связь с сервером…');if(errors>=5){void stop().catch(()=>{});setHostStatus('Эфир остановлен: потеряна связь');toast.error('Связь потеряна. Проверь интернет и запусти эфир заново.');}}finally{polling=false;}};
   hostTimer.current=setInterval(()=>void poll(),3000);void poll();
  }catch(e){setHostStatus('Не удалось запустить эфир');toast.error(errorText(e));}finally{starting.current=false;setConnecting(false);}
 }
 async function resume(){try{await context.current?.resume();await audio.current?.play();}catch{setPhase('blocked');setStatus('Нажми «Включить звук», чтобы разрешить воспроизведение.');}}
 function pause(){audio.current?.pause();}
 async function listen(id:string,title='Прямой эфир'){
  if(joinedId.current===id)return;
  endViewer();joinedId.current=id;const gen=generation.current;setConnecting(true);setJoined(true);setPhase('connecting');setStatus('Подключаемся к автору…');
  try{
   const ctx=new AudioContext();context.current=ctx;void ctx.resume().catch(()=>{});
   let disconnectedAt=Date.now(),playbackBlocked=false,userPaused=false;const pc=new RTCPeerConnection(config);viewer.current=pc;pc.addTransceiver('audio',{direction:'recvonly'});const el=audio.current??new Audio();audio.current=el;el.autoplay=true;el.volume=volumeRef.current/100;
   el.onplaying=()=>{if(gen!==generation.current)return;playbackBlocked=false;userPaused=false;setListening(true);setConnecting(false);setPhase('playing');setStatus('Вы слушаете прямой эфир');if('mediaSession'in navigator)navigator.mediaSession.playbackState='playing';};
   el.onpause=()=>{if(gen!==generation.current)return;userPaused=true;setListening(false);setPhase('paused');setStatus('Прослушивание на паузе');if('mediaSession'in navigator)navigator.mediaSession.playbackState='paused';};
   el.onerror=()=>{if(gen===generation.current)endViewer('error','Не удалось воспроизвести звук. Подключись ещё раз.');};
   if('mediaSession'in navigator){navigator.mediaSession.metadata=new MediaMetadata({title,artist:'True Thrills',album:'Прямой эфир',artwork:[{src:location.origin+'/icon-512.png?v=0.4.1',sizes:'512x512',type:'image/png'}]});navigator.mediaSession.setActionHandler('play',()=>void resume());navigator.mediaSession.setActionHandler('pause',pause);}
   pc.ontrack=e=>{
    if(gen!==generation.current)return;const remote=e.streams[0]??new MediaStream([e.track]);el.srcObject=remote;
    const analyser=ctx.createAnalyser();analyser.fftSize=1024;ctx.createMediaStreamSource(remote).connect(analyser);const values=new Float32Array(1024);
    meterTimer.current=setInterval(()=>{if(gen!==generation.current)return;analyser.getFloatTimeDomainData(values);let peak=0;for(const x of values)peak=Math.max(peak,Math.abs(x));setLevel(Math.max(-60,20*Math.log10(peak||0.001)));setSamples(Array.from({length:64},(_,i)=>Math.abs(values[i*16])));},100);
    void el.play().catch(()=>{if(gen===generation.current){playbackBlocked=true;setConnecting(false);setPhase('blocked');setStatus('Звук готов. Нажми «Включить звук».');}});
   };
   pc.onconnectionstatechange=()=>{
    if(gen!==generation.current)return;
    if(pc.connectionState==='connected'){
     disconnectedAt=0;setConnecting(false);
     if(playbackBlocked){setPhase('blocked');setStatus('Звук готов. Нажми «Включить звук».');}
     else if(userPaused){setPhase('paused');setStatus('Прослушивание на паузе');}
     else if(!el.paused&&el.readyState>=2){setListening(true);setPhase('playing');setStatus('Вы слушаете прямой эфир');}
     else{setPhase('waiting');setStatus('Соединение установлено. Ожидаем звук…');}
    }
    if(pc.connectionState==='disconnected'){disconnectedAt=Date.now();setListening(false);setPhase('reconnecting');setStatus('Связь прервалась. Переподключаемся…');}
    if(pc.connectionState==='failed')endViewer('error','Соединение не установилось. Попробуй другую сеть и подключись снова.');
   };
   await pc.setLocalDescription(stereoDescription(await pc.createOffer()));await gather(pc);if(gen!==generation.current)return;
   const p=await api<{id:string;token:string}>('live',{action:'join',id,offer:JSON.stringify(pc.localDescription)});if(gen!==generation.current){void api('live',{action:'leave',peer:p.id,token:p.token});return;}peer.current=p;let polling=false,errors=0;disconnectedAt=Date.now();
   const poll=async()=>{if(polling||gen!==generation.current)return;polling=true;try{
    await api('live',{action:'pulse',peer:p.id,token:p.token});const d=await api<{active:boolean;answer:string|null}>('live?peer='+p.id,undefined,{headers:{'x-peer-token':p.token}});if(gen!==generation.current)return;errors=0;
    if(!d.active){endViewer('ended','Автор завершил эфир');return;}if(d.answer&&!pc.currentRemoteDescription)await pc.setRemoteDescription(JSON.parse(d.answer));
    if(disconnectedAt>0&&Date.now()-disconnectedAt>40000&&pc.connectionState!=='connected')endViewer('error','Не удалось получить звук. Попробуй подключиться ещё раз.');
   }catch(e){if(gen!==generation.current)return;errors++;if(errors>=4)endViewer('error',errorText(e));}finally{polling=false;}};
   listenTimer.current=setInterval(()=>void poll(),3000);void poll();
  }catch(e){if(gen===generation.current)endViewer('error',errorText(e));}
 }
 useEffect(()=>{if(audio.current)audio.current.volume=volume/100;},[volume]);
 useEffect(()=>{const before=(e:BeforeUnloadEvent)=>{if(host.current){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',before);return()=>{generation.current++;window.removeEventListener('beforeunload',before);for(const t of [hostTimer,listenTimer,elapsedTimer,meterTimer])if(t.current)clearInterval(t.current);pcs.current.forEach(p=>p.close());viewer.current?.close();audio.current?.pause();void context.current?.close().catch(()=>{});};},[]);
 return{hosting,connecting,listeners,status,listening,joined,activeId:joinedId.current,phase,hostStatus,hostSeconds,volume,setVolume,level,samples,start,stop,listen,leave,resume,pause,unmute:resume};
}
