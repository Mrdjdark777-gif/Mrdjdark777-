import assert from 'node:assert/strict';
import {mkdtemp, mkdir, rm, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import Database from 'better-sqlite3';

const root = process.cwd(), dir = await mkdtemp(path.join(root, '.test-tmp-orphans-'));
const env = {...process.env, DATABASE_PATH: path.join(dir, 'db.sqlite'), STORAGE_DIR: path.join(dir, 'storage'), LIVE_DIR: path.join(dir, 'live')};
try {
 execFileSync(process.execPath, ['node_modules/drizzle-kit/bin.cjs', 'migrate'], {env, stdio: 'pipe'});
 const db = new Database(env.DATABASE_PATH);
 const now = Date.now();
 const post = (id, audio, cover) => db.prepare('INSERT INTO posts (id,kind,title,audio_key,cover_key,published,created_at) VALUES (?,?,?,?,?,1,?)').run(id, 'podcast', 'Выпуск ' + id, audio, cover, now);
 const recording = (id, state, postId) => db.prepare('INSERT INTO live_recordings (id,owner_id,title,state,post_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(id, 'owner', 'Эфир ' + id, state, postId, now, now);
 const broadcast = (id, active) => db.prepare('INSERT INTO broadcasts (id,owner_id,title,active,heartbeat) VALUES (?,?,?,?,?)').run(id, 'owner', 'Эфир ' + id, active, now);

 // Живой выпуск со звуком и обложкой; его запись эфира трогать нельзя.
 post('keep-post', 'audio/keep.m4a', 'cover/keep.jpg');
 recording('kept-by-post', 'ready', 'keep-post');
 broadcast('kept-by-post', 0);
 // Эфир идёт прямо сейчас — тоже неприкосновенен, хотя выпуска ещё нет.
 recording('on-air', 'receiving', null);
 broadcast('on-air', 1);
 // Запись, у которой ещё лежат файлы на диске: её убирает prune-live, не мы.
 recording('has-files', 'ready', null);
 broadcast('has-files', 0);
 await mkdir(path.join(env.LIVE_DIR, 'has-files'), {recursive: true});
 // Мёртвые: выпуск удалён, каталога нет, эфир завершён. У dead-1 есть обложка,
 // и после удаления самого эфира она тоже становится ничьей — оба должны уйти
 // за один проход, а не за два.
 recording('dead-1', 'ready', null);
 db.prepare('INSERT INTO broadcasts (id,owner_id,title,active,heartbeat,cover_key) VALUES (?,?,?,0,?,?)').run('dead-1', 'owner', 'Эфир dead-1', now, 'cover/dead.jpg');
 recording('dead-2', 'failed', 'gone-post');
 broadcast('dead-2', 0);
 // Проба, от которой осталась только строка эфира без записи.
 broadcast('dead-3', 0);
 db.prepare("INSERT INTO settings (key,value) VALUES ('channelArt','cover/art.png')").run();
 db.close();

 await mkdir(path.join(env.STORAGE_DIR, 'audio'), {recursive: true});
 await mkdir(path.join(env.STORAGE_DIR, 'cover'), {recursive: true});
 const file = async (key, bytes) => {
  await writeFile(path.join(env.STORAGE_DIR, key), 'x'.repeat(bytes));
  await writeFile(path.join(env.STORAGE_DIR, key + '.meta.json'), '{}');
 };
 await file('audio/keep.m4a', 2048);
 await file('cover/keep.jpg', 1024);
 await file('cover/art.png', 512);      // оформление канала
 await file('audio/orphan.m4a', 4096);  // ничей
 await file('cover/orphan.jpg', 2048);  // ничей
 await file('cover/dead.jpg', 1536);    // обложка удаляемого эфира

 const prune = (...args) => execFileSync(process.execPath, ['scripts/prune-orphans.mjs', ...args], {cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
 const report = prune();
 assert.match(report, /без выпуска и файлов 3/, 'находит все три мёртвых эфира, включая тот, у которого нет записи');
 assert.match(report, /ничьих 3/, 'обложка удаляемого эфира тоже считается ничьей');
 assert.ok(existsSync(path.join(env.STORAGE_DIR, 'audio/orphan.m4a')), 'отчёт ничего не удаляет');

 prune('--delete');
 const after = new Database(env.DATABASE_PATH, {readonly: true});
 const ids = after.prepare('SELECT id FROM live_recordings ORDER BY id').all().map(r => r.id);
 assert.deepEqual(ids, ['has-files', 'kept-by-post', 'on-air'], 'остаются живой выпуск, идущий эфир и запись с файлами');
 assert.deepEqual(after.prepare('SELECT id FROM broadcasts ORDER BY id').all().map(r => r.id), ['has-files', 'kept-by-post', 'on-air'], 'эфиры удаляются вместе со своими записями, включая строку без записи');
 after.close();
 for (const key of ['audio/keep.m4a', 'cover/keep.jpg', 'cover/art.png']) {
  assert.ok(existsSync(path.join(env.STORAGE_DIR, key)), key + ' используется и должен остаться');
 }
 for (const key of ['audio/orphan.m4a', 'cover/orphan.jpg', 'cover/dead.jpg']) {
  assert.ok(!existsSync(path.join(env.STORAGE_DIR, key)), key + ' ничей и должен быть удалён');
  assert.ok(!existsSync(path.join(env.STORAGE_DIR, key + '.meta.json')), 'метаданные удаляются вместе с файлом');
 }
 assert.match(prune(), /Удалять нечего/, 'повторный запуск не находит работы');
 console.log('PASS: prune-orphans keeps live episodes, running broadcasts and files in use; removes dead recordings and unreferenced storage');
} finally { await rm(dir, {recursive: true, force: true}); }
