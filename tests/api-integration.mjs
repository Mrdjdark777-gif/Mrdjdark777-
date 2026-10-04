import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {existsSync,readdirSync} from 'node:fs';

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
// Уменьшенные обложки лежат отдельно от хранилища: это производные файлы, их
// не считает копия и по ним не ходит уборка сирот.
process.env.THUMB_DIR = path.join(dir, 'thumbs');
process.env.SESSION_SECRET = 'test-secret-not-for-production-use';
process.env.ADMIN_PASSWORD = 'test-password';

execFileSync('npx', ['drizzle-kit', 'migrate'], { cwd: root, stdio: 'inherit', env: process.env });

// import() берёт не путь, а адрес. На Linux абсолютный путь начинается со
// слэша и сходит за адрес сам собой, а на Windows он начинается с «C:», и Node
// принимает «c:» за протокол: «Only URLs with a scheme in: file, data, and node
// are supported». Поэтому путь переводится в file:// явно — иначе весь прогон
// на машине владельца падает на первой же сборке.
const outfile = path.join(dir, 'routes.mjs');
await build({
  stdin: {
    contents: `
      export * as uiClient from '${root}/lib/client.ts';
      export * as video from '${root}/lib/video.ts';
      export * as library from '${root}/app/api/library/route.ts';
      export * as audio from '${root}/app/api/audio/route.ts';
      export * as cover from '${root}/app/api/cover/route.ts';
      export * as live from '${root}/app/api/live/route.ts';
      export * as login from '${root}/app/api/auth/route.ts';
      export * as auth from '${root}/lib/auth.ts';
      export * as notifications from '${root}/app/api/notifications/route.ts';
      export * as push from '${root}/lib/push.ts';
      export * as liveRecording from '${root}/lib/live-recording.ts';
      export * as storage from '${root}/lib/storage.ts';
      export * as thumbs from '${root}/lib/thumbs.ts';
      export * as dicts from '${root}/lib/i18n/index.ts';
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
const { uiClient, video: videoLib, library, audio, cover, live, auth, login, ice, notifications, push, liveRecording, storage, thumbs, dicts, getDb } = await import(pathToFileURL(outfile).href);
const liveLimit = liveRecording.liveListenerLimit;
const routes = { library, audio, cover, live, notifications, login, ice };

const ORIGIN = 'https://true-thrills.test';
let ownerCookie = auth.createSessionCookie(new Request(ORIGIN)).split(';')[0];

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
  // Вид площадки без проверки её домена ничего не значил: под видом PayPal
  // сохранялся любой HTTPS-адрес, и кнопка поддержки вела куда угодно.
  assert.equal((await request('library', { action: 'donations', links: [{ kind: 'paypal', url: 'https://unrelated.invalid/pay' }] })).status, 400,
   'под видом PayPal сохранился чужой домен');
  // Похожий домен — не тот же домен: совпадать должен сам домен или его
  // поддомен, а не хвост строки.
  assert.equal((await request('library', { action: 'donations', links: [{ kind: 'paypal', url: 'https://paypal.com.attacker.example/pay' }] })).status, 400,
   'домен-двойник принят за PayPal');
  assert.equal((await request('library', { action: 'links', links: [{ kind: 'telegram', url: 'https://example.invalid/chat' }] })).status, 400,
   'под видом Telegram сохранился чужой домен');
  // «Мой сайт» — это любой адрес по смыслу, и ограничивать его нечем.
  assert.equal((await request('library', { action: 'links', links: [{ kind: 'site', url: 'https://truethrills.com' }] })).status, 200,
   'собственный сайт должен сохраняться с любым доменом');
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

  // Cookie подписана и живёт до срока, серверной записи о ней нет: снятая
  // копия оставалась годной даже после смены ADMIN_PASSWORD, потому что
  // пароль на подпись не влияет. Теперь в подпись входит поколение сессий.
  {
   const stolen = ownerCookie;
   const revoked = await dispatch('login', { method: 'POST', headers: { cookie: stolen, 'Content-Type': 'application/json', origin: 'https://truethrills.test', host: 'truethrills.test' }, body: JSON.stringify({ action: 'revokeAll' }) });
   assert.equal(revoked.status, 200, '«выйти на всех устройствах» не сработало');
   const fresh = revoked.headers.get('set-cookie').split(';')[0];
   assert.notEqual(fresh, stolen, 'после отзыва выдана та же самая cookie');
   assert.equal(auth.sessionUserId(new Request('https://truethrills.test/', { headers: { cookie: stolen } })), null,
    'старая cookie осталась годной после отзыва всех сессий');
   assert.equal(auth.sessionUserId(new Request('https://truethrills.test/', { headers: { cookie: fresh } })), 'owner',
    'свежая cookie не работает после отзыва');
   ownerCookie = fresh;
  }

  // Заявленный размер — это слова отправителя. Раньше им верили: весь поток
  // сначала писался на диск и только потом сверялся размер, поэтому соврав в
  // заголовке можно было занять место чем угодно. Теперь чтение обрывается
  // на превышении, а недописанный файл не остаётся в хранилище.
  //
  // Проверять это через маршрут бессмысленно: там есть вторая сверка размера
  // после записи, и она вернёт ошибку в любом случае — прогон пройдёт и без
  // защиты. Поэтому спрашиваем само хранилище.
  {
   const coverDir = path.join(process.env.STORAGE_DIR, 'cover');
   const count = () => existsSync(coverDir) ? readdirSync(coverDir).length : 0;
   const before = count();
   const big = Buffer.alloc(3 * 1024 * 1024, 7);
   await assert.rejects(
    () => storage.localBucket().put('cover/over-limit', new Blob([big]).stream(), {maxBytes: 64 * 1024}),
    'хранилище приняло поток больше предела: чтение не обрывается по ходу',
   );
   assert.equal(count(), before,
    'оборванная загрузка оставила файл в хранилище');
   // Предел не мешает обычной загрузке.
   await storage.localBucket().put('cover/under-limit', new Blob([Buffer.alloc(1024, 1)]).stream(), {maxBytes: 64 * 1024});
   assert.ok(existsSync(path.join(process.env.STORAGE_DIR, 'cover/under-limit')), 'нормальная загрузка не сохранилась');
  }

  // Видео: сохраняется только ссылка, файл на сервер не попадает.
  assert.equal((await request('library', { kind: 'video', title: 'No link' })).status, 400);
  assert.equal((await request('library', { kind: 'video', title: 'Insecure', videoUrl: 'http://youtu.be/dQw4w9WgXcQ' })).status, 400);
  const video = await request('library', { kind: 'video', title: 'Behind the scenes', videoUrl: 'https://youtu.be/dQw4w9WgXcQ', published: true });
  assert.equal(video.status, 200);
  const listedVideo = (await request('library', undefined, false)).data.items.find(p => p.id === video.data.id);
  assert.equal(listedVideo.kind, 'video');
  assert.equal(listedVideo.videoUrl, 'https://youtu.be/dQw4w9WgXcQ');
  {
    // Вертикальные ролики должны попадать в вертикальную рамку: раньше Shorts
    // открывались в кадре 16:9 и стояли в полях или обрезались.
    const wide = videoLib.parseVideo('https://youtu.be/dQw4w9WgXcQ');
    assert.equal(wide.tall, false, 'обычное видео — горизонтальная рамка');
    assert.match(wide.embed, /iv_load_policy=3/, 'аннотации должны быть выключены');
    assert.equal(videoLib.parseVideo('https://www.youtube.com/shorts/dQw4w9WgXcQ').tall, true, 'YouTube Shorts — вертикальная рамка');
    assert.equal(videoLib.parseVideo('https://rutube.ru/shorts/abcdef0123456789/').tall, true, 'Rutube Shorts — вертикальная рамка');
    assert.equal(videoLib.parseVideo('https://rutube.ru/video/abcdef0123456789/').tall, false, 'обычный Rutube — горизонтальная рамка');
    assert.equal(videoLib.parseVideo('https://www.tiktok.com/@a/video/1234567890123').tall, true, 'TikTok — вертикальная рамка');
  }
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

  // Тип аудиоматериала. Хранится на сервере и приходит в списке; публикация
  // без типа не проходит; незнакомое значение отклоняется; правка без поля
  // (студия старой версии) тип не стирает; смена типа — тем же обновлением,
  // без повторной загрузки файла; старая запись без типа читается как есть.
  {
   const item = async (id) => (await request('library', undefined)).data.items.find((x) => x.id === id);
   const none = await request('library', { kind: 'podcast', title: 'Без типа', audioKey: key, published: true });
   assert.equal(none.status, 400, 'аудио без типа опубликовалось');
   assert.equal(none.data.error, '#err.audioCategory');
   const bad = await request('library', { kind: 'podcast', title: 'Чужой тип', audioKey: key, audioCategory: 'mp3', published: true });
   assert.equal(bad.status, 400, 'незнакомый тип аудио принят');
   assert.equal(bad.data.error, '#err.audioCategoryBad');
   const draft = await request('library', { kind: 'podcast', title: 'Черновик без типа', audioKey: key, published: false });
   assert.equal(draft.status, 200, 'черновик без типа не сохранился');
   assert.equal((await item(draft.data.id)).audioCategory, null);
   const made3 = [];
   for (const c of ['audio_story', 'podcast', 'music']) {
    const made = await request('library', { kind: 'podcast', title: 'Тип ' + c, audioKey: key, audioCategory: c, published: true });
    assert.equal(made.status, 200, 'не сохранился тип ' + c);
    assert.equal((await item(made.data.id)).audioCategory, c, 'тип ' + c + ' не вернулся из списка');
    made3.push(made.data.id);
   }
   const story = await request('library', { kind: 'podcast', title: '76 дней', description: 'Стивен Каллахэн.', audioKey: key, audioCategory: 'podcast', published: true });
   const id = story.data.id;
   // Смена типа тем же обновлением: файл тот же, ключ тот же.
   assert.equal((await request('library', { id, kind: 'podcast', title: '76 дней', description: 'Стивен Каллахэн.', audioKey: key, audioCategory: 'audio_story', published: true })).status, 200);
   const changed = await item(id);
   assert.equal(changed.audioCategory, 'audio_story', 'тип не сменился');
   assert.equal(changed.audioKey, key, 'при смене типа поменялся файл');
   // Студия старой версии не знает о типе и не присылает поле: тип остаётся.
   assert.equal((await request('library', { id, kind: 'podcast', title: '76 дней (правка)', audioKey: key, published: true })).status, 200);
   assert.equal((await item(id)).audioCategory, 'audio_story', 'правка без поля стёрла тип');
   // Снять тип у опубликованной записи нельзя.
   assert.equal((await request('library', { id, kind: 'podcast', title: '76 дней', audioKey: key, audioCategory: '', published: true })).status, 400);
   // Тип — только у аудио: видео и рассказ его не получают, что бы ни прислали.
   const v = await request('library', { kind: 'story', title: 'Рассказ', body: 'Текст', audioCategory: 'music', published: false });
   assert.equal((await item(v.data.id)).audioCategory, null, 'тип аудио приклеился к рассказу');
   // Старая запись без типа (вставлена мимо API, как в рабочих данных)
   // читается, а правка старой студией её не ломает.
   getDb().$client.prepare("INSERT INTO posts(id,kind,title,description,body,audio_key,duration,published,created_at) VALUES('legacy-1','podcast','Старая','','',?,0,1,?)").run(key, Date.now());
   assert.equal((await item('legacy-1')).audioCategory, null);
   assert.equal((await request('library', { id: 'legacy-1', kind: 'podcast', title: 'Старая, правка', audioKey: key, published: true })).status, 200, 'старая запись без типа перестала сохраняться старой студией');
   for (const pid of [draft.data.id, id, v.data.id, 'legacy-1', ...made3]) await request('library', { action: 'delete', id: pid });
  }

  // Перемотка: плеер просит с середины и до конца, не зная точной длины.
  // Прежде конец диапазона не прижимался к размеру файла, и Content-Length
  // обещал байты, которых нет, — перемотка вставала на последних секундах.
  r = await dispatch('audio', { search: '?id=' + p.data.id, headers: { Range: 'bytes=2-999999' } });
  assert.equal(r.status, 206);
  assert.equal(r.headers.get('content-range'), 'bytes 2-5/6');
  assert.equal(r.headers.get('content-length'), '4');
  assert.equal(await r.text(), 'cdef');
  r = await dispatch('audio', { search: '?id=' + p.data.id, headers: { Range: 'bytes=3-' } });
  assert.equal(r.status, 206);
  assert.equal(r.headers.get('content-range'), 'bytes 3-5/6');
  assert.equal(await r.text(), 'def');
  // Хвост файла: так Safari перематывает, и так читается индекс M4A.
  r = await dispatch('audio', { search: '?id=' + p.data.id, headers: { Range: 'bytes=-2' } });
  assert.equal(r.status, 206, 'Суффиксный диапазон раньше молча отдавал файл целиком');
  assert.equal(r.headers.get('content-range'), 'bytes 4-5/6');
  assert.equal(await r.text(), 'ef');
  r = await dispatch('audio', { search: '?id=' + p.data.id, headers: { Range: 'bytes=-99' } });
  assert.equal(r.status, 206);
  assert.equal(r.headers.get('content-range'), 'bytes 0-5/6');
  // Начало за концом файла — 416 с настоящим размером, а не молчаливые 200.
  r = await dispatch('audio', { search: '?id=' + p.data.id, headers: { Range: 'bytes=6-7' } });
  assert.equal(r.status, 416);
  assert.equal(r.headers.get('content-range'), 'bytes */6');
  r = await dispatch('audio', { search: '?id=' + p.data.id, headers: { Range: 'bytes=99-' } });
  assert.equal(r.status, 416);
  // Мусор в заголовке — отдаём файл целиком, как требует RFC.
  for (const bad of ['bytes=abc-1', 'items=0-1', 'bytes=-', 'bytes=4-2']) {
    r = await dispatch('audio', { search: '?id=' + p.data.id, headers: { Range: bad } });
    if (bad === 'bytes=4-2') { assert.equal(r.status, 416, bad); continue; }
    assert.equal(r.status, 200, 'Непонятный Range не должен ломать выдачу: ' + bad);
    assert.equal(await r.text(), 'abcdef');
  }

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

  /**
   * Плитке отдаётся уменьшенная обложка, а не оригинал.
   *
   * Браузер распаковывает картинку целиком, какой бы маленькой её ни
   * показывали. Обложки у владельца 1080×1350 — полтора миллиона точек и около
   * шести мегабайт распакованного вида на плитку, а плиток в карусели
   * тридцать шесть. Медленное листание открывает их по одной и успевает;
   * брошенная лента открывает пачкой, и телефон встаёт. Владелец описал это
   * словами «листнул быстро и заново — зависает», и ни одна правка в коде
   * прокрутки ничего не меняла: работа была не в прокрутке.
   */
  {
   const sharp = (await import('sharp')).default;
   const full = await sharp({ create: { width: 1080, height: 1350, channels: 3, background: { r: 18, g: 120, b: 110 } } })
    .jpeg({ quality: 90 }).toBuffer();
   const up = await dispatch('cover', { method: 'POST', headers: { cookie: ownerCookie, 'Content-Type': 'image/jpeg', 'X-Upload-Size': String(full.length) }, body: new Blob([full]).stream(), duplex: 'half' });
   assert.equal(up.status, 200, 'настоящая обложка не загрузилась');
   const { key: bigKey } = await up.json();
   const shot = await request('library', { kind: 'video', title: 'Обложка 1080×1350', videoUrl: 'https://youtu.be/dQw4w9WgXcQ', coverKey: bigKey, published: true });
   assert.equal(shot.status, 200);

   // Без ширины — оригинал, как было всегда: полноэкранным местам нужен он.
   const whole = await dispatch('cover', { search: '?id=' + shot.data.id });
   assert.equal(whole.status, 200);
   const wholeBytes = Buffer.from(await whole.arrayBuffer());
   assert.equal(wholeBytes.length, full.length, 'без ширины приехал не оригинал');

   // С шириной — уменьшенная, и ровно запрошенной ширины.
   const small = await dispatch('cover', { search: '?id=' + shot.data.id + '&w=480' });
   assert.equal(small.status, 200, 'уменьшенная обложка не отдалась');
   assert.equal(small.headers.get('content-type'), 'image/webp', 'уменьшенная приехала не в webp');
   const smallBytes = Buffer.from(await small.arrayBuffer());
   const meta = await sharp(smallBytes).metadata();
   assert.equal(meta.width, 480, 'ширина уменьшенной не та, что просили: ' + meta.width);
   assert.ok(smallBytes.length * 3 < wholeBytes.length,
    'уменьшенная весит не меньше втрое: ' + smallBytes.length + ' против ' + wholeBytes.length);
   assert.equal(Number(small.headers.get('content-length')), smallBytes.length,
    'объявленная длина не совпала с телом ответа');

   /**
    * Тело ответа — ровно картинка, а не кусок общего пула.
    *
    * Buffer в Node для небольших данных выдаётся куском заранее выделенного
    * пула, и `.buffer` у него шире самих данных: у стобайтовой картинки это
    * восемь килобайт. Отдай такой буфер целиком — и к картинке приедет хвост
    * чужой памяти. Через маршрут это не ловится: readFile пула не трогает, и
    * проверка молчала бы на обеих сторонах. Поэтому спрашиваем напрямую, с
    * заведомо пуловым буфером.
    */
   {
    const pooled = Buffer.allocUnsafe(100);
    assert.ok(pooled.buffer.byteLength > pooled.byteLength,
     'Node перестал выдавать пуловые буферы — проверка ничего не сторожит');
    assert.equal(thumbs.bodyOf(pooled).byteLength, 100,
     'в тело ответа уехал весь пул, а не картинка: ' + thumbs.bodyOf(pooled).byteLength + ' байт вместо 100');
   }

   // Сделанная однажды остаётся на диске: второй раз оригинал не читается.
   assert.equal(readdirSync(process.env.THUMB_DIR).filter((f) => f.endsWith('-480.webp')).length, 1,
    'уменьшенная не легла на диск — её будут пересжимать на каждый запрос');

   // Ширина не из списка — это оригинал, а не повод пересжать что угодно.
   // Иначе любой желающий закажет тысячу ширин и займёт сервер и диск.
   const odd = await dispatch('cover', { search: '?id=' + shot.data.id + '&w=481' });
   assert.equal(Buffer.from(await odd.arrayBuffer()).length, full.length, 'ширина не из списка всё-таки пересжала картинку');

   // Файл, который не картинка, уменьшить нельзя — и экран от этого не пустеет.
   const broken = await dispatch('cover', { method: 'POST', headers: { cookie: ownerCookie, 'Content-Type': 'image/png', 'X-Upload-Size': '3' }, body: new Blob(['xyz']).stream(), duplex: 'half' });
   const { key: brokenKey } = await broken.json();
   const brokenPost = await request('library', { kind: 'video', title: 'Битая обложка', videoUrl: 'https://youtu.be/dQw4w9WgXcQ', coverKey: brokenKey, published: true });
   const fallback = await dispatch('cover', { search: '?id=' + brokenPost.data.id + '&w=480' });
   assert.equal(fallback.status, 200, 'на нечитаемой картинке маршрут упал, а должен отдать как есть');
   assert.equal(await fallback.text(), 'xyz', 'на нечитаемой картинке отдалось не исходное содержимое');

   await request('library', { action: 'delete', id: shot.data.id });
   await request('library', { action: 'delete', id: brokenPost.data.id });
  }

  // Архив эфира и сам эфир держат одну обложку: воркер переносит её на выпуск
  // при публикации. Удаление выпуска стирало файл и оставляло строку эфира
  // указывать в пустоту — на этом 14 сентября встало обновление сервера,
  // потому что проверка бэкапа требует каждый файл, названный в базе.
  //
  // Первое решение обнуляло обложку у эфира. Оно закрывало проверку копии, но
  // ломало сам эфир: картинка у него пропадала без всякой на то причины.
  // Теперь файл просто не удаляется, пока на него ссылается хоть кто-то, —
  // и строка эфира остаётся верной.
  {
   const db = getDb().$client;
   const shared = await dispatch('cover', { method: 'POST', headers: { cookie: ownerCookie, 'Content-Type': 'image/png', 'X-Upload-Size': '5' }, body: new Blob(['live!']).stream(), duplex: 'half' });
   assert.equal(shared.status, 200);
   const sharedKey = (await shared.json()).key;
   const archive = await request('library', { kind: 'podcast', audioCategory: 'podcast', title: 'Архив эфира', audioKey: key, coverKey: sharedKey, published: true });
   assert.equal(archive.status, 200);
   db.prepare("INSERT INTO broadcasts(id,title,owner_id,heartbeat,active,cover_key) VALUES(?,?,?,?,0,?)").run(archive.data.id, 'Архив эфира', 'owner', Date.now() - 7200000, sharedKey);
   await request('library', { action: 'delete', id: archive.data.id });
   assert.equal(db.prepare('SELECT cover_key FROM broadcasts WHERE id=?').get(archive.data.id).cover_key, sharedKey,
    'эфир потерял свою обложку из-за удаления чужого выпуска');
   assert.equal((await dispatch('cover', { search: '?id=live:' + archive.data.id })).status, 200,
    'файл обложки удалён, хотя на него ещё ссылается эфир');
   // Когда исчезает последняя ссылка, файл всё-таки уходит: иначе хранилище
   // копило бы мусор, а уборка ради этого и написана.
   db.prepare('DELETE FROM broadcasts WHERE id=?').run(archive.data.id);
   const second = await request('library', { kind: 'podcast', audioCategory: 'podcast', title: 'Ещё архив', audioKey: key, coverKey: sharedKey, published: true });
   assert.equal(second.status, 200);
   await request('library', { action: 'delete', id: second.data.id });
   assert.equal(existsSync(path.join(process.env.STORAGE_DIR, sharedKey)), false, 'файл остался в хранилище, хотя ссылок на него больше нет');
  }

  assert.equal((await dispatch('cover', { search: '?id=channel' })).status, 404);
  cr = await dispatch('cover', { method: 'POST', headers: { cookie: ownerCookie, 'Content-Type': 'image/jpeg', 'X-Upload-Size': '6' }, body: new Blob(['channl']).stream(), duplex: 'half' });
  const { key: artKey } = await cr.json();
  assert.equal((await request('library', { action: 'channelArt', key: 'not-a-cover-key' })).status, 400);
  assert.equal((await request('library', { action: 'channelArt', key: artKey })).status, 200);
  cr = await dispatch('cover', { search: '?id=channel' });
  assert.equal(cr.status, 200);
  assert.equal(await cr.text(), 'channl');

  // Картинка шторки уведомлений. Правило владельца: загружен «Фон
  // уведомлений» — он у всего, что играет; не загружен — обложка того, что
  // играет; нет и её — знак канала.
  {
   const upload = async (text) => (await (await dispatch('cover', { method: 'POST', headers: { cookie: ownerCookie, 'Content-Type': 'image/jpeg', 'X-Upload-Size': String(text.length) }, body: new Blob([text]).stream(), duplex: 'half' })).json()).key;
   const covered = await request('library', { kind: 'video', title: 'Шторка с обложкой', videoUrl: 'https://youtu.be/dQw4w9WgXcQ', coverKey: await upload('epcover'), published: true });
   const bare = await request('library', { kind: 'video', title: 'Шторка без обложки', videoUrl: 'https://youtu.be/dQw4w9WgXcQ', published: true });
   const hidden = await request('library', { kind: 'video', title: 'Шторка черновик', videoUrl: 'https://youtu.be/dQw4w9WgXcQ', coverKey: await upload('drcover'), published: false });
   const notify = (id, signed = false) => dispatch('cover', { search: '?id=' + encodeURIComponent('notify:' + id), ...(signed ? { headers: { cookie: ownerCookie } } : {}) });
   await request('library', { action: 'channelArt', key: '' });
   let r = await notify(covered.data.id);
   assert.equal(r.status, 200, 'без фона уведомлений шторка не получила обложку выпуска');
   assert.equal(await r.text(), 'epcover', 'без фона уведомлений в шторке не обложка выпуска');
   assert.match(r.headers.get('cache-control'), /no-store/, 'картинка шторки кэшируется — замена фона уведомлений не будет видна');
   r = await notify(bare.data.id);
   assert.equal(r.status, 302, 'ни фона, ни обложки — шторка должна получить знак канала, а не пустоту');
   assert.match(r.headers.get('location'), /\/brand\/logo\.png/, 'вместо знака канала шторка получила '+r.headers.get('location'));
   assert.equal((await notify(hidden.data.id)).status, 404, 'обложка черновика ушла в шторку постороннему');
   await request('library', { action: 'channelArt', key: artKey });
   for (const p of [covered, bare]) {
    r = await notify(p.data.id);
    assert.equal(r.status, 200);
    assert.equal(await r.text(), 'channl', 'фон уведомлений загружен, а в шторке «' + p.data.id + '» не он');
   }
   for (const p of [covered, bare, hidden]) await request('library', { action: 'delete', id: p.data.id });
  }

  // Постер главной. Загружается отдельно от обложки выпуска и привязан к
  // выпуску, который открывается нажатием на него.
  {
   const up = async (text) => (await (await dispatch('cover', { method: 'POST', headers: { cookie: ownerCookie, 'Content-Type': 'image/jpeg', 'X-Upload-Size': String(text.length) }, body: new Blob([text]).stream(), duplex: 'half' })).json()).key;
   const posterKey = await up('poster');
   const a = await request('library', { kind: 'video', title: 'Постер А', videoUrl: 'https://youtu.be/dQw4w9WgXcQ', published: true });
   const b = await request('library', { kind: 'video', title: 'Постер Б', videoUrl: 'https://youtu.be/dQw4w9WgXcQ', published: true });
   const draft = await request('library', { kind: 'video', title: 'Постер черновик', videoUrl: 'https://youtu.be/dQw4w9WgXcQ', published: false });
   assert.equal((await dispatch('cover', { search: '?id=hero' })).status, 404, 'постера ещё нет — отдавать нечего');
   // Чужой ключ, неизвестный выпуск, черновик и слушатель — отказ.
   assert.equal((await request('library', { action: 'hero', id: a.data.id, key: 'audio/not-a-cover' })).status, 400, 'постер принят не из загруженных обложек');
   assert.equal((await request('library', { action: 'hero', id: 'нет такого', key: posterKey })).status, 400, 'постер привязан к несуществующему выпуску');
   assert.equal((await request('library', { action: 'hero', id: draft.data.id, key: posterKey })).status, 400, 'постер ведёт на черновик — слушатель упрётся в пустоту');
   assert.equal((await request('library', { action: 'hero', id: a.data.id, key: posterKey }, false)).status, 403, 'постер главной поставил не автор');
   assert.equal((await request('library', undefined, false)).data.poster, null, 'отказы не должны были ничего сохранить');

   assert.equal((await request('library', { action: 'hero', id: a.data.id, key: posterKey })).status, 200);
   let lib = (await request('library', undefined, false)).data;
   assert.equal(lib.pinned, a.data.id, 'нажатие на постер ведёт не на выбранный выпуск');
   assert.deepEqual(lib.poster, { post: a.data.id, v: posterKey.replace(/^cover\//, '') }, 'слушатель не получил постер главной');
   cr = await dispatch('cover', { search: '?id=hero' });
   assert.equal(cr.status, 200);
   assert.equal(await cr.text(), 'poster');
   assert.match(cr.headers.get('cache-control'), /no-store/, 'постер без версии в адресе закэширован — замена не будет видна');
   cr = await dispatch('cover', { search: '?id=hero&v=' + encodeURIComponent(lib.poster.v) });
   assert.match(cr.headers.get('cache-control'), /immutable/, 'постер с нынешней версией в адресе качается заново при каждом запуске');
   cr = await dispatch('cover', { search: '?id=hero&v=old' });
   assert.match(cr.headers.get('cache-control'), /no-store/, 'постер со старой версией закэширован навсегда');

   // Другой выпуск без нового постера: постер остаётся у своего выпуска и в
   // кадр над чужим не попадает.
   assert.equal((await request('library', { action: 'hero', id: b.data.id })).status, 200);
   lib = (await request('library', undefined, false)).data;
   assert.equal(lib.pinned, b.data.id);
   assert.equal(lib.poster, null, 'постер выпуска А встал над выпуском Б');
   // Вернулся к А — постер снова его.
   await request('library', { action: 'hero', id: a.data.id });
   assert.equal((await request('library', undefined, false)).data.poster?.post, a.data.id, 'постер потерялся при возврате к своему выпуску');
   // Убрать постер, оставив выпуск.
   await request('library', { action: 'hero', id: a.data.id, key: '' });
   lib = (await request('library', undefined, false)).data;
   assert.equal(lib.pinned, a.data.id, 'удаление постера сняло и выпуск');
   assert.equal(lib.poster, null, 'постер не удалился');
   // Автоматический выбор: снято всё.
   await request('library', { action: 'hero', id: a.data.id, key: posterKey });
   await request('library', { action: 'hero', id: '' });
   lib = (await request('library', undefined, false)).data;
   assert.equal(lib.pinned, null, 'автоматический выбор не снял закрепление');
   assert.equal(lib.poster, null, 'автоматический выбор оставил постер');
   for (const p of [a, b, draft]) await request('library', { action: 'delete', id: p.data.id });
  }

  assert.equal((await request('live', { action: 'start', title: 'Unauthorized' }, false)).status, 403);
  const liveRes = await request('live', { action: 'start', title: 'Test broadcast' });
  assert.equal(liveRes.status, 200);
  const publicLive = await request('live', undefined, false, {}, '?status=1');
  assert.equal(publicLive.data.live.id, liveRes.data.id);
  assert.equal(publicLive.data.live.title, 'Test broadcast');
  // Слушателю отдаём ещё и момент выхода в эфир: по нему на экране считается,
  // сколько эфир уже идёт. Владельца эфира и прочие поля наружу не отдаём.
  // Время берётся из записи эфира, а этот эфир запущен без неё — значит null,
  // и экран слушателя просто не покажет счётчик. Настоящее время проверяет
  // live-archive-integration на эфире с работающим воркером.
  // Описание эфира слушателю тоже нужно: оно рассказывает, о чём включение,
  // и после окончания переходит в описание записи.
  assert.deepEqual(Object.keys(publicLive.data.live).sort(), ['cover', 'description', 'id', 'startedAt', 'title']);
  assert.equal(publicLive.data.live.cover, false, 'эфир запущен без обложки');
  assert.equal(publicLive.data.live.startedAt, null, 'без записи эфира времени начала нет');
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
  // Предел слушателей задаётся настройкой, а не вшит в код. Это предел на
  // вход через интерфейс: сам HLS отдаётся всем, кто знает ссылку, и строка
  // ошибки поэтому не называет число, чтобы не обещать потолок, которого нет.
  process.env.LIVE_LISTENER_LIMIT='2';
  const seat=()=>request('live',{action:'join',id:liveRes.data.id,offer:JSON.stringify({type:'offer',sdp:'test'})},false);
  assert.equal((await seat()).status,200,'второе место свободно');
  const full=await seat();
  assert.equal(full.status,400);assert.equal(full.data.error,'#err.liveFull');
  process.env.LIVE_LISTENER_LIMIT='3';
  assert.equal((await seat()).status,200,'поднятая настройка должна пускать ещё одного без правки кода');
  for(const bad of ['0','-2','нет']){process.env.LIVE_LISTENER_LIMIT=bad;assert.throws(()=>liveLimit(),/LIVE_LISTENER_LIMIT/,bad);}
  delete process.env.LIVE_LISTENER_LIMIT;
  for(const locale of ['ru','it','uk','ro'])assert.ok(!/\d/.test(dicts.translate(locale,'err.liveFull')),'строка «эфир заполнен» не должна называть число: настройка его меняет');

  await request('live', { action: 'stop', id: liveRes.data.id });
  assert.equal((await request('library')).data.live, null);
  assert.equal((await request('live', undefined, false, {}, '?status=1')).data.live, null);
  assert.equal(
    (await request('live', undefined, false, { 'x-peer-token': join.data.token }, '?peer=' + join.data.id)).data.active,
    false,
  );
  assert.equal((await request('live', { action: 'heartbeat', id: liveRes.data.id })).status, 409);

  // Обложка конкретного эфира: чужой ключ не принимается, своя отдаётся
  // публично — слушателю она нужна до всякого входа.
  //
  // Своей обложки может не быть. Тогда отдаётся оформление канала, а не 404:
  // на экране блокировки телефона пустая карточка выглядит поломкой. Раньше
  // клиент ради этого всегда просил channel art, и собственная обложка эфира
  // не показывалась никогда.
  {
   const fallback = await dispatch('cover', { search: '?id=live:' + liveRes.data.id });
   assert.equal(fallback.status, 200, 'эфир без своей обложки должен получать картинку канала');
   assert.equal(await fallback.text(), 'channl', 'подставилась не картинка канала');
   // Шторка эфира: фон уведомлений загружен — он, а не обложка эфира.
   const liveNotify = await dispatch('cover', { search: '?id=' + encodeURIComponent('notify:live:' + liveRes.data.id) });
   assert.equal(liveNotify.status, 200);
   assert.equal(await liveNotify.text(), 'channl', 'в шторке эфира не фон уведомлений');
   // А если и оформления канала нет — отдавать нечего.
   await request('library', { action: 'channelArt', key: '' });
   assert.equal((await dispatch('cover', { search: '?id=live:' + liveRes.data.id })).status, 404,
    'без обложки эфира и без оформления канала ответа быть не должно');
   assert.equal((await dispatch('cover', { search: '?id=' + encodeURIComponent('notify:live:' + liveRes.data.id) })).status, 302,
    'эфир без обложки и без фона уведомлений — шторка должна получить знак канала');
   await request('library', { action: 'channelArt', key: artKey });
  }
  assert.equal((await request('live', { action: 'start', title: 'Bad cover', coverKey: 'audio/not-a-cover' })).status, 400);
  const liveCover = await dispatch('cover', { method: 'POST', headers: { cookie: ownerCookie, 'Content-Type': 'image/png', 'X-Upload-Size': '4' }, body: new Blob(['live']).stream(), duplex: 'half' });
  const withArt = await request('live', { action: 'start', title: 'Cover live', coverKey: (await liveCover.json()).key });
  assert.equal(withArt.status, 200);
  const shownCover = await dispatch('cover', { search: '?id=live:' + withArt.data.id });
  assert.equal(shownCover.status, 200);
  assert.equal(await shownCover.text(), 'live');
  {
   // Фона уведомлений нет — в шторке эфира его собственная обложка.
   await request('library', { action: 'channelArt', key: '' });
   const own = await dispatch('cover', { search: '?id=' + encodeURIComponent('notify:live:' + withArt.data.id) });
   assert.equal(own.status, 200);
   assert.equal(await own.text(), 'live', 'без фона уведомлений в шторке эфира не его обложка');
   await request('library', { action: 'channelArt', key: artKey });
  }
  await request('live', { action: 'stop', id: withArt.data.id });

  await request('library', { action: 'delete', id: p.data.id });
  r = await dispatch('audio', { search: '?id=' + p.data.id });
  assert.equal(r.status, 404);

  // Правка выпуска, которого уже нет: раньше update менял ноль строк, а
  // маршрут отвечал «сохранено» — студия закрывала окно и теряла набранное.
  const ghost = await request('library', { id: p.data.id, kind: 'story', title: 'Призрак', body: 'текст' });
  assert.equal(ghost.status, 400, 'правка удалённого выпуска не должна проходить молча');
  assert.equal(ghost.data.error, '#err.notFound');


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

  // Предел устройств и скорость рассылки — одно решение, а не два.
  //
  // Уведомление о начале эфира живёт 120 секунд: всё, что очередь не успела
  // разослать, протухает молча. Прежние 20 заданий за тик по 5 одновременно
  // давали около четырёх в секунду — тысяча устройств не успевала и
  // наполовину. Здесь очередь заполняется тысячей заданий и должна уйти
  // целиком за один вызов.
  {
   const db=getDb().$client;
   db.prepare('DELETE FROM push_subscriptions').run();db.prepare('DELETE FROM push_outbox').run();db.prepare('DELETE FROM push_events').run();
   // Один ключ на все записи: проверяется пропускная способность очереди, а
   // не криптография — её разбирает соседний блок, по-настоящему расшифровывая
   // доставленное сообщение.
   const bulkKeys={p256dh:client.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')};
   const insert=db.prepare("INSERT INTO push_subscriptions(id,manage_hash,subscription,kind,locale,preferences,created_at) VALUES(?,?,?,'webpush','ru',7,?)");
   db.transaction(()=>{for(let i=0;i<1000;i++)insert.run('device-'+i,'hash-'+i,JSON.stringify({endpoint:'https://fcm.googleapis.com/fcm/send/bulk-'+i,keys:bulkKeys}),Date.now());})();
   const originalFcm=globalThis.fetch;let delivered=0;
   globalThis.fetch=async()=>{delivered++;return new Response(null,{status:200});};
   try{
    const before=Date.now();
    db.prepare("INSERT INTO push_events(id,created_at) VALUES('bulk',?)").run(before);
    const payload=JSON.stringify({titleKey:'push.liveTitle',body:'Эфир',url:'/',tag:'live:bulk'});
    db.prepare("INSERT INTO push_outbox(id,subscription_id,payload,origin,category,expires_at) SELECT 'bulk:'||id,id,?,'https://truethrills.com',1,? FROM push_subscriptions").run(payload,before+120000);
    await push.flushPush();
    assert.equal(delivered,1000,'вся тысяча должна уйти за один проход очереди, пока уведомление ещё живо');
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM push_outbox WHERE state='pending'").get().n,0);
   }finally{globalThis.fetch=originalFcm;}

   // Предел устройств задаётся настройкой, а не вшит в запрос.
   db.prepare('DELETE FROM push_subscriptions').run();db.prepare('DELETE FROM push_outbox').run();db.prepare('DELETE FROM push_events').run();
   assert.equal(push.deviceLimit(),1000,'по умолчанию тысяча');
   process.env.PUSH_DEVICE_LIMIT='2';assert.equal(push.deviceLimit(),2);
   const device=async(n)=>{const c=createECDH('prime256v1');c.generateKeys();
    return request('notifications',{action:'subscribe',subscription:{endpoint:'https://fcm.googleapis.com/fcm/send/limit-'+n,keys:{p256dh:c.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}},preferences:7},false);};
   assert.equal((await device(1)).status,200);
   assert.equal((await device(2)).status,200);
   const overflow=await device(3);assert.equal(overflow.status,400);assert.equal(overflow.data.error,'#err.deviceLimit');
   process.env.PUSH_DEVICE_LIMIT='3';
   assert.equal((await device(3)).status,200,'поднятая настройка должна пускать новое устройство без правки кода');
   for(const bad of ['0','-1','нет','1.5']){process.env.PUSH_DEVICE_LIMIT=bad;assert.throws(()=>push.deviceLimit(),/PUSH_DEVICE_LIMIT/,bad);}
   delete process.env.PUSH_DEVICE_LIMIT;

   // Частая регистрация с одного адреса — это не слушатель. Свой телефон
   // человек перерегистрирует редко, десяти попыток в час хватает с запасом.
   db.prepare('DELETE FROM push_subscriptions').run();db.prepare('DELETE FROM rate_limits').run();
   const fromIp=async(n)=>{const c=createECDH('prime256v1');c.generateKeys();
    return request('notifications',{action:'subscribe',subscription:{endpoint:'https://fcm.googleapis.com/fcm/send/flood-'+n,keys:{p256dh:c.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}},preferences:7},false,{'x-real-ip':'198.51.100.7'});};
   for(let i=0;i<10;i++)assert.equal((await fromIp(i)).status,200,'попытка '+i);
   const flooded=await fromIp(10);
   assert.equal(flooded.status,429);assert.equal(flooded.data.error,'#err.subscribeLimited');assert.ok(Number(flooded.headers.get('retry-after'))>0);
   // Другой адрес не должен страдать из-за соседа.
   const c=createECDH('prime256v1');c.generateKeys();
   assert.equal((await request('notifications',{action:'subscribe',subscription:{endpoint:'https://fcm.googleapis.com/fcm/send/other',keys:{p256dh:c.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}},preferences:7},false,{'x-real-ip':'203.0.113.9'})).status,200);
   db.prepare('DELETE FROM rate_limits').run();db.prepare('DELETE FROM push_subscriptions').run();
  }

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
   // Сервер сам удаляет подписку, когда FCM отвечает «токен недействителен».
   // Устройство об этом не знает и при следующей смене токена всё равно
   // присылает previousId. Раньше маршрут отвечал 400 #err.subscriptionOther,
   // и уведомления нельзя было восстановить ничем, кроме переустановки.
   getDb().$client.prepare('DELETE FROM push_subscriptions WHERE id=?').run(rotated.data.id);
   const revived=await request('notifications',{action:'subscribe',kind:'fcm',token:'d'.repeat(152),previousId:rotated.data.id,preferences:7,locale:'it'},false,{'x-push-token':fcmSub.data.token});
   assert.equal(revived.status,200,'после удаления старой строки регистрация должна восстанавливаться, а не упираться в 400');
   assert.ok(getDb().$client.prepare('SELECT id FROM push_subscriptions WHERE id=?').get(revived.data.id),'новая подписка не сохранилась');
   assert.equal((await request('library',{kind:'story',title:'Unsafe cover',body:'x',coverUrl:'javascript:alert(1)'})).status,400);
   fcmSendStatus=404;
   const post2=await request('library',{kind:'story',title:'FCM story 2',body:'Body',published:true});
   await request('library',{action:'visibility',id:post2.data.id,published:true});await push.flushPush();
   assert.equal(getDb().$client.prepare('SELECT id FROM push_subscriptions WHERE id=?').get(fcmSub.data.id),undefined);
  }finally{globalThis.fetch=originalFetch;}

  // Оформление канала живёт под одним адресом и меняется, поэтому его нельзя
  // держать в кэше: удалённая картинка возвращалась из кэша WebView после
  // перезапуска приложения, хотя настройка уже была пустой.
  {
   const art=await cover.GET(new Request(ORIGIN+'/api/cover?id=channel'));
   assert.notEqual(art.headers.get('cache-control'),'public, max-age=86400','оформление канала не кэшируется надолго');
  }

  console.log(
    'PASS: anonymous Web Push, native FCM (Android), device ownership, encryption round-trip, deduplication, preferences, retry/expiry, background live lease, owner session bootstrap, write authorization, cross-origin rejection, draft privacy, publishing, video links, social links, error keys, notification language, configurable device limit, bulk delivery inside the live notice lifetime, subscribe rate limit, donation validation, streaming upload, audio range playback including seek-to-end, suffix ranges and 416, cover upload/serving, tile covers resized once and cached on disk with the original kept for full-screen places and for files that are not images, channel art, live lifecycle, configurable listener limit, peer token isolation, deletion that leaves no dangling broadcast cover.',
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
