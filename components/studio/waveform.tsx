'use client';
import {useEffect,useState} from 'react';
import {decodePeaks,barHeight,PEAK_COUNT} from '@/lib/waveform';
import {useT} from '@/components/i18n-provider';

/**
 * Форма звука на S04. Пики приходят готовыми с сервера: тяжёлый decode не
 * делается ни в запросе, ни на телефоне. Пока их нет — спокойная ровная линия
 * и подпись, а не случайные палочки, которые выглядели бы как настоящие.
 *
 * Полоса перемотки остаётся основным управлением и работает независимо от
 * того, посчитаны пики или нет.
 *
 * Состояние сбрасывает сам React: компонент смонтирован с key выпуска, поэтому
 * чужие пики не задерживаются на экране при смене источника.
 */
export function Waveform({postId,progress}:{postId:string;progress:number}){
 const {t}=useT();
 const [peaks,setPeaks]=useState<number[]|null>(null),[failed,setFailed]=useState(false);
 useEffect(()=>{
  let alive=true;
  if(!postId)return;
  const controller=new AbortController();
  let timer:ReturnType<typeof setTimeout>|undefined,delay=2000;
  const load=async()=>{
   try{
    const response=await fetch('/api/peaks?id='+encodeURIComponent(postId),{cache:'no-store',signal:controller.signal});
    if(response.status===404||response.status===403){if(alive)setFailed(true);return true;}
    if(!response.ok)throw new Error('peaks');
    const data=await response.json() as {state:string;peaks:string};
    if(!alive)return true;
    if(data.state==='ready'&&data.peaks){setFailed(false);setPeaks(decodePeaks(data.peaks));return true;}
    if(data.state==='error'){setFailed(true);return true;}
    return false;
   }catch{if(alive)setFailed(true);return !alive;}
  };
  // Анализ может ждать окончания длинного эфира. Продолжаем редкий опрос,
  // пока этот выпуск открыт; временная ошибка сети не отключает волну навсегда.
  const poll=async()=>{const done=await load();if(!done&&alive){timer=setTimeout(()=>void poll(),delay);delay=Math.min(delay*2,30000);}};
  void poll();
  return()=>{alive=false;controller.abort();if(timer)clearTimeout(timer);};
 },[postId]);

 if(!peaks)return <div className={'waveform-strip is-flat'+(failed?' is-failed':'')} aria-hidden="true">
  <span className="waveform-line"/>
  {!failed&&<span className="waveform-note">{t('player.waveformPending')}</span>}
 </div>;

 const played=Math.max(0,Math.min(1,progress));
 return <div className="waveform-strip" aria-hidden="true">
  {peaks.map((level,index)=><span key={index} className={index/(peaks.length||PEAK_COUNT)<played?'is-played':undefined} style={{height:barHeight(level)+'%'}}/>)}
 </div>;
}
