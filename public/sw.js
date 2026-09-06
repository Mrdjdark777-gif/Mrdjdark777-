self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
// Authenticated content and recordings are never added to a shared offline cache.
self.addEventListener('fetch',event=>{if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(()=>new Response('<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="font-family:Arial;background:#101113;color:#fff;padding:40px"><h1>True Thrills</h1><p>Нет подключения к интернету. Подключись к сети и обнови страницу.</p><button onclick="location.reload()">Повторить</button></body></html>',{headers:{'Content-Type':'text/html; charset=utf-8'}})));});
