export async function api<T=unknown>(path:string,data?:unknown,init?:RequestInit){
  const r=await fetch('/api/'+path,{cache:'no-store',...init,...(data!==undefined?{method:'POST',headers:{'Content-Type':'application/json',...init?.headers},body:JSON.stringify(data)}:{})});
  const type=r.headers.get('content-type')??'';
  if(!type.includes('application/json'))throw new Error('Сервер недоступен. Обновите страницу и проверьте вход в аккаунт.');
  const d=await r.json() as T & {error?:string};if(!r.ok)throw new Error(d.error||'Ошибка сервера');return d;
}
export const clock=(seconds:number)=>{const n=Math.max(0,Math.floor(seconds||0));return `${Math.floor(n/60).toString().padStart(2,'0')}:${(n%60).toString().padStart(2,'0')}`;};
export function errorText(e:unknown){return e instanceof Error?e.message:'Не удалось выполнить действие';}
export function draftFile(file?:Blob|null):Promise<Blob|null>{return new Promise((resolve,reject)=>{
  const r=indexedDB.open('true-thrills-drafts',1);r.onupgradeneeded=()=>r.result.createObjectStore('audio');r.onerror=()=>reject(r.error);
  r.onsuccess=()=>{const db=r.result,tx=db.transaction('audio',file===undefined?'readonly':'readwrite'),s=tx.objectStore('audio');const q=file===undefined?s.get('latest'):file?s.put(file,'latest'):s.delete('latest');let value:Blob|null=null;q.onsuccess=()=>{value=q.result instanceof Blob?q.result:null;};tx.oncomplete=()=>{db.close();resolve(value);};tx.onerror=()=>{db.close();reject(tx.error);};};
});}
