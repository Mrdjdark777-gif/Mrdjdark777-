'use client';
import {Play,Pause,Loader2,Heart,ChevronRight,AudioLines} from 'lucide-react';
import {liveStage,onAirLabelVisible,ringsPulsing,stageAction,type ListenPhase} from '@/lib/live-stage';
import {haptic} from '@/lib/client';
import {useT} from '@/components/i18n-provider';
import {Artwork} from './artwork';

/**
 * S05 — экран эфира для слушателя. Круг с обложкой и тонкие кольца вокруг —
 * декоративный мотив, а не спектр: он ничего не измеряет и пульсирует только
 * при настоящем воспроизведении. Что именно экран говорит в каждом состоянии,
 * решает lib/live-stage, а не разметка.
 *
 * Донат виден во всех состояниях эфира, включая offline и ended.
 */
/** Сколько колец рисуем вокруг знака эфира. */
const RINGS=8;

export function LiveStageView({title,note,cover,phase,onAir,joined,elapsed,status,hint,onListen,onPause,onArchive,support,levels=[]}:{
 title:string;note:string;cover?:string;phase:ListenPhase;onAir:boolean;joined:boolean;levels?:number[];
 elapsed:string;status:string;hint?:string;onListen:()=>void;onPause:()=>void;onArchive:()=>void;support:React.ReactNode;
}){
 const {t}=useT();
 const stage=liveStage({onAir,joined,phase});
 const action=stageAction(stage);
 const pulsing=ringsPulsing(stage,false);
 // Когда эфира нет, круг работает дыхательным ориентиром: 4 секунды вдох,
 // 4 задержка, 4 выдох, 4 задержка — квадратное дыхание. Метод известен
 // как средство снять острую тревогу за полторы-две минуты; лечением
 // тревожного расстройства он не является, и обещать этого нельзя.
 // Только когда эфира нет вовсе. При идущем эфире, даже неподключённом,
 // вести дыхание неуместно: на экране написано «Мы в эфире».
 const calm=stage==='offline'||stage==='ended';
 // Заголовок внутри круга — ровно то, что происходит сейчас.
 const heading=stage==='offline'?t('live.noBroadcast')
  :stage==='ended'?t('live.endedTitle')
  :stage==='reconnecting'?t('live.reconnecting')
  :stage==='connecting'?t('live.connecting')
  :t('live.weAreOnAir');

 return <section className="live-stage">
  <div className={'live-rings'+(pulsing?' is-pulsing':'')+(calm?' is-calm':'')}>
   {/* Кольца-«дорожки». Внешние идут за низкими частотами, внутренние — за
       высокими: бас качает большие круги, голос и верх шевелят ближние к
       центру. Без звука все значения нулевые, и остаётся ровное дыхание. */}
   {Array.from({length:RINGS},(_,i)=>{
    const from=Math.floor(i/RINGS*levels.length),to=Math.max(from+1,Math.floor((i+1)/RINGS*levels.length));
    const band=levels.slice(from,to);
    const energy=band.length?band.reduce((a,b)=>a+b,0)/band.length:0;
    return <span key={i} className="live-ring" aria-hidden="true"
     style={{'--ring':String(i),'--ring-energy':energy.toFixed(3)} as React.CSSProperties}/>;
   })}
   <div className="live-orb">
    <Artwork src={cover}/>
    <span className="live-orb-shade" aria-hidden="true"/>
    <span className="live-orb-copy" role="status">
     {onAirLabelVisible(stage)&&<span className="live-orb-dot" aria-hidden="true"/>}
     <strong>{heading}</strong>
    </span>
   </div>
  </div>

  {calm&&<p className="breath-guide" aria-hidden="true">
   <span>{t('breath.in')}</span><span>{t('breath.hold')}</span><span>{t('breath.out')}</span><span>{t('breath.hold')}</span>
  </p>}
  {calm&&<p className="breath-note">{t('breath.note')}</p>}

  <h2 className="live-stage-name">{title}</h2>
  <p className="live-stage-sub">{status||note}</p>
  {elapsed&&stage==='playing'&&<p className="live-stage-clock"><strong>{elapsed}</strong><span>{t('live.onAirFor')}</span></p>}

  {action!=='none'&&<button type="button" className="live-cta tt-pressable" disabled={action==='busy'}
   onClick={()=>{haptic();if(action==='pause')onPause();else onListen();}}>
   {action==='busy'?<Loader2 className="spin" size={20}/>:action==='pause'?<Pause size={20} fill="currentColor"/>:<Play size={20} fill="currentColor"/>}
   {action==='busy'?t('live.connecting'):action==='pause'?t('live.stopListening'):t('live.listen')}
  </button>}

  <button type="button" className="live-archive-card tt-pressable" onClick={()=>{haptic();onArchive();}}>
   <span className="live-archive-icon"><AudioLines size={22}/></span>
   <span className="live-archive-copy"><strong>{t('live.archiveTitle')}</strong><span>{t('live.archiveNote')}</span></span>
   <ChevronRight size={18}/>
  </button>

  {hint&&<p className="live-stage-hint">{hint}</p>}
  {support??<span className="live-stage-support-missing"><Heart size={17}/>{t('donate.unavailable')}</span>}
 </section>;
}
