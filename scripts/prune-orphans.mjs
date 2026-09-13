#!/usr/bin/env node
// Убирает два вида хвостов, которые накапливаются от проб и удалённых выпусков:
//
//  1. Записи эфиров (live_recordings) и сами эфиры (broadcasts), от которых уже
//     ничего не осталось: выпуск удалён, каталог с нарезкой убран, эфир не идёт.
//     Такие строки только засоряют список «Записи эфиров» в студии на ПК.
//  2. Файлы в хранилище, на которые не ссылается ни один выпуск, ни обложка
//     эфира, ни оформление канала.
//
//   sudo node --env-file=.env scripts/prune-orphans.mjs            # показать
//   sudo node --env-file=.env scripts/prune-orphans.mjs --delete   # удалить
//
// Ничего не удаляется, пока нужное кем-то используется: строка с живым выпуском,
// активный эфир и каталог с файлами на диске остаются нетронутыми.
import Database from 'better-sqlite3';
import {readdir, stat, rm, access} from 'node:fs/promises';
import path from 'node:path';

const apply = process.argv.includes('--delete');
const dbPath = path.resolve(process.env.DATABASE_PATH || 'data/truethrills.db');
const storage = path.resolve(process.env.STORAGE_DIR || 'data/storage');
const live = path.resolve(process.env.LIVE_DIR || 'data/live');
const db = new Database(dbPath, {readonly: !apply, fileMustExist: true});
const mb = n => (n / 1024 ** 2).toFixed(1) + ' МБ';

try {
 // --- 1. Мёртвые записи эфиров ---------------------------------------------
 const recordings = db.prepare(`
   SELECT r.id, r.title, r.state, r.post_id AS postId, b.active AS active
   FROM live_recordings r LEFT JOIN broadcasts b ON b.id = r.id
 `).all();
 const posts = new Set(db.prepare('SELECT id FROM posts').all().map(p => p.id));
 const dead = [];
 for (const row of recordings) {
  if (row.active) continue;                       // эфир идёт прямо сейчас
  if (row.state === 'receiving' || row.state === 'closing' || row.state === 'processing') continue;
  if (row.postId && posts.has(row.postId)) continue; // выпуск на месте
  try { await access(path.join(live, row.id)); continue; } catch { /* каталога нет */ }
  dead.push(row);
 }
 console.log(`Записи эфиров: всего ${recordings.length}, без выпуска и файлов ${dead.length}.`);
 for (const row of dead) console.log(`  - «${row.title}» ${row.state} ${row.id}`);

 // --- 2. Файлы, на которые никто не ссылается -------------------------------
 const used = new Set();
 for (const p of db.prepare('SELECT audio_key, cover_key FROM posts').all()) {
  if (p.audio_key) used.add(p.audio_key);
  if (p.cover_key) used.add(p.cover_key);
 }
 for (const b of db.prepare('SELECT cover_key FROM broadcasts').all()) if (b.cover_key) used.add(b.cover_key);
 const art = db.prepare("SELECT value FROM settings WHERE key = 'channelArt'").get();
 if (art?.value) used.add(art.value);

 const orphans = [];
 for (const folder of ['audio', 'cover']) {
  let names;
  try { names = await readdir(path.join(storage, folder)); } catch { continue; }
  for (const name of names) {
   if (name.endsWith('.meta.json')) continue;
   const key = folder + '/' + name;
   if (used.has(key)) continue;
   orphans.push({key, size: (await stat(path.join(storage, folder, name))).size});
  }
 }
 const freed = orphans.reduce((sum, o) => sum + o.size, 0);
 console.log(`\nФайлы в хранилище: используются ${used.size}, ничьих ${orphans.length} на ${mb(freed)}.`);
 for (const o of orphans) console.log(`  - ${o.key} ${mb(o.size)}`);

 if (!apply) {
  console.log(dead.length || orphans.length ? '\nЭто был отчёт. Запусти с --delete, чтобы удалить перечисленное.' : '\nУдалять нечего.');
 } else {
  const removeRow = db.transaction(ids => {
   for (const id of ids) {
    db.prepare('DELETE FROM live_recordings WHERE id = ?').run(id);
    db.prepare('DELETE FROM broadcasts WHERE id = ?').run(id);
    db.prepare('DELETE FROM peers WHERE broadcast_id = ?').run(id);
   }
  });
  removeRow(dead.map(r => r.id));
  for (const o of orphans) {
   await rm(path.join(storage, o.key), {force: true});
   await rm(path.join(storage, o.key + '.meta.json'), {force: true});
  }
  console.log(`\nУдалено записей эфиров: ${dead.length}, файлов: ${orphans.length}, освобождено ${mb(freed)}.`);
 }
} finally { db.close(); }
