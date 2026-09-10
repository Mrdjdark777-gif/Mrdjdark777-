import {createHmac} from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';

// Offline regression test for the self-hosted (Node/better-sqlite3/local
// filesystem) API routes. Route handlers are framework-agnostic (plain Web
// Request/Response), so we bundle them directly (resolving the `@/*`
// tsconfig alias and stripping types) instead of standing up a server or
// emulating Cloudflare Workers.
const root = process.cwd();
// Bundled inside the project root (not the OS tmpdir) so Node's ESM resolver
// still finds this project's node_modules for the externalized packages.
const dir = await mkdtemp(path.join(root, '.test-tmp-'));
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = path.join(dir, 'db.sqlite');
process.env.STORAGE_DIR = path.join(dir, 'storage');
process.env.SESSION_SECRET = 'test-secret-not-for-production-use';
process.env.ADMIN_PASSWORD = 'test-password';

execFileSync('npx', ['drizzle-kit', 'migrate'], { cwd: root, stdio: 'inherit', env: process.env });

const outfile = path.join(dir, 'routes.mjs');
await build({
  stdin: {
    contents: `
      export * as uiClient from '${root}/lib/client.ts';
      export * as library from '${root}/app/api/library/route.ts';
      export * as audio from '${root}/app/api/audio/route.ts';
      export * as cover from '${root}/app/api/cover/route.ts';
      export * as live from '${root}/app/api/live/route.ts';
      export * as login from '${root}/app/api/auth/route.ts';
      export * as ice from '${root}/app/api/ice/route.ts';
      export * as auth from '${root}/lib/auth.ts';
      export * as notifications from '${root}/app/api/notifications/route.ts';
      export * as push from '${root}/lib/push.ts';
      export {getDb} from '${root}/db/index.ts';
    `,
    resolveDir: root,
    sourcefile: 'api-test-entry.ts',
  },
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  packages: 'external',
  tsconfig: path.join(root, 'tsconfig.json'),
});
const { uiClient, library, audio, cover, live, auth, login, ice, notifications, push, getDb } = await import(outfile);
const routes = { library, audio, cover, live, notifications, login, ice };

const ORIGIN = 'https://true-thrills.test';
const ownerCookie = auth.createSessionCookie(new Request(ORIGIN)).split(';')[0];

async function dispatch(pathname, init) {
  const route = routes[pathname];
  // A real HTTP server always supplies a Host header; a bare `new Request()`
  // does not, so add it explicitly to match production request semantics
  // (originCheck compares Origin's host against the Host header).
  const headers = new Headers(init?.headers);
  if (!headers.has('host')) headers.set('host', new URL(ORIGIN).host);
  const req = new Request(`${ORIGIN}/api/${pathname}${init?.search ?? ''}`, { ...init, headers });
  return route[req.method](req);
}

const request = async (routeName, data, signedIn = true, extraHeaders = {}, search = '') => {
  const headers = {
    ...(signedIn ? { cookie: ownerCookie } : {}),
    ...(data !== undefined ? { 'Content-Type': 'application/json', origin: ORIGIN } : {}),
    ...extraHeaders,
  };
  const r = await dispatch(routeName, {
    method: data === undefined ? 'GET' : 'POST',
    headers,
    search,
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
  });
  return { status: r.status, headers: r.headers, data: await r.json() };
};

try {
  assert.equal(uiClient.errorText(new Error('#err.notificationsBlocked')),'Разреши уведомления в настройках телефона.');
  process.env.TRUST_PROXY='true';
  for(let i=0;i<10;i++)assert.equal((await request('login',{password:'wrong'},false,{'x-real-ip':'192.0.2.1'})).status,400);
  const limited=await request('login',{password:'test-password'},false,{'x-real-ip':'192.0.2.1'});assert.equal(limited.status,429);assert.ok(Number(limited.headers.get('retry-after'))>0);
  assert.equal((await request('login',{password:'test-password'},false,{'x-real-ip':'192.0.2.2'})).status,200);
  getDb().$client.prepare('DELETE FROM rate_limits').run();

  assert.equal((await request('library', undefined, false)).data.needsSetup, true);
  assert.equal((await request('library', { action: 'setup' }, false)).status, 401);
  assert.equal((await request('library', { action: 'setup' })).status, 200);
  process.env.TURN_SECRET='test-turn-secret';process.env.TURN_URLS='turn:relay.example:3478?transport=udp';
  const publicIce=await request('ice',undefined,false);assert.equal(publicIce.data.iceServers.length,1);
  const ownerIce=await request('ice');assert.equal(ownerIce.data.iceServers.length,2);
  const turn=ownerIce.data.iceServers[1];assert.equal(turn.credential,createHmac('sha1',process.env.TURN_SECRET).update(turn.username).digest('base64'));assert.ok(Number(turn.username.split(':')[0])>Date.now()/1000+3500);
  assert.notEqual(turn.username,(await request('ice')).data.iceServers[1].username);assert.equal(JSON.stringify(ownerIce.data).includes(process.env.TURN_SECRET),false);
  delete process.env.TURN_SECRET;delete process.env.TURN_URLS;

  assert.equal((await request('library', { kind: 'story', title: 'Secret', body: 'Draft' }, false)).status, 403);
  assert.equal(
    (await request('library', { kind: 'story', title: 'Secret', body: 'Draft' }, true, { origin: 'https://evil.test' }))
      .status,
    400,
  );
  const draft = await request('library', { kind: 'story', title: 'Draft story', body: 'Private words' });
  assert.equal(draft.status, 200);
  assert.equal((await request('library', undefined, false)).data.items.length, 0);
  await request('library', { action: 'visibility', id: draft.data.id, published: true });
  assert.equal((await request('library', undefined, false)).data.items.length, 1);
  // Ошибки сервера уходят ключами: слова подставляет клиент по своему словарю.
  assert.equal((await request('library', { kind: 'story', title: '' })).data.error, '#err.titleLength');
  assert.equal((await request('library', { kind: 'story', title: 'X' }, false)).data.error, '#err.ownerOnly');
  assert.equal((await request('library', { action: 'donations', links: [{ kind: 'boosty', url: 'javascript:alert(1)' }] })).status, 400);
  assert.equal(
    (await request('library', {
      action: 'donations',
      links: [{ kind: 'boosty', url: 'https://boosty.to/truethrills' }, { kind: 'paypal', url: 'https://paypal.me/truethrills' }],
    })).status,
    200,
  );
  assert.deepEqual((await request('library', undefined, false)).data.donations, [
    { kind: 'boosty', url: 'https://boosty.to/truethrills' },
    { kind: 'paypal', url: 'https://paypal.me/truethrills' },
  ]);

  // Видео: сохраняется только ссылка, файл на сервер не попадает.
  assert.equal((await request('library', { kind: 'video', title: 'No link' })).status, 400);
  assert.equal((await request('library', { kind: 'video', title: 'Insecure', videoUrl: 'http://youtu.be/dQw4w9WgXcQ' })).status, 400);
  const video = await request('library', { kind: 'video', title: 'Behind the scenes', videoUrl: 'https://youtu.be/dQw4w9WgXcQ', published: true });
  assert.equal(video.status, 200);
  const listedVideo = (await request('library', undefined, false)).data.items.find(p => p.id === video.data.id);
  assert.equal(listedVideo.kind, 'video');
  assert.equal(listedVideo.videoUrl, 'https://youtu.be/dQw4w9WgXcQ');
  assert.equal(listedVideo.audioKey, null);

  // Ссылки на площадки: только HTTPS и только известные площадки.
  assert.equal((await request('library', { action: 'links', links: [{ kind: 'tiktok', url: 'http://tiktok.com/@tt' }] })).status, 400);
  assert.equal((await request('library', { action: 'links', links: [{ kind: 'myspace', url: 'https://myspace.com/tt' }] })).status, 400);
  assert.equal(
    (await request('library', {
      action: 'links',
      links: [{ kind: 'tiktok', url: 'https://www.tiktok.com/@truethrills' }, { kind: 'bogus', url: 'https://bogus.test' }],
    })).status,
    200,
  );
  assert.deepEqual((await request('library', undefined, false)).data.links, [{ kind: 'tiktok', url: 'https://www.tiktok.com/@truethrills' }]);
  // Адрес, скопированный из строки браузера без схемы, дополняется, а не теряется молча.
  assert.equal((await request('library', { action: 'links', links: [{ kind: 'tiktok', url: 'tiktok.com/@true_thrills' }] })).status, 200);
  assert.deepEqual((await request('library', undefined, false)).data.links, [{ kind: 'tiktok', url: 'https://tiktok.com/@true_thrills' }]);

  let r = await dispatch('audio', {
    method: 'POST',
    headers: { cookie: ownerCookie, 'Content-Type': 'audio/mpeg', 'X-Upload-Size': '6' },
    body: new Blob(['abcdef']).stream(),
    duplex: 'half',
  });
  assert.equal(r.status, 200);
  const { key } = await r.json();
  const p = await request('library', { kind: 'podcast', title: 'Test audio', audioKey: key, published: false });
  assert.equal(p.status, 200);
  r = await dispatch('audio', { search: '?id=' + p.data.id });
  assert.equal(r.status, 404);
  await request('library', { action: 'visibility', id: p.data.id, published: true });
  r = await dispatch('audio', { search: '?id=' + p.data.id, headers: { Range: 'bytes=1-3' } });
  assert.equal(r.status, 206);
  assert.equal(r.headers.get('content-range'), 'bytes 1-3/6');
  assert.equal(await r.text(), 'bcd');

  // Обложки: загрузка своего изображения вместо ссылки, и фон эфира (channelArt).
  assert.equal((await dispatch('cover', { method: 'POST', headers: { cookie: ownerCookie, 'Content-Type': 'text/plain', 'X-Upload-Size': '3' }, body: new Blob(['xyz']).stream(), duplex: 'half' })).status, 400);
  let cr = await dispatch('cover', { method: 'POST', headers: { cookie: ownerCookie, 'Content-Type': 'image/png', 'X-Upload-Size': '3' }, body: new Blob(['xyz']).stream(), duplex: 'half' });
  assert.equal(cr.status, 200);
  const { key: coverKey } = await cr.json();
  const withCover = await request('library', { kind: 'video', title: 'Cover test', videoUrl: 'https://youtu.be/dQw4w9WgXcQ', coverKey, published: false });
  assert.equal(withCover.status, 200);
  assert.equal((await dispatch('cover', { search: '?id=' + withCover.data.id })).status, 404);
  await request('library', { action: 'visibility', id: withCover.data.id, published: true });
  cr = await dispatch('cover', { search: '?id=' + withCover.data.id });
  assert.equal(cr.status, 200);
  assert.equal(await cr.text(), 'xyz');
  await request('library', { action: 'delete', id: withCover.data.id });
  assert.equal((await dispatch('cover', { search: '?id=' + withCover.data.id })).status, 404);

  assert.equal((await dispatch('cover', { search: '?id=channel' })).status, 404);
  cr = await dispatch('cover', { method: 'POST', headers: { cookie: ownerCookie, 'Content-Type': 'image/jpeg', 'X-Upload-Size': '6' }, body: new Blob(['channl']).stream(), duplex: 'half' });
  const { key: artKey } = await cr.json();
  assert.equal((await request('library', { action: 'channelArt', key: 'not-a-cover-key' })).status, 400);
  assert.equal((await request('library', { action: 'channelArt', key: artKey })).status, 200);
  cr = await dispatch('cover', { search: '?id=channel' });
  assert.equal(cr.status, 200);
  assert.equal(await cr.text(), 'channl');

  assert.equal((await request('live', { action: 'start', title: 'Unauthorized' }, false)).status, 403);
  const liveRes = await request('live', { action: 'start', title: 'Test broadcast' });
  assert.equal(liveRes.status, 200);
  const publicLive = await request('live', undefined, false, {}, '?status=1');
  assert.equal(publicLive.data.live.id, liveRes.data.id);
  assert.equal(publicLive.data.live.title, 'Test broadcast');
  assert.deepEqual(Object.keys(publicLive.data.live).sort(), ['id', 'title']);
  const cacheResponse = await dispatch('live', { search: '?status=1' });
  assert.equal(cacheResponse.headers.get('cache-control'), 'no-store');
  assert.equal((await request('live', { action: 'start', title: 'Duplicate' })).status, 400);
  const join = await request(
    'live',
    { action: 'join', id: liveRes.data.id, offer: JSON.stringify({ type: 'offer', sdp: 'test' }) },
    false,
  );
  assert.equal(join.status, 200);
  assert.equal((await request('live', undefined, false, { 'x-peer-token': 'wrong' }, '?peer=' + join.data.id)).status, 404);
  await request('live', { action: 'answer', peer: join.data.id, answer: 'answer-sdp' });
  assert.equal(
    (await request('live', undefined, false, { 'x-peer-token': join.data.token }, '?peer=' + join.data.id)).data.answer,
    'answer-sdp',
  );
  // A phone may stop JS polling while its WebRTC connection still carries audio.
  getDb().$client.prepare('UPDATE peers SET heartbeat=? WHERE id=?').run(Date.now()-70000,join.data.id);
  await request('live',{action:'heartbeat',id:liveRes.data.id,connected:[join.data.id]});
  assert.equal((await request('live',undefined,false,{'x-peer-token':join.data.token},'?peer='+join.data.id)).data.active,true);
  await request('live', { action: 'stop', id: liveRes.data.id });
  assert.equal((await request('library')).data.live, null);
  assert.equal((await request('live', undefined, false, {}, '?status=1')).data.live, null);
  assert.equal(
    (await request('live', undefined, false, { 'x-peer-token': join.data.token }, '?peer=' + join.data.id)).data.active,
    false,
  );
  assert.equal((await request('live', { action: 'heartbeat', id: liveRes.data.id })).status, 409);

  await request('library', { action: 'delete', id: p.data.id });
  r = await dispatch('audio', { search: '?id=' + p.data.id });
  assert.equal(r.status, 404);


  const {createECDH,randomBytes,hkdfSync,createDecipheriv}=await import('node:crypto');
  const client=createECDH('prime256v1');client.generateKeys();const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/test',keys:{p256dh:client.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}};
  assert.equal((await request('notifications',{action:'subscribe',subscription:{...subscription,endpoint:'https://127.0.0.1/private'},preferences:7},false)).status,400);
  const sub=await request('notifications',{action:'subscribe',subscription,preferences:4},false);assert.equal(sub.status,200);assert.equal(sub.data.token.length,43);const deviceHeaders={'x-push-token':sub.data.token};
  const hidden=await request('notifications',undefined,false,{},'?id='+sub.data.id);assert.equal(hidden.status,400);
  const prefs=await request('notifications',undefined,false,deviceHeaders,'?id='+sub.data.id);assert.equal(prefs.data.current.preferences,4);assert.equal(JSON.stringify(prefs.data).includes('privateKey'),false);
  assert.equal((await request('notifications',{action:'subscribe',subscription,preferences:7},false,{'x-push-token':'a'.repeat(43)})).status,403);
  const sent=[],originalFetch=globalThis.fetch;let responseStatus=201;
  globalThis.fetch=async(url,init)=>{assert.equal(new URL(url).hostname,'fcm.googleapis.com');sent.push({headers:new Headers(init.headers),body:Buffer.from(init.body)});return new Response(null,{status:responseStatus});};
  try{
   const pub=await request('library',{kind:'story',title:'Push story',body:'Body',published:true});assert.equal(pub.status,200);
   await request('library',{action:'visibility',id:pub.data.id,published:true});await push.flushPush();await push.flushPush();assert.equal(sent.length,1);
   assert.equal(sent[0].headers.get('content-encoding'),'aes128gcm');assert.match(sent[0].headers.get('authorization'),/^vapid /);
   const bytes=sent[0].body,salt=bytes.subarray(0,16),serverPublic=bytes.subarray(21,21+bytes[20]),ciphertext=bytes.subarray(21+bytes[20]);
   const ikm=hkdfSync('sha256',client.computeSecret(serverPublic),Buffer.from(subscription.keys.auth,'base64url'),Buffer.concat([Buffer.from('WebPush: info\0'),client.getPublicKey(),serverPublic]),32);
   const cek=hkdfSync('sha256',ikm,salt,Buffer.from('Content-Encoding: aes128gcm\0'),16),nonce=hkdfSync('sha256',ikm,salt,Buffer.from('Content-Encoding: nonce\0'),12);const decipher=createDecipheriv('aes-128-gcm',cek,nonce);decipher.setAuthTag(ciphertext.subarray(-16));const clear=Buffer.concat([decipher.update(ciphertext.subarray(0,-16)),decipher.final()]);let last=clear.length-1;while(clear[last]===0)last--;assert.equal(clear[last],2);assert.equal(JSON.parse(clear.subarray(0,last).toString()).body,'Push story');
   await request('library',{kind:'story',title:'Draft push',body:'Draft',published:false});const ignored=await request('live',{action:'start',title:'Category off'});await push.flushPush();assert.equal(sent.length,1);await request('live',{action:'stop',id:ignored.data.id});
   await request('library',{kind:'story',title:'Retry',body:'Body',published:true});responseStatus=503;await push.flushPush();assert.equal(getDb().$client.prepare("SELECT attempts FROM push_outbox WHERE state='pending'").get().attempts,1);
   getDb().$client.prepare("UPDATE push_outbox SET available_at=0 WHERE state='pending'").run();responseStatus=410;await push.flushPush();assert.equal(getDb().$client.prepare('SELECT id FROM push_subscriptions WHERE id=?').get(sub.data.id),undefined);
  }finally{globalThis.fetch=originalFetch;}

  const {generateKeyPairSync,createVerify}=await import('node:crypto');
  const {writeFile}=await import('node:fs/promises');
  const {publicKey:fcmPub,privateKey:fcmPriv}=generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
  const saFile=path.join(dir,'firebase-service-account.json');
  await writeFile(saFile,JSON.stringify({client_email:'push@true-thrills.iam.gserviceaccount.com',private_key:fcmPriv,project_id:'true-thrills'}));
  process.env.FIREBASE_SERVICE_ACCOUNT_FILE=saFile;
  assert.equal((await request('notifications',{action:'subscribe',kind:'fcm',token:'short',preferences:7},false)).status,400);
  const fcmToken='a'.repeat(152);
  const fcmSub=await request('notifications',{action:'subscribe',kind:'fcm',token:fcmToken,preferences:7,locale:'it'},false);assert.equal(fcmSub.status,200);
  let fcmBody=null,fcmSendStatus=200;
  globalThis.fetch=async(url,init)=>{
   const u=new URL(url);
   if(u.hostname==='oauth2.googleapis.com'){
    const params=new URLSearchParams(init.body);const [h,c,s]=params.get('assertion').split('.');
    assert.equal(createVerify('RSA-SHA256').update(`${h}.${c}`).verify(fcmPub,Buffer.from(s,'base64url')),true);
    return Response.json({access_token:'test-fcm-access',expires_in:3600});
   }
   assert.equal(u.href,'https://fcm.googleapis.com/v1/projects/true-thrills/messages:send');
   assert.equal(init.headers.authorization,'Bearer test-fcm-access');
   fcmBody=JSON.parse(init.body);
   return new Response(null,{status:fcmSendStatus});
  };
  try{
   const post=await request('library',{kind:'story',title:'FCM story',body:'Body',published:true});assert.equal(post.status,200);
   await request('library',{action:'visibility',id:post.data.id,published:true});await push.flushPush();
   assert.equal(fcmBody.message.token,fcmToken);assert.equal(fcmBody.message.data.body,'FCM story');assert.equal(fcmBody.message.data.tag.startsWith('post:'),true);
   // Устройство подписалось с locale:'it' — заголовок приходит по-итальянски,
   // а название публикации остаётся авторским и не переводится.
   assert.equal(fcmBody.message.data.title,'Nuovo racconto di True Thrills');
   await push.sendFcmNotice(fcmToken,{title:'live',body:'test',url:'/',tag:'live:test'},90);
   assert.equal(fcmBody.message.android.ttl,'90s');assert.ok(Number(fcmBody.message.data.expiresAt)>Date.now()+85000);assert.ok(Number(fcmBody.message.data.expiresAt)<=Date.now()+90000);
   const rotated=await request('notifications',{action:'subscribe',kind:'fcm',token:'b'.repeat(152),previousId:fcmSub.data.id,preferences:7,locale:'it'},false,{'x-push-token':fcmSub.data.token});assert.equal(rotated.status,200);
   assert.equal(getDb().$client.prepare('SELECT id FROM push_subscriptions WHERE id=?').get(fcmSub.data.id),undefined);
   const foreign=await request('notifications',{action:'subscribe',kind:'fcm',token:'c'.repeat(152),previousId:rotated.data.id,preferences:7},false,{'x-push-token':'x'.repeat(43)});assert.notEqual(foreign.status,200);assert.ok(getDb().$client.prepare('SELECT id FROM push_subscriptions WHERE id=?').get(rotated.data.id));
   assert.equal((await request('library',{kind:'story',title:'Unsafe cover',body:'x',coverUrl:'javascript:alert(1)'})).status,400);
   fcmSendStatus=404;
   const post2=await request('library',{kind:'story',title:'FCM story 2',body:'Body',published:true});
   await request('library',{action:'visibility',id:post2.data.id,published:true});await push.flushPush();
   assert.equal(getDb().$client.prepare('SELECT id FROM push_subscriptions WHERE id=?').get(fcmSub.data.id),undefined);
  }finally{globalThis.fetch=originalFetch;}
  console.log(
    'PASS: anonymous Web Push, native FCM (Android), device ownership, encryption round-trip, deduplication, preferences, retry/expiry, background live lease, owner session bootstrap, write authorization, cross-origin rejection, draft privacy, publishing, video links, social links, error keys, notification language, donation validation, streaming upload, audio range playback, cover upload/serving, channel art, live lifecycle, peer token isolation, deletion.',
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
