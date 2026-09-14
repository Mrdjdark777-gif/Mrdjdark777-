#!/usr/bin/env node
/**
 * Проверка снятой копии. Копия, которая не проверена, — это не копия, а
 * надежда: ошибку замечают в тот единственный день, когда восстанавливаться
 * уже нужно.
 *
 * Проверяется всё, на что ссылается база, а не только звук выпусков: обложки
 * выпусков и эфиров и оформление канала теряются так же тихо, а заметно это
 * становится на восстановленном сервере с пустыми карточками.
 *
 * Содержимое сверяется по sha256 из сидекара — размер совпадает и у файла,
 * побитого при копировании. У файлов, загруженных сборкой без контрольных
 * сумм, её нет; такие считаются отдельно и называются в отчёте, чтобы «нечего
 * сверять» нельзя было принять за «сверено».
 *
 * Третий аргумент — каталог живого хранилища. С ним проверка отличает две
 * разные беды: файл пропал при копировании (копия негодная, отказываем) или
 * его нет и в живом хранилище — тогда это висячая ссылка в самой базе, копия
 * при этом верная, и отказывать в ней нельзя. Бэкап нужнее всего именно
 * тогда, когда с данными что-то не так.
 */
import Database from 'better-sqlite3';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {readFile,lstat,realpath} from 'node:fs/promises';
import path from 'node:path';
const folder=process.argv[2];if(!folder||!path.isAbsolute(folder))throw new Error('Supply an absolute backup directory.');
// Сколько выпусков со звуком было в живой базе на момент копирования. Без этой
// сверки бэкап пустой базы проходит проверку молча — печатает «0» и выглядит
// успешным, хотя спасать им нечего.
const expected=process.argv[3]===undefined||process.argv[3]===''?null:Number(process.argv[3]);
if(expected!==null&&!Number.isInteger(expected))throw new Error('Expected audio count must be an integer.');
const liveStorage=process.argv[4]?path.resolve(process.argv[4]):null;
const dangling=[];
const root=await realpath(folder),db=new Database(path.join(root,'truethrills.db'),{readonly:true,fileMustExist:true});

const KEY=/^(audio|cover)\/(?:live-)?[a-f0-9-]+$/i;
async function sha256(file){
 const hash=createHash('sha256');
 for await(const chunk of createReadStream(file))hash.update(chunk);
 return hash.digest('hex');
}
const missing=async file=>{try{await lstat(file);return false;}catch{return true;}};
/**
 * Возвращает true, если у файла была контрольная сумма и она сошлась,
 * false — если суммы не было, и null — если файла нет ни в копии, ни в живом
 * хранилище: это висячая ссылка в базе, а не изъян копии.
 */
async function checkFile(key,owner,kind,optional=false){
 if(!KEY.test(key))throw new Error('Invalid '+kind+' key for '+owner);
 if(kind==='audio'&&!key.startsWith('audio/'))throw new Error('Audio key outside audio/ for '+owner);
 if(kind==='cover'&&!key.startsWith('cover/'))throw new Error('Cover key outside cover/ for '+owner);
 const file=path.join(root,'storage',key),meta=file+'.meta.json';
 if(await missing(file)){
  // Без живого хранилища различить нечем: звук и обложки выпусков считаем
  // потерей, ссылки эфиров и оформления канала — висячими.
  const gone=liveStorage?await missing(path.join(liveStorage,key)):optional;
  if(gone){dangling.push(kind+' '+key+' ('+owner+')');return null;}
  throw new Error('Missing '+kind+' for '+owner+' ('+key+')');
 }
 const info=await lstat(file);
 const metadata=await lstat(meta).catch(()=>{throw new Error('Missing '+kind+' metadata for '+owner+' ('+key+')');});
 if(!info.isFile()||info.isSymbolicLink()||!metadata.isFile()||metadata.isSymbolicLink()||info.size<=0)throw new Error('Missing or unsafe '+kind+' for '+owner);
 const data=JSON.parse(await readFile(meta,'utf8'));
 if(data.size!==info.size)throw new Error('Size mismatch for '+owner+' ('+key+')');
 const type=String(data.contentType||'');
 if(kind==='audio'&&!type.startsWith('audio/'))throw new Error('Invalid audio metadata for '+owner);
 if(kind==='cover'&&!type.startsWith('image/'))throw new Error('Invalid cover metadata for '+owner);
 if(!data.sha256)return false;
 if(await sha256(file)!==data.sha256)throw new Error('Checksum mismatch for '+owner+' ('+key+') — the file is damaged, do not rely on this backup.');
 return true;
}
const hasColumn=(table,column)=>db.prepare('SELECT COUNT(*) AS n FROM pragma_table_info(?) WHERE name = ?').get(table,column).n>0;
const hasTable=name=>db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?").get(name).n>0;

try{
 if(db.pragma('integrity_check',{simple:true})!=='ok')throw new Error('SQLite integrity check failed.');
 const rows=db.prepare('SELECT id,audio_key FROM posts WHERE audio_key IS NOT NULL').all();
 let checked=0,legacy=0;
 for(const row of rows){const state=await checkFile(row.audio_key,row.id,'audio');if(state===true)checked++;else if(state===false)legacy++;}
 // Обложки появились позже звука, и в старых копиях этих колонок может не
 // быть. Отсутствие колонки — не повреждение; отсутствие файла — повреждение.
 const covers=[];
 if(hasColumn('posts','cover_key'))for(const row of db.prepare('SELECT id,cover_key FROM posts WHERE cover_key IS NOT NULL').all())covers.push([row.cover_key,'post '+row.id]);
 if(hasTable('broadcasts')&&hasColumn('broadcasts','cover_key'))for(const row of db.prepare('SELECT id,cover_key FROM broadcasts WHERE cover_key IS NOT NULL').all())covers.push([row.cover_key,'broadcast '+row.id]);
 if(hasTable('settings')){const art=db.prepare("SELECT value FROM settings WHERE key = 'channelArt'").get();if(art?.value)covers.push([art.value,'channel art']);}
 // Обложка выпуска — содержимое; обложка эфира и оформление канала — ссылки,
 // которые могут пережить свой файл (удалённый архив уносит обложку с собой).
 for(const [key,owner] of covers){
  const soft=owner==='channel art'||owner.startsWith('broadcast ');
  const state=await checkFile(key,owner,'cover',soft);
  if(state===true)checked++;else if(state===false)legacy++;
 }

 if(expected!==null&&rows.length!==expected)throw new Error('Backup holds '+rows.length+' episodes with audio, the live database has '+expected+'. Do not rely on this backup.');
 console.log('Verified SQLite, audio and covers:',rows.length+' episodes with audio'+(expected===null?'':' of '+expected+' in the live database')+', '+covers.length+' covers; '+checked+' files matched their checksum'+(legacy?', '+legacy+' predate checksums and were checked by size only':''));
 // Копия верная, но в самой базе есть указатели в пустоту. Это чинится
 // отдельно (scripts/prune-orphans.mjs), и бэкап из-за этого не отменяется.
 if(dangling.length){console.log('\nСсылки без файлов — их нет и в живом хранилище, копия тут ни при чём: '+dangling.length);for(const line of dangling)console.log('  - '+line);console.log('Убрать их: node scripts/prune-orphans.mjs, затем с --delete.');}
}finally{db.close();}
