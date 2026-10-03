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
// Тактильный отклик. В Android-приложении
// зовёт нативный EFFECT_CLICK через мост (см. NativeBridge.haptic) — это
// калиброванная волна, а не голая длительность, ощущается заметно чётче.
// В обычном браузере (или на старом APK без этого метода моста) — запасной
// вариант через Vibration API; на iOS Safari/WebView её нет, тихо не сработает.
//
// 'tick' — щелчок барабана карусели, по одному на каждую карточку. В
// приложении это тот же EFFECT_CLICK: мост не знает слова 'tick' и берёт
// обычный щелчок, а он короткий и чёткий, как раз для частой серии. В
// браузере длительность урезана до 12 мс: 25 мс подряд на быстром броске
// сливаются в сплошное жужжание, а короткие толчки остаются раздельными.
export const haptic=(strength:'click'|'heavy'|'tick'='click')=>{
  if(hasNativeClient()){void nativeCall('ui.haptic',{strength}).catch(()=>{});return;}
  // Запасной путь в браузере: у Vibration API нет калиброванных волн, есть
  // только длительность. Сильный отклик набирается двойным толчком — он
  // ощущается отчётливее одного длинного и не превращается в зуд.
  try{navigator.vibrate?.(strength==='heavy'?[30,45,60]:strength==='tick'?12:25);}catch{}
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
 *
 * `width` — для плиток. Браузер распаковывает картинку целиком, какой бы
 * маленькой её ни показывали, и обложка 1080×1350 стоит полтора миллиона
 * точек на каждую плитку. Для полноэкранных мест ширина не указывается: там
 * нужен оригинал.
 */
/**
 * Картинка для уведомления о воспроизведении: шторка и экран блокировки.
 *
 * Что именно показать, решает сервер (/api/cover?id=notify:…): загружен «Фон
 * уведомлений» — он, иначе обложка того, что играет, иначе знак канала. Так
 * велел владелец. Адрес не зависит от настройки, поэтому замена картинки в
 * студии не требует ни пересборки приложения, ни нового адреса.
 * 960 — уменьшенная копия: шторке больше не нужно, а оригинал на 12 МБ
 * телефон тянул бы ради карточки шириной в экран.
 */
export const notifySrc=(id:string)=>'/api/cover?id=notify:'+encodeURIComponent(id)+'&w=960';
export function coverSrc(post:{id:string;coverKey?:string|null;coverUrl?:string|null},width?:number){
 if(post.coverKey)return '/api/cover?id='+encodeURIComponent(post.id)+'&v='+encodeURIComponent(post.coverKey.replace(/^cover\//,''))+
  (width?'&w='+width:'');
 return post.coverUrl||'';
}
