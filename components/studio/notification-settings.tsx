'use client';
import {Bell,Loader2} from 'lucide-react';
import {Switch} from '@/components/ui/switch';
import {useNotifications} from '@/hooks/use-notifications';
import {useT} from '@/components/i18n-provider';

const OPTIONS:[number,string][]=[[1,'notif.optLive'],[2,'notif.optPodcast'],[4,'notif.optStory']];

export function NotificationSettings(){
 const n=useNotifications(),{t}=useT();
 return <section className="settings-panel"><div className="section-icon"><Bell size={22}/></div><h2>{t('notif.title')}</h2><p>{t('notif.text')}</p>
 {n.supported?<>
  {!n.permitted&&<p role="status">{t('notif.blocked')} <button className="secondary-button" onClick={()=>void n.openSettings()}>{t('notif.openSettings')}</button></p>}
  {n.lastReceivedAt>0&&<p>{t('notif.lastReceived')}: {new Date(n.lastReceivedAt).toLocaleString()}</p>}
  <div className="notification-options">{OPTIONS.map(([bit,key])=><label key={bit}><Switch checked={!!(n.preferences&bit)} disabled={n.busy} onCheckedChange={checked=>void n.update(checked?n.preferences|bit:n.preferences&~bit)}/>{t(key)}</label>)}</div>
  <div className="settings-actions"><button className="primary-button" disabled={n.busy} onClick={()=>void((n.enabled||n.subscribed)?n.disable():n.enable())}>{n.busy?<Loader2 className="spin" size={18}/>:<Bell size={18}/>} {(n.enabled||n.subscribed)?t('notif.disable'):t('notif.enable')}</button>{n.enabled&&<button className="secondary-button" disabled={n.busy} onClick={()=>void n.test()}>{t('notif.test')}</button>}</div>
 </>:<p>{t('notif.unsupported')}</p>}
 {n.message&&<p role="status">{n.message}</p>}
 <small>{t('notif.note')}</small></section>;
}
