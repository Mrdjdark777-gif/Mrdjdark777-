'use client';
import {useEffect,useState} from 'react';
import {Smartphone} from 'lucide-react';
import {useT} from '@/components/i18n-provider';
import {nativeCall,onNative} from '@/lib/native-client';

/**
 * Проверка наклона — строка в настройках приложения.
 *
 * Наклон карточек у владельца не работал, и дважды я чинил его вслепую: на
 * телефоне видно только «движения нет», а оборваться цепочка может в трёх
 * местах — оболочка не знает команду датчика (старый APK), датчик принял
 * команду и молчит, значения идут, но карточка от них не двигается. Здесь
 * видно, на каком звене: ответила ли оболочка, сколько значений приходит в
 * секунду и какие. Одного взгляда на экран хватает, чтобы перестать гадать.
 *
 * Датчик читается, только пока открыты настройки, и останавливается при уходе.
 */
type State={phase:'asking'|'ok'|'failed';error?:string};

export function TiltCheck(){
 const {t}=useT();
 const [state,setState]=useState<State>({phase:'asking'});
 const [live,setLive]=useState<{rate:number;beta:number;gamma:number}|null>(null);
 useEffect(()=>{
  const times:number[]=[];let last={beta:0,gamma:0};let alive=true;
  const off=onNative(message=>{
   if(message.event!=='motion')return;
   times.push(performance.now());
   last={beta:Number(message.beta)||0,gamma:Number(message.gamma)||0};
  });
  nativeCall('motion.start')
   .then(()=>{if(alive)setState({phase:'ok'});})
   .catch((error:unknown)=>{if(alive)setState({phase:'failed',error:error instanceof Error?error.message:String(error)});});
  const timer=setInterval(()=>{
   const now=performance.now();
   while(times.length&&now-times[0]>1000)times.shift();
   setLive({rate:times.length,beta:Math.round(last.beta),gamma:Math.round(last.gamma)});
  },500);
  return()=>{alive=false;off();clearInterval(timer);void nativeCall('motion.stop').catch(()=>{});};
 },[]);

 const line=state.phase==='asking'?t('settings.tiltAsking')
  :state.phase==='failed'?t('settings.tiltOld',{error:state.error||'—'})
  :live&&live.rate>0?t('settings.tiltLive',{rate:String(live.rate),beta:String(live.beta),gamma:String(live.gamma)})
  :t('settings.tiltSilent');
 return <section className="settings-panel tilt-check"><div className="section-icon"><Smartphone size={22}/></div>
  <h2>{t('settings.tiltTitle')}</h2>
  <p className="tilt-check-line" data-phase={state.phase} data-rate={live?.rate??0}>{line}</p>
 </section>;
}
