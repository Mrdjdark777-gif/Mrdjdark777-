#!/usr/bin/env node
// Возвращает обложку выпускам, которые записались до того, как live-worker
// научился её переносить. Берёт ключ из эфира с тем же id и ставит выпуску,
// предварительно убедившись, что файл на месте.
//
//   cd /opt/truethrills
//   sudo node --env-file=.env scripts/backfill-covers.mjs          # показать
//   sudo node --env-file=.env scripts/backfill-covers.mjs --apply  # применить
import Database from 'better-sqlite3';
import {stat} from 'node:fs/promises';
import path from 'node:path';

const apply = process.argv.includes('--apply');
const dbPath = path.resolve(process.env.DATABASE_PATH || 'data/truethrills.db');
const storage = path.resolve(process.env.STORAGE_DIR || 'data/storage');
const db = new Database(dbPath, {readonly: !apply, fileMustExist: true});

try{
 // Выпуски эфиров узнаются по ключу аудио; id выпуска совпадает с id эфира.
 const rows = db.prepare(`SELECT p.id, p.title, b.cover_key FROM posts p
   JOIN broadcasts b ON b.id = p.id
   WHERE p.cover_key IS NULL AND p.audio_key LIKE 'audio/live-%' AND b.cover_key IS NOT NULL`).all();
 if(!rows.length){ console.log('Выпусков без обложки, которым её можно вернуть, нет.'); process.exit(0); }
 let done = 0;
 for(const row of rows){
  try{ await stat(path.join(storage, row.cover_key)); }
  catch{ console.log(`пропуск «${row.title}»: файл ${row.cover_key} не найден в хранилище`); continue; }
  if(apply){
   db.prepare('UPDATE posts SET cover_key=? WHERE id=? AND cover_key IS NULL').run(row.cover_key, row.id);
   console.log(`обложка возвращена: «${row.title}» -> ${row.cover_key}`);
  } else console.log(`будет возвращена: «${row.title}» -> ${row.cover_key}`);
  done++;
 }
 console.log(apply ? `\nГотово: ${done}.` : `\nНайдено: ${done}. Запусти с --apply, чтобы применить.`);
}finally{ db.close(); }
