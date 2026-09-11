#!/usr/bin/env node
// Что на самом деле лежит в живой базе и в хранилище. Только чтение, ничего не
// меняет. Нужен, когда бэкап и приложение показывают разное.
//
//   cd /opt/truethrills
//   sudo node --env-file=.env scripts/data-status.mjs
import Database from 'better-sqlite3';
import {readdir, stat} from 'node:fs/promises';
import path from 'node:path';

const dbPath = path.resolve(process.env.DATABASE_PATH || 'data/truethrills.db');
const storage = path.resolve(process.env.STORAGE_DIR || 'data/storage');
const live = path.resolve(process.env.LIVE_DIR || 'data/live');
console.log('база     :', dbPath);
console.log('хранилище:', storage);
console.log('эфиры    :', live);

async function count(dir){
 try{
  const files = (await readdir(dir)).filter(f => !f.endsWith('.meta.json'));
  let bytes = 0;
  for(const f of files) bytes += (await stat(path.join(dir, f))).size;
  return `${files.length} шт., ${(bytes / 1024 ** 2).toFixed(1)} МБ`;
 }catch(e){ return e.code === 'ENOENT' ? 'нет каталога' : 'ошибка: ' + e.code; }
}

const db = new Database(dbPath, {readonly: true, fileMustExist: true});
try{
 const posts = db.prepare('SELECT id,kind,title,audio_key,cover_key,published FROM posts ORDER BY created_at').all();
 console.log('\nпубликаций в базе:', posts.length);
 for(const p of posts){
  console.log(` - ${p.kind.padEnd(7)} «${p.title}» аудио=${p.audio_key || 'НЕТ'} обложка=${p.cover_key || 'нет'} ${p.published ? 'опубликовано' : 'черновик'}`);
 }
 const withAudio = posts.filter(p => p.audio_key).length;
 console.log('из них со звуком:', withAudio);
 const rec = db.prepare('SELECT state, COUNT(*) AS n FROM live_recordings GROUP BY state').all();
 console.log('записи эфиров   :', rec.length ? rec.map(r => `${r.state}=${r.n}`).join(', ') : 'нет');
 console.log('\nfiles storage/audio:', await count(path.join(storage, 'audio')));
 console.log('files storage/cover:', await count(path.join(storage, 'cover')));
 if(withAudio === 0 && posts.length > 0) console.log('\nВНИМАНИЕ: публикации есть, но ни у одной нет ключа аудио.');
}finally{ db.close(); }
