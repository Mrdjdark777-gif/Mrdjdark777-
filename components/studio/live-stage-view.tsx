'use client';
import {Play,Pause,Loader2,Heart,ChevronRight,AudioLines} from 'lucide-react';
import {liveStage,onAirLabelVisible,ringsPulsing,stageAction,type ListenPhase} from '@/lib/live-stage';
import {haptic} from '@/lib/client';
import {useT} from '@/components/i18n-provider';

/**
 * S05 — экран эфира для слушателя. Круг с обложкой и тонкие кольца вокруг —
 * декоративный мотив, а не спектр: он ничего не измеряет и пульсирует только
 * при настоящем воспроизведении. Что именно экран говорит в каждом состоянии,
 * решает lib/live-stage, а не разметка.
 *
 * Донат виден во всех состояниях эфира, включая offline и ended.
 */
export function LiveStageView({title,note,cover,phase,onAir,joined,elapsed,status,hint,onListen,onPause,onArchive,support}:{
 title:string;note:string;cover?:string;phase:ListenPhase;onAir:boolean;joined:boolean;
 elapsed:string;status:string;hint?:string;onListen:()=>void;onPause:()=>void;onArchive:()=>void;support:React.ReactNode;
}){
 const {t}=useT();
 const stage=liveStage({onAir,joined,phase});
 const action=stageAction(stage);
 const pulsing=ringsPulsing(stage,false);
 // Заголовок внутри круга — ровно то, что происходит сейчас.
 const heading=stage==='offline'?t('live.noBroadcast')
  :stage==='ended'?t('live.endedTitle')
  :stage==='reconnecting'?t('live.reconnecting')
  :stage==='connecting'?t('live.connecting')
  :t('live.weAreOnAir');

 return <section className="live-stage">
  <div className={'live-rings'+(pulsing?' is-pulsing':'')}>
   <span className="live-ring" aria-hidden="true"/><span className="live-ring" aria-hidden="true"/><span className="live-ring" aria-hidden="true"/>
   <div className="live-orb">
    {cover?<img src={cover} alt="" onError={e=>{e.currentTarget.parentElement?.classList.add('live-orb-plain');e.currentTarget.remove();}}/>:null}
    <span className="live-orb-shade" aria-hidden="true"/>
    <span className="live-orb-copy" role="status">
     {onAirLabelVisible(stage)&&<span className="live-orb-dot" aria-hidden="true"/>}
     <strong>{heading}</strong>
    </span>
   </div>
  </div>

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
