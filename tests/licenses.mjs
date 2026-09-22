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
assert.ok(rows.length>100,'опись пуста: не установлены зависимости? запусти npm ci');

const saved=readFileSync(path.join(root,'docs','third-party-licenses.csv'),'utf8');
assert.equal(csv(rows),saved,'docs/third-party-licenses.csv разошёлся с установленными пакетами — обнови: node scripts/license-inventory.mjs --write');

// Лицензии, уезжающие в поставку. Разрешительные вопросов не вызывают;
// всё остальное разобрано поимённо в docs/LICENSES-RU.md, и новая такая
// лицензия обязана пройти через тот же разбор, а не появиться незаметно.
const PERMISSIVE=new Set(['MIT','ISC','Apache-2.0','BSD-2-Clause','BSD-3-Clause','0BSD','BlueOak-1.0.0','CC0-1.0','Unlicense','(MIT OR WTFPL)','(BSD-2-Clause OR MIT OR Apache-2.0)']);
const REVIEWED=new Set(['mediabunny','@img/sharp-libvips-linux-x64','@img/sharp-libvips-linuxmusl-x64','caniuse-lite']);

const shipped=rows.filter(r=>r.shipped);
assert.ok(shipped.length>50,'список поставки подозрительно короткий: npm ls --omit=dev не отработал');

const unreviewed=shipped.filter(r=>!PERMISSIVE.has(r.license)&&!REVIEWED.has(r.name));
assert.deepEqual(unreviewed.map(r=>r.name+' ('+r.license+')'),[],
 'в поставке появились пакеты с неразобранной лицензией: разбери их в docs/LICENSES-RU.md и добавь сюда');

const missing=rows.filter(r=>r.license==='НЕ УКАЗАНА'&&r.shipped);
assert.deepEqual(missing.map(r=>r.name),[],'в поставке есть пакеты без указанной лицензии — так отдавать продукт нельзя');

console.log('PASS: опись лицензий совпадает с установленным ('+rows.length+' пакетов, из них '+shipped.length+' в поставке); неразобранных лицензий в поставке нет');
