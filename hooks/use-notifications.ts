'use client';
import {useEffect,useState} from 'react';
import {api,errorText} from '@/lib/client';
const storage='tt-push-device';
type Device={id:string;token:string};
function saved():Device|null{try{return JSON.parse(localStorage.getItem(storage)||'null');}catch{return null;}}
const headers=()=>({'x-push-token':saved()?.token??''});
async function registration(){await navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'});return Promise.race([navigator.serviceWorker.ready,new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('Уведомления не запустились. Обнови приложение.')),15000))]);}
export function useNotifications(){
 const [supported,setSupported]=useState(false),[busy,setBusy]=useState(false),[enabled,setEnabled]=useState(false),[preferences,setPreferences]=useState(7),[message,setMessage]=useState('');
 useEffect(()=>{const ok=window.isSecureContext&&'Notification'in window&&'serviceWorker'in navigator&&'PushManager'in window;setSupported(ok);if(!ok)return;let mounted=true;
 void(async()=>{try{const info=saved();if(!info)return;const sub=await(await registration()).pushManager.getSubscription();if(!sub)return;const r=await api<{current:{preferences:number}|null}>('notifications?id='+encodeURIComponent(info.id),undefined,{headers:headers()});if(mounted&&r.current){setEnabled(true);setPreferences(r.current.preferences);}}catch(e){if(mounted)setMessage(errorText(e));}})();return()=>{mounted=false;};},[]);
 async function persist(sub:PushSubscription,value:number){const r=await api<{id:string;token:string|null}>('notifications',{action:'subscribe',subscription:sub.toJSON(),preferences:value},{headers:headers()});if(r.token)localStorage.setItem(storage,JSON.stringify({id:r.id,token:r.token}));setPreferences(value);setEnabled(true);}
 async function enable(){setBusy(true);setMessage('');try{if(await Notification.requestPermission()!=='granted')throw new Error('Разреши уведомления сайта в Chrome и уведомления самого Chrome в настройках Android.');
 const reg=await registration(),config=await api<{publicKey:string}>('notifications');let sub=await reg.pushManager.getSubscription();if(sub&&!saved()){await sub.unsubscribe();sub=null;}
 sub??=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:Uint8Array.from(atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))});await persist(sub,preferences);setMessage('Уведомления включены на этом устройстве. Проверь доставку.');
 }catch(e){setMessage(errorText(e));}finally{setBusy(false);}}
 async function disable(){setBusy(true);try{const info=saved();if(info)await api('notifications',{action:'unsubscribe',id:info.id},{headers:headers()});await(await(await registration()).pushManager.getSubscription())?.unsubscribe();localStorage.removeItem(storage);setEnabled(false);setMessage('Уведомления выключены.');}catch(e){setMessage(errorText(e));}finally{setBusy(false);}}
 async function update(value:number){if(!enabled){setPreferences(value);return;}setBusy(true);try{const sub=await(await registration()).pushManager.getSubscription();if(!sub)throw new Error('Включи уведомления заново.');await persist(sub,value);}catch(e){setMessage(errorText(e));}finally{setBusy(false);}}
 async function test(){setBusy(true);try{await api('notifications',{action:'test',id:saved()?.id},{headers:headers()});setMessage('Сервис принял сообщение. Проверь шторку телефона. Если его нет — разрешения Chrome и режим «Не беспокоить».');}catch(e){setMessage(errorText(e));}finally{setBusy(false);}}
 return{supported,busy,enabled,preferences,message,enable,disable,update,test};
}
