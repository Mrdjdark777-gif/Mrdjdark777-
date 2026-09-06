'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {toast} from 'sonner';
import {draftFile,errorText} from '@/lib/client';
import {prepareAudioFile} from '@/lib/prepare-audio';
import {discoverMicrophones} from '@/lib/device-discovery';
export function useCapture(){
 const [devices,setDevices]=useState<MediaDeviceInfo[]>([]),[device,setDevice]=useState('default'),[channel,setChannel]=useState('0'),[discovering,setDiscovering]=useState(false);
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[recording,setRecording]=useState(false),[paused,setPaused]=useState(false),[seconds,setSeconds]=useState(0),[level,setLevel]=useState(-60),[samples,setSamples]=useState<number[]>(Array(80).fill(0)),[blob,setBlob]=useState<Blob|null>(null),[url,setUrl]=useState('');
 const [gainDb,setGainDb]=useState(0),[muted,setMuted]=useState(false),[lowCut,setLowCut]=useState(false);
 const raw=useRef<MediaStream|null>(null),stream=useRef<MediaStream|null>(null),ctx=useRef<AudioContext|null>(null),rec=useRef<MediaRecorder|null>(null),meter=useRef<ReturnType<typeof setInterval>|null>(null),time=useRef<ReturnType<typeof setInterval>|null>(null),gain=useRef<GainNode|null>(null),filter=useRef<BiquadFilterNode|null>(null),connecting=useRef(false);
 const prepareGeneration=useRef(0),prepareAbort=useRef<AbortController|null>(null);
 const controls=useRef({gainDb,muted,lowCut});controls.current={gainDb,muted,lowCut};
 const refreshDevices=useCallback(async(requestPermission=false)=>{
  if(!navigator.mediaDevices?.enumerateDevices){if(requestPermission)toast.error('Аудиоустройства недоступны в этом браузере.');return;}
  setDiscovering(true);try{const list=await discoverMicrophones(navigator.mediaDevices,requestPermission);setDevices(list);if(requestPermission&&!list.length)toast.error('Микрофон не найден. Проверь подключение аудиоинтерфейса.');}catch(e){toast.error(e instanceof DOMException&&e.name==='NotAllowedError'?'Разреши доступ к микрофону в окне приложения.':errorText(e));}finally{setDiscovering(false);}
 },[]);
 function release(){raw.current?.getTracks().forEach(t=>{t.onended=null;t.stop();});stream.current?.getTracks().forEach(t=>t.stop());ctx.current?.close().catch(()=>{});raw.current=null;stream.current=null;ctx.current=null;gain.current=null;filter.current=null;if(meter.current)clearInterval(meter.current);setReady(false);setLevel(-60);setSamples(Array(80).fill(0));}
 async function connect(){
  if(connecting.current||recording)return null;connecting.current=true;release();setBusy(true);
  try{
   if(!navigator.mediaDevices?.getUserMedia)throw new Error('Открой приложение в Edge или Chrome и разреши микрофон.');
   const input=await navigator.mediaDevices.getUserMedia({audio:{deviceId:device==='default'?undefined:{exact:device},echoCancellation:false,noiseSuppression:false,autoGainControl:false,channelCount:{ideal:2}},video:false});raw.current=input;
   setDevices(await discoverMicrophones(navigator.mediaDevices));
   const context=new AudioContext();ctx.current=context;await context.resume();const source=context.createMediaStreamSource(input),split=context.createChannelSplitter(2),mono=context.createGain(),hp=context.createBiquadFilter(),dest=context.createMediaStreamDestination(),analyser=context.createAnalyser();
   gain.current=mono;filter.current=hp;mono.channelCount=1;mono.channelCountMode='explicit';mono.gain.value=controls.current.muted?0:Math.pow(10,controls.current.gainDb/20);hp.type=controls.current.lowCut?'highpass':'allpass';hp.frequency.value=80;hp.Q.value=0.707;
   source.connect(split);split.connect(hp,Number(channel));hp.connect(mono);mono.connect(dest);mono.connect(analyser);analyser.fftSize=2048;stream.current=dest.stream;
   const values=new Float32Array(analyser.fftSize);meter.current=setInterval(()=>{analyser.getFloatTimeDomainData(values);let peak=0;for(const x of values)peak=Math.max(peak,Math.abs(x));setLevel(Math.max(-60,20*Math.log10(peak||0.001)));setSamples(Array.from({length:80},(_,i)=>Math.abs(values[i*24]||0)));},80);
   input.getTracks()[0].onended=()=>{if(rec.current?.state==='recording'||rec.current?.state==='paused')rec.current.stop();release();toast.error('Аудиоинтерфейс отключён');};setReady(true);return dest.stream;
  }catch(e){release();toast.error(e instanceof DOMException&&e.name==='NotAllowedError'?'Разреши приложению доступ к микрофону.':e instanceof DOMException&&e.name==='OverconstrainedError'?'Выбранный вход недоступен. Обнови список устройств.':errorText(e));return null;}finally{setBusy(false);connecting.current=false;}
 }
 useEffect(()=>{if(gain.current&&ctx.current)gain.current.gain.setTargetAtTime(muted?0:Math.pow(10,gainDb/20),ctx.current.currentTime,0.02);},[gainDb,muted]);
 useEffect(()=>{if(filter.current)filter.current.type=lowCut?'highpass':'allpass';},[lowCut]);
 async function accept(b:Blob){
  const generation=++prepareGeneration.current;prepareAbort.current?.abort();const abort=new AbortController();prepareAbort.current=abort;
  setBusy(true);setBlob(b);
  // Persist the original immediately: closing during preparation must not lose a recording.
  try{await draftFile(b);}catch{toast.warning('Черновик не сохранился на устройстве. Скачай запись перед закрытием.');}
  if(generation!==prepareGeneration.current)return;
  try{
   const result=await prepareAudioFile(b,abort.signal);if(generation!==prepareGeneration.current)return;
   setBlob(result.blob);setSeconds(result.duration);if(result.blob!==b)await draftFile(result.blob);
  }catch(e){if(!abort.signal.aborted){toast.warning('Исходная запись сохранена, но подготовка не завершена. '+errorText(e));if(b instanceof File)setSeconds(0);}}
  finally{if(generation===prepareGeneration.current)setBusy(false);}
 }

 async function start(){try{
  if(typeof MediaRecorder==='undefined')throw new Error('Запись не поддерживается. Используй Edge или Chrome.');
  const s=stream.current??await connect();if(!s)return;
  const mime=['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(t=>MediaRecorder.isTypeSupported(t));if(!mime)throw new Error('Браузер не поддерживает запись аудио');
  const chunks:BlobPart[]=[];let size=0;const recorder=new MediaRecorder(s,{mimeType:mime,audioBitsPerSecond:128000});rec.current=recorder;
  recorder.ondataavailable=e=>{if(e.data.size){chunks.push(e.data);size+=e.data.size;if(size>75*1024*1024&&recorder.state!=='inactive'){recorder.stop();toast.warning('Запись остановлена на 75 МБ. Сохрани выпуск.');}}};
  recorder.onstop=()=>{if(time.current)clearInterval(time.current);setRecording(false);setPaused(false);void accept(new Blob(chunks,{type:recorder.mimeType}));};recorder.onerror=()=>toast.error('Ошибка записи. Сохрани доступный фрагмент.');
  setSeconds(0);setPaused(false);setRecording(true);recorder.start(1000);time.current=setInterval(()=>{if(recorder.state==='recording')setSeconds(s=>s+1);},1000);
 }catch(e){toast.error(errorText(e));}}
 function stop(){if(rec.current&&rec.current.state!=='inactive')rec.current.stop();}
 function pause(){if(rec.current?.state==='recording'){rec.current.pause();setPaused(true);}else if(rec.current?.state==='paused'){rec.current.resume();setPaused(false);}}
 useEffect(()=>{void refreshDevices();const change=()=>void refreshDevices();navigator.mediaDevices?.addEventListener?.('devicechange',change);draftFile().then(b=>{if(b)void accept(b);}).catch(()=>{});return()=>{navigator.mediaDevices?.removeEventListener?.('devicechange',change);if(rec.current&&rec.current.state!=='inactive')rec.current.stop();raw.current?.getTracks().forEach(t=>{t.onended=null;t.stop();});ctx.current?.close();if(meter.current)clearInterval(meter.current);if(time.current)clearInterval(time.current);};},[refreshDevices]);
 useEffect(()=>{if(!blob){setUrl('');return;}const u=URL.createObjectURL(blob);setUrl(u);return()=>URL.revokeObjectURL(u);},[blob]);
 useEffect(()=>{const guard=(e:BeforeUnloadEvent)=>{if(recording){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);},[recording]);
 return{devices,device,setDevice,channel,setChannel,discovering,refreshDevices,ready,busy,recording,paused,seconds,level,samples,blob,url,accept,start,stop,pause,connect,release,stream,gainDb,setGainDb,muted,setMuted,lowCut,setLowCut};
}
