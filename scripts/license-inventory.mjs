#!/usr/bin/env node
/**
 * Опись сторонних пакетов и их лицензий.
 *
 * Нужна не для красоты: юристу и покупателю важно знать, что именно уезжает
 * вместе с продуктом и на каких условиях. Руками такой список устаревает за
 * неделю, поэтому он собирается из node_modules, а tests/licenses.mjs роняет
 * прогон, если сохранённая опись разошлась с установленными пакетами.
 *
 * Колонка «поставка» отделяет то, что уходит на сервер и в приложение, от
 * инструментов разработки: к ним требования лицензий другие, потому что их
 * никому не передают.
 *
 *   node scripts/license-inventory.mjs            # напечатать
 *   node scripts/license-inventory.mjs --write    # обновить docs/third-party-licenses.csv
 */
import {readFileSync,readdirSync,existsSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');

function licenseOf(p){
 if(typeof p.license==='string')return p.license;
 if(p.license&&typeof p.license.type==='string')return p.license.type;
 if(Array.isArray(p.licenses))return p.licenses.map(l=>l.type||l).join(' OR ');
 return 'НЕ УКАЗАНА';
}

/** Все установленные пакеты, включая вложенные копии разных версий. */
export function installed(){
 const found=new Map();
 const walk=dir=>{
  let entries;try{entries=readdirSync(dir,{withFileTypes:true});}catch{return;}
  for(const entry of entries){
   if(!entry.isDirectory())continue;
   const full=path.join(dir,entry.name);
   if(entry.name.startsWith('@')){walk(full);continue;}
   const manifest=path.join(full,'package.json');
   if(existsSync(manifest)){
    try{const p=JSON.parse(readFileSync(manifest,'utf8'));
     if(p.name&&p.version)found.set(p.name+'@'+p.version,licenseOf(p));}catch{}
   }
   const nested=path.join(full,'node_modules');
   if(existsSync(nested))walk(nested);
  }
 };
 walk(path.join(root,'node_modules'));
 return found;
}

/** Имена пакетов, которые остаются после npm ci --omit=dev, то есть уезжают в поставку. */
export function shipped(){
 try{
  const out=execFileSync('npm',['ls','--omit=dev','--all','--parseable'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']});
  return new Set(out.split('\n').filter(Boolean).map(line=>line.split('node_modules/').pop()).filter(Boolean));
 }catch{return new Set();}
}

export function inventory(){
 const all=installed(),prod=shipped();
 return [...all].map(([id,license])=>{
  const name=id.slice(0,id.lastIndexOf('@'));
  return {name,version:id.slice(id.lastIndexOf('@')+1),license,shipped:prod.has(name)};
 }).sort((a,b)=>a.name.localeCompare(b.name)||a.version.localeCompare(b.version));
}

export function csv(rows){
 const cell=v=>/[",\n]/.test(String(v))?'"'+String(v).replaceAll('"','""')+'"':String(v);
 return ['пакет,версия,лицензия,поставка',
  ...rows.map(r=>[r.name,r.version,r.license,r.shipped?'да':'нет'].map(cell).join(','))].join('\n')+'\n';
}

if(process.argv[1]&&process.argv[1].endsWith('license-inventory.mjs')){
 const rows=inventory(),text=csv(rows);
 const target=path.join(root,'docs','third-party-licenses.csv');
 if(process.argv.includes('--write')){writeFileSync(target,text);console.log('Записано: docs/third-party-licenses.csv, пакетов '+rows.length);}
 else{
  const byLicense={};for(const r of rows)byLicense[r.license]=(byLicense[r.license]||0)+1;
  console.log('Пакетов: '+rows.length+', из них в поставке '+rows.filter(r=>r.shipped).length);
  for(const [l,n] of Object.entries(byLicense).sort((a,b)=>b[1]-a[1]))console.log(String(n).padStart(5)+'  '+l);
 }
}
