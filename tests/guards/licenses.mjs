#!/usr/bin/env node
/**
 * Опись сторонних лицензий должна совпадать с тем, что реально установлено.
 *
 * Список пакетов, который собрали один раз руками, устаревает на первом же
 * обновлении зависимости — а показывают его юристу и покупателю. Поэтому он
 * собирается скриптом, а здесь сверяется с сохранённым файлом.
 *
 * Прогон падает в двух случаях: опись разошлась с node_modules (обнови её
 * `node scripts/license-inventory.mjs --write`) или в поставке появилась
 * лицензия, которой там раньше не было, — такую нужно осознанно разобрать,
 * а не пропустить молча.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {inventory,csv} from '../scripts/license-inventory.mjs';

const root=path.resolve(import.meta.dirname,'..');
const rows=inventory();
assert.ok(rows.length>100,'опись пуста: package-lock.json не прочитан');

const saved=readFileSync(path.join(root,'docs','third-party-licenses.csv'),'utf8');
assert.equal(csv(rows),saved,'docs/third-party-licenses.csv разошёлся с package-lock.json — обнови: node scripts/license-inventory.mjs --write');

// Лицензии, уезжающие в поставку. Разрешительные вопросов не вызывают;
// всё остальное разобрано поимённо в docs/LICENSES-RU.md, и новая такая
// лицензия обязана пройти через тот же разбор, а не появиться незаметно.
const PERMISSIVE=new Set(['MIT','ISC','Apache-2.0','BSD-2-Clause','BSD-3-Clause','0BSD','BlueOak-1.0.0','CC0-1.0','Unlicense','(MIT OR WTFPL)','(BSD-2-Clause OR MIT OR Apache-2.0)']);
// Разобранные поимённо в docs/LICENSES-RU.md. Сборки sharp перечислены
// префиксом: lock содержит вариант под каждую платформу, и это одна и та же
// библиотека с одними и теми же условиями, а не десяток разных решений.
const REVIEWED=[p=>p==='mediabunny',p=>p==='caniuse-lite',p=>p.startsWith('@img/sharp-')];
const reviewed=name=>REVIEWED.some(match=>match(name));

const shipped=rows.filter(r=>r.shipped);
assert.ok(shipped.length>50,'список поставки подозрительно короткий: npm ls --omit=dev не отработал');

const unreviewed=shipped.filter(r=>!PERMISSIVE.has(r.license)&&!reviewed(r.name));
assert.deepEqual(unreviewed.map(r=>r.name+' ('+r.license+')'),[],
 'в поставке появились пакеты с неразобранной лицензией: разбери их в docs/LICENSES-RU.md и добавь сюда');

const missing=rows.filter(r=>r.license==='НЕ УКАЗАНА'&&r.shipped);
assert.deepEqual(missing.map(r=>r.name),[],'в поставке есть пакеты без указанной лицензии — так отдавать продукт нельзя');

// Имя правообладателя живёт только в документах. Автор попросил убрать его
// из продукта: из подвала сайта, из окна «О приложении» и из манифеста —
// пользователю и программисту личное имя там не нужно, а права оно не
// меняет, они держатся на LICENSE и на документах рядом с ним.
//
// Проверка двусторонняя. Документы без имени — это потеря права; имя,
// вернувшееся в код, — нарушение просьбы автора, и оба случая возвращаются
// молча: копирайт правят раз в год и не перечитывают.
const HOLDER='Dumitru Paiul';
const DOCUMENTS=[
 ['LICENSE','файл лицензии'],
 ['docs/RIGHTS-RU.md','разбор прав'],
 ['ЧИТАТЬ-ПЕРВЫМ.md','оглавление для юриста'],
];
for(const [file,what] of DOCUMENTS){
 const text=readFileSync(path.join(root,file),'utf8');
 assert.ok(text.includes(HOLDER),'правообладатель не назван: '+what+' ('+file+')');
}
const documents=new Set([...DOCUMENTS.map(([file])=>file),'tests/licenses.mjs']);
const tracked=execFileSync('git',['ls-files','-z'],{cwd:root,maxBuffer:1<<26}).toString('utf8').split('\0').filter(Boolean);
assert.ok(tracked.length>200,'список файлов проекта не прочитан: '+tracked.length);
const leaked=tracked.filter(file=>{
 if(documents.has(file))return false;
 let text;
 try{text=readFileSync(path.join(root,file));}catch{return false;}
 // Двоичные файлы не смотрим: имени в них нет, а читать их как текст незачем.
 if(text.includes(0))return false;
 return text.toString('utf8').includes(HOLDER);
});
assert.deepEqual(leaked,[],'имя правообладателя осталось за пределами документов:\n'+leaked.join('\n'));

const manifest=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8'));
assert.equal(manifest.license,'UNLICENSED','поле license в package.json должно отражать закрытую лицензию');
assert.equal(manifest.author,'True Thrills','поле author в package.json должно называть проект, а не человека');
assert.equal(manifest.private,true,'private:true защищает от случайной публикации пакета в реестр');
// Подвал переводится, а не висит по-английски в четырёхъязычном интерфейсе.
assert.ok(readFileSync(path.join(root,'app','studio.tsx'),'utf8').includes("t('footer.rights')"),
 'строка прав в подвале должна браться из словаря, а не быть зашита');

console.log('PASS: опись лицензий совпадает с package-lock.json ('+rows.length+' пакетов, из них '+shipped.length+' в поставке); неразобранных лицензий в поставке нет; имя правообладателя есть во всех документах и нигде в продукте');
