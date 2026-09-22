#!/usr/bin/env node
/**
 * Ссылки на файлы собираются в одном месте — и больше нигде.
 *
 * Список был размазан по трём местам и разошёлся: уборка и проверка копии
 * знали про channelArt, но не про calmArt. Картинка круга покоя, на которую
 * ссылалась настройка, удалялась как ничья, а проверка резервной копии
 * отвечала «всё цело». Отдельно: удаление материала сносило файл, не
 * спрашивая, ссылается ли на него кто-то ещё, — а обложка бывает общей у
 * нескольких архивов эфиров.
 *
 * Здесь проверяется договорённость, а не одна поломка: любое место, которое
 * собирает ссылки само, обязано провалить прогон.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import {MEDIA_SETTING_KEYS, referencedMediaKeys} from '../lib/media-refs.mjs';
import {LIVE_BUSY_STATES} from '../lib/live-states.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = (f) => readFileSync(path.join(root, f), 'utf8');

// Настройка с картинкой, забытая в списке, — это и есть исходная поломка.
assert.ok(MEDIA_SETTING_KEYS.includes('channelArt'), 'channelArt пропал из списка настроек с медиа');
assert.ok(MEDIA_SETTING_KEYS.includes('calmArt'), 'calmArt пропал из списка настроек с медиа');

// Каждая настройка, которую маршрут библиотеки принимает как ключ обложки,
// обязана быть в списке: иначе уборка снова начнёт считать её файл ничьим.
const library = read('app/api/library/route.ts');
for (const match of library.matchAll(/d\.action==='([A-Za-z]*[Aa]rt)'/g)) {
 assert.ok(MEDIA_SETTING_KEYS.includes(match[1]),
  'маршрут сохраняет настройку с картинкой «' + match[1] + '», а lib/media-refs.mjs про неё не знает');
}

// Никто не собирает ссылки в обход общего модуля.
for (const file of ['scripts/prune-orphans.mjs', 'scripts/verify-backup.mjs']) {
 const text = read(file);
 assert.equal(/SELECT value FROM settings WHERE key = '[a-zA-Z]+'/.test(text), false,
  file + ': настройка с картинкой читается напрямую — ссылки собирает lib/media-refs.mjs');
}

// Удаление снимает ссылку и только потом трогает файл.
for (const file of ['app/api/library/route.ts', 'app/api/live-stream/route.ts']) {
 const text = read(file);
 assert.match(text, /unlinkIfUnused\(/, file + ': файл удаляется в обход проверки оставшихся ссылок');
 assert.equal(/bucket\(\)\.delete\(/.test(text), false,
  file + ': прямое удаление файла из хранилища — только через unlinkIfUnused');
}
// Обнуление чужих обложек ради прохождения проверки копии — та самая поломка.
assert.equal(/update\(broadcasts\)\.set\(\{coverKey:null\}\)/.test(read('app/api/live-stream/route.ts')), false,
 'удаление снова обнуляет обложку у других эфиров');

// Сам сборщик: настройка держит файл живым.
const file = path.join(root, '.test-media-refs.db');
const db = new Database(file);
try {
 db.exec(`CREATE TABLE settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE posts(id TEXT PRIMARY KEY, audio_key TEXT, cover_key TEXT);
  CREATE TABLE broadcasts(id TEXT PRIMARY KEY, cover_key TEXT);`);
 db.prepare('INSERT INTO settings VALUES (?,?)').run('calmArt', 'cover/calm');
 db.prepare('INSERT INTO settings VALUES (?,?)').run('channelArt', 'cover/channel');
 db.prepare('INSERT INTO posts VALUES (?,?,?)').run('p1', 'audio/one', 'cover/one');
 db.prepare('INSERT INTO broadcasts VALUES (?,?)').run('b1', 'cover/live');

 const used = referencedMediaKeys(db);
 for (const key of ['cover/calm', 'cover/channel', 'audio/one', 'cover/one', 'cover/live']) {
  assert.ok(used.has(key), 'сборщик потерял ссылку на ' + key);
 }
 assert.equal(used.has('cover/nobody'), false, 'сборщик придумал лишнюю ссылку');

 // Эфир, который удаляется этим же проходом, держать файл не должен.
 assert.equal(referencedMediaKeys(db, {skipBroadcasts: new Set(['b1'])}).has('cover/live'), false,
  'обложка удаляемого эфира осталась «используемой»');
} finally {
 db.close();
 for (const suffix of ['', '-wal', '-shm']) {
  try { readFileSync(file + suffix); } catch { continue; }
  await import('node:fs/promises').then(fs => fs.rm(file + suffix, {force: true}));
 }
}

// Тот же вид поломки, что и со ссылками: список занятых состояний записи
// лежал в трёх местах, и маршрут удаления знал только «receiving» — запись
// можно было снести во время сшивания, прямо из-под FFmpeg.
assert.deepEqual([...LIVE_BUSY_STATES].sort(), ['closing', 'processing', 'receiving'],
 'список занятых состояний записи изменился — проверь все три места, которые им пользуются');
for (const file of ['app/api/live-stream/route.ts', 'app/api/library/route.ts', 'scripts/prune-orphans.mjs']) {
 const text = read(file);
 assert.match(text, /LIVE_BUSY_STATES/, file + ': занятые состояния перечисляются сами по себе, а не берутся из lib/live-states.mjs');
 assert.equal(/'receiving'\s*,\s*'closing'/.test(text), false,
  file + ': список занятых состояний снова записан вручную');
}
assert.match(read('app/api/live-stream/route.ts'), /LIVE_BUSY_STATES\.includes\(row\.state\)\)throw new Error\('#err\.liveActive'\)/,
 'удаление записи должно быть запрещено во всех занятых состояниях, а не только при приёме');

console.log('PASS: ссылки на медиа собираются одним модулем; настройки с картинками учтены везде; удаление снимает ссылку прежде, чем тронуть файл; занятые состояния записи тоже в одном месте');
