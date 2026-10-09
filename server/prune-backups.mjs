#!/usr/bin/env node
// Оставляет последние N проверенных копий в /var/backups/truethrills, остальные
// удаляет. Копия считается проверенной, только если в её каталоге есть
// VERIFIED.json — незавершённые и повреждённые копии не считаются и не
// удаляются: с ними разбирается человек.
//
//   node scripts/prune-backups.mjs              # показать, что будет удалено
//   node scripts/prune-backups.mjs --delete     # удалить
//   node scripts/prune-backups.mjs --keep 3     # оставить три вместо пяти
//
// Ротацию можно включать только тогда, когда копия лежит ещё и вне сервера:
// иначе уборка уменьшает и без того единственный экземпляр данных.
import {readdir, stat, rm, access} from 'node:fs/promises';
import path from 'node:path';

const argv = process.argv.slice(2);
const apply = argv.includes('--delete');
const keepArg = argv.indexOf('--keep');
const keep = keepArg === -1 ? 5 : Number(argv[keepArg + 1]);
if (!Number.isInteger(keep) || keep < 1) throw new Error('--keep expects a whole number of copies to keep, at least 1.');
const rootArg = argv.indexOf('--root');
const root = rootArg === -1 ? '/var/backups/truethrills' : argv[rootArg + 1];

const verified = [];
const skipped = [];
for (const name of await readdir(root)) {
 if (!name.startsWith('TrueThrills-')) continue;
 const dir = path.join(root, name);
 if (!(await stat(dir)).isDirectory()) continue;
 try { await access(path.join(dir, 'VERIFIED.json')); verified.push(name); }
 catch { skipped.push(name); }
}
// Имя содержит время в ISO, поэтому обычная сортировка строк уже даёт порядок
// от старых к новым.
verified.sort();
const doomed = verified.slice(0, Math.max(0, verified.length - keep));

async function size(dir){
 let total = 0;
 for (const entry of await readdir(dir, {withFileTypes: true, recursive: true})) {
  if (!entry.isFile()) continue;
  total += (await stat(path.join(entry.parentPath ?? entry.path, entry.name))).size;
 }
 return total;
}

let freed = 0;
for (const name of doomed) {
 const dir = path.join(root, name);
 freed += await size(dir);
 if (apply) await rm(dir, {recursive: true, force: true});
}
const mb = n => (n / 1024 / 1024).toFixed(1) + ' МБ';
console.log(`Проверенных копий: ${verified.length}. Оставляем последние ${Math.min(keep, verified.length)}.`);
if (skipped.length) console.log(`Не тронуты (нет VERIFIED.json): ${skipped.join(', ')}`);
if (!doomed.length) console.log('Удалять нечего.');
else console.log(apply
 ? `Удалено копий: ${doomed.length}, освобождено ${mb(freed)}.`
 : `К удалению ${doomed.length} копий, освободится ${mb(freed)}. Запусти с --delete, чтобы удалить.`);
