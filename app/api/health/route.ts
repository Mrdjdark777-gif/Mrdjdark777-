import {statfsSync,existsSync} from 'node:fs';
import {getDb} from '@/db';
import {owner,result} from '@/lib/server';
import pkg from '@/package.json';
export const runtime='nodejs';
export async function GET(req:Request){try{
 getDb().$client.prepare('SELECT 1').get();const fs=statfsSync(process.env.STORAGE_DIR||'data'),freeBytes=fs.bavail*fs.bsize,ok=freeBytes>1024**3;
 const details=await owner(req)?{freeBytes,pushQueue:getDb().$client.prepare('SELECT state,COUNT(*) AS count FROM push_outbox GROUP BY state').all(),firebaseConfigured:!!process.env.FIREBASE_SERVICE_ACCOUNT_FILE&&existsSync(process.env.FIREBASE_SERVICE_ACCOUNT_FILE),turnConfigured:!!process.env.TURN_URLS&&!!process.env.TURN_SECRET,trustProxy:process.env.TRUST_PROXY==='true'}:{};
 return result({ok,version:pkg.version,...details},ok?200:503);
}catch{return result({ok:false,version:pkg.version},503);}}
