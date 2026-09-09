import {readFile,statfs} from 'node:fs/promises';
import path from 'node:path';
export const liveRoot=()=>path.resolve(process.env.LIVE_DIR||'data/live');
export const liveId=(id:string)=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id);
export async function recordingAvailable(){
 try {const h=JSON.parse(await readFile(path.join(liveRoot(),'worker.json'),'utf8'));return Date.now()-h.at<20000;}catch{return false;}
}
export async function requireRecordingCapacity(){
 if(!await recordingAvailable())throw new Error('#err.liveWorker');
 const fs=await statfs(liveRoot());if(fs.bavail*fs.bsize<1024**3)throw new Error('#err.liveDisk');
}
