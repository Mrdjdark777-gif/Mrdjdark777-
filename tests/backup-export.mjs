#!/usr/bin/env node
/**
 * Копия, уезжающая с сервера, должна быть зашифрована — и открываться.
 *
 * В архиве лежат .env, приватные ключи push-подписок и персональные данные
 * подписчиков. За пределами сервера он обязан быть закрыт. Но копия, которую
 * нельзя открыть без доустановки программ, — это не копия, а ловушка,
 * поэтому формат проверяется на открываемость средствами, которые есть в
 * Windows сами по себе: PBKDF2 и AES из .NET, без openssl и 7-Zip.
 *
 * Здесь проверяется ровно это: реальный openssl шифрует файл, а расшифровка
 * идёт независимой реализацией — тем же способом, каким это делает
 * scripts/TrueThrills-Restore.ps1. Сам PowerShell отсюда запустить нельзя,
 * поэтому дополнительно сверяются параметры: разойдись они хоть в одном
 * числе — восстановление не сработает, а узнать об этом хочется здесь.
 */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const read = (f) => readFileSync(path.join(root, f), 'utf8');

const shell = read('scripts/export-backup.sh');
const restore = read('scripts/TrueThrills-Restore.ps1');

// Без пароля копия уезжает открытой — этого быть не должно, но и молча
// шифровать нечем: пароль приходит снаружи. Проверяем, что путь с паролем
// существует и что имя файла отличается, иначе открытую копию можно принять
// за закрытую.
assert.match(shell, /BACKUP_PASSPHRASE/, 'экспорт не умеет шифровать');
assert.match(shell, /name=backup\.tar\.gz\.enc/, 'зашифрованная копия должна называться иначе, чем открытая');
assert.match(shell, /rm -f -- "\$folder\/backup\.tar\.gz"/, 'открытая копия обязана удаляться после шифрования');

// Параметры должны совпадать в обоих концах. Расхождение здесь означает
// нерасшифровываемую копию, и узнать об этом при восстановлении — поздно.
const ITER = 200000;
assert.match(shell, new RegExp('-iter ' + ITER + '\\b'), 'число итераций в экспорте изменилось');
assert.match(shell, /-aes-256-cbc/, 'алгоритм в экспорте изменился');
assert.match(shell, /-md sha256/, 'хэш KDF в экспорте изменён');
assert.match(restore, new RegExp('\\b' + ITER + ',', ), 'число итераций в восстановлении разошлось с экспортом');
assert.match(restore, /HashAlgorithmName\]::SHA256/, 'хэш KDF в восстановлении разошёлся с экспортом');
assert.match(restore, /KeySize=256/, 'длина ключа в восстановлении разошлась с экспортом');
assert.match(restore, /GetBytes\(48\)/, 'из пароля нужно 48 байт: 32 на ключ и 16 на вектор');
assert.match(restore, /Salted__/, 'восстановление должно узнавать формат openssl');

// Настоящий круг: openssl шифрует — независимая реализация открывает.
const dir = mkdtempSync(path.join(tmpdir(), 'tt-backup-'));
try {
 const secret = 'данные канала: .env, ключи push, подписчики';
 const pass = 'пароль от копии — длинный и с пробелами';
 writeFileSync(path.join(dir, 'plain'), secret);
 execFileSync('openssl', ['enc', '-aes-256-cbc', '-pbkdf2', '-iter', String(ITER), '-md', 'sha256', '-salt',
  '-in', path.join(dir, 'plain'), '-out', path.join(dir, 'cipher'), '-pass', 'stdin'], {input: pass});

 const blob = readFileSync(path.join(dir, 'cipher'));
 assert.equal(blob.subarray(0, 8).toString('latin1'), 'Salted__', 'openssl выдал не тот формат');
 assert.equal(blob.includes(Buffer.from(secret)), false, 'содержимое осталось читаемым в зашифрованном файле');

 const keyIv = crypto.pbkdf2Sync(Buffer.from(pass, 'utf8'), blob.subarray(8, 16), ITER, 48, 'sha256');
 const decipher = crypto.createDecipheriv('aes-256-cbc', keyIv.subarray(0, 32), keyIv.subarray(32, 48));
 const opened = Buffer.concat([decipher.update(blob.subarray(16)), decipher.final()]).toString();
 assert.equal(opened, secret, 'копия не открывается тем способом, которым её будет открывать Windows');

 // Неверный пароль обязан отказать, а не отдать мусор.
 assert.throws(() => {
  const wrong = crypto.pbkdf2Sync(Buffer.from('не тот пароль', 'utf8'), blob.subarray(8, 16), ITER, 48, 'sha256');
  const bad = crypto.createDecipheriv('aes-256-cbc', wrong.subarray(0, 32), wrong.subarray(32, 48));
  Buffer.concat([bad.update(blob.subarray(16)), bad.final()]);
 }, 'неверный пароль не должен что-то расшифровывать');
} finally {
 rmSync(dir, {recursive: true, force: true});
}

console.log('PASS: копия шифруется при выгрузке и открывается средствами, которые есть в Windows сами по себе; параметры обоих концов сходятся');
