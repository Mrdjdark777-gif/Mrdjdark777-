'use client';
import {useEffect,useRef,useState} from 'react';
import {Play,Pause,Download,Trash2,RotateCcw} from 'lucide-react';
import {api,errorText} from '@/lib/client';
import {useT} from '@/components/i18n-provider';
import {toast} from 'sonner';

/**
 * Записи эфиров в студии. Скачать было можно с самого начала, а прослушать и
 * удалить — нет: список копился, в том числе записями, чьи выпуски автор уже
 * удалил из библиотеки, и разобрать его было нечем.
 *
 * Удаление убирает саму запись и её рабочие файлы. Выпуск в подкастах — другая
 * сущность: он остаётся, и удалять его автор идёт в библиотеку. Прослушать
 * можно только то, у чего этот выпуск ещё есть, — играем именно его звук.
 */
type Row={id:string;title:string;state:string;postId:string|null};
export function LiveArchives(){
 const {t}=useT(),[rows,setRows]=useState<Row[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState('');
 const [playing,setPlaying]=useState(''),[asking,setAsking]=useState('');
 const audio=useRef<HTMLAudioElement|null>(null);
 useEffect(()=>{let alive=true;const poll=()=>api<{recordings:Row[]}>('live-stream?list=1').then(d=>{if(alive){setRows(d.recordings);setError('');}}).catch(e=>{if(alive)setError(errorText(e));});void poll();const timer=setInterval(()=>void poll(),5000);return()=>{alive=false;clearInterval(timer);};},[]);
 useEffect(()=>()=>{audio.current?.pause();audio.current=null;},[]);
 async function retry(id:string){setBusy(id);try{await api('live-stream?id='+id+'&retry=1',{});toast.success(t('liveArchive.processingState'));}catch(e){toast.error(errorText(e));}finally{setBusy('');}}
 async function remove(id:string){
  setBusy(id);setAsking('');
  try{
   await api('live-stream?id='+id+'&remove=1',{});
   if(playing===id){audio.current?.pause();audio.current=null;setPlaying('');}
   setRows(list=>list.filter(r=>r.id!==id));
   toast.success(t('liveArchive.removed'));
  }catch(e){toast.error(errorText(e));}finally{setBusy('');}
 }
 function listen(row:Row){
  if(playing===row.id){audio.current?.pause();audio.current=null;setPlaying('');return;}
  audio.current?.pause();
  const el=new Audio('/api/audio?id='+row.postId);
  el.onended=()=>setPlaying('');
  el.onerror=()=>{toast.error(t('liveArchive.failed'));setPlaying('');};
  audio.current=el;setPlaying(row.id);
  void el.play().catch(()=>{setPlaying('');toast.error(t('player.tapInPlayer'));});
 }
 const labels:Record<string,string>={receiving:t('liveArchive.receivingState'),closing:t('liveArchive.closing'),processing:t('liveArchive.processingState'),ready:t('liveArchive.ready'),failed:t('liveArchive.failed')};
 return <details className="live-archives"><summary>{t('liveArchive.title')}</summary>
  {error&&<p role="alert">{error}</p>}
  {!rows.length&&<p>{t('liveArchive.empty')}</p>}
  {rows.map(row=><article key={row.id}>
   <strong>{row.title}</strong>
   <span role="status">{labels[row.state]||row.state}</span>
   {asking===row.id
    ?<span className="archive-ask">{t('liveArchive.removeAsk')}
      <button type="button" className="archive-danger" disabled={busy===row.id} onClick={()=>void remove(row.id)}>{t('liveArchive.removeYes')}</button>
      <button type="button" onClick={()=>setAsking('')}>{t('liveArchive.removeNo')}</button>
     </span>
    :<span className="archive-actions">
      {row.state==='ready'&&row.postId&&<button type="button" onClick={()=>listen(row)} aria-label={playing===row.id?t('liveArchive.stop'):t('liveArchive.play')} title={playing===row.id?t('liveArchive.stop'):t('liveArchive.play')}>
       {playing===row.id?<Pause size={15}/>:<Play size={15}/>}{playing===row.id?t('liveArchive.stop'):t('liveArchive.play')}</button>}
      {row.state==='ready'&&row.postId&&<a href={'/api/audio?id='+row.postId} download={'True-Thrills-'+row.id+'.m4a'}><Download size={15}/>{t('liveArchive.download')}</a>}
      {row.state==='failed'&&<button type="button" disabled={busy===row.id} onClick={()=>void retry(row.id)}><RotateCcw size={15}/>{t('liveArchive.retryAction')}</button>}
      <button type="button" className="archive-danger" disabled={busy===row.id||row.state==='receiving'} onClick={()=>setAsking(row.id)}
       aria-label={t('liveArchive.remove')} title={t('liveArchive.remove')}><Trash2 size={15}/>{t('liveArchive.remove')}</button>
     </span>}
  </article>)}
 </details>;
}
