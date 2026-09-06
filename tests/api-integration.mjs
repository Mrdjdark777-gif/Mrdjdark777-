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
const { library, audio, live, auth } = await import(outfile);
const routes = { library, audio, live };

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

  console.log(
    'PASS: owner session bootstrap, write authorization, cross-origin rejection, draft privacy, publishing, donation validation, streaming upload, audio range playback, live lifecycle, peer token isolation, deletion.',
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
