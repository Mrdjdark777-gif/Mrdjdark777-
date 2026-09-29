import {createHash} from 'node:crypto';
import type Database from 'better-sqlite3';
/** Aggregates only. Random session hashes expire after 24h; no event history. */
export function recordUsage(db:Pick<Database.Database,'prepare'|'transaction'>,id:string,session:string,now=Date.now()){
 return db.transaction(()=>{
  const post=db.prepare('SELECT kind,published FROM posts WHERE id=?').get(id) as {kind:string;published:number}|undefined;
  if(!post||post.published!==1||!['story','podcast'].includes(post.kind))return false;
  db.prepare('DELETE FROM rate_limits WHERE expires_at<=?').run(now);
  const key='usage:'+createHash('sha256').update(id+':'+session).digest('hex');
  const accepted=db.prepare('INSERT OR IGNORE INTO rate_limits(id,attempts,expires_at) VALUES(?,1,?)').run(key,now+86400000);
  if(!accepted.changes)return false;
  db.prepare("INSERT INTO settings(key,value) VALUES(?,'1') ON CONFLICT(key) DO UPDATE SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT)").run('usage:'+id);
  return true;
 })();
}
