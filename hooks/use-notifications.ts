'use client';
import {useEffect,useState} from 'react';
import {api,errorText} from '@/lib/client';
const storage='tt-push-device';
type Device={id:string;token:string};
function saved():Device|null{try{return JSON.parse(localStorage.getItem(storage)||'null');}catch{return null;}}
const headers=()=>({'x-push-token':saved()?.token??''});
async function registration(){await navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'});return Promise.race([navigator.serviceWorker.ready,new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('Уведомления не запустились. Обнови приложение.')),15000))]);}

// The Android app embeds a plain WebView (no PushManager), so it injects a
// native bridge instead and drives the same UI through it. Requests are
// keyed by an id because JavascriptInterface calls are one-way; the native
// side calls back into window.__ttPushCallback once the network round-trip
// finishes.
type AndroidPush={getState():string;enable(preferences:number,requestId:number):void;update(preferences:number,requestId:number):void;disable(requestId:number):void;test(requestId:number):void};
type BridgeResult={error?:string;[key:string]:unknown};
declare global{interface Window{AndroidPush?:AndroidPush;__ttPushCallback?:(id:number,data:BridgeResult)=>void;}}
let nextRequestId=1;
const pendingCalls=new Map<number,(data:BridgeResult)=>void>();
if(typeof window!=='undefined')window.__ttPushCallback=(id,data)=>{pendingCalls.get(id)?.(data);};
function androidCall(method:'enable'|'update'|'disable'|'test',preferences?:number){
 return new Promise<BridgeResult>((resolve,reject)=>{
  const bridge=window.AndroidPush;if(!bridge)return reject(new Error('Мост уведомлений недоступен.'));
  const id=nextRequestId++;
  pendingCalls.set(id,data=>{pendingCalls.delete(id);if(data?.error)reject(new Error(data.error));else resolve(data);});
  if(method==='enable')bridge.enable(preferences!,id);else if(method==='update')bridge.update(preferences!,id);else if(method==='disable')bridge.disable(id);else bridge.test(id);
 });
}

export function useNotifications(){
 const [supported,setSupported]=useState(false),[busy,setBusy]=useState(false),[enabled,setEnabled]=useState(false),[preferences,setPreferences]=useState(7),[message,setMessage]=useState('');
 useEffect(()=>{
  if(window.AndroidPush){setSupported(true);try{const state=JSON.parse(window.AndroidPush.getState()) as {enabled?:boolean;preferences?:number};setEnabled(!!state.enabled);if(typeof state.preferences==='number')setPreferences(state.preferences);}catch{}return;}
  const ok=window.isSecureContext&&'Notification'in window&&'serviceWorker'in navigator&&'PushManager'in window;setSupported(ok);if(!ok)return;let mounted=true;
  void(async()=>{try{const info=saved();if(!info)return;const sub=await(await registration()).pushManager.getSubscription();if(!sub)return;const r=await api<{current:{preferences:number}|null}>('notifications?id='+encodeURIComponent(info.id),undefined,{headers:headers()});if(mounted&&r.current){setEnabled(true);setPreferences(r.current.preferences);}}catch(e){if(mounted)setMessage(errorText(e));}})();return()=>{mounted=false;};},[]);
 async function persist(sub:PushSubscription,value:number){const r=await api<{id:string;token:string|null}>('notifications',{action:'subscribe',subscription:sub.toJSON(),preferences:value},{headers:headers()});if(r.token)localStorage.setItem(storage,JSON.stringify({id:r.id,token:r.token}));setPreferences(value);setEnabled(true);}
 async function enable(){setBusy(true);setMessage('');try{
  if(window.AndroidPush){await androidCall('enable',preferences);setEnabled(true);setMessage('Уведомления включены на этом устройстве. Проверь доставку.');return;}
  if(await Notification.requestPermission()!=='granted')throw new Error('Разреши уведомления сайта в Chrome и уведомления самого Chrome в настройках Android.');
 const reg=await registration(),config=await api<{publicKey:string}>('notifications');let sub=await reg.pushManager.getSubscription();if(sub&&!saved()){await sub.unsubscribe();sub=null;}
 sub??=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:Uint8Array.from(atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))});await persist(sub,preferences);setMessage('Уведомления включены на этом устройстве. Проверь доставку.');
 }catch(e){setMessage(errorText(e));}finally{setBusy(false);}}
 async function disable(){setBusy(true);try{
  if(window.AndroidPush){await androidCall('disable');setEnabled(false);setMessage('Уведомления выключены.');return;}
  const info=saved();if(info)await api('notifications',{action:'unsubscribe',id:info.id},{headers:headers()});await(await(await registration()).pushManager.getSubscription())?.unsubscribe();localStorage.removeItem(storage);setEnabled(false);setMessage('Уведомления выключены.');}catch(e){setMessage(errorText(e));}finally{setBusy(false);}}
 async function update(value:number){if(!enabled){setPreferences(value);return;}setBusy(true);try{
  if(window.AndroidPush){await androidCall('update',value);setPreferences(value);return;}
  const sub=await(await registration()).pushManager.getSubscription();if(!sub)throw new Error('Включи уведомления заново.');await persist(sub,value);}catch(e){setMessage(errorText(e));}finally{setBusy(false);}}
 async function test(){setBusy(true);try{
  if(window.AndroidPush){await androidCall('test');setMessage('Сервис принял сообщение. Проверь шторку телефона.');return;}
  await api('notifications',{action:'test',id:saved()?.id},{headers:headers()});setMessage('Сервис принял сообщение. Проверь шторку телефона. Если его нет — разрешения Chrome и режим «Не беспокоить».');}catch(e){setMessage(errorText(e));}finally{setBusy(false);}}
 return{supported,busy,enabled,preferences,message,enable,disable,update,test};
}
