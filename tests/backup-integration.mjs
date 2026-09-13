import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm,cp,readdir} from 'node:fs/promises';
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
 // Ротация удаляет только проверенные копии и только сверх последних N.
 // Незавершённая копия без VERIFIED.json остаётся человеку, даже если она
 // самая старая: иначе уборка молча унесла бы наполовину снятый бэкап.
 const vault=dir+'-vault';await mkdir(vault,{recursive:true});
 const snapshots=['TrueThrills-2026-09-01T00-00-00-000Z','TrueThrills-2026-09-02T00-00-00-000Z','TrueThrills-2026-09-03T00-00-00-000Z','TrueThrills-2026-09-04T00-00-00-000Z'];
 try{
  for(const name of snapshots){await mkdir(path.join(vault,name),{recursive:true});await writeFile(path.join(vault,name,'VERIFIED.json'),'{}');await writeFile(path.join(vault,name,'truethrills.db'),'x'.repeat(1024));}
  const broken='TrueThrills-2026-08-01T00-00-00-000Z';await mkdir(path.join(vault,broken),{recursive:true});await writeFile(path.join(vault,broken,'truethrills.db'),'half');
  const prune=(...args)=>execFileSync(process.execPath,['scripts/prune-backups.mjs','--root',vault,...args],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  assert.match(prune('--keep','2'),/К удалению 2/,'сухой прогон должен только сообщать');
  assert.equal((await readdir(vault)).length,5,'сухой прогон ничего не удаляет');
  prune('--keep','2','--delete');
  const left=(await readdir(vault)).sort();
  assert.deepEqual(left,[broken,snapshots[2],snapshots[3]].sort(),'остаются две свежие проверенные копии и незавершённая');
  prune('--keep','5','--delete');
  assert.equal((await readdir(vault)).length,3,'когда копий меньше запаса, удалять нечего');
  assert.throws(()=>prune('--keep','0'),/whole number/,'бессмысленный запас должен отвергаться');
 }finally{await rm(vault,{recursive:true,force:true});}
 console.log('PASS: backup integrity, separate restore, missing audio, size mismatch, lost-episode detection and rotation');
}finally{await rm(dir,{recursive:true,force:true});}
