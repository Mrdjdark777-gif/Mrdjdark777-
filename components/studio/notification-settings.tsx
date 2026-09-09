'use client';
import {Bell,Loader2} from 'lucide-react';
import {Switch} from '@/components/ui/switch';
import {useNotifications} from '@/hooks/use-notifications';
import {useT} from '@/components/i18n-provider';

const OPTIONS:[number,string][]=[[1,'notif.optLive'],[2,'notif.optPodcast'],[4,'notif.optStory']];

// Кнопка проверки доставки — инструмент отладки для автора, а не то, что
// показывают обычным пользователям: ни в одном приложении слушатель не видит
// «отправить себе тестовое уведомление». Автор проверяет пайплайн push здесь
// или на ПК; слушателю остаются только переключатели категорий и включение.
export function NotificationSettings({author=false}:{author?:boolean}){
 const n=useNotifications(),{t}=useT();
 return <section className="settings-panel"><div className="section-icon"><Bell size={22}/></div><h2>{t('notif.title')}</h2><p>{t('notif.text')}</p>
 {n.supported?<>
  <div className="notification-options">{OPTIONS.map(([bit,key])=><label key={bit}><Switch checked={!!(n.preferences&bit)} disabled={n.busy} onCheckedChange={checked=>void n.update(checked?n.preferences|bit:n.preferences&~bit)}/>{t(key)}</label>)}</div>
  <div className="settings-actions"><button className="primary-button" disabled={n.busy} onClick={()=>void(n.enabled?n.disable():n.enable())}>{n.busy?<Loader2 className="spin" size={18}/>:<Bell size={18}/>} {n.enabled?t('notif.disable'):t('notif.enable')}</button>{author&&n.enabled&&<button className="secondary-button" disabled={n.busy} onClick={()=>void n.test()}>{t('notif.test')}</button>}</div>
 </>:<p>{t('notif.unsupported')}</p>}
 {n.message&&<p role="status">{n.message}</p>}
 <small>{t('notif.note')}</small></section>;
}
