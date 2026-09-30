#!/usr/bin/env node
/**
 * Скрипты для Windows обязаны начинаться с метки UTF-8 (BOM).
 *
 * Почему это не придирка к оформлению. Windows PowerShell 5.1 — тот, что стоит
 * в системе у владельца, — читает файл .ps1 без метки не как UTF-8, а в
 * однобайтовой кодировке системы. На русской Windows это cp1251. Каждая буква
 * кириллицы занимает в UTF-8 два байта, и при таком чтении они превращаются в
 * пару чужих знаков.
 *
 * Дальше начинается настоящая беда. Тире «—» в UTF-8 — это байты E2 80 94, а
 * байт 94 в cp1251 — правая типографская кавычка. PowerShell считает такую
 * кавычку настоящей границей строки: одно тире в комментарии открывает строку,
 * которая нигде не закрывается, и весь файл перестаёт разбираться. Владелец
 * получил ровно это: «В строке отсутствует завершающий символ», «Отсутствует
 * закрывающий знак "}"» — и обновление не запустилось вовсе.
 *
 * Метка в начале файла снимает вопрос: по ней PowerShell читает файл как UTF-8
 * и кириллица доезжает целой.
 *
 * Проверяются только .ps1. В .cmd метку ставить нельзя: cmd.exe печатает её
 * как мусор перед первой командой, и там кириллица живёт только в строках rem,
 * где искажение ничего не ломает.
 */
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const folder = path.join(root, 'scripts');
const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

// Байты, которые в cp1251 становятся типографскими кавычками. Именно они
// ломают разбор: PowerShell принимает их за границу строки.
const QUOTES = new Map([[0x91, '‘'], [0x92, '’'], [0x93, '“'], [0x94, '”']]);

const files = readdirSync(folder).filter((f) => f.endsWith('.ps1')).sort();
assert.ok(files.length, 'в scripts/ не осталось ни одного .ps1 — проверять нечего');

let checked = 0;
for (const name of files) {
 const bytes = readFileSync(path.join(folder, name));
 const ascii = bytes.every((b) => b < 0x80);
 if (ascii) continue;                      // латиница читается одинаково в любой кодировке
 checked += 1;

 assert.ok(bytes.subarray(0, 3).equals(BOM),
  'scripts/' + name + ' без метки UTF-8: Windows PowerShell прочитает его в cp1251 и кириллица развалится');

 // И называем опасность поимённо: без метки вот эти байты станут кавычками.
 const found = [...new Set([...bytes.subarray(3)].filter((b) => QUOTES.has(b)))];
 if (found.length) {
  assert.ok(bytes.subarray(0, 3).equals(BOM),
   'scripts/' + name + ' содержит байты ' + found.map((b) => '0x' + b.toString(16)).join(', ') +
   ' — без метки они станут кавычками ' + found.map((b) => QUOTES.get(b)).join(' ') + ' и файл не разберётся');
 }
}

assert.ok(checked, 'ни в одном .ps1 нет кириллицы — проверка ничего не сторожит');

console.log('PASS: все ' + checked + ' скрипта PowerShell с кириллицей начинаются с метки UTF-8 — Windows прочитает их целыми, а не в cp1251');
