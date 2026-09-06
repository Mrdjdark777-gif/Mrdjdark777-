import {prepareAudio} from '../lib/audio-file';
self.onmessage=async(event:MessageEvent<Blob>)=>{
 try{self.postMessage({ok:true,...await prepareAudio(event.data)});}
 catch(error){self.postMessage({ok:false,error:error instanceof Error?error.message:'Не удалось подготовить запись'});}
};
