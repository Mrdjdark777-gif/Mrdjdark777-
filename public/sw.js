self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
// Тексты в service worker живут отдельно от словарей приложения: сюда не
// доходит сборка Next. Язык берём у самого браузера, как в остальном интерфейсе.
const LANG=(self.navigator.language||'ru').slice(0,2)==='it'?'it':'ru';
const SW_TEXT={
 ru:{offline:'Нет подключения к интернету. Подключись к сети и обнови страницу.',retry:'Повторить',fallback:'Новая публикация'},
 it:{offline:'Nessuna connessione a internet. Collegati alla rete e ricarica la pagina.',retry:'Riprova',fallback:'Nuova pubblicazione'},
}[LANG];
const OFFLINE_PAGE=`<!doctype html><html lang="${LANG}"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="font-family:Arial;background:#101113;color:#fff;padding:40px"><h1>True Thrills</h1><p>${SW_TEXT.offline}</p><button onclick="location.reload()">${SW_TEXT.retry}</button></body></html>`;
// Authenticated content and recordings are never added to a shared offline cache.
self.addEventListener('fetch',event=>{if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(()=>new Response(OFFLINE_PAGE,{headers:{'Content-Type':'text/html; charset=utf-8'}})));});

self.addEventListener('push',event=>{
 let notice={};try{notice=event.data?.json()||{};}catch{}
 let url=new URL('/',self.location.origin);try{const candidate=new URL(notice.url,self.location.origin);if(candidate.origin===self.location.origin&&candidate.pathname==='/')url=candidate;}catch{}
 event.waitUntil(self.registration.showNotification(typeof notice.title==='string'?notice.title:'True Thrills',{body:typeof notice.body==='string'?notice.body:SW_TEXT.fallback,icon:'/icon-192.png?v=0.4.1',tag:typeof notice.tag==='string'?notice.tag:'true-thrills',data:{url:url.href}}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();event.waitUntil((async()=>{const target=new URL(event.notification.data?.url||'/',self.location.origin);if(target.origin!==self.location.origin)return;
 const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true}),client=clients.find(c=>{const u=new URL(c.url);return u.origin===target.origin&&u.searchParams.get('mode')==='listen';});
 if(client){await client.focus();client.postMessage({type:'tt-notification',url:target.href});}else await self.clients.openWindow(target.href);
 })());
});
