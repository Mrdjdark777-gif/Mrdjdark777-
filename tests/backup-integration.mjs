import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm,cp} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import Database from 'better-sqlite3';
const root=process.cwd(),dir=await mkdtemp(path.join(root,'.test-tmp-backup-')),dbPath=path.join(dir,'truethrills.db');
try{
 const db=new Database(dbPath);db.exec('CREATE TABLE posts(id TEXT PRIMARY KEY,audio_key TEXT)');db.prepare('INSERT INTO posts VALUES(?,?)').run('episode','audio/abc-123');db.close();
 await mkdir(path.join(dir,'storage/audio'),{recursive:true});await writeFile(path.join(dir,'storage/audio/abc-123'),'test');await writeFile(path.join(dir,'storage/audio/abc-123.meta.json'),JSON.stringify({size:4,contentType:'audio/mpeg'}));
 execFileSync(process.execPath,['scripts/verify-backup.mjs',dir],{cwd:root,stdio:'pipe'});
 // Restore into a separate directory, then verify that the copied DB and audio agree.
 const restored=dir+'-restored';try{await cp(dir,restored,{recursive:true});execFileSync(process.execPath,['scripts/verify-backup.mjs',restored],{cwd:root,stdio:'pipe'});}finally{await rm(restored,{recursive:true,force:true});}
 await writeFile(path.join(dir,'storage/audio/abc-123'),'truncated');
 assert.throws(()=>execFileSync(process.execPath,['scripts/verify-backup.mjs',dir],{cwd:root,stdio:'pipe'}));
 await rm(path.join(dir,'storage/audio/abc-123'));
 assert.throws(()=>execFileSync(process.execPath,['scripts/verify-backup.mjs',dir],{cwd:root,stdio:'pipe'}));
 // Бэкап пустой базы раньше проходил проверку молча: печатал «0» и выглядел
 // успешным. Теперь сверяется с тем, сколько выпусков было в живой базе.
 const empty=dir+'-empty';await mkdir(empty,{recursive:true});
 const emptyDb=new Database(path.join(empty,'truethrills.db'));emptyDb.exec('CREATE TABLE posts(id TEXT PRIMARY KEY,audio_key TEXT)');emptyDb.close();
 try{
  execFileSync(process.execPath,['scripts/verify-backup.mjs',empty,'0'],{cwd:root,stdio:'pipe'});
  assert.throws(()=>execFileSync(process.execPath,['scripts/verify-backup.mjs',empty,'1'],{cwd:root,stdio:'pipe'}),/live database/,'пустой бэкап при непустой базе должен падать');
 }finally{await rm(empty,{recursive:true,force:true});}
 console.log('PASS: backup integrity, separate restore, missing audio, size mismatch and lost-episode detection');
}finally{await rm(dir,{recursive:true,force:true});}
