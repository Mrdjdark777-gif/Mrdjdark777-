#!/usr/bin/env node
// Run on the VPS as a user that can read the data directory.
// Uses SQLite's online backup API; never copy a live WAL database with plain cp.
import {execFileSync} from 'node:child_process';
import Database from 'better-sqlite3';
import {mkdir,cp,writeFile,realpath,copyFile,chmod} from 'node:fs/promises';
import path from 'node:path';
const destination=process.argv[2];if(!destination){console.error('Usage: node --env-file=.env scripts/backup-data.mjs /absolute/backup-directory');process.exit(1);}
const target=path.resolve(destination),databasePath=path.resolve(process.env.DATABASE_PATH||'data/truethrills.db'),storagePath=path.resolve(process.env.STORAGE_DIR||'data/storage');
if(!path.isAbsolute(destination))throw new Error('Use an absolute destination path.');
await mkdir(target,{recursive:true,mode:0o700});
const canonicalTarget=await realpath(target),canonicalStorage=await realpath(storagePath);
if(canonicalTarget===canonicalStorage||canonicalTarget.startsWith(canonicalStorage+path.sep))throw new Error('Backup destination must be outside audio storage.');
const output=path.join(canonicalTarget,'TrueThrills-'+new Date().toISOString().replace(/[:.]/g,'-'));await mkdir(output,{mode:0o700});
const db=new Database(databasePath,{readonly:true});
try{await db.backup(path.join(output,'truethrills.db'));await cp(storagePath,path.join(output,'storage'),{recursive:true,errorOnExist:true,force:false});}finally{db.close();}
await writeFile(path.join(output,'RESTORE.txt'),'SQLite online backup + audio storage. Stop publications/deletions while backing up for a consistent content set. Restore while the service is stopped. Secrets from .env are included in server.env. The DB contains private push subscription keys. Keep this archive private.\n',{mode:0o600});
execFileSync(process.execPath,['scripts/verify-backup.mjs',output],{stdio:'inherit'});
await copyFile('.env',path.join(output,'server.env'));await chmod(path.join(output,'server.env'),0o600);
await writeFile(path.join(output,'VERIFIED.json'),JSON.stringify({verifiedAt:new Date().toISOString()}),{mode:0o600});
console.log('Backup created:',output);
