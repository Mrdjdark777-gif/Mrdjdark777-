'use client';
import {Play,Pause,Loader2,ChevronRight,AudioLines} from 'lucide-react';
import {HeartBeam} from '@/components/ui/heart-beam';
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

export function LiveStageView({title,note,cover,phase,onAir,joined,elapsed,status,hint,onListen,onPause,onArchive,support,levels=[],calmSrc='',archiveOpen=false,archive,volume,shareAction,about='',desk=false,comments}:{
 title:string;note:string;cover?:string;phase:ListenPhase;onAir:boolean;joined:boolean;levels?:number[];calmSrc?:string;
 elapsed:string;status:string;hint?:string;onListen:()=>void;onPause:()=>void;onArchive:()=>void;support:React.ReactNode;
 archiveOpen?:boolean;archive?:React.ReactNode;volume?:React.ReactNode;shareAction?:React.ReactNode;about?:string;
 /** Сайт на ПК: карточка эфира во всю ширину, архив эфиров ниже (см. ниже). */
 desk?:boolean;
 /** Комментарии к эфиру — на ПК в правой части карточки эфира. */
 comments?:React.ReactNode;
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
 // вести дыхание неуместно: в круге горит ON AIR.
 const calm=stage==='offline'||stage==='ended';
 // Круг — студийная лампа: ON AIR, когда станция в эфире, OFF AIR, когда нет.
 // Так это подписано на любой радиостанции, поэтому слово не переводится, а
 // лежит в словаре: захочется вернуть русский — меняется в одном месте.
 // Состояние подключения лампу не касается: оно и так сказано строкой под
 // кругом и самой кнопкой.
 const onAirLamp=onAirLabelVisible(stage);
 const heading=onAirLamp?t('live.weAreOnAir'):t('live.noBroadcast');
 // Крупное имя под кругом — имя эфира. Своего имени у «эфира нет» не бывает,
 // и подставлять туда название канала незачем: оно уже стоит в шапке.
 const name=stage==='ended'?t('live.endedTitle'):stage==='offline'?'':title;

 // Сайт на ПК. 14 октября ночью владелец: «страница лайва имеет такую же
 // раскладку, как на телефоне, куча места везде без полезного»; утром того же
 // дня: «самая бедная… сделать архив эфиров как список во вкладке музыка,
 // чтоб были видны обложки, описание… снизу отдельной колонкой… в одной
 // стилистике с другими страницами». Поэтому:
 // - сверху одна карточка эфира во всю ширину: круг-лампа, состояние словами
 //   с кнопкой «Слушать», громкостью и «Поделиться»; во время эфира справа
 //   колонка — комментарии и поддержка; без эфира под заголовком рядом с
 //   кругом подсказка дыхания и поддержка в ряд;
 // - ниже архив эфиров — раздел, как «Аудио»: заголовок, поиск, порядок и
 //   плитки с обложкой, описанием, датой и длительностью (archive собирает
 //   app/studio.tsx из DeskSection).
 // Состояния (эфира нет, подключение, играет, пауза, ошибка) — те же, что на
 // телефоне: их решает lib/live-stage, а не разметка.
 const supportNode=support??<span className="live-stage-support-missing"><HeartBeam size={17}/>{t('donate.unavailable')}</span>;
 if(desk)return <div className={'live-desk'+(calm?' is-calm':' is-live')}>
  <section className="live-desk-stage" aria-label={t('nav.live')}>
   <div className={'live-rings'+(pulsing?' is-pulsing':'')+(calm?' is-calm':'')}>
    {Array.from({length:RINGS},(_,i)=>{
     const from=Math.floor(i/RINGS*levels.length),to=Math.max(from+1,Math.floor((i+1)/RINGS*levels.length));
     const band=levels.slice(from,to);
     const energy=band.length?band.reduce((a,b)=>a+b,0)/band.length:0;
     return <span key={i} className="live-ring" aria-hidden="true"
      style={{'--ring':String(i),'--ring-energy':energy.toFixed(3)} as React.CSSProperties}/>;
    })}
    <div className="live-orb">
     <Artwork src={calm&&calmSrc?calmSrc:cover}/>
     <span className="live-orb-shade" aria-hidden="true"/>
     <span className={'live-orb-copy'+(onAirLamp?' is-live':'')} role="status">
      {onAirLamp&&<span className="live-orb-dot" aria-hidden="true"/>}
      <strong>{heading}</strong>
     </span>
    </div>
   </div>
   <div className="live-desk-copy">
    <h2 className="live-stage-name">{name||t('live.deskIdleTitle')}</h2>
    <p className="live-stage-sub">{status||note}</p>
    {about&&stage!=='offline'&&<p className="live-stage-about">{about}</p>}
    {elapsed&&stage==='playing'&&<p className="live-stage-clock"><strong>{elapsed}</strong><span>{t('live.onAirFor')}</span></p>}
    {(action!=='none'||!calm)&&<div className="live-desk-actions">
     {action!=='none'&&<button type="button" className="live-cta tt-pressable" disabled={action==='busy'}
      onClick={()=>{haptic();if(action==='pause')onPause();else onListen();}}>
      {action==='busy'?<Loader2 className="spin" size={20}/>:action==='pause'?<Pause size={20} fill="currentColor"/>:<Play size={20} fill="currentColor"/>}
      {action==='busy'?t('live.connecting'):action==='pause'?t('live.stopListening'):t('live.listen')}
     </button>}
     {!calm&&shareAction}
    </div>}
    {volume}
    {hint&&<p className="live-stage-hint">{hint}</p>}
    {/* Без эфира подсказка дыхания стоит рядом с кругом, под заголовком:
        круг дышит, и связь видна сразу (14 октября владелец: в правой
        колонке «уже непонятно, причём здесь»). Поддержка — с ней в ряд. */}
    {calm&&<div className="live-desk-calm">
     <div className="live-desk-breath">
      <p className="breath-guide" aria-hidden="true">
       <span>{t('breath.in')}</span><span>{t('breath.hold')}</span><span>{t('breath.out')}</span><span>{t('breath.hold')}</span>
      </p>
      <p className="breath-note">{t('breath.note')}</p>
     </div>
     {supportNode}
    </div>}
   </div>
   {!calm&&<aside className="live-desk-side">
    {comments}
    {supportNode}
   </aside>}
  </section>
  <section className="live-desk-archive" aria-label={t('live.archiveTitle')}>
   <div className="live-desk-archive-head">
    <span className="live-archive-icon"><AudioLines size={22}/></span>
    <div className="live-desk-archive-copy"><h2>{t('live.archiveTitle')}</h2><p>{t('live.archiveNote')}</p></div>
   </div>
   {archive}
  </section>
 </div>;

 // В эфире на экране появляется ещё четыре блока — название, статус, часы и
 // кнопка с громкостью. Значит круг и промежутки должны стать меньше, иначе
 // экран перестаёт помещаться целиком.
 return <section className={'live-stage'+(calm?'':' is-live')}>
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
    {/* В покое в круге стоит своя картинка автора, если он её загрузил. */}
    <Artwork src={calm&&calmSrc?calmSrc:cover}/>
    <span className="live-orb-shade" aria-hidden="true"/>
    <span className={'live-orb-copy'+(onAirLamp?' is-live':'')} role="status">
     {onAirLamp&&<span className="live-orb-dot" aria-hidden="true"/>}
     <strong>{heading}</strong>
    </span>
   </div>
  </div>

  {calm&&<p className="breath-guide" aria-hidden="true">
   <span>{t('breath.in')}</span><span>{t('breath.hold')}</span><span>{t('breath.out')}</span><span>{t('breath.hold')}</span>
  </p>}
  {calm&&<p className="breath-note">{t('breath.note')}</p>}

  {name&&<h2 className="live-stage-name">{name}</h2>}
  {/* Без эфира строка молчит: в круге горит OFF AIR, и человек стоит во
      вкладке «Эфир» — повторять это словами незачем. */}
  {(status||stage!=='offline')&&<p className="live-stage-sub">{status||note}</p>}
  {/* О чём эфир — словами автора. Показываем, только когда эфир есть: у
      отсутствующего эфира описания не бывает. */}
  {about&&stage!=='offline'&&<p className="live-stage-about">{about}</p>}
  {elapsed&&stage==='playing'&&<p className="live-stage-clock"><strong>{elapsed}</strong><span>{t('live.onAirFor')}</span></p>}

  {action!=='none'&&<button type="button" className="live-cta tt-pressable" disabled={action==='busy'}
   onClick={()=>{haptic();if(action==='pause')onPause();else onListen();}}>
   {action==='busy'?<Loader2 className="spin" size={20}/>:action==='pause'?<Pause size={20} fill="currentColor"/>:<Play size={20} fill="currentColor"/>}
   {action==='busy'?t('live.connecting'):action==='pause'?t('live.stopListening'):t('live.listen')}
  </button>}
  {/* Громкость идёт сразу за кнопкой: во время эфира ею пользуются чаще
      всего, и искать её под карточками архива неправильно. */}
  {volume}
  {/* Позвать друга на эфир — там же, где слушают. Уводить за этим в меню
      неправильно: эфир идёт сейчас, и звать надо сейчас. Только пока эфир
      есть: в покое кнопка повторяла «Поделиться» в шапке — та делится тем
      же эфиром (lib/share.ts), и владелец попросил лишнюю убрать. */}
  {!calm&&shareAction}

  {/* Архив эфиров раскрывается здесь же. Уводить отсюда в подкасты нельзя:
      подкаст — подготовленный выпуск, запись эфира — другое, и человек
      нажимает «Архив эфиров», чтобы остаться в эфире, а не сменить раздел. */}
  <button type="button" className={'live-archive-card tt-pressable'+(archiveOpen?' is-open':'')}
   aria-expanded={archiveOpen} onClick={()=>{haptic();onArchive();}}>
   <span className="live-archive-icon"><AudioLines size={22}/></span>
   <span className="live-archive-copy"><strong>{t('live.archiveTitle')}</strong><span>{t('live.archiveNote')}</span></span>
   <ChevronRight size={18}/>
  </button>
  {archiveOpen&&archive}

  {hint&&<p className="live-stage-hint">{hint}</p>}
  {support??<span className="live-stage-support-missing"><HeartBeam size={17}/>{t('donate.unavailable')}</span>}
 </section>;
}
