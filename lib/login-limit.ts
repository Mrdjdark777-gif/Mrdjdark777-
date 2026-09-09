import {createHmac} from 'node:crypto';
import {isIP} from 'node:net';
import {getDb} from '@/db';
function key(req:Request){const ip=process.env.TRUST_PROXY==='true'?req.headers.get('x-real-ip')??'direct':'direct';return createHmac('sha256',process.env.SESSION_SECRET??'').update('login:'+ (isIP(ip)?ip:'direct')).digest('hex');}
export function consumeLoginAttempt(req:Request){const db=getDb().$client,now=Date.now(),id=key(req);return db.transaction(()=>{
 db.prepare('DELETE FROM rate_limits WHERE expires_at<=?').run(now);
 const row=db.prepare('SELECT attempts,expires_at FROM rate_limits WHERE id=?').get(id) as {attempts:number;expires_at:number}|undefined;
 if(row&&row.attempts>=10)return Math.max(1,Math.ceil((row.expires_at-now)/1000));
 db.prepare('INSERT INTO rate_limits(id,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET attempts=attempts+1').run(id,now+600000);return 0;
})();}
export function resetLoginAttempts(req:Request){getDb().$client.prepare('DELETE FROM rate_limits WHERE id=?').run(key(req));}
