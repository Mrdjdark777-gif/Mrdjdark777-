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
 // Пульт входа: источник, устройство, канал и срез низких. Пояснений под ним
 // нет — владелец попросил убрать «писанину» и выбирать вход прямо здесь, а не
 // через «устройство по умолчанию» в Windows. Во время записи и эфира вход не
 // меняется (это оборвало бы поток), срез низких переключается в любой момент.
 const off=locked||capture.busy||!capture.settingsLoaded;
 const devices=capture.devices.filter(d=>d.deviceId!=='default'&&d.deviceId!=='communications');
 const known=capture.device==='default'||devices.some(d=>d.deviceId===capture.device);
 // Названия устройств Windows отдаёт только после разрешения на микрофон:
 // если их ещё нет, разрешение спрашивается при открытии списка.
 const ask=(open:boolean)=>{if(open&&!devices.some(d=>d.label))void capture.refreshDevices(true);};
 return <div className="mic-setup audio-pult">
  <label className="field">{t('input.howSound')}<Select value={capture.mode} onValueChange={v=>capture.changeMode(v as 'mic'|'daw')} disabled={off}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="mic">{t('input.mic')}</SelectItem><SelectItem value="daw">{t('input.daw')}</SelectItem></SelectContent></Select></label>
  <label className="field">{t('input.device')}<Select value={capture.device} onValueChange={capture.setDevice} onOpenChange={ask} disabled={off}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="default">{t('input.deviceDefault')}</SelectItem>{!known&&<SelectItem value={capture.device}>{t('input.deviceSaved')}</SelectItem>}{devices.map((d,i)=><SelectItem key={d.deviceId} value={d.deviceId}>{d.label||t('input.deviceN',{n:i+1})}</SelectItem>)}</SelectContent></Select></label>
  <label className="field">{t('input.channel')}<Select value={capture.channel} onValueChange={v=>capture.setChannel(v)} disabled={off}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="0">{t('input.channel1')}</SelectItem><SelectItem value="1">{t('input.channel2')}</SelectItem><SelectItem value="stereo">{t('input.stereo')}</SelectItem></SelectContent></Select></label>
  <label className="audio-pult-switch"><Switch checked={capture.lowCut} onCheckedChange={capture.setLowCut} disabled={!capture.settingsLoaded}/>{t('input.lowCut')}</label>
 </div>;
}
export function SignalMeter({samples,level,active,clipping,label}:{samples:number[];level:number;active:boolean;clipping:boolean;label:string}){const {t}=useT();return <div className="signal-console"><div className="signal-head"><span>{label}</span><strong className={active&&clipping?'clipping':''}>{active?`${Math.round(level)} dBFS`:t('input.noSignal')}</strong></div><div className={'waveform '+(!active?'wave-inactive':'')} aria-label={label}>{samples.map((s,i)=><span key={i} style={{height:Math.max(3,Math.min(94,active?s*180+3:3))+'%'}}/>)}</div><div className="meter-labels"><span>−60</span><span>−36</span><span>−18</span><span>−6</span><span>0 dBFS</span></div>{active&&clipping&&<p className="clip-notice">{t('input.tooLoud')}</p>}</div>;}
export function AudioControls({capture}:{capture:Capture}){const {t}=useT();return <div className="audio-controls-panel"><div className="gain-control"><div><label htmlFor="input-gain">{t('input.gain')}</label><strong>{capture.gainDb>0?'+':''}{capture.gainDb} dB</strong></div><Slider id="input-gain" aria-label={t('input.gain')} value={[capture.gainDb]} min={-18} max={12} step={1} onValueChange={v=>capture.setGainDb(v[0])}/></div><div className="mic-toggles"><label><Switch checked={capture.muted} onCheckedChange={capture.setMuted}/>{capture.muted?<MicOff size={16}/>:<Mic size={16}/>}{t('input.muteAll')}</label></div></div>;}
