'use client';
import {useEffect,useRef,useState} from 'react';
import {MessageCircle,Flag,UserRound,Heart} from 'lucide-react';
import {haptic} from '@/lib/client';
import {useT} from '@/components/i18n-provider';
import {t as tr} from '@/lib/i18n/runtime';
import './style.css';
type Member={id:string;nickname:string;banned?:number};
type Status={member:Member|null;enabled:boolean;privacy:string;contact:string;rules:string};
type Comment={id:string;memberId:string;nickname:string;body:string;createdAt:number;state:string;reason?:string;liveId?:string;reports?:number};
// Код ошибки приходит с сервера на всех языках одинаковый, а текст показываем
// на языке телефона. Словарь читаем в момент ошибки, а не при загрузке файла:
// язык к тому времени уже установлен.
const ERROR_KEYS:Record<string,string>={unauthorized:'community.errUnauthorized',invalid_code:'community.errInvalidCode',rate_limit:'community.errRateLimit',invalid_comment:'community.errInvalidComment',live_ended:'community.errLiveEnded',banned:'community.errBanned',rules_required:'community.errRulesRequired',disabled:'community.errDisabled',conflict:'community.errConflict'};
async function api<T>(action:string,body?:unknown):Promise<T>{const r=await fetch('/api/community/'+action,{method:body===undefined?'GET':'POST',headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',credentials:'same-origin'});const d=await r.json();if(!r.ok)throw Error(tr(ERROR_KEYS[d.error]??'community.errOffline'));return d;}
function changed(){window.dispatchEvent(new Event('tt-member-changed'));}
/** Состояние сообщества для экранов снаружи: включено ли и есть ли участник. */
export function useCommunityStatus(){return useMember();}
function useMember(){const [status,setStatus]=useState<Status|null>(null);useEffect(()=>{let alive=true;const load=()=>{void api<Status>('me').then(v=>{if(alive)setStatus(v);}).catch(()=>{if(alive)setStatus(null);});};load();window.addEventListener('tt-member-changed',load);return()=>{alive=false;window.removeEventListener('tt-member-changed',load);};},[]);return status;}
function saveFile(name:string,text:string){const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
export function ListenerProfile(){
 const {t}=useT();
 const status=useMember(),[exported,setExported]=useState(''),[code,setCode]=useState(''),[fresh,setFresh]=useState(''),[accept,setAccept]=useState(false),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[deleting,setDeleting]=useState(false),[blocks,setBlocks]=useState<{id:string;nickname:string}[]>([]);
 async function run(fn:()=>Promise<void>){if(busy)return;setBusy(true);setMessage('');try{haptic();await fn();}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 if(!status)return <p>{t('community.loading')}</p>;
 return <section className="tt-community"><h2><UserRound size={21}/>{t('community.profileTitle')}</h2>
 {fresh&&<div className="tt-recovery"><strong>{t('community.saveCode')}</strong><p>{t('community.saveCodeNote')}</p><code>{fresh}</code><button onClick={()=>void run(async()=>{await navigator.clipboard.writeText(fresh);setMessage(t('community.codeCopied'));})}>{t('community.copyCode')}</button><button onClick={()=>saveFile('TrueThrills-access-code.txt',t('community.codeFileNote')+'\n'+fresh)}>{t('community.saveToFile')}</button><button onClick={()=>setFresh('')}>{t('community.codeSaved')}</button></div>}
 {status.member?<><p>{status.member.nickname}</p>{!!status.member.banned&&<p>{t('community.bannedNote',{contact:status.contact})}</p>}
 {exported&&<label>{t('community.exportLabel')}<textarea readOnly value={exported}/></label>}
 <button disabled={busy} onClick={()=>void run(async()=>{await api('logout',{});setFresh('');changed();})}>{t('community.logout')}</button>
 <button disabled={busy} onClick={()=>void run(async()=>{const text=JSON.stringify(await api('export'),null,2);setExported(text);saveFile('TrueThrills-my-data.json',text);})}>{t('community.download')}</button>
 <button onClick={()=>void run(async()=>{const d=await api<{items:typeof blocks}>('blocks');setBlocks(d.items);})}>{t('community.blocked')}</button>
 {blocks.map(b=><p key={b.id}>{b.nickname} <button onClick={()=>void run(async()=>{await api('block',{id:b.id,on:false});setBlocks(v=>v.filter(x=>x.id!==b.id));})}>{t('community.unblock')}</button></p>)}
 <button onClick={()=>setDeleting(true)}>{t('community.deleteProfile')}</button>{deleting&&<div><p>{t('community.deleteConfirm')}</p><button disabled={busy} onClick={()=>void run(async()=>{await api('delete',{confirm:true});setFresh('');setDeleting(false);changed();})}>{t('community.deleteYes')}</button><button onClick={()=>setDeleting(false)}>{t('common.cancel')}</button></div>}
 </>:<><p>{t('community.anonymous')}</p>
 {status.enabled&&<><p>{t('community.rules',{contact:status.contact})}</p><label><input type="checkbox" checked={accept} onChange={e=>setAccept(e.target.checked)}/>{t('community.acceptRules')}</label><button disabled={!accept||busy} onClick={()=>void run(async()=>{const r=await api<{code:string}>('register',{rules:status.rules});setFresh(r.code);changed();})}>{t('community.createProfile')}</button></>}
 <label>{t('community.haveProfile')}<input autoComplete="off" type="password" value={code} onChange={e=>setCode(e.target.value)} placeholder={t('community.codePlaceholder')} maxLength={100}/></label><button disabled={!code.trim()||busy} onClick={()=>void run(async()=>{await api('login',{code});setCode('');changed();})}>{t('community.loginByCode')}</button>
 </>}
 <p role="status">{message}</p>{status.privacy&&<a href={status.privacy} target="_blank" rel="noreferrer">{t('community.privacyLink')}</a>}<p>{t('community.contactNote',{contact:status.contact})}</p></section>;
}
export function LiveComments({liveId}:{liveId:string}){
 const status=useMember();
 // No title, count, invitation, fetch of comments or composer for guests.
 if(!status?.member||!status.enabled)return null;
 return <Comments key={status.member.id+liveId} member={status.member} liveId={liveId}/>;
}
function Comments({member,liveId}:{member:Member;liveId:string}){
 const {t}=useT();
 const [items,setItems]=useState<Comment[]>([]),[text,setText]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[active,setActive]=useState(true),[hidden,setHidden]=useState(false),[report,setReport]=useState<string|null>(null),[reason,setReason]=useState('abuse');
 const pending=useRef<{id:string;body:string}|null>(null);
 async function refresh(){const d=await api<{items:Comment[];active:boolean}>('comments?live='+encodeURIComponent(liveId));setItems(d.items);setActive(d.active);}
 useEffect(()=>{let stop=false,timer:ReturnType<typeof setTimeout>;async function poll(){try{if(!document.hidden){const d=await api<{items:Comment[];active:boolean}>('comments?live='+encodeURIComponent(liveId));if(!stop){setItems(d.items);setActive(d.active);}}}catch(e){if(!stop){setMessage((e as Error).message);void api<Status>('me').then(s=>{if(!s.member){setHidden(true);changed();}}).catch(()=>{});}}finally{if(!stop)timer=setTimeout(poll,4000);}}void poll();return()=>{stop=true;clearTimeout(timer);};},[liveId]);
 async function run(fn:()=>Promise<void>){if(busy)return;setBusy(true);try{haptic();await fn();}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 if(hidden)return null;
 return <section className="tt-community"><h3><MessageCircle size={20}/>{t('community.commentsTitle')}</h3><p>{t('community.commentsNote')}</p>
 <div className="tt-comments-list">{items.map(c=><article key={c.id}><strong>{c.nickname}</strong><p>{c.body}</p>{c.state!=='published'&&<small>{c.state==='pending'?t('community.pending'):c.reason||t('community.rejected')}</small>}
 {c.memberId===member.id?<button disabled={busy} onClick={()=>void run(async()=>{await api('remove',{id:c.id});await refresh();})}>{t('community.remove')}</button>:<><button onClick={()=>setReport(c.id)}><Flag size={14}/>{t('community.report')}</button><button disabled={busy} onClick={()=>void run(async()=>{await api('block',{id:c.memberId});await refresh();})}>{t('community.blockMember')}</button></>}</article>)}</div>
 {report&&<div><label>{t('community.reportReason')}<select value={reason} onChange={e=>setReason(e.target.value)}><option value="abuse">{t('community.reasonAbuse')}</option><option value="spam">{t('community.reasonSpam')}</option><option value="privacy">{t('community.reasonPrivacy')}</option><option value="illegal">{t('community.reasonIllegal')}</option><option value="other">{t('community.reasonOther')}</option></select></label><button disabled={busy} onClick={()=>void run(async()=>{await api('report',{id:report,reason});setReport(null);setMessage(t('community.reportSent'));})}>{t('community.sendReport')}</button><button onClick={()=>setReport(null)}>{t('common.cancel')}</button></div>}
 {active&&!member.banned&&<form onSubmit={e=>{e.preventDefault();void run(async()=>{const body=text.trim();if(!pending.current||pending.current.body!==body)pending.current={id:crypto.randomUUID(),body};await api('post',{...pending.current,live:liveId});pending.current=null;setText('');setMessage(t('community.published'));await refresh();});}}><label>{t('community.yourComment')}<textarea value={text} maxLength={500} disabled={busy} onChange={e=>setText(e.target.value)} placeholder={t('community.commentPlaceholder')}/></label><button disabled={busy||!text.trim()}>{t('community.send')}</button></form>}{!active&&<p>{t('community.liveEnded')}</p>}<p role="status">{message}</p></section>;
}
export function CommunityModeration(){
 const {t}=useT();
 const [items,setItems]=useState<Comment[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function load(){const d=await api<{items:Comment[]}>('queue');setItems(d.items);}
 useEffect(()=>{let alive=true;const poll=()=>void api<{items:Comment[]}>('queue').then(d=>{if(alive)setItems(d.items);}).catch(e=>{if(alive)setError(e.message);});poll();const timer=setInterval(poll,5000);return()=>{alive=false;clearInterval(timer);};},[]);
 const ACTIONS=[['publish','community.actPublish'],['reject','community.actReject'],['ban','community.actBan'],['dismiss','community.actDismiss'],['unban','community.actUnban']] as const;
 async function act(c:Comment,action:string){if(busy)return;const reason=action==='reject'||action==='ban'?window.prompt(t('community.reasonPrompt')):undefined;if(reason===null)return;setBusy(true);try{await api('moderate',{id:c.id,action,reason});await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section className="tt-community"><h3><Heart size={20}/>{t('community.moderationTitle')}</h3><p>{error}</p>{items.map(c=><article key={c.id}><strong>{c.nickname}</strong><p>{c.body}</p><small>{c.liveId} · {t('community.reportsCount',{n:c.reports||0})}</small><div>{ACTIONS.map(([a,key])=><button disabled={busy} key={a} onClick={()=>void act(c,a)}>{t(key)}</button>)}</div></article>)}</section>;
}
