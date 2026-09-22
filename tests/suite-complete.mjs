#!/usr/bin/env node
/**
 * Каждый файл проверки должен кем-то запускаться.
 *
 * Поломка, ради которой это написано: tests/playback-restore.mjs девять
 * месяцев лежал в папке, но его не звал ни один сценарий package.json.
 * Проверка молча протухла — подпись playPost в app/studio.tsx изменилась,
 * а «npm test» остался зелёным. Файл проверки, который никто не запускает,
 * хуже отсутствующего: он создаёт видимость покрытия.
 *
 * Правило простое: либо тест входит в «npm test», либо у него есть свой
 * сценарий (test:browser, test:design, test:live — им нужны браузер или
 * поднятый сервер, поэтому в общий прогон они не попадают).
 */
import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const scripts = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).scripts;
const referenced = Object.values(scripts).join(' ');
const files = readdirSync(path.join(root, 'tests')).filter((f) => f.endsWith('.mjs')).sort();

const orphans = files.filter((f) => !referenced.includes('tests/' + f));
assert.deepEqual(orphans, [], 'эти проверки не запускает ни один сценарий package.json: ' + orphans.join(', '));

// Отдельные сценарии — только для тех, кому нужен браузер или живой сервер.
//
// Браузерные проверки вынесены из общего прогона не для удобства: они
// импортируют playwright и требуют установленного Chrome. Пока они стояли в
// «npm test», чистая установка падала на первой из них, а CI ставил браузер
// уже после прогона — то есть не запускал их вовсе.
const separate = files.filter((f) => !scripts.test.includes('tests/' + f));
assert.deepEqual(separate, [
 'browser-integration.mjs', 'design-preview.mjs', 'kinetic-grid.mjs', 'live-archive-after.mjs',
 'live-archive-integration.mjs', 'live-about.mjs', 'live-archives.mjs', 'player-swipe.mjs',
].sort(),
 'список проверок вне общего прогона изменился: либо добавь тест в «npm test», либо объясни здесь, почему ему нужен свой сценарий');

// Всё, что импортирует playwright, обязано быть вне общего прогона и внутри
// сценария с браузером: иначе «npm test» снова начнёт требовать Chrome.
const {readFileSync: read} = await import('node:fs');
for (const file of files) {
 // Ищем именно строку импорта в начале строки: упоминание в тексте или в
 // сообщении проверки не делает файл браузерным (иначе этот файл поймал бы
 // сам себя).
 const uses = /^import\s[^\n]*\bplaywright\b/m.test(read(path.join(root, 'tests', file), 'utf8'));
 if (uses) {
  assert.ok(!scripts.test.includes('tests/' + file), file + ': использует playwright и не должен входить в «npm test»');
  assert.ok(referenced.includes('tests/' + file), file + ': использует playwright и не запускается ни одним сценарием');
 }
}

// Playwright должен быть закреплённой зависимостью, а не случайно
// установленным пакетом: на чистом checkout его иначе просто нет.
const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.ok(manifest.devDependencies?.playwright, 'playwright обязан быть в devDependencies');
assert.match(manifest.devDependencies.playwright, /^\d+\.\d+\.\d+$/, 'версия playwright должна быть закреплена точно, без диапазона');

console.log('PASS: все ' + files.length + ' проверок запускаются — ' + (files.length - separate.length) + ' в общем прогоне, ' + separate.length + ' отдельными сценариями (браузер и живой сервер)');
