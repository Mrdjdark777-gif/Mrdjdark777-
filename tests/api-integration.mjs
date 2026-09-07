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
      export * as library from '${root}/app/api/library/route.ts';
      export * as audio from '${root}/app/api/audio/route.ts';
      export * as live from '${root}/app/api/live/route.ts';
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
const { library, audio, live, auth, notifications, push, getDb } = await import(outfile);
const routes = { library, audio, live, notifications };

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
  assert.equal((await request('library', undefined, false)).data.needsSetup, true);
  assert.equal((await request('library', { action: 'setup' }, false)).status, 401);
  assert.equal((await request('library', { action: 'setup' })).status, 200);
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
  assert.equal((await request('library', { action: 'donation', url: 'javascript:alert(1)' })).status, 400);
  assert.equal((await request('library', { action: 'donation', url: 'https://payments.example/dima' })).status, 200);

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
  console.log(
    'PASS: anonymous Web Push, device ownership, encryption round-trip, deduplication, preferences, retry/expiry, background live lease, owner session bootstrap, write authorization, cross-origin rejection, draft privacy, publishing, donation validation, streaming upload, audio range playback, live lifecycle, peer token isolation, deletion.',
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
