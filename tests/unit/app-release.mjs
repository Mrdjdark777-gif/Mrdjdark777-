/**
 * Ссылка на приложение не должна вести в никуда.
 *
 * Файл лежит в public/ и выкладывается вместе с кодом, но ничто не мешает
 * поменять номер версии в одном месте и забыть про другое. Тогда на сайте
 * появится кнопка, ведущая на 404, и узнает об этом первый же человек,
 * который попробует скачать.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';

const root=path.resolve(import.meta.dirname,'..');
const {outputFiles}=await build({entryPoints:[path.join(root,'lib/app-release.ts')],bundle:true,write:false,format:'esm',platform:'node'});
const {APP_RELEASE}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));

assert.match(APP_RELEASE.href,/^\/app\/[\w.-]+\.apk$/,'ссылка ведёт на файл в public/app');
assert.match(APP_RELEASE.version,/^\d+\.\d+\.\d+$/);
assert.match(APP_RELEASE.sha256,/^[0-9a-f]{64}$/);
assert.ok(Number.isInteger(APP_RELEASE.versionCode)&&APP_RELEASE.versionCode>0);

// Номер версии — в имени файла: по одному скачанному файлу должно быть видно,
// что именно человек держит, без установки.
assert.ok(APP_RELEASE.href.includes(APP_RELEASE.version),'имя файла должно нести номер версии');

const file=path.join(root,'public',APP_RELEASE.href.replace(/^\//,''));
const info=await stat(file).catch(()=>null);
assert.ok(info,'файла '+APP_RELEASE.href+' нет в public — ссылка на сайте вела бы на 404');
assert.equal(info.size,APP_RELEASE.bytes,'размер в lib/app-release.ts разошёлся с файлом');

const bytes=await readFile(file);
assert.equal(createHash('sha256').update(bytes).digest('hex'),APP_RELEASE.sha256,'сумма разошлась с файлом');

// Это должен быть настоящий подписанный APK, а не переименованный архив.
assert.equal(bytes.subarray(0,2).toString('latin1'),'PK','APK — это zip');
// Дальше — поиск двух меток в сырых байтах. Важно понимать предел такой
// проверки, потому что прежняя формулировка обещала больше, чем делала.
//
// Наличие строки «APK Sig Block 42» говорит, что в файле есть блок подписи
// v2/v3. Она НЕ проверяет саму подпись: ни цепочку сертификатов, ни то, что
// подписано нашим ключом, ни целостность содержимого относительно подписи.
// Подменённый файл с таким же блоком эту проверку пройдёт. Настоящая
// проверка — `apksigner verify --print-certs` со сверкой отпечатка ключа, а
// она требует Android SDK и делается при выпуске, а не здесь.
//
// Что эту проверку действительно держит — сумма sha256 выше: она закрепляет
// файл побайтово вместе с манифестом и подписью. Если файл подменили, не
// сойдётся именно она.
assert.ok(bytes.includes(Buffer.from('APK Sig Block 42')),'в сборке нет блока подписи v2/v3');
assert.ok(bytes.includes(Buffer.from('com.truethrills.listener','utf16le')),'это сборка не того приложения');

console.log('PASS: сборка для Android на месте — сумма sha256, размер и имя пакета сходятся со ссылкой на сайте; блок подписи присутствует (криптографическая проверка подписи требует apksigner и делается при выпуске).');
