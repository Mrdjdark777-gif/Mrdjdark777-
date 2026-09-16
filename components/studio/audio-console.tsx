'use client';
import {Mic,MicOff} from 'lucide-react';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {Slider} from '@/components/ui/slider';
import {Switch} from '@/components/ui/switch';
import type {useCapture} from '@/hooks/use-capture';
import {useT} from '@/components/i18n-provider';
type Capture=ReturnType<typeof useCapture>;
export function InputPicker({capture,locked=false}:{capture:Capture;locked?:boolean}){
 const {t}=useT();
 // Здесь остался один выбор — откуда идёт звук. Источник и канал входа задаются
 // в FL Studio и в параметрах звука Windows, а не тут: владелец их не меняет, и
 // они только занимали место на пульте. Разрешение на микрофон запрашивается
 // при подключении, так что отдельная кнопка для этого не нужна.
 return <div className="mic-setup"><label className="field">{t('input.howSound')}<Select value={capture.mode} onValueChange={v=>capture.changeMode(v as 'mic'|'daw')} disabled={locked||capture.busy||!capture.settingsLoaded}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="mic">{t('input.mic')}</SelectItem><SelectItem value="daw">{t('input.daw')}</SelectItem></SelectContent></Select></label><p className="audio-mode-help">{capture.mode==='daw'?t('input.dawHelp'):t('input.micHelp')}</p></div>;
}
export function SignalMeter({samples,level,active,clipping,label}:{samples:number[];level:number;active:boolean;clipping:boolean;label:string}){const {t}=useT();return <div className="signal-console"><div className="signal-head"><span>{label}</span><strong className={active&&clipping?'clipping':''}>{active?`${Math.round(level)} dBFS`:t('input.noSignal')}</strong></div><div className={'waveform '+(!active?'wave-inactive':'')} aria-label={label}>{samples.map((s,i)=><span key={i} style={{height:Math.max(3,Math.min(94,active?s*180+3:3))+'%'}}/>)}</div><div className="meter-labels"><span>−60</span><span>−36</span><span>−18</span><span>−6</span><span>0 dBFS</span></div>{active&&clipping&&<p className="clip-notice">{t('input.tooLoud')}</p>}</div>;}
export function AudioControls({capture}:{capture:Capture}){const {t}=useT();return <div className="audio-controls-panel"><div className="gain-control"><div><label htmlFor="input-gain">{t('input.gain')}</label><strong>{capture.gainDb>0?'+':''}{capture.gainDb} dB</strong></div><Slider id="input-gain" aria-label={t('input.gain')} value={[capture.gainDb]} min={-18} max={12} step={1} onValueChange={v=>capture.setGainDb(v[0])}/></div><div className="mic-toggles"><label><Switch checked={capture.muted} onCheckedChange={capture.setMuted}/>{capture.muted?<MicOff size={16}/>:<Mic size={16}/>}{t('input.muteAll')}</label></div></div>;}
