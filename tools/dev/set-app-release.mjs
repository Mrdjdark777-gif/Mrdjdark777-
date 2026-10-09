#!/usr/bin/env node
/**
 * Кладёт сведения о новом APK в lib/app-release.ts: версия, код версии,
 * адрес, размер, сумма и дата — все поля разом, как требует
 * tests/unit/app-release.mjs. Запускается сборкой Android на GitHub, когда её
 * попросили выложить APK на сайт (android-build.yml, publish=true).
 *
 *   node tools/dev/set-app-release.mjs 0.9.4 24 public/app/TrueThrills-0.9.4.apk
 */
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';

const [version,code,file]=process.argv.slice(2);
if(!/^\d+\.\d+\.\d+$/.test(version||'')||!/^\d+$/.test(code||'')||!file)throw new Error('usage: set-app-release.mjs <version> <versionCode> <public/app/…apk>');
const rel=path.relative('public',file).split(path.sep).join('/');
if(rel.startsWith('..')||!/^app\/[\w.-]+\.apk$/.test(rel))throw new Error('APK должен лежать в public/app: '+file);
const bytes=await readFile(file);
const fields={version:`'${version}'`,versionCode:code,href:`'/${rel}'`,bytes:String(bytes.length),
 sha256:`'${createHash('sha256').update(bytes).digest('hex')}'`,builtAt:`'${new Date().toISOString().slice(0,10)}'`};
const target='lib/app-release.ts';let src=await readFile(target,'utf8');
for(const [k,v] of Object.entries(fields)){
 const re=new RegExp('^( '+k+':)[^,\\n]*,','m');
 if(!re.test(src))throw new Error('в '+target+' нет поля '+k);
 src=src.replace(re,'$1'+v+',');
}
await writeFile(target,src);
console.log('lib/app-release.ts →',JSON.stringify(fields));
