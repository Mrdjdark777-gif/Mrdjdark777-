#!/usr/bin/env node
/**
 * Ссылки в документах ведут на то, что есть.
 *
 * Документы разложены по папкам docs/<раздел>/ (9 октября 2026), и ссылки в
 * них относительные: перенёс файл — и ссылка ведёт в пустоту, а заметит это
 * аудитор, а не прогон. Здесь каждая ссылка вида [текст](путь) в каждом .md
 * репозитория разрешается от места файла и обязана указывать на файл или
 * папку из репозитория. Адреса в сеть (https:, mailto:) и якоря (#…) не
 * проверяются: это не пути.
 *
 * Пути от корня в обратных кавычках (`server/update-safe.sh`) — то же самое:
 * по ним человек идёт в репозиторий. Кроме журналов docs/releases и
 * docs/audits: это записи о прошлом, и файл, которого с тех пор нет, там
 * законно назван по имени.
 */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
// Файлы репозитория и новые, ещё не добавленные в git (кроме игнорируемых):
// иначе документ проверяется только после git add, и ошибка в нём доезжает
// до CI — так и случилось с HANDOFF-RU.md 9 октября.
const tracked = [...new Set(execFileSync('git', ['-c', 'core.quotepath=off', 'ls-files', '--cached', '--others', '--exclude-standard'], {cwd: root}).toString().split('\n').filter(Boolean))];
const files = new Set(tracked);
const dirs = new Set(tracked.flatMap((f) => f.split('/').slice(0, -1).map((_, i, a) => a.slice(0, i + 1).join('/'))));
const broken = [];
let checked = 0;
for (const doc of tracked.filter((f) => f.endsWith('.md'))) {
 const text = readFileSync(path.join(root, doc), 'utf8');
 // Код в обратных кавычках — пример, а не ссылка.
 const prose = text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
 for (const m of prose.matchAll(/\]\(([^)\s]+)\)/g)) {
  const target = m[1];
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) continue;
  checked++;
  const clean = decodeURIComponent(target.split('#')[0]);
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(doc), clean)).replace(/\/$/, '');
  if (!files.has(resolved) && !dirs.has(resolved)) broken.push(doc + ' → ' + target);
 }
}
const TOP = /^(app|components|hooks|lib|db|drizzle|workers|public|android|desktop|server|tools|tests|docs|scripts|\.github)\//;
let mentioned = 0;
for (const doc of tracked.filter((f) => f.endsWith('.md') && !/^docs\/(releases|audits)\//.test(f))) {
 const text = readFileSync(path.join(root, doc), 'utf8').replace(/```[\s\S]*?```/g, '');
 for (const m of text.matchAll(/`([^`\s]+)`/g)) {
  const raw = m[1].replace(/[.,:;)]+$/, '').replace(/:\d+(-\d+)?$/, '');
  if (!TOP.test(raw) || /[*<>{}$]/.test(raw)) continue;
  mentioned++;
  const clean = raw.replace(/\/$/, '');
  if (!files.has(clean) && !dirs.has(clean)) broken.push(doc + ' → `' + m[1] + '`');
 }
}
assert.ok(checked + mentioned > 40, 'ссылок и путей в документах нашлось всего ' + (checked + mentioned) + ' — проверка смотрит не туда');
assert.deepEqual(broken, [], 'ссылки в документах ведут в пустоту:\n' + broken.join('\n'));
console.log('PASS: все ' + checked + ' ссылок и ' + mentioned + ' путей в документах ведут на файлы и папки репозитория');
