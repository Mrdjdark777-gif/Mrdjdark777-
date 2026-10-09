/** Behavioural regressions discovered in the 2026-10-06 isolated audit. */
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.cwd(),dir=await mkdtemp(path.join(root,'.test-tmp-audit-'));
process.env.NODE_ENV='test';process.env.DATABASE_PATH=path.join(dir,'db.sqlite');
process.env.STORAGE_DIR=path.join(dir,'storage');process.env.THUMB_DIR=path.join(dir,'thumbs');
process.env.SESSION_SECRET='audit-regression-secret-0123456789';
const mutation=process.env.TT_AUDIT_MUTATION;
const plugin={name:'audit-mutations',setup(b){b.onLoad({filter:/\.(ts|tsx)$/},async args=>{
 let contents=await readFile(args.path,'utf8');
 if(mutation==='archive'&&args.path.endsWith('/app/api/live-stream/route.ts'))contents=contents.replace('const window=limit+offset+1;','const window=limit+offset;');
 if(mutation==='thumbs'&&args.path.endsWith('/lib/thumbs.ts'))contents=contents.replace('const running = pending.get(cacheKey);','const running = undefined;');
 return {contents,loader:args.path.endsWith('tsx')?'tsx':'ts'};
});}};
let db;
try{
 execFileSync('npx',['drizzle-kit','migrate'],{stdio:'ignore'});
 const outfile=path.join(dir,'routes.mjs');
 await build({stdin:{contents:`export * as library from './app/api/library/route.ts';export * as archives from './app/api/live-stream/route.ts';export * as auth from './lib/auth.ts';export * as thumbs from './lib/thumbs.ts';export {getDb} from './db/index.ts';`,resolveDir:root},outfile,bundle:true,format:'esm',platform:'node',packages:'external',tsconfig:'tsconfig.json',plugins:[plugin]});
 const m=await import(pathToFileURL(outfile).href);db=m.getDb().$client;
 const origin='https://regression.test',cookie=m.auth.createSessionCookie(new Request(origin)).split(';')[0];
 const req=(url,init={})=>new Request(origin+url,{...init,headers:{host:'regression.test',cookie,...init.headers}});
 assert.equal((await m.library.POST(req('/api/library',{method:'POST',body:JSON.stringify({action:'setup'})}))).status,200);
 const owner=db.prepare("SELECT value FROM settings WHERE key='owner'").get().value;
 for(let i=0;i<5;i++)db.prepare('INSERT INTO live_recordings (id,owner_id,title,state,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(crypto.randomUUID(),owner,'Recording '+i,'ready',i*2,i*2);
 for(let i=0;i<3;i++)db.prepare('INSERT INTO posts (id,kind,title,audio_key,created_at) VALUES (?,?,?,?,?)').run(crypto.randomUUID(),'audio','Orphan '+i,'audio/live-'+crypto.randomUUID(),i*2+1);
 const pages=[];
 for(let offset=0;offset<8;offset+=2){
  const r=await m.archives.GET(req('/api/live-stream?list&limit=2&offset='+offset));assert.equal(r.status,200);
  const data=await r.json();assert.equal(data.more,offset+2<8,'archive: more must reflect records beyond this page');pages.push(...data.recordings);
 }
 assert.equal(pages.length,8);assert.equal(new Set(pages.map(x=>x.id)).size,8);
 assert.deepEqual(pages.map(x=>x.createdAt),[8,6,5,4,3,2,1,0]);
 // A single source is the original failing case: the merge must not hide it.
 db.prepare('DELETE FROM posts').run();
 const single=await (await m.archives.GET(req('/api/live-stream?list&limit=2'))).json();
 assert.equal(single.more,true,'archive: one source with five recordings needs a second page');
 const sharp=(await import('sharp')).default,image=await sharp({create:{width:1080,height:1350,channels:3,background:'#67ddd3'}}).png().toBuffer();
 let calls=0;const source=async()=>{calls++;await new Promise(r=>setTimeout(r,20));return image;};
 const thumbs=await Promise.all(Array.from({length:16},()=>m.thumbs.thumbnail('cover/parallel',480,source)));
 assert.equal(calls,1,'thumbnails: concurrent cold requests must share one conversion');
 assert.ok(thumbs.every(x=>x!==null),'thumbnails: every concurrent caller must get a thumbnail');
 assert.equal((await sharp(thumbs[0]).metadata()).width,480);
 await m.thumbs.thumbnail('cover/parallel',480,()=>{throw Error('cached thumbnail must not reload source');});
 // Execute the actual storage guard with node:path.win32 semantics on Linux.
 let storage=await readFile('lib/storage.ts','utf8');
 storage=storage.replace("import { dirname, isAbsolute, join, normalize, relative } from 'node:path';","import path from 'node:path'; const {dirname,isAbsolute,join,normalize,relative}=path.win32;");
 if(mutation==='windows')storage=storage.replace('const rel = relative(ROOT, target);',"if (target !== ROOT && !target.startsWith(ROOT + '/')) throw new Error('#err.badStorageKey'); const rel = relative(ROOT, target);");
 storage+='\nexport {dataPath as auditStoragePath};';
 const winfile=path.join(dir,'windows.mjs');
 await build({stdin:{contents:storage,resolveDir:root,loader:'ts'},outfile:winfile,bundle:true,format:'esm',platform:'node',packages:'external'});
 const win=await import(pathToFileURL(winfile).href);
 assert.doesNotThrow(()=>win.auditStoragePath('audio/valid'),'storage: valid Windows key must be accepted');
 assert.throws(()=>win.auditStoragePath('../../outside'));assert.throws(()=>win.auditStoragePath('..\\..\\outside'));
 console.log('PASS audit: archive pagination (mixed/single source/end), concurrent thumbnail + cache, Windows storage + traversal');
}finally{db?.close();await rm(dir,{recursive:true,force:true});}
