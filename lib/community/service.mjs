import {createHash,createHmac,randomBytes,randomUUID} from 'node:crypto';
export const RULES='2026-09-23-community-v1';
const digest=s=>createHash('sha256').update(s).digest('hex');
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export function makeCommunity({db,rateSecret,now=Date.now}){
 if(!rateSecret||rateSecret.length<32)throw Error('configuration');
 db.pragma?.('foreign_keys=ON');db.pragma?.('busy_timeout=5000');
 function limit(key,n,ms){
  const h=createHmac('sha256',rateSecret).update(key).digest('hex');
  db.transaction(()=>{db.prepare('DELETE FROM tt_community_limits WHERE expires<=?').run(now());const r=db.prepare('SELECT n FROM tt_community_limits WHERE key=?').get(h);if(r?.n>=n)throw Error('rate_limit');db.prepare('INSERT INTO tt_community_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET n=n+1').run(h,now()+ms);})();
 }
 function session(id){const token=randomBytes(32).toString('hex');db.prepare('DELETE FROM tt_member_sessions WHERE expires<=?').run(now());db.prepare('INSERT INTO tt_member_sessions VALUES(?,?,?)').run(digest(token),id,now()+7*86400000);return token;}
 function me(token){if(!/^[a-f0-9]{64}$/.test(token||''))return null;return db.prepare('SELECT m.id,m.nickname,m.banned FROM tt_members m JOIN tt_member_sessions s ON s.member_id=m.id WHERE s.hash=? AND s.expires>?').get(digest(token),now())||null;}
 function auth(token){const m=me(token);if(!m)throw Error('unauthorized');return m;}
 function allowed(token){const m=auth(token);if(m.banned)throw Error('banned');return m;}
 function signup(ip,rules){if(rules!==RULES)throw Error('rules_required');limit('signup:'+ip,3,86400000);const id=randomUUID(),raw=randomBytes(24).toString('hex').toUpperCase(),code='TT-'+raw.match(/.{1,8}/g).join('-');
  return db.transaction(()=>{db.prepare('INSERT INTO tt_members(id,nickname,recovery_hash,created_at,rules) VALUES(?,?,?,?,?)').run(id,'Слушатель '+id.slice(0,8),digest(raw),now(),RULES);return {code,token:session(id),member:db.prepare('SELECT id,nickname FROM tt_members WHERE id=?').get(id)};})();
 }
 function login(ip,code){limit('login:'+ip,10,600000);const raw=String(code||'').trim().toUpperCase().replace(/^TT-/,'').replace(/[\s-]/g,'');if(!/^[A-F0-9]{48}$/.test(raw))throw Error('invalid_code');const m=db.prepare('SELECT id FROM tt_members WHERE recovery_hash=?').get(digest(raw));if(!m)throw Error('invalid_code');db.prepare('DELETE FROM tt_member_sessions WHERE member_id=?').run(m.id);return {token:session(m.id)};}
 function live(id){if(!UUID.test(id||''))throw Error('invalid_input');return !!db.prepare('SELECT id FROM broadcasts WHERE id=? AND active=1 AND heartbeat>?').get(id,now()-90000);}
 function list(token,id){const m=allowed(token);if(!live(id))return {items:[],active:false};return {active:true,items:db.prepare("SELECT c.id,c.member_id memberId,m.nickname,c.body,c.created_at createdAt,c.state,c.reason FROM tt_comments c JOIN tt_members m ON m.id=c.member_id WHERE c.live_id=? AND ((c.state='published' AND m.banned=0) OR c.member_id=?) AND NOT EXISTS(SELECT 1 FROM tt_member_blocks b WHERE b.member_id=? AND b.blocked_id=c.member_id) ORDER BY c.created_at DESC,c.id DESC LIMIT 80").all(id,m.id,m.id).reverse()};}
 function post(token,input){const m=allowed(token);if(!UUID.test(input.id||'')||typeof input.body!=='string')throw Error('invalid_input');const body=input.body.normalize('NFC').trim();if(!body||[...body].length>500||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(body)||/(https?:\/\/|www\.)/i.test(body))throw Error('invalid_comment');
  return db.transaction(()=>{const old=db.prepare('SELECT member_id,body,live_id FROM tt_comments WHERE id=?').get(input.id);if(old){if(old.member_id!==m.id||old.body!==body||old.live_id!==input.live)throw Error('conflict');return {ok:true};}if(!live(input.live))throw Error('live_ended');limit('post:'+m.id,1,5000);limit('post-hour:'+m.id,60,3600000);db.prepare("INSERT INTO tt_comments(id,live_id,member_id,body,created_at,state) VALUES(?,?,?,?,?,'published')").run(input.id,input.live,m.id,body,now());return {ok:true};})();
 }
 function report(token,id,reason){const m=allowed(token);if(!['spam','abuse','privacy','illegal','other'].includes(reason))throw Error('invalid_input');const c=db.prepare("SELECT id FROM tt_comments WHERE id=? AND state='published'").get(id);if(!c)throw Error('not_found');limit('report:'+m.id,20,3600000);db.prepare('INSERT OR IGNORE INTO tt_comment_reports VALUES(?,?,?,?)').run(id,m.id,reason,now());return {ok:true};}
 function block(token,id,on=true){const m=allowed(token);if(id===m.id||!db.prepare('SELECT id FROM tt_members WHERE id=?').get(id))throw Error('not_found');if(on)db.prepare('INSERT OR IGNORE INTO tt_member_blocks VALUES(?,?)').run(m.id,id);else db.prepare('DELETE FROM tt_member_blocks WHERE member_id=? AND blocked_id=?').run(m.id,id);return {ok:true};}
 function blocks(token){const m=auth(token);return db.prepare('SELECT m.id,m.nickname FROM tt_member_blocks b JOIN tt_members m ON m.id=b.blocked_id WHERE b.member_id=?').all(m.id);}
 function removeOwn(token,id){const m=auth(token);db.prepare('DELETE FROM tt_comments WHERE id=? AND member_id=?').run(id,m.id);return {ok:true};}
 function exportData(token){const m=auth(token);return {profile:m,comments:db.prepare('SELECT id,live_id,body,state,reason,created_at FROM tt_comments WHERE member_id=?').all(m.id),blocks:blocks(token),reports:db.prepare('SELECT comment_id,reason,created_at FROM tt_comment_reports WHERE reporter_id=?').all(m.id)};}
 function erase(token){const m=auth(token);db.transaction(()=>{db.prepare('DELETE FROM tt_comment_reports WHERE reporter_id=? OR comment_id IN (SELECT id FROM tt_comments WHERE member_id=?)').run(m.id,m.id);db.prepare('DELETE FROM tt_member_blocks WHERE member_id=? OR blocked_id=?').run(m.id,m.id);db.prepare('DELETE FROM tt_comments WHERE member_id=?').run(m.id);db.prepare('DELETE FROM tt_member_sessions WHERE member_id=?').run(m.id);db.prepare('DELETE FROM tt_members WHERE id=?').run(m.id);})();return {ok:true};}
 function logout(token){if(token)db.prepare('DELETE FROM tt_member_sessions WHERE hash=?').run(digest(token));return {ok:true};}
 // Caller MUST requireOwner before these two methods. No viewer-controlled role.
 function queue(){return db.prepare("SELECT c.id,c.member_id memberId,m.nickname,c.body,c.state,c.live_id liveId,c.reason,(SELECT COUNT(*) FROM tt_comment_reports r WHERE r.comment_id=c.id) reports FROM tt_comments c JOIN tt_members m ON m.id=c.member_id ORDER BY (SELECT COUNT(*) FROM tt_comment_reports r WHERE r.comment_id=c.id) DESC,c.created_at DESC LIMIT 100").all();}
 function moderate(input){if(!['publish','reject','ban','dismiss','unban'].includes(input.action))throw Error('invalid_input');const c=db.prepare('SELECT * FROM tt_comments WHERE id=?').get(input.id);if(!c)throw Error('not_found');
  return db.transaction(()=>{if(input.action==='publish'&&db.prepare('SELECT banned FROM tt_members WHERE id=?').get(c.member_id)?.banned)throw Error('banned');
   if(input.action==='publish')db.prepare("UPDATE tt_comments SET state='published',reason=NULL WHERE id=?").run(c.id);
   if(input.action==='reject'||input.action==='ban'){if(typeof input.reason!=='string'||input.reason.trim().length<3||input.reason.length>300)throw Error('reason_required');db.prepare("UPDATE tt_comments SET state='rejected',reason=? WHERE id=?").run(input.reason,c.id);}
   if(input.action==='ban'){db.prepare('UPDATE tt_members SET banned=1 WHERE id=?').run(c.member_id);db.prepare("UPDATE tt_comments SET state='rejected',reason=? WHERE member_id=?").run(input.reason,c.member_id);}
   if(input.action==='unban')db.prepare('UPDATE tt_members SET banned=0 WHERE id=?').run(c.member_id);
   db.prepare('DELETE FROM tt_comment_reports WHERE comment_id=?').run(c.id);return {ok:true};})();
 }
 function prune(){db.prepare('DELETE FROM tt_comments WHERE created_at<?').run(now()-30*86400000);db.prepare('DELETE FROM tt_member_sessions WHERE expires<?').run(now());db.prepare('DELETE FROM tt_community_limits WHERE expires<?').run(now());}
 return {signup,login,me,list,post,report,block,blocks,removeOwn,exportData,erase,logout,queue,moderate,prune,limit};
}
