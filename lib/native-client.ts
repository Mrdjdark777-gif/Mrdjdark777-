'use client';
type Reply={error?:string;[key:string]:unknown};
declare global {interface Window {TrueThrillsNative?:{postMessage(message:string):void;onmessage?: (event:{data:string})=>void};}}
const pending=new Map<number,{resolve:(data:Reply)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();let sequence=0;
export const hasNativeClient=()=>typeof window!=='undefined'&&!!window.TrueThrillsNative;

/**
 * Оболочка умеет не только отвечать, но и рассказывать сама.
 *
 * Прежде обработчик входящих сообщений ставился заново на каждый вызов и знал
 * только про ответы: сообщение с незнакомым номером молча выбрасывалось.
 * Датчику телефона отвечать не на что — он шлёт поток, и поток нужно кому-то
 * отдать. Поэтому обработчик ставится один раз и разбирает два случая: ответ
 * на наш вызов и сообщение, которое оболочка прислала сама.
 */
type NativeEvent={event:string;[key:string]:unknown};
const watchers=new Set<(message:NativeEvent)=>void>();
let listening=false;
function listen(){
 const bridge=window.TrueThrillsNative;if(!bridge||listening)return;
 listening=true;
 bridge.onmessage=event=>{try{
  const message=JSON.parse(event.data);
  if(typeof message?.event==='string'){for(const watcher of watchers)watcher(message as NativeEvent);return;}
  const {id,data}=message;const call=pending.get(id);if(!call)return;
  clearTimeout(call.timer);pending.delete(id);
  if(data?.error)call.reject(new Error(data.error));else call.resolve(data);
 }catch{}};
}

/** Подписка на поток от оболочки. Возвращает отписку. */
export function onNative(watcher:(message:NativeEvent)=>void){
 if(!hasNativeClient())return ()=>{};
 listen();watchers.add(watcher);
 return ()=>{watchers.delete(watcher);};
}

export function nativeCall<T=Reply>(method:string,args:Record<string,unknown>={}):Promise<T>{
 return new Promise((resolve,reject)=>{
  const bridge=window.TrueThrillsNative;if(!bridge){reject(new Error('#err.nativeUnavailable'));return;}
  listen();
  const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error('#err.request'));},45000);
  pending.set(id,{resolve:data=>resolve(data as T),reject,timer});
  try{bridge.postMessage(JSON.stringify({id,method,args}));}catch(error){clearTimeout(timer);pending.delete(id);reject(error);}
 });
}
export function stopNativePlayer(){if(hasNativeClient())void nativeCall('player.stop').catch(()=>{});}
