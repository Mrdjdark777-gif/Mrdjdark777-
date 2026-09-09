#!/usr/bin/env node
// Run on the VPS as a user that can read the data directory.
// Uses SQLite's online backup API; never copy a live WAL database with plain cp.
import {execFileSync} from 'node:child_process';
import Database from 'better-sqlite3';
import {mkdir,cp,writeFile,realpath,copyFile,chmod} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const destination=process.argv[2];if(!destination){console.error('Usage: node --env-file=.env scripts/backup-data.mjs /absolute/backup-directory');process.exit(1);}
const target=path.resolve(destination),databasePath=path.resolve(process.env.DATABASE_PATH||'data/truethrills.db'),storagePath=path.resolve(process.env.STORAGE_DIR||'data/storage');
const livePath=path.resolve(process.env.LIVE_DIR||'data/live');
if(!path.isAbsolute(destination))throw new Error('Use an absolute destination path.');
await mkdir(target,{recursive:true,mode:0o700});
// A fresh server with no uploaded files yet never gets data/storage created —
// lib/storage.ts only mkdir's it lazily, per file, on first write. Ensure it
// exists so backups don't fail before the first real upload.
await mkdir(storagePath,{recursive:true,mode:0o700});
const canonicalTarget=await realpath(target),canonicalStorage=await realpath(storagePath);
if(canonicalTarget===livePath||canonicalTarget.startsWith(livePath+path.sep))throw new Error('Backup destination must be outside live storage.');
if(canonicalTarget===canonicalStorage||canonicalTarget.startsWith(canonicalStorage+path.sep))throw new Error('Backup destination must be outside audio storage.');
const output=path.join(canonicalTarget,'TrueThrills-'+new Date().toISOString().replace(/[:.]/g,'-'));await mkdir(output,{mode:0o700});
const db=new Database(databasePath,{readonly:true});
try{await db.backup(path.join(output,'truethrills.db'));await cp(storagePath,path.join(output,'storage'),{recursive:true,errorOnExist:true,force:false});}finally{db.close();}
try{await cp(livePath,path.join(output,'live'),{recursive:true,errorOnExist:true,force:false});}catch(e){if(e.code!=='ENOENT')throw e;}
await writeFile(path.join(output,'RESTORE.txt'),'SQLite online backup + audio storage. Stop publications/deletions while backing up for a consistent content set. Restore while the service is stopped. Secrets from .env are included in server.env. The DB contains private push subscription keys. Keep this archive private.\n',{mode:0o600});
execFileSync(process.execPath,[fileURLToPath(new URL('./verify-backup.mjs',import.meta.url)),output],{stdio:'inherit'});
await copyFile('.env',path.join(output,'server.env'));await chmod(path.join(output,'server.env'),0o600);
if(process.env.FIREBASE_SERVICE_ACCOUNT_FILE){await copyFile(process.env.FIREBASE_SERVICE_ACCOUNT_FILE,path.join(output,'firebase-service-account.json'));await chmod(path.join(output,'firebase-service-account.json'),0o600);}
await writeFile(path.join(output,'RESTORE-PATHS.json'),JSON.stringify({databasePath,storagePath,livePath,firebasePath:process.env.FIREBASE_SERVICE_ACCOUNT_FILE||null}),{mode:0o600});
await writeFile(path.join(output,'VERIFIED.json'),JSON.stringify({verifiedAt:new Date().toISOString()}),{mode:0o600});
console.log('Backup created:',output);
