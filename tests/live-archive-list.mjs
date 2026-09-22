#!/usr/bin/env node
/**
 * Список записей эфиров в студии.
 *
 * Поломка: «сиротой» — выпуском, чья строка эфира потерялась, — считался
 * тот, которого нет среди 25 загруженных строк списка. Двадцать шестой и
 * более старый действующий архив показывался сиротой, хотя его запись на
 * месте, а сам жёсткий предел в 25 строк прятал от автора всё остальное:
 * удалить забытую запись оттуда было нечем.
 *
 * Здесь список проверяется на тридцати эфирах и настоящей сироте.
 */
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import path from 'node:path';
import {build} from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
// Сборка кладётся внутрь проекта, а не в системный tmp: иначе Node не найдёт
// node_modules для внешних пакетов маршрута.
const dir = mkdtempSync(path.join(root, '.test-tmp-'));
process.env.DATABASE_PATH = path.join(dir, 'db.sqlite');
process.env.STORAGE_DIR = path.join(dir, 'storage');
process.env.LIVE_DIR = path.join(dir, 'live');
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'x'.repeat(32);
process.env.ADMIN_PASSWORD = 'password-for-tests';

const outfile = path.join(dir, 'routes.mjs');
await build({
 stdin: {
  contents: `export * as stream from '${root}/app/api/live-stream/route.ts';
   export * as auth from '${root}/lib/auth.ts';
   export {getDb} from '${root}/db';`,
  resolveDir: root,
 },
 outfile, bundle: true, format: 'esm', platform: 'node', packages: 'external',
});
const {stream, auth, getDb} = await import(outfile);

const {execFileSync} = await import('node:child_process');
execFileSync('npx', ['drizzle-kit', 'migrate'], {cwd: root, stdio: 'ignore', env: process.env});

const db = getDb().$client;
const ORIGIN = 'https://truethrills.test';
const cookie = auth.createSessionCookie(new Request(ORIGIN)).split(';')[0];
// Владелец студии: без этой строки маршрут отвечает 404 на всё.
db.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('owner', 'owner');
const uuid = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');

// Тридцать эфиров с записями и выпусками — больше прежнего предела в 25.
const now = Date.now();
for (let i = 0; i < 30; i++) {
 const id = uuid(i), made = now - i * 3600000;
 db.prepare('INSERT INTO posts(id,kind,title,description,body,audio_key,duration,published,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
  .run(id, 'podcast', 'Эфир ' + i, '', '', 'audio/live-' + id, 60, 1, made);
 db.prepare('INSERT INTO live_recordings(id,owner_id,title,state,post_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
  .run(id, 'owner', 'Эфир ' + i, 'ready', id, made, made);
}
// Настоящая сирота: выпуск есть, строки эфира нет. Самая старая из всех.
const orphanId = uuid(999), orphanMade = now - 100 * 3600000;
db.prepare('INSERT INTO posts(id,kind,title,description,body,audio_key,duration,published,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
 .run(orphanId, 'podcast', 'Забытая запись', '', '', 'audio/live-' + orphanId, 60, 1, orphanMade);

const ask = async (search) => {
 const r = await stream.GET(new Request(ORIGIN + '/api/live-stream' + search, {headers: {cookie}}));
 assert.equal(r.status, 200, 'список не отдался: ' + r.status);
 return r.json();
};

const {recordings} = await ask('?list=1');
assert.ok(recordings.length >= 31, 'список обрезан: отдано ' + recordings.length + ' из 31');

// Ни один действующий архив не должен попасть в «сироты». Сирота ровно одна,
// и у неё postId совпадает с её же id — так их и рисует студия.
const shown = new Map(recordings.map(r => [r.id, r]));
for (let i = 0; i < 30; i++) {
 assert.ok(shown.has(uuid(i)), 'эфир ' + i + ' пропал из списка');
}
assert.ok(shown.has(orphanId), 'забытая запись не показана автору — удалить её нечем');

// Порядок: новые сверху, забытая запись самая старая.
assert.equal(recordings[0].id, uuid(0), 'список не отсортирован по свежести');
assert.equal(recordings[recordings.length - 1].id, orphanId, 'забытая запись должна оказаться последней по дате');

// Страницами список тоже отдаётся, и вторая страница не повторяет первую.
const first = await ask('?list=1&limit=10');
assert.equal(first.recordings.length, 10, 'limit не учтён');
assert.equal(first.more, true, 'сервер не сообщил, что есть ещё');
const second = await ask('?list=1&limit=10&offset=10');
assert.equal(second.recordings.some(r => first.recordings.some(f => f.id === r.id)), false,
 'вторая страница повторяет первую');

rmSync(dir, {recursive: true, force: true});
console.log('PASS: список записей эфиров отдаёт все тридцать, сиротой считает только настоящую сироту и отдаётся страницами');
