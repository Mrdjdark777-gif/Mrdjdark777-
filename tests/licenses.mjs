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

// Правообладатель назван в трёх местах, и разойтись они не должны: файл
// лицензии, манифест и окно «О приложении» в студии на ПК. Последнее —
// нативный код, и про него забывают первым. В подвале сайта имени больше
// нет: автор убрал его намеренно, права это не меняет.
const HOLDER='Dumitru Paiul';
const places=[
 ['LICENSE','файл лицензии'],
 ['package.json','манифест проекта'],
 ['desktop/client.cpp','окно «О приложении» в студии на ПК'],
];
const footer=readFileSync(path.join(root,'app','studio.tsx'),'utf8');
assert.ok(!footer.includes(HOLDER),'имя правообладателя вернулось в подвал сайта — его убрали намеренно');
for(const [file,what] of places){
 const text=readFileSync(path.join(root,file),'utf8');
 assert.ok(text.includes(HOLDER),'правообладатель не назван: '+what+' ('+file+')');
}
const manifest=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8'));
assert.equal(manifest.license,'UNLICENSED','поле license в package.json должно отражать закрытую лицензию');
assert.equal(manifest.author,HOLDER,'поле author в package.json разошлось с правообладателем');
assert.equal(manifest.private,true,'private:true защищает от случайной публикации пакета в реестр');
// Подвал переводится, а не висит по-английски в четырёхъязычном интерфейсе.
assert.ok(readFileSync(path.join(root,'app','studio.tsx'),'utf8').includes("t('footer.rights')"),
 'строка прав в подвале должна браться из словаря, а не быть зашита');

console.log('PASS: опись лицензий совпадает с package-lock.json ('+rows.length+' пакетов, из них '+shipped.length+' в поставке); неразобранных лицензий в поставке нет; правообладатель назван во всех трёх местах, а в подвале сайта его нет');
