#!/usr/bin/env node
/**
 * Старые адреса скриптов работают после раскладки папок (9 октября 2026).
 *
 * Серверные скрипты переехали в server/, программы для Windows — в
 * tools/windows/. Но старыми адресами пользуются не только люди:
 * - программа обновления на компьютере владельца — старая копия из архива —
 *   копирует с сервера scripts/update-safe.sh, scripts/backup-data.mjs и
 *   scripts/verify-backup.mjs и запускает их;
 * - прежний update-safe.sh после git merge зовёт bash scripts/install-operations.sh;
 * - таймеры и службы, записанные прежней установкой, смотрят в scripts/.
 *
 * Поэтому в scripts/ лежат переходники. Здесь проверяется:
 * - у каждого файла из server/ и tools/windows/ есть переходник со старым именем;
 * - каждый переходник ведёт на существующий файл и ничего не делает сам;
 * - переходники на деле запускают нужный файл и передают ему аргументы;
 * - обновление, запущенное так, как это делает старая программа владельца
 *   (копия в .update-staging), доходит до server/update-safe.sh, запускается
 *   из отдельной копии и получает рядом свежие backup-data и verify-backup;
 * - службы, которые пишет установка, смотрят уже в server/.
 */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const list = (dir) => readdirSync(path.join(root, dir)).sort();
const shims = list('scripts');

// Каждому переехавшему файлу — переходник со старым именем, и ничего лишнего.
const moved = [...list('server').map((f) => ['server', f]), ...list('tools/windows').map((f) => ['tools/windows', f])];
assert.deepEqual(shims, moved.map(([, f]) => f).sort(),
 'в scripts/ должны лежать ровно переходники к server/ и tools/windows/ — ни больше, ни меньше');

for (const [dir, name] of moved) {
 const text = readFileSync(path.join(root, 'scripts', name), 'utf8');
 const target = dir + '/' + name;
 // Смотрим только код, не пояснения: адрес в комментарии ничего не запускает.
 const code = text.split(/\r?\n/).filter((l) => l.trim() && !/^\s*(#|\/\/|rem\b|@echo)/i.test(l));
 // Windows пишет обратные косые черты; сравниваем в одном виде.
 assert.ok(code.join('\n').replace(/\\/g, '/').includes(target), 'scripts/' + name + ' не ведёт на ' + target);
 // Переходник — это пара строк, а не копия скрипта: иначе правку в одном
 // месте забудут сделать в другом.
 const limit = name === 'update-safe.sh' ? 9 : name === 'vps-setup.sh' ? 7 : 3;
 assert.ok(code.length <= limit, 'scripts/' + name + ' — не переходник: ' + code.length + ' строк кода');
}

// На деле: переходники .mjs и .sh запускают свой файл с теми же аргументами.
// Сбой запуска называем словами, а не сырым потоком ошибок.
const run = (what, file, args, options) => {
 try { return execFileSync(file, args, {...options, stdio: ['ignore', 'pipe', 'pipe']}).toString().trim(); }
 catch (e) { assert.fail(what + ' упал: ' + String(e.stderr || e.message).trim().split('\n').slice(0, 3).join(' | ')); }
};
const temp = mkdtempSync(path.join(tmpdir(), 'tt-shims-'));
try {
 const app = path.join(temp, 'app');
 mkdirSync(path.join(app, 'scripts'), {recursive: true});
 mkdirSync(path.join(app, 'server'), {recursive: true});
 copyFileSync(path.join(root, 'scripts/data-status.mjs'), path.join(app, 'scripts/data-status.mjs'));
 writeFileSync(path.join(app, 'server/data-status.mjs'), "console.log('server/data-status', process.argv.slice(2).join(' '));\n");
 assert.equal(run('переходник scripts/data-status.mjs', process.execPath, [path.join(app, 'scripts/data-status.mjs'), '--json', 'x y']),
  'server/data-status --json x y', 'переходник .mjs не запустил server/data-status.mjs с теми же аргументами');

 copyFileSync(path.join(root, 'scripts/install-operations.sh'), path.join(app, 'scripts/install-operations.sh'));
 writeFileSync(path.join(app, 'server/install-operations.sh'), 'echo "server/install-operations $*"\n');
 // Прежний update-safe.sh зовёт его из корня сервиса относительным путём.
 assert.equal(run('переходник scripts/install-operations.sh', 'bash', ['scripts/install-operations.sh', 'a', 'b c'], {cwd: app}),
  'server/install-operations a b c', 'переходник .sh не запустил server/install-operations.sh с теми же аргументами');

 // Обновление так, как его запускает программа владельца: копия переходника в
 // .update-staging, запуск оттуда из корня сервиса. Вместо настоящего
 // update-safe.sh — подставной, который рассказывает, откуда он запущен и что
 // лежит рядом. id подменён: переходник требует root, как и сам скрипт.
 for (const f of ['backup-data.mjs', 'verify-backup.mjs']) writeFileSync(path.join(app, 'server', f), '// ' + f + '\n');
 writeFileSync(path.join(app, 'server/update-safe.sh'),
  'here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)\necho "$here|$*|$(ls "$here" | tr "\\n" " ")"\n');
 mkdirSync(path.join(app, '.update-staging'));
 copyFileSync(path.join(root, 'scripts/update-safe.sh'), path.join(app, '.update-staging/update-safe.sh'));
 const bin = path.join(temp, 'bin');mkdirSync(bin);
 writeFileSync(path.join(bin, 'id'), '#!/bin/sh\necho 0\n');chmodSync(path.join(bin, 'id'), 0o755);
 const out = run('обновление через scripts/update-safe.sh из .update-staging', 'bash', ['.update-staging/update-safe.sh', 'design/six-screens', 'a'.repeat(40)],
  {cwd: app, env: {...process.env, PATH: bin + ':' + process.env.PATH}});
 const [dir, args, files] = out.split('|');
 assert.equal(path.dirname(dir), app, 'обновление запустилось не из папки в корне сервиса: ' + dir + ' — копии не найдут ../lib и node_modules');
 assert.match(path.basename(dir), /^\.update-run\./, 'обновление запустилось не из своей временной копии, а из ' + dir);
 assert.equal(args, 'design/six-screens ' + 'a'.repeat(40), 'ветка и ожидаемый коммит не дошли до update-safe.sh: ' + args);
 assert.deepEqual(files.trim().split(' ').sort(), ['backup-data.mjs', 'update-safe.sh', 'verify-backup.mjs'],
  'рядом с запущенным update-safe.sh не те файлы: ' + files);
} finally {
 rmSync(temp, {recursive: true, force: true});
}

// Новая установка пишет службы и таймер уже с адресами server/.
const install = readFileSync(path.join(root, 'server/install-operations.sh'), 'utf8');
const execs = install.split('\n').filter((l) => l.startsWith('ExecStart='));
assert.ok(execs.length >= 3, 'в установке не нашлось служб — проверка смотрит не туда');
for (const line of execs) assert.ok(!/scripts\//.test(line), 'служба всё ещё смотрит в scripts/: ' + line);
assert.ok(execs.some((l) => l.includes('server/live-worker.mjs')) && execs.some((l) => l.includes('server/monitor.mjs')) && execs.some((l) => l.includes('server/backup-service.sh')),
 'установка не запускает воркер эфира, монитор или резервную копию из server/');

console.log('PASS: старые адреса scripts/ работают — ' + shims.length + ' переходников ведут в server/ и tools/windows/, запускают свой файл с теми же аргументами; обновление из старой программы владельца доходит до server/update-safe.sh через отдельную копию; службы смотрят в server/');
