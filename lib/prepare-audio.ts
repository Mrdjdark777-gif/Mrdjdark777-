/** Keep parsing and remuxing off the UI thread; cancellation also stops the worker. */
export function prepareAudioFile(blob:Blob,signal?:AbortSignal):Promise<{blob:Blob;duration:number}>{
 return new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(new DOMException('Отменено','AbortError'));return;}
  const worker=new Worker(new URL('../workers/audio-file.worker.ts',import.meta.url),{type:'module'});
  const cleanup=()=>{worker.terminate();signal?.removeEventListener('abort',abort);};
  const abort=()=>{cleanup();reject(new DOMException('Отменено','AbortError'));};
  signal?.addEventListener('abort',abort,{once:true});
  worker.onmessage=e=>{cleanup();if(e.data.ok)resolve({blob:e.data.blob,duration:e.data.duration});else reject(new Error(e.data.error));};
  worker.onerror=()=>{cleanup();reject(new Error('Не удалось подготовить аудио. Обнови приложение и попробуй снова.'));};
  worker.postMessage(blob);
 });
}
