import {getDb} from '@/db';
import {originCheck,owner,result,failure} from '@/lib/server';
import {consumePublicAttempt} from '@/lib/rate-limit';
import {recordUsage} from '@/lib/usage';
export async function POST(req:Request){try{
 originCheck(req);
 if(await owner(req))return result({counted:false});
 const text=await req.text();if(text.length>512)return result({error:'Request too large'},413);
 const d=JSON.parse(text) as {id?:unknown;session?:unknown};
 if(typeof d.id!=='string'||d.id.length>128||typeof d.session!=='string'||!/^[a-f0-9-]{36}$/.test(d.session))return result({error:'Invalid event'},400);
 const wait=consumePublicAttempt(req,'usage',120,600000);
 if(wait)return result({error:'Too many requests'},429,{'Retry-After':String(wait)});
 return result({counted:recordUsage(getDb().$client,d.id,d.session)});
}catch(e){return failure(e);}}
