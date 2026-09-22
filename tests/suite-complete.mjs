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
const separate = files.filter((f) => !scripts.test.includes('tests/' + f));
assert.deepEqual(separate, ['browser-integration.mjs', 'design-preview.mjs', 'live-archive-integration.mjs'],
 'список проверок вне общего прогона изменился: либо добавь тест в «npm test», либо объясни здесь, почему ему нужен свой сценарий');

console.log('PASS: все ' + files.length + ' проверок запускаются — ' + (files.length - separate.length) + ' в общем прогоне, ' + separate.length + ' отдельными сценариями');
