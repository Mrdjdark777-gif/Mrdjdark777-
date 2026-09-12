import {createHmac,randomBytes} from 'node:crypto';
import {getDb} from '@/db';
import {owner,result} from '@/lib/server';
export async function GET(req:Request){
 const iceServers:RTCIceServer[]=[{urls:'stun:stun.l.google.com:19302'}];
 const secret=process.env.TURN_SECRET,urls=(process.env.TURN_URLS??'').split(',').map(s=>s.trim()).filter(s=>/^turns?:[a-zA-Z0-9.-]+(?::\d+)?(?:\?transport=(?:udp|tcp))?$/.test(s));
 if(secret&&urls.length&&(await owner(req)||getDb().$client.prepare('SELECT id FROM broadcasts WHERE active=1 AND heartbeat>? LIMIT 1').get(Date.now()-90000))){
  const username=`${Math.floor(Date.now()/1000)+3600}:${randomBytes(8).toString('hex')}`;
  iceServers.push({urls,username,credential:createHmac('sha1',secret).update(username).digest('base64')});
 }
 return result({iceServers});
}
