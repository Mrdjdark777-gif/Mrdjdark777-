#!/usr/bin/env node
/**
 * Опись сторонних пакетов и их лицензий.
 *
 * Нужна не для красоты: юристу и покупателю важно знать, что именно уезжает
 * вместе с продуктом и на каких условиях.
 *
 * Источник — package-lock.json, а не node_modules. Разница не косметическая:
 * опись, собранная из установленного каталога, зафиксировала 43 версии,
 * которых нет в lock, и пакет playwright, поставленный когда-то с --no-save.
 * Lock — это то, что действительно приедет к другому человеку по npm ci.
 * tests/licenses.mjs роняет прогон, если опись разошлась с lock.
 *
 * Колонка «поставка» отделяет то, что уходит на сервер и в приложение, от
 * инструментов разработки: к ним требования лицензий другие, потому что их
 * никому не передают.
 *
 *   node scripts/license-inventory.mjs            # напечатать
 *   node scripts/license-inventory.mjs --write    # обновить docs/third-party-licenses.csv
 */
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');

/** Все пакеты из lock-файла: именно они приедут по npm ci. */
export function packagesFromLock(){
 const lock=JSON.parse(readFileSync(path.join(root,'package-lock.json'),'utf8'));
 const found=new Map();
 for(const [key,meta] of Object.entries(lock.packages??{})){
  if(!key.startsWith('node_modules/'))continue;
  // Вложенные копии записаны как a/node_modules/b — имя это последний отрезок.
  const name=key.slice(key.lastIndexOf('node_modules/')+'node_modules/'.length);
  if(!meta.version)continue;
  found.set(name+'@'+meta.version,typeof meta.license==='string'?meta.license
   :Array.isArray(meta.license)?meta.license.join(' OR '):'НЕ УКАЗАНА');
 }
 return found;
}

/** Имена пакетов без dev:true — то, что уезжает на сервер и в приложение. */
export function shipped(){
 const lock=JSON.parse(readFileSync(path.join(root,'package-lock.json'),'utf8'));
 const names=new Set();
 for(const [key,meta] of Object.entries(lock.packages??{})){
  if(!key.startsWith('node_modules/'))continue;
  if(meta.dev||meta.devOptional)continue;
  names.add(key.slice(key.lastIndexOf('node_modules/')+'node_modules/'.length));
 }
 return names;
}

export function inventory(){
 const all=packagesFromLock(),prod=shipped();
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
