export type CaptureSettings={mode:'mic'|'daw';device:string;channel:'0'|'1'|'stereo';gainDb:number;lowCut:boolean};
export const captureSettingsKey='tt-capture-settings-v1';
/** Канал по умолчанию для источника: из FL Studio звук идёт стереопарой, с
 *  микрофона — первым входом в моно. На пульте канал можно сменить вручную
 *  («Вход 1 / Вход 2 / Стерео»), и выбор запоминается вместе с устройством. */
export function channelForMode(mode:CaptureSettings['mode']):CaptureSettings['channel']{return mode==='daw'?'stereo':'0';}
export function parseCaptureSettings(raw:string|null):CaptureSettings{
 const defaults:CaptureSettings={mode:'mic',device:'default',channel:'0',gainDb:0,lowCut:false};
 try{
  const s=JSON.parse(raw||'null');if(!s||typeof s!=='object')return defaults;
  const mode:CaptureSettings['mode']=s.mode==='daw'?'daw':'mic';
  return{mode,device:typeof s.device==='string'&&s.device.length>0&&s.device.length<1024?s.device:'default',
   channel:s.channel==='0'||s.channel==='1'||s.channel==='stereo'?s.channel:channelForMode(mode),
   gainDb:Number.isFinite(s.gainDb)?Math.max(-18,Math.min(12,Math.round(s.gainDb))):0,lowCut:s.lowCut===true};
 }catch{return defaults;}
}
