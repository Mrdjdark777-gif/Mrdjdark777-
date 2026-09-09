#!/usr/bin/env node
import Database from 'better-sqlite3';
import {readFile,lstat,realpath} from 'node:fs/promises';
import path from 'node:path';
const folder=process.argv[2];if(!folder||!path.isAbsolute(folder))throw new Error('Supply an absolute backup directory.');
const root=await realpath(folder),db=new Database(path.join(root,'truethrills.db'),{readonly:true,fileMustExist:true});
try{
 if(db.pragma('integrity_check',{simple:true})!=='ok')throw new Error('SQLite integrity check failed.');
 const rows=db.prepare('SELECT id,audio_key FROM posts WHERE audio_key IS NOT NULL').all();
 for(const row of rows){
  if(!/^audio\/(?:live-)?[a-f0-9-]+$/i.test(row.audio_key))throw new Error('Invalid audio key for '+row.id);
  const audio=path.join(root,'storage',row.audio_key),meta=audio+'.meta.json';
  const info=await lstat(audio),metadata=await lstat(meta);
  if(!info.isFile()||info.isSymbolicLink()||!metadata.isFile()||metadata.isSymbolicLink()||info.size<=0)throw new Error('Missing or unsafe audio for '+row.id);
  const data=JSON.parse(await readFile(meta,'utf8'));if(data.size!==info.size||!data.contentType?.startsWith('audio/'))throw new Error('Invalid audio metadata for '+row.id);
 }
 console.log('Verified SQLite and audio files:',rows.length);
}finally{db.close();}
