'use client';
import {useEffect,useState} from 'react';
import {api,errorText} from '@/lib/client';
import {useT} from '@/components/i18n-provider';
import {toast} from 'sonner';
type Row={id:string;title:string;state:string;postId:string|null};
export function LiveArchives(){
 const {t}=useT(),[rows,setRows]=useState<Row[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState('');
 useEffect(()=>{let alive=true;const poll=()=>api<{recordings:Row[]}>('live-stream?list=1').then(d=>{if(alive){setRows(d.recordings);setError('');}}).catch(e=>{if(alive)setError(errorText(e));});void poll();const timer=setInterval(()=>void poll(),5000);return()=>{alive=false;clearInterval(timer);};},[]);
 async function retry(id:string){setBusy(id);try{await api('live-stream?id='+id+'&retry=1',{});toast.success(t('liveArchive.processingState'));}catch(e){toast.error(errorText(e));}finally{setBusy('');}}
 const labels:Record<string,string>={receiving:t('liveArchive.receivingState'),closing:t('liveArchive.closing'),processing:t('liveArchive.processingState'),ready:t('liveArchive.ready'),failed:t('liveArchive.failed')};
 return <details className="live-archives"><summary>{t('liveArchive.title')}</summary>{error&&<p role="alert">{error}</p>}{!rows.length&&<p>{t('liveArchive.empty')}</p>}{rows.map(row=><article key={row.id}><strong>{row.title}</strong><span role="status">{labels[row.state]||row.state}</span>{row.state==='ready'&&row.postId&&<a href={'/api/audio?id='+row.postId} download={'True-Thrills-'+row.id+'.m4a'}>{t('liveArchive.download')}</a>}{row.state==='failed'&&<button disabled={busy===row.id} onClick={()=>void retry(row.id)}>{t('liveArchive.retryAction')}</button>}</article>)}</details>;
}
