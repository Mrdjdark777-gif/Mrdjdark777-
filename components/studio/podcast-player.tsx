'use client';
import {useEffect,useRef,useState,type RefObject} from 'react';
import {errorText} from '@/lib/client';
import {prepareAudioFile} from '@/lib/prepare-audio';
import {hasNativeClient} from '@/lib/native-client';
import {NativePodcastPlayer} from './native-podcast-player';
import {PlayerChrome} from './player-chrome';
import {presentation} from '@/lib/player-presentation';
import {readProgress,saveProgress} from '@/lib/listening-progress';
import {useT} from '@/components/i18n-provider';

type Props={src:string;title:string;duration?:number;cover?:string;note?:string;archived?:boolean;supportUrl?:string;onShare?:()=>void;resume?:boolean;next?:{id:string;title:string;cover?:string;duration:number}|null;onNext?:(id:string)=>void;audioRef:RefObject<HTMLAudioElement|null>;autoplay?:boolean;expanded?:boolean;onExpand?:(next:boolean)=>void;onClose:()=>void};

function WebPodcastPlayer({src,title,duration:initialDuration=0,cover,note,archived,supportUrl,onShare,resume=false,next,onNext,audioRef,autoplay=true,expanded=true,onExpand=()=>{},onClose}:Props){
 const postId=new URL(src,'https://truethrills.com').searchParams.get('id')??'';
 const restored=useRef(false),lastSaved=useRef(0);
 const [rate,setRate]=useState(1),[sleep,setSleep]=useState(0),[isRepairing,setIsRepairing]=useState(false);
 useEffect(()=>{if(!sleep)return;const timer=setTimeout(()=>{local.current?.pause();setSleep(0);},sleep*60000);return()=>clearTimeout(timer);},[sleep]);
 const {t}=useT();
 const [duration,setDuration]=useState(initialDuration),[position,setPosition]=useState(0),[playing,setPlaying]=useState(false),[loading,setLoading]=useState(true),[seekable,setSeekable]=useState(false),[message,setMessage]=useState('');
 const local=useRef<HTMLAudioElement|null>(null),repairing=useRef(false),attempted=useRef(false),controller=useRef<AbortController|null>(null),objectUrl=useRef(''),wanted=useRef(autoplay),scrubbing=useRef(false),alive=useRef(true);
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
 // eslint-disable-next-line react-hooks/exhaustive-deps -- Перезагружает элемент только при смене источника; остальное — стабильные ссылки и стартовые значения.
 useEffect(()=>{alive.current=true;const el=local.current;if(el){el.src=src;el.load();if(autoplay)void play();}return()=>{alive.current=false;controller.current?.abort();if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);if(el&&restored.current)saveProgress(postId,el.currentTime,Number.isFinite(el.duration)?el.duration:initialDuration);el?.pause();if('mediaSession'in navigator){for(const action of ['play','pause','seekbackward','seekforward','seekto'] as const)navigator.mediaSession.setActionHandler(action,null);navigator.mediaSession.metadata=null;navigator.mediaSession.playbackState='none';}if(audioRef.current===el)audioRef.current=null;};},[src]);
 function metadata(){const el=local.current;if(!el||el.readyState===0)return;if(Number.isFinite(el.duration)&&el.duration>0){if(!restored.current){restored.current=true;
  // С места продолжаем, только когда человек сам попросил — со строки
  // «Продолжить». Из каталога выпуск всегда начинается сначала.
  if(resume){const progress=readProgress().find(p=>p.id===postId);if(progress&&progress.position<el.duration-2)el.currentTime=progress.position;}}setDuration(el.duration);setSeekable(true);setLoading(false);mediaPosition();}else if(!attempted.current)void repair();}
 // <audio> живёт вне корпуса и не пересоздаётся при сворачивании плеера:
 // иначе звук прерывался бы на каждом нажатии стрелки.
 const audio=<audio ref={el=>{local.current=el;audioRef.current=el;}} preload="metadata" onLoadedMetadata={metadata} onDurationChange={metadata}
   onPlaying={()=>{setPlaying(true);setLoading(false);session();if('mediaSession'in navigator)navigator.mediaSession.playbackState='playing';}}
   onPause={()=>{setPlaying(false);if('mediaSession'in navigator)navigator.mediaSession.playbackState='paused';}}
   onTimeUpdate={()=>{const el=local.current;if(el&&!scrubbing.current&&Number.isFinite(el.currentTime))setPosition(el.currentTime);if(el&&restored.current&&Date.now()-lastSaved.current>5000){lastSaved.current=Date.now();saveProgress(postId,el.currentTime,Number.isFinite(el.duration)?el.duration:initialDuration);}mediaPosition();}}
   onWaiting={()=>setLoading(true)} onCanPlay={()=>{if(!repairing.current)setLoading(false);}}
   onEnded={()=>{wanted.current=false;setPlaying(false);setPosition(local.current?.duration||0);}}
   onError={()=>{setLoading(false);setMessage(t('player.unavailable'));}}/>;
 return <PlayerChrome expanded={expanded} onExpand={onExpand}
  view={{title,cover,note,supportUrl,postId,next,presentation:presentation({archived,cover}),kindLabel:archived?t('post.liveArchive'):t('post.podcast'),
   position,duration,playing,loading:loading||isRepairing,seekable:seekable&&!isRepairing,rate,sleep,sleepValue:sleep,message,
   sleepOptions:[{value:0,label:t('player.sleepOff')},...[15,30,60].map(value=>({value,label:value+' '+t('player.minutes')}))]}}
  act={{toggle:()=>{if(playing){wanted.current=false;local.current?.pause();}else{wanted.current=true;void play();}},
   seekBy:s=>seek((local.current?.currentTime??0)+s),seekTo:s=>{scrubbing.current=false;seek(s);},scrub:s=>{scrubbing.current=true;setPosition(s);},
   setRate:value=>{setRate(value);if(local.current)local.current.playbackRate=value;mediaPosition();},setSleep:value=>setSleep(Number(value)),close:onClose,openNext:onNext,share:onShare}}>
  {audio}
 </PlayerChrome>;
}

/**
 * autoplay=false — восстановление: приложение открыли заново, а выпуск стоял
 * на паузе. Показать плеер в этом состоянии нужно, а начать играть — нет.
 */
export function PodcastPlayer(props:Props){return hasNativeClient()?<NativePodcastPlayer {...props}/>:<WebPodcastPlayer {...props}/>;}
