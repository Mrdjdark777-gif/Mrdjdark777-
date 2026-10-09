#!/usr/bin/env node
/**
 * Дописывает sha256 в сидекары файлов, загруженных до того, как контрольные
 * суммы появились. Без этого проверка бэкапа сверяет у них только размер и
 * честно об этом говорит — но говорит она это про каждую копию, вечно.
 *
 * Сумма считается по файлу, который лежит на диске сейчас. Это не проверка
 * того, что он цел, — это точка отсчёта: с этого момента повреждение при
 * копировании станет видно.
 *
 * По умолчанию только отчёт. Запись — с --apply.
 */
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {readdir, readFile, rename, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';

const apply = process.argv.includes('--apply');
const storage = path.resolve(process.env.STORAGE_DIR || 'data/storage');
const sha256 = async (file) => {
 const hash = createHash('sha256');
 for await (const chunk of createReadStream(file)) hash.update(chunk);
 return hash.digest('hex');
};

let had = 0, added = 0, skipped = 0;
for (const folder of ['audio', 'cover']) {
 let names;
 try { names = await readdir(path.join(storage, folder)); } catch { continue; }
 for (const name of names) {
  if (name.endsWith('.meta.json')) continue;
  const file = path.join(storage, folder, name), meta = file + '.meta.json';
  let data;
  try { data = JSON.parse(await readFile(meta, 'utf8')); } catch { skipped++; console.log(`  ? ${folder}/${name} — сидекара нет или он нечитаем, пропущен`); continue; }
  if (data.sha256) { had++; continue; }
  const info = await stat(file);
  if (data.size !== info.size) { skipped++; console.log(`  ! ${folder}/${name} — размер в сидекаре ${data.size}, на диске ${info.size}; сумму не пишем, разберитесь сначала`); continue; }
  const digest = await sha256(file);
  added++;
  console.log(`  + ${folder}/${name} ${digest.slice(0, 12)}…`);
  if (apply) {
   const next = {...data, sha256: digest, etag: digest};
   const tmp = meta + '.tmp';
   await writeFile(tmp, JSON.stringify(next), {mode: 0o600});
   await rename(tmp, meta);
  }
 }
}
console.log(`\nС суммой уже было: ${had}. ${apply ? 'Дописано' : 'К дописыванию'}: ${added}. Пропущено: ${skipped}.`);
if (!apply && added) console.log('Это был отчёт. Записать: node --env-file=.env scripts/checksum-storage.mjs --apply');
