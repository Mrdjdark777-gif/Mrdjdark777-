#!/usr/bin/env node
import {statfs,mkdir,writeFile,readdir,stat,readFile,rm} from 'node:fs/promises';
import tls from 'node:tls';
import {account,human,transmittedBytes} from './traffic.mjs';
import {notify} from './notify.mjs';
const issues=[],base=new URL(process.env.PUBLIC_SITE_URL||'https://truethrills.com');
try{const r=await fetch(new URL('/api/health',base),{signal:AbortSignal.timeout(10000),redirect:'error'});if(!r.ok||!(await r.json()).ok)issues.push('Application health check failed');}catch{issues.push('Application unreachable');}
try{const fs=await statfs(process.env.STORAGE_DIR||'data');if(fs.bavail*fs.bsize<1024**3)issues.push('Less than 1 GiB free disk');}catch{issues.push('Cannot check disk');}
try{const days=await new Promise((resolve,reject)=>{const s=tls.connect({host:base.hostname,port:443,servername:base.hostname,rejectUnauthorized:true},()=>{const expiry=Date.parse(s.getPeerCertificate().valid_to);s.end();if(!Number.isFinite(expiry))reject(new Error('No certificate'));else resolve((expiry-Date.now())/86400000);});s.setTimeout(10000,()=>s.destroy(new Error('TLS timeout')));s.on('error',reject);});if(days<14)issues.push('TLS certificate expires in less than 14 days');}catch{issues.push('TLS verification failed');}
try{const root='/var/backups/truethrills',entries=await readdir(root),dates=await Promise.all(entries.filter(n=>n.startsWith('TrueThrills-')).map(async n=>{try{return (await stat(root+'/'+n+'/VERIFIED.json')).mtimeMs;}catch{return 0;}}));if(!dates.length||Date.now()-Math.max(...dates)>36*3600000)issues.push('No verified backup in 36 hours');}catch{issues.push('Backup directory unavailable');}
if(process.env.LIVE_ENABLED==='true'){try{const h=JSON.parse(await readFile((process.env.LIVE_DIR||'data/live')+'/worker.json','utf8'));if(Date.now()-h.at>20000)issues.push('Live recording worker stopped');}catch{issues.push('Live recording worker unavailable');}}
await mkdir('data/operations',{recursive:true,mode:0o700});
// Трафик за месяц (server/traffic.mjs): предупреждения на 50 и 80 %, на
// пределе — флаг data/operations/traffic-stop, по которому приложение
// перестаёт отдавать слушателям звук и эфир до начала следующего месяца.
// Предел — TRAFFIC_MONTH_LIMIT_GB в .env, по умолчанию 8000 ГБ: это 80 %
// бесплатных 10 ТБ Oracle, с запасом на всё, что сервер шлёт кроме выпусков.
const notices=[];
try{
 const limit=(Number(process.env.TRAFFIC_MONTH_LIMIT_GB)>0?Number(process.env.TRAFFIC_MONTH_LIMIT_GB):8000)*1e9;
 let state=null;try{state=JSON.parse(await readFile('data/operations/traffic.json','utf8'));}catch{}
 const r=account(state,transmittedBytes(await readFile('/proc/net/dev','utf8')),Date.now(),limit);
 await writeFile('data/operations/traffic.json',JSON.stringify(r.state),{mode:0o600});
 const line=`Трафик за ${r.state.month}: ${human(r.used)} из ${human(limit)}`;
 if(r.level==='stop')await writeFile('data/operations/traffic-stop',JSON.stringify({month:r.state.month,used:r.used,limit}),{mode:0o644});
 else await rm('data/operations/traffic-stop',{force:true});
 // О каждом уровне — один раз за месяц, а не каждый час до конца месяца.
 if(r.notify==='half')notices.push(line+' — половина предела');
 if(r.notify==='warn')notices.push(line+' — больше 80 % предела');
 if(r.notify==='stop')notices.push(line+' — предел достигнут: звук и эфир для слушателей остановлены до 1-го числа. Поднять предел — TRAFFIC_MONTH_LIMIT_GB в .env');
}catch{issues.push('Cannot count traffic');}
const report={checkedAt:new Date().toISOString(),ok:!issues.length,issues};await writeFile('data/operations/health.json',JSON.stringify(report,null,2),{mode:0o600});
// Уведомления: при каждом изменении списка бед, раз в час — пока беда не
// прошла, и одно «всё снова в порядке», когда прошла.
let previous={};try{previous=JSON.parse(await readFile('data/operations/last-alert.json','utf8'));}catch{}
const signature=JSON.stringify(issues);
const changed=previous.signature!==signature;
const recovered=changed&&!issues.length&&!!previous.signature&&previous.signature!=='[]';
const hourly=!report.ok&&Date.now()-(previous.at||0)>3600000;
if((changed&&issues.length)||recovered||hourly||notices.length){
 const parts=[...issues.map(i=>'⚠️ '+i),...notices.map(n=>'📶 '+n)];
 const text='True Thrills\n'+(parts.length?parts.join('\n'):'✅ всё снова в порядке');
 const failed=await notify(text,report);
 if(!failed.length)await writeFile('data/operations/last-alert.json',JSON.stringify({signature,at:Date.now()}),{mode:0o600});
 else console.error('Alert delivery failed: '+failed.join(', '));
}
console.log(JSON.stringify(report));process.exitCode=issues.length?1:0;
