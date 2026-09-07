self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
// Authenticated content and recordings are never added to a shared offline cache.
self.addEventListener('fetch',event=>{if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(()=>new Response('<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="font-family:Arial;background:#101113;color:#fff;padding:40px"><h1>True Thrills</h1><p>Нет подключения к интернету. Подключись к сети и обнови страницу.</p><button onclick="location.reload()">Повторить</button></body></html>',{headers:{'Content-Type':'text/html; charset=utf-8'}})));});

self.addEventListener('push',event=>{
 let notice={};try{notice=event.data?.json()||{};}catch{}
 let url=new URL('/',self.location.origin);try{const candidate=new URL(notice.url,self.location.origin);if(candidate.origin===self.location.origin&&candidate.pathname==='/')url=candidate;}catch{}
 event.waitUntil(self.registration.showNotification(typeof notice.title==='string'?notice.title:'True Thrills',{body:typeof notice.body==='string'?notice.body:'Новая публикация',icon:'/icon-192.png?v=0.4.1',tag:typeof notice.tag==='string'?notice.tag:'true-thrills',data:{url:url.href}}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();event.waitUntil((async()=>{const target=new URL(event.notification.data?.url||'/',self.location.origin);if(target.origin!==self.location.origin)return;
 const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true}),client=clients.find(c=>{const u=new URL(c.url);return u.origin===target.origin&&u.searchParams.get('mode')==='listen';});
 if(client){await client.focus();client.postMessage({type:'tt-notification',url:target.href});}else await self.clients.openWindow(target.href);
 })());
});
