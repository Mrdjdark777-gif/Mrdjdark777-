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

const argv = process.argv.slice(2);
const apply = argv.includes('--delete');
// Файл попадает в хранилище раньше, чем на него появляется ссылка: студия
// сначала загружает аудио и обложку, и только потом сохраняет публикацию; так
// же ведёт себя воркер, когда дописывает запись эфира. В этом промежутке файл
// выглядит ничьим. Поэтому свежие файлы не трогаем вовсе — счёт идёт на
// минуты, а порог по умолчанию сутки.
const ageArg = argv.indexOf('--min-age-hours');
const minAgeHours = ageArg === -1 ? 24 : Number(argv[ageArg + 1]);
if (!Number.isFinite(minAgeHours) || minAgeHours < 0) throw new Error('--min-age-hours expects a number of hours, zero or more.');
const minAgeMs = minAgeHours * 3600 * 1000;
const dbPath = path.resolve(process.env.DATABASE_PATH || 'data/truethrills.db');
const storage = path.resolve(process.env.STORAGE_DIR || 'data/storage');
const live = path.resolve(process.env.LIVE_DIR || 'data/live');
const db = new Database(dbPath, {readonly: !apply, fileMustExist: true});
const mb = n => (n / 1024 ** 2).toFixed(1) + ' МБ';

try {
 // --- 1. Мёртвые эфиры и их записи ------------------------------------------
 // Каждый эфир — это строка broadcasts и, если его писали, строка
 // live_recordings с тем же id. Пробный эфир может остаться и без записи,
 // поэтому идём от broadcasts и подтягиваем запись к нему.
 const airs = db.prepare(`
   SELECT b.id, b.title, b.active, r.state, r.post_id AS postId
   FROM broadcasts b LEFT JOIN live_recordings r ON r.id = b.id
   UNION
   SELECT r.id, r.title, 0 AS active, r.state, r.post_id AS postId
   FROM live_recordings r WHERE r.id NOT IN (SELECT id FROM broadcasts)
 `).all();
 const posts = new Set(db.prepare('SELECT id FROM posts').all().map(p => p.id));
 const dead = [];
 for (const row of airs) {
  if (row.active) continue;                       // эфир идёт прямо сейчас
  if (row.state === 'receiving' || row.state === 'closing' || row.state === 'processing') continue;
  if (row.postId && posts.has(row.postId)) continue; // выпуск на месте
  try { await access(path.join(live, row.id)); continue; } catch { /* каталога нет */ }
  dead.push(row);
 }
 const doomed = new Set(dead.map(r => r.id));
 console.log(`Эфиры и их записи: всего ${airs.length}, без выпуска и файлов ${dead.length}.`);
 for (const row of dead) console.log(`  - «${row.title}» ${row.state ?? 'без записи'} ${row.id}`);

 // --- 2. Файлы, на которые никто не ссылается -------------------------------
 // Обложка эфира, который удаляется здесь же, тоже становится ничьей — иначе
 // пришлось бы гонять скрипт дважды.
 const used = new Set();
 for (const p of db.prepare('SELECT audio_key, cover_key FROM posts').all()) {
  if (p.audio_key) used.add(p.audio_key);
  if (p.cover_key) used.add(p.cover_key);
 }
 for (const b of db.prepare('SELECT id, cover_key FROM broadcasts').all()) if (b.cover_key && !doomed.has(b.id)) used.add(b.cover_key);
 const art = db.prepare("SELECT value FROM settings WHERE key = 'channelArt'").get();
 if (art?.value) used.add(art.value);

 // Пока эфир принимается или обрабатывается, воркер вот-вот положит в
 // хранилище готовую запись. Файлы в это время не трогаем совсем.
 const busy = db.prepare("SELECT COUNT(*) AS n FROM live_recordings WHERE state IN ('receiving','closing','processing')").get().n;
 const orphans = [];
 let young = 0;
 if (!busy) for (const folder of ['audio', 'cover']) {
  let names;
  try { names = await readdir(path.join(storage, folder)); } catch { continue; }
  for (const name of names) {
   if (name.endsWith('.meta.json')) continue;
   const key = folder + '/' + name;
   if (used.has(key)) continue;
   const info = await stat(path.join(storage, folder, name));
   if (Date.now() - info.mtimeMs < minAgeMs) { young++; continue; }
   orphans.push({key, size: info.size});
  }
 }
 const freed = orphans.reduce((sum, o) => sum + o.size, 0);
 if (busy) console.log(`\nФайлы в хранилище: идёт эфир или обработка записи — не трогаем ни одного файла.`);
 else {
  console.log(`\nФайлы в хранилище: используются ${used.size}, ничьих ${orphans.length} на ${mb(freed)}.`);
  if (young) console.log(`  Свежих файлов пропущено: ${young} (моложе ${minAgeHours} ч — возможно, публикация ещё сохраняется).`);
 }
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
  // Ссылки перечитываются перед самым удалением: пока шёл отчёт, публикация
  // могла сохраниться, и файл уже не ничей.
  const linked = new Set();
  for (const row of db.prepare('SELECT audio_key, cover_key FROM posts').all()) {
   if (row.audio_key) linked.add(row.audio_key);
   if (row.cover_key) linked.add(row.cover_key);
  }
  for (const row of db.prepare('SELECT cover_key FROM broadcasts').all()) if (row.cover_key) linked.add(row.cover_key);
  const fresh = db.prepare("SELECT value FROM settings WHERE key = 'channelArt'").get();
  if (fresh?.value) linked.add(fresh.value);
  let removed = 0, spared = 0, freedNow = 0;
  for (const o of orphans) {
   if (linked.has(o.key)) { spared++; continue; }
   await rm(path.join(storage, o.key), {force: true});
   await rm(path.join(storage, o.key + '.meta.json'), {force: true});
   removed++; freedNow += o.size;
  }
  // Кэш формы звука живёт ровно столько, сколько сам файл: строка без файла
  // никому не нужна, но удалять её можно только здесь, после самой уборки.
  const peaks = db.prepare(`DELETE FROM audio_peaks WHERE audio_key NOT IN (SELECT audio_key FROM posts WHERE audio_key IS NOT NULL)`).run().changes;
  console.log(`\nУдалено эфиров: ${dead.length}, файлов: ${removed}, освобождено ${mb(freedNow)}.`);
  if (peaks) console.log(`Кэш формы звука без файла: удалено строк ${peaks}.`);
  if (spared) console.log(`На ${spared} файл(ов) ссылка появилась, пока шла уборка — оставлены.`);
 }
} finally { db.close(); }
