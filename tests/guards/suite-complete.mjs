#!/usr/bin/env node
/**
 * Каждый файл проверки должен кем-то запускаться.
 *
 * Поломка, ради которой это написано: tests/unit/playback-restore.mjs девять
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

const root = path.resolve(import.meta.dirname, '..','..');
const scripts = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).scripts;
const referenced = Object.values(scripts).join(' ');
// Проверки лежат по папкам (раскладка 9 октября 2026): unit — чистая логика,
// integration — база, сервер, ffmpeg и серверные скрипты, browser — Chromium,
// sweeps — большие обходы со снимками, guards — порядок в самом репозитории.
// Имена здесь — с папкой: «unit/swipe.mjs».
const KINDS = ['unit', 'integration', 'browser', 'sweeps', 'guards'];
const files = readdirSync(path.join(root, 'tests'), {recursive: true}).map((f) => String(f).split(path.sep).join('/'))
 .filter((f) => f.endsWith('.mjs') && !f.startsWith('fixtures/')).sort();
const loose = files.filter((f) => !KINDS.includes(f.split('/')[0]) || f.split('/').length !== 2);
assert.deepEqual(loose, [], 'проверки вне папок ' + KINDS.join(', ') + ' (или во вложенных папках): ' + loose.join(', '));

const orphans = files.filter((f) => !referenced.includes('tests/' + f));
assert.deepEqual(orphans, [], 'эти проверки не запускает ни один сценарий package.json: ' + orphans.join(', '));

// Отдельные сценарии — только для тех, кому нужен браузер или живой сервер.
//
// Браузерные проверки вынесены из общего прогона не для удобства: они
// импортируют playwright и требуют установленного Chrome. Пока они стояли в
// «npm test», чистая установка падала на первой из них, а CI ставил браузер
// уже после прогона — то есть не запускал их вовсе.
// Общий прогон «npm test» — сборка и три сценария по папкам. Каждая папка
// запускается своим сценарием: guards — test:guards, unit — test:unit и так
// далее; browser — test:browser, обходы sweeps — каждый своим test:*.
assert.equal(scripts.test, 'npm run build && npm run test:guards && npm run test:unit && npm run test:integration',
 '«npm test» должен собирать проект и звать test:guards, test:unit и test:integration — и только их');
const general = ['test:guards', 'test:unit', 'test:integration'].map((k) => scripts[k] ?? '').join(' ');
for (const file of files) {
 const kind = file.split('/')[0];
 const own = kind === 'sweeps' ? Object.entries(scripts).filter(([k]) => k.startsWith('test:')).map(([, v]) => v).join(' ')
  : (scripts['test:' + kind] ?? '') + (file === 'integration/live-archive-integration.mjs' ? ' ' + scripts['test:live'] : '');
 assert.ok(own.includes('tests/' + file), file + ' не запускается сценарием своей папки (test:' + kind + ')');
}
for (const [name, line] of Object.entries(scripts).filter(([k]) => /^test:(guards|unit|integration|browser)$/.test(k)))
 for (const ref of line.matchAll(/tests\/([a-z]+)\//g))
  assert.equal(ref[1], name.slice(5), name + ' запускает проверку из чужой папки: tests/' + ref[1] + '/');
const separate = files.filter((f) => !general.includes('tests/' + f));
// Вне общего прогона — ровно браузерные проверки, обходы со снимками и
// настоящий конвейер эфира (ему нужен ffmpeg с живым HLS, test:live).
const LIVE_PIPELINE = ['integration/live-archive-integration.mjs'];
assert.deepEqual(separate, files.filter((f) => f.startsWith('browser/') || f.startsWith('sweeps/') || LIVE_PIPELINE.includes(f)),
 'список проверок вне общего прогона изменился: либо добавь тест в «npm test», либо положи его в browser/ или sweeps/ и объясни, почему ему нужен свой сценарий');

// Всё, что импортирует playwright, обязано быть вне общего прогона и внутри
// сценария с браузером: иначе «npm test» снова начнёт требовать Chrome.
const {readFileSync: read} = await import('node:fs');
for (const file of files) {
 // Ищем именно строку импорта в начале строки: упоминание в тексте или в
 // сообщении проверки не делает файл браузерным (иначе этот файл поймал бы
 // сам себя).
 const uses = /^import\s[^\n]*\bplaywright\b/m.test(read(path.join(root, 'tests', file), 'utf8'));
 if (uses) {
  assert.ok(!general.includes('tests/' + file), file + ': использует playwright и не должен входить в «npm test»');
  assert.ok(referenced.includes('tests/' + file), file + ': использует playwright и не запускается ни одним сценарием');
  assert.ok(file.startsWith('browser/') || file.startsWith('sweeps/'), file + ': использует playwright, а лежит не в browser/ и не в sweeps/');
 } else {
  assert.ok(!file.startsWith('browser/'), file + ': лежит в browser/, а браузер не открывает — ему место в unit/ или integration/');
 }
}

// import() берёт адрес, а не путь. Пока прогон шёл только на Linux, разницы
// не было: абсолютный путь начинается со слэша и сходит за адрес. На Windows
// он начинается с «C:», и Node принимает «c:» за протокол — прогон падает
// с ERR_UNSUPPORTED_ESM_URL_SCHEME на первой же собранной связке. Владелец
// как раз запускал проверки у себя, и весь прогон встал на этом.
//
// Правило: если в import() стоит не строка, а переменная, она обязана пройти
// через pathToFileURL. Строковые адреса ('node:fs', 'data:…', имя пакета)
// правило не трогает.
for (const file of files.concat(separate)) {
 const text = read(path.join(root, 'tests', file), 'utf8');
 for (const call of text.matchAll(/\bimport\(\s*([^)\n]+)\)/g)) {
  const argument = call[1].trim();
  if (/^['"`]/.test(argument)) continue;              // адрес строкой — годится
  if (argument.includes('pathToFileURL')) continue;   // путь переведён в адрес
  assert.fail(file + ': import(' + argument + ') берёт путь как есть — на Windows он '
   + 'читается как протокол «c:». Оберни в pathToFileURL(...).href');
 }
}

// Playwright должен быть закреплённой зависимостью, а не случайно
// установленным пакетом: на чистом checkout его иначе просто нет.
const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.ok(manifest.devDependencies?.playwright, 'playwright обязан быть в devDependencies');
assert.match(manifest.devDependencies.playwright, /^\d+\.\d+\.\d+$/, 'версия playwright должна быть закреплена точно, без диапазона');

console.log('PASS: все ' + files.length + ' проверок запускаются — ' + (files.length - separate.length) + ' в общем прогоне, ' + separate.length + ' отдельными сценариями (браузер и живой сервер)');
