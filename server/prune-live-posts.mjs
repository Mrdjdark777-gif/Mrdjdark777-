#!/usr/bin/env node
// Записи эфиров, у которых не осталось строки эфира.
//
// До того как удаление стало уносить запись целиком, оно убирало строку из
// live_recordings, а выпуск со звуком оставался. Автор такую запись не видел,
// слушатель видел, и дотянуться до неё было нечем. Этот скрипт убирает
// оставшиеся хвосты: выпуск, его звук и обложку.
//
//   node --env-file=.env scripts/prune-live-posts.mjs           # показать
//   node --env-file=.env scripts/prune-live-posts.mjs --delete  # удалить
import Database from 'better-sqlite3';
import {unlinkSync} from 'node:fs';
import path from 'node:path';

const apply=process.argv.includes('--delete');
const storage=path.resolve(process.env.STORAGE_DIR||'data/storage');
const db=new Database(process.env.DATABASE_PATH||'data/truethrills.db',{readonly:!apply});
const kept=new Set(db.prepare('select post_id from live_recordings where post_id is not null').all().map(r=>r.post_id));
const orphans=db.prepare("select * from posts where audio_key like 'audio/live-%' order by created_at desc").all()
 .filter(p=>!kept.has(p.id));

if(!orphans.length){console.log('Записей без строки эфира нет.');process.exit(0);}
console.log((apply?'Удаляю':'Нашёл')+' записей без строки эфира: '+orphans.length);
for(const p of orphans){
 console.log(' ·',p.title,'|',p.id,'|',new Date(p.created_at).toISOString().slice(0,10));
 if(!apply)continue;
 db.prepare('delete from posts where id = ?').run(p.id);
 // Обложка выпуска и обложка эфира — один файл: снимаем ссылку до удаления,
 // иначе в базе остаётся указатель в пустоту.
 if(p.cover_key)db.prepare('update broadcasts set cover_key = null where cover_key = ?').run(p.cover_key);
 for(const key of [p.audio_key,p.audio_key&&p.audio_key+'.meta.json',p.cover_key]){
  if(!key)continue;
  try{unlinkSync(path.join(storage,key));}catch{}
 }
}
console.log(apply?'Готово. Обнови экран в приложении.':'Ничего не тронуто. Повтори с --delete, чтобы удалить.');
