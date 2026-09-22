import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
const {outputFiles}=await build({stdin:{contents:"export * from './lib/desktop-shell';",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node'});
const {isDesktopApp,sendDesktopCommand}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));

// В браузере моста нет: кнопки приложения показывать не надо.
assert.equal(isDesktopApp({}),false,'обычный браузер — не приложение');
assert.equal(isDesktopApp({chrome:{}}),false,'chrome без webview — не приложение');
assert.equal(sendDesktopCommand('reload',{}),false,'без моста команда не уходит');

// В окне приложения команда уходит той же строкой, что понимает клиент.
const sent=[];
const win={chrome:{webview:{postMessage:m=>sent.push(m)}}};
assert.equal(isDesktopApp(win),true);
assert.equal(sendDesktopCommand('reload',win),true);
assert.equal(sendDesktopCommand('browser',win),true);
assert.equal(sendDesktopCommand('about',win),true);
assert.equal(sendDesktopCommand('fullscreen',win),true);
assert.deepEqual(sent,['true-thrills:reload','true-thrills:browser','true-thrills:about','true-thrills:fullscreen']);

// Сломанный мост не роняет страницу.
const broken={chrome:{webview:{postMessage(){throw new Error('мост закрыт');}}}};
assert.equal(sendDesktopCommand('about',broken),false,'ошибка моста не выбрасывается наружу');

// Каждая команда страницы должна иметь разбор в оконной части: разъехавшиеся
// стороны моста молча ничего не делают, и заметить это можно только на ПК.
const client=await readFile('desktop/client.cpp','utf8');
for(const message of sent)assert.ok(client.includes('L"'+message+'"'),'окно не разбирает '+message);

// Версия установщика живёт в client.rc и больше нигде. Зашитая строка уже
// отставала на две версии: ресурсы объявляли 0.9.2, а человек ставил файл с
// 0.9.0 в названии — и заметить это можно было только глазами.
const rc=await readFile('desktop/client.rc','utf8');
const version=/^FILEVERSION\s+(\d+),(\d+),(\d+)/m.exec(rc);
assert.ok(version,'client.rc: нет строки FILEVERSION');
for(const file of ['desktop/build.py','desktop/verify.py']){
 const text=await readFile(file,'utf8');
 assert.equal(/TrueThrills-Setup-[0-9][0-9.]*\.exe/.test(text),false,
  file+': имя установщика зашито строкой — оно обязано собираться из FILEVERSION в client.rc');
 assert.match(text,/FILEVERSION/,file+': версия не читается из client.rc');
}

console.log('PASS: мост к приложению на ПК — определение окна, четыре команды, их разбор в оконной части, устойчивость к сбою моста и версия установщика из одного места.');
