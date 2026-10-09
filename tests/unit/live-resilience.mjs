#!/usr/bin/env node
/**
 * Проверяет, когда эфир отпускается, а когда нет.
 *
 * Воспроизводимая беда: слушатель кладёт телефон в карман, WebView перестаёт
 * выполнять запросы, пять опросов статуса подряд не проходят — и страница
 * останавливает нативный плеер, который в этот момент прекрасно играл. Эфир
 * обрывается посреди фразы без единой ошибки в звуке.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {build} from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
const {outputFiles} = await build({entryPoints: [path.join(root, 'lib/live-resilience.ts')], bundle: true, write: false, format: 'esm', platform: 'node'});
const {dropAfterPollError, shouldPoll, POLL_ERROR_LIMIT} = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64'));

// Звук идёт из самой страницы: связи со статусом нет — эфир и правда кончился.
for (let errors = 1; errors < POLL_ERROR_LIMIT; errors++)
 assert.equal(dropAfterPollError({errors, nativeAttached: false, hidden: false}), false, `Терпим ${errors} неудач подряд, прежде чем отпускать эфир в браузере`);
assert.equal(dropAfterPollError({errors: POLL_ERROR_LIMIT, nativeAttached: false, hidden: false}), true);

// Играет нативный плеер: он переподключается сам, и неудачи опроса о нём
// ничего не говорят. Ни на пятой, ни на сотой не трогаем.
for (const errors of [POLL_ERROR_LIMIT, POLL_ERROR_LIMIT * 20])
 assert.equal(dropAfterPollError({errors, nativeAttached: true, hidden: false}), false, 'Неудачный опрос не должен останавливать нативный плеер');

// Приложение свёрнуто: не отпускаем вообще ничего.
assert.equal(dropAfterPollError({errors: 99, nativeAttached: true, hidden: true}), false);
assert.equal(dropAfterPollError({errors: 99, nativeAttached: false, hidden: true}), false);

// И не опрашиваем.
assert.equal(shouldPoll(false), true);
assert.equal(shouldPoll(true), false, 'В фоне опрос только копит неудачи');

// Хук обязан пользоваться этими решениями, а не своим счётчиком: без проверки
// правило легко потерять при следующей правке.
const hook = readFileSync(path.join(root, 'hooks/use-live.ts'), 'utf8');
assert.match(hook, /dropAfterPollError\(\{errors,nativeAttached:native\.current&&attached,hidden:away\(\)\}\)/, 'Хук решает судьбу эфира сам, мимо lib/live-resilience.');
assert.ok(!/if\(\+\+errors>=5\)endViewer/.test(hook), 'В хуке остался прежний счётчик «пять неудач — стоп».');
assert.match(hook, /if\(!shouldPoll\(away\(\)\)\)return;/, 'Хук опрашивает статус и в фоне.');
assert.match(hook, /visibilitychange/, 'Хук не замечает возвращения на экран, а значит не опросит сразу и не сбросит счётчик.');
assert.match(hook, /wake\.current=\(\)=>\{errors=0;void poll\(\);\};/, 'Возвращение на экран не сбрасывает накопленные в фоне неудачи.');

console.log('PASS: неудачный опрос не останавливает нативный плеер; в фоне эфир не опрашивается и не обрывается; возвращение на экран опрашивает сразу с чистым счётчиком');
