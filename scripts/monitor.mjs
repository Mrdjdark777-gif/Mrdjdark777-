#!/usr/bin/env node
import {statfs,mkdir,writeFile,readdir,stat} from 'node:fs/promises';
import tls from 'node:tls';
const issues=[],base=new URL(process.env.PUBLIC_SITE_URL||'https://truethrills.com');
try{const r=await fetch(new URL('/api/health',base),{signal:AbortSignal.timeout(10000),redirect:'error'});if(!r.ok||!(await r.json()).ok)issues.push('Application health check failed');}catch{issues.push('Application unreachable');}
try{const fs=await statfs(process.env.STORAGE_DIR||'data');if(fs.bavail*fs.bsize<1024**3)issues.push('Less than 1 GiB free disk');}catch{issues.push('Cannot check disk');}
try{const days=await new Promise((resolve,reject)=>{const s=tls.connect({host:base.hostname,port:443,servername:base.hostname,rejectUnauthorized:true},()=>{const expiry=Date.parse(s.getPeerCertificate().valid_to);s.end();if(!Number.isFinite(expiry))reject(new Error('No certificate'));else resolve((expiry-Date.now())/86400000);});s.setTimeout(10000,()=>s.destroy(new Error('TLS timeout')));s.on('error',reject);});if(days<14)issues.push('TLS certificate expires in less than 14 days');}catch{issues.push('TLS verification failed');}
try{const root='/var/backups/truethrills',entries=await readdir(root),dates=await Promise.all(entries.filter(n=>n.startsWith('TrueThrills-')).map(async n=>{try{return (await stat(root+'/'+n+'/VERIFIED.json')).mtimeMs;}catch{return 0;}}));if(!dates.length||Date.now()-Math.max(...dates)>36*3600000)issues.push('No verified backup in 36 hours');}catch{issues.push('Backup directory unavailable');}
await mkdir('data/operations',{recursive:true,mode:0o700});
const report={checkedAt:new Date().toISOString(),ok:!issues.length,issues};await writeFile('data/operations/health.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));process.exitCode=issues.length?1:0;
