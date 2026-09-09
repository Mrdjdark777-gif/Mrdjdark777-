'use client';
type Reply={error?:string;[key:string]:unknown};
declare global {interface Window {TrueThrillsNative?:{postMessage(message:string):void;onmessage?: (event:{data:string})=>void};}}
const pending=new Map<number,{resolve:(data:Reply)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();let sequence=0;
export const hasNativeClient=()=>typeof window!=='undefined'&&!!window.TrueThrillsNative;
export function nativeCall<T=Reply>(method:string,args:Record<string,unknown>={}):Promise<T>{
 return new Promise((resolve,reject)=>{
  const bridge=window.TrueThrillsNative;if(!bridge){reject(new Error('#err.nativeUnavailable'));return;}
  bridge.onmessage=event=>{try{const {id,data}=JSON.parse(event.data);const call=pending.get(id);if(!call)return;clearTimeout(call.timer);pending.delete(id);if(data?.error)call.reject(new Error(data.error));else call.resolve(data);}catch{}};
  const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error('#err.request'));},45000);
  pending.set(id,{resolve:data=>resolve(data as T),reject,timer});
  try{bridge.postMessage(JSON.stringify({id,method,args}));}catch(error){clearTimeout(timer);pending.delete(id);reject(error);}
 });
}
export function stopNativePlayer(){if(hasNativeClient())void nativeCall('player.stop').catch(()=>{});}
