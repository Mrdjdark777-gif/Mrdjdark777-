#!/usr/bin/env node
// Разовая уборка того, что осталось от эфиров, записанных до появления
// автоматической уборки в live-worker.mjs. Удаляет каталог эфира только если
// выпуск уже готов (state='ready') и его аудио лежит в хранилище — то есть
// удалять нечего, кроме кусков от студии и нарезки HLS.
//
//   node --env-file=.env scripts/prune-live.mjs          # показать, что будет удалено
//   node --env-file=.env scripts/prune-live.mjs --delete # удалить
import Database from 'better-sqlite3';
import {readdir, stat, rm} from 'node:fs/promises';
import path from 'node:path';

const apply = process.argv.includes('--delete');
const root = path.resolve(process.env.LIVE_DIR || 'data/live');
const storage = path.resolve(process.env.STORAGE_DIR || 'data/storage');
const db = new Database(process.env.DATABASE_PATH || 'data/truethrills.db', {readonly: true});

async function size(dir){
 let total = 0;
 for(const entry of await readdir(dir, {withFileTypes: true, recursive: true})){
  if(!entry.isFile()) continue;
  total += (await stat(path.join(entry.parentPath ?? entry.path, entry.name))).size;
 }
 return total;
}
const human = bytes => (bytes / 1024 ** 2).toFixed(1) + ' МБ';

let entries;
try{ entries = await readdir(root, {withFileTypes: true}); }
catch(e){ if(e.code === 'ENOENT'){ console.log('Каталог эфиров пуст.'); process.exit(0); } throw e; }

let freed = 0, kept = 0;
for(const entry of entries){
 if(!entry.isDirectory()) continue;
 const id = entry.name, dir = path.join(root, id);
 const row = db.prepare('SELECT state, post_id FROM live_recordings WHERE id=?').get(id);
 if(!row){ console.log(`пропуск ${id}: нет записи в базе`); kept++; continue; }
 if(row.state !== 'ready'){ console.log(`пропуск ${id}: состояние ${row.state} — куски ещё нужны для повтора`); kept++; continue; }
 // Последняя проверка перед удалением: сам выпуск действительно лежит в хранилище.
 try{ await stat(path.join(storage, 'audio', 'live-' + id)); }
 catch{ console.log(`пропуск ${id}: выпуск не найден в хранилище`); kept++; continue; }
 const bytes = await size(dir);
 freed += bytes;
 if(apply){ await rm(dir, {recursive: true, force: true}); console.log(`удалено ${id} — ${human(bytes)}`); }
 else console.log(`будет удалено ${id} — ${human(bytes)}`);
}
db.close();
console.log(apply ? `\nОсвобождено: ${human(freed)}. Оставлено каталогов: ${kept}.`
                  : `\nОсвободится: ${human(freed)}. Оставлено каталогов: ${kept}. Запусти с --delete, чтобы удалить.`);
