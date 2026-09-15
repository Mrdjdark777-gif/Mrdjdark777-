/**
 * S05 — состояние экрана эфира. Правило вынесено из разметки: экран не должен
 * говорить «Мы в эфире», когда эфира нет, выдавать переподключение за
 * воспроизведение или показывать старый эфир после его окончания.
 *
 * Пульс колец — декоративный мотив, и он допустим только при настоящем
 * воспроизведении; спектра он не изображает.
 */
export type ListenPhase='idle'|'connecting'|'waiting'|'playing'|'paused'|'reconnecting'|'blocked'|'ended'|'error';
export type LiveStage='offline'|'ready'|'connecting'|'playing'|'paused'|'reconnecting'|'blocked'|'ended'|'error';

export function liveStage(input:{onAir:boolean;joined:boolean;phase:ListenPhase}):LiveStage{
 const {onAir,joined,phase}=input;
 // Эфир закончился, пока человек слушал: экран обязан сказать об этом, а не
 // продолжать показывать прежний.
 if(phase==='ended')return 'ended';
 if(!onAir)return joined&&phase==='error'?'error':'offline';
 switch(phase){
  case 'connecting':case 'waiting':return 'connecting';
  case 'playing':return 'playing';
  case 'paused':return 'paused';
  case 'reconnecting':return 'reconnecting';
  case 'blocked':return 'blocked';
  case 'error':return 'error';
  // Эфир идёт, но слушатель ещё не подключился: это не offline.
  default:return joined?'connecting':'ready';
 }
}

/** «Мы в эфире» — только когда эфир действительно идёт. */
export function onAirLabelVisible(stage:LiveStage):boolean{
 return stage!=='offline'&&stage!=='ended';
}

/** Пульс колец: только настоящее воспроизведение, и его отключает reduced motion. */
export function ringsPulsing(stage:LiveStage,reducedMotion:boolean):boolean{
 return stage==='playing'&&!reducedMotion;
}

/** Главная кнопка: play до подключения, pause во время, состояние — при подключении. */
export function stageAction(stage:LiveStage):'play'|'pause'|'busy'|'none'{
 if(stage==='offline')return 'none';
 if(stage==='playing')return 'pause';
 if(stage==='ready')return 'play';
 if(stage==='connecting'||stage==='reconnecting')return 'busy';
 return 'play';
}
