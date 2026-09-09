#!/usr/bin/env node
import {statfs,mkdir,writeFile,readdir,stat,readFile} from 'node:fs/promises';
import tls from 'node:tls';
const issues=[],base=new URL(process.env.PUBLIC_SITE_URL||'https://truethrills.com');
try{const r=await fetch(new URL('/api/health',base),{signal:AbortSignal.timeout(10000),redirect:'error'});if(!r.ok||!(await r.json()).ok)issues.push('Application health check failed');}catch{issues.push('Application unreachable');}
try{const fs=await statfs(process.env.STORAGE_DIR||'data');if(fs.bavail*fs.bsize<1024**3)issues.push('Less than 1 GiB free disk');}catch{issues.push('Cannot check disk');}
try{const days=await new Promise((resolve,reject)=>{const s=tls.connect({host:base.hostname,port:443,servername:base.hostname,rejectUnauthorized:true},()=>{const expiry=Date.parse(s.getPeerCertificate().valid_to);s.end();if(!Number.isFinite(expiry))reject(new Error('No certificate'));else resolve((expiry-Date.now())/86400000);});s.setTimeout(10000,()=>s.destroy(new Error('TLS timeout')));s.on('error',reject);});if(days<14)issues.push('TLS certificate expires in less than 14 days');}catch{issues.push('TLS verification failed');}
try{const root='/var/backups/truethrills',entries=await readdir(root),dates=await Promise.all(entries.filter(n=>n.startsWith('TrueThrills-')).map(async n=>{try{return (await stat(root+'/'+n+'/VERIFIED.json')).mtimeMs;}catch{return 0;}}));if(!dates.length||Date.now()-Math.max(...dates)>36*3600000)issues.push('No verified backup in 36 hours');}catch{issues.push('Backup directory unavailable');}
if(process.env.LIVE_ENABLED==='true'){try{const h=JSON.parse(await readFile((process.env.LIVE_DIR||'data/live')+'/worker.json','utf8'));if(Date.now()-h.at>20000)issues.push('Live recording worker stopped');}catch{issues.push('Live recording worker unavailable');}}
await mkdir('data/operations',{recursive:true,mode:0o700});
const report={checkedAt:new Date().toISOString(),ok:!issues.length,issues};await writeFile('data/operations/health.json',JSON.stringify(report,null,2),{mode:0o600});if(process.env.MONITOR_WEBHOOK_URL){
 const url=new URL(process.env.MONITOR_WEBHOOK_URL);if(url.protocol!=='https:')throw new Error('Monitor webhook must use HTTPS');
 let previous={};try{previous=JSON.parse(await readFile('data/operations/last-alert.json','utf8'));}catch{}
 const signature=JSON.stringify(issues);
 if(previous.signature!==signature||(!report.ok&&Date.now()-(previous.at||0)>3600000)){
  try{const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(report),signal:AbortSignal.timeout(10000),redirect:'error'});if(!response.ok)throw new Error('Alert delivery failed');await writeFile('data/operations/last-alert.json',JSON.stringify({signature,at:Date.now()}),{mode:0o600});}catch{console.error('Monitor alert could not be delivered');}
 }
}
console.log(JSON.stringify(report));process.exitCode=issues.length?1:0;
