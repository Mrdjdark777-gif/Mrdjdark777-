export type CaptureSettings={mode:'mic'|'daw';device:string;channel:'0'|'1'|'stereo';gainDb:number;lowCut:boolean};
export const captureSettingsKey='tt-capture-settings-v1';
export function parseCaptureSettings(raw:string|null):CaptureSettings{
 const defaults:CaptureSettings={mode:'mic',device:'default',channel:'0',gainDb:0,lowCut:false};
 try{const s=JSON.parse(raw||'null');if(!s||typeof s!=='object')return defaults;return{mode:s.mode==='daw'?'daw':'mic',device:typeof s.device==='string'&&s.device.length>0&&s.device.length<1024?s.device:'default',channel:['0','1','stereo'].includes(s.channel)?s.channel:'0',gainDb:Number.isFinite(s.gainDb)?Math.max(-18,Math.min(12,Math.round(s.gainDb))):0,lowCut:s.lowCut===true};}catch{return defaults;}
}
