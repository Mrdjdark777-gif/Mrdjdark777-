import {t} from '@/lib/i18n/runtime';
import {hasNativeClient,nativeCall} from '@/lib/native-client';

// Сервер отдаёт не текст, а ключ вида "#err.badKind": он один для всех
// языков, а слова подставляет клиент по своему словарю. Сообщение без "#"
// (прокси, старая версия сервера) показываем как есть.
function serverMessage(raw?:string){
  if(!raw)return t('err.server');
  if(!raw.startsWith('#'))return raw;
  const key=raw.slice(1),text=t(key);
  return text===key?t('err.server'):text;
}
export async function api<T=unknown>(path:string,data?:unknown,init?:RequestInit){
  const r=await fetch('/api/'+path,{cache:'no-store',...init,...(data!==undefined?{method:'POST',headers:{'Content-Type':'application/json',...init?.headers},body:JSON.stringify(data)}:{})});
  const type=r.headers.get('content-type')??'';
  if(!type.includes('application/json'))throw new Error(t('err.serverDown'));
  const d=await r.json() as T & {error?:string};if(!r.ok)throw new Error(serverMessage(d.error));return d;
}
export const clock=(seconds:number)=>{
 const n=Math.max(0,Math.floor(seconds||0)),m=Math.floor(n/60)%60,s=n%60,h=Math.floor(n/3600);
 const mm=m.toString().padStart(2,'0'),ss=s.toString().padStart(2,'0');
 // Часы появляются только когда есть: у выпуска на 12 минут «00:12:30» читается
 // хуже, чем «12:30», а у полуторачасового «90:00» уже вводит в заблуждение.
 return h?`${h}:${mm}:${ss}`:`${mm}:${ss}`;
};
/**
 * Разбор длительности, введённой руками. У видео это ссылка на чужую площадку,
 * длины ролика мы не знаем — её вписывает автор.
 *
 * Пусто — длительности нет, карточка её не показывает. Иначе «мм:сс» или
 * «ч:мм:сс»; всё остальное — null, и вызывающий говорит об этом человеку,
 * а не сохраняет молча ноль.
 */
export const parseClock=(text:string):number|null=>{
 const value=text.trim();
 if(!value)return 0;
 const parts=/^(\d{1,3}):([0-5]\d)$/.exec(value);
 if(parts)return Number(parts[1])*60+Number(parts[2]);
 const long=/^(\d{1,2}):([0-5]\d):([0-5]\d)$/.exec(value);
 if(long)return Number(long[1])*3600+Number(long[2])*60+Number(long[3]);
 return null;
};
// Короткий тактильный отклик на тап по нижней навигации. В Android-приложении
// зовёт нативный EFFECT_CLICK через мост (см. NativeBridge.haptic) — это
// калиброванная волна, а не голая длительность, ощущается заметно чётче.
// В обычном браузере (или на старом APK без этого метода моста) — запасной
// вариант через Vibration API; на iOS Safari/WebView её нет, тихо не сработает.
export const haptic=()=>{
  if(hasNativeClient()){void nativeCall('ui.haptic').catch(()=>{});return;}
  try{navigator.vibrate?.(25);}catch{}
};
export function errorText(e:unknown){return e instanceof Error?serverMessage(e.message):t('err.generic');}
export function draftFile(file?:Blob|null):Promise<Blob|null>{return new Promise((resolve,reject)=>{
  const r=indexedDB.open('true-thrills-drafts',1);r.onupgradeneeded=()=>r.result.createObjectStore('audio');r.onerror=()=>reject(r.error);
  r.onsuccess=()=>{const db=r.result,tx=db.transaction('audio',file===undefined?'readonly':'readwrite'),s=tx.objectStore('audio');const q=file===undefined?s.get('latest'):file?s.put(file,'latest'):s.delete('latest');let value:Blob|null=null;q.onsuccess=()=>{value=q.result instanceof Blob?q.result:null;};tx.oncomplete=()=>{db.close();resolve(value);};tx.onerror=()=>{db.close();reject(tx.error);};};
});}

/**
 * Ссылка на обложку выпуска.
 *
 * Ключ загрузки в адресе обязателен. Сам адрес /api/cover?id=<выпуск> не
 * меняется при замене картинки, а ответ кэшируется на сутки — заменив обложку,
 * автор целый день видел старую и считал, что она не сохранилась. Ключ у
 * каждой загрузки свой, поэтому новая картинка — это новый адрес.
 */
export function coverSrc(post:{id:string;coverKey?:string|null;coverUrl?:string|null}){
 if(post.coverKey)return '/api/cover?id='+encodeURIComponent(post.id)+'&v='+encodeURIComponent(post.coverKey.replace(/^cover\//,''));
 return post.coverUrl||'';
}
