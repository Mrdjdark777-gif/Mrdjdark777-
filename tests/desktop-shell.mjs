import assert from 'node:assert/strict';
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
assert.deepEqual(sent,['true-thrills:reload','true-thrills:browser','true-thrills:about']);

// Сломанный мост не роняет страницу.
const broken={chrome:{webview:{postMessage(){throw new Error('мост закрыт');}}}};
assert.equal(sendDesktopCommand('about',broken),false,'ошибка моста не выбрасывается наружу');

console.log('PASS: мост к приложению на ПК — определение окна, три команды и устойчивость к сбою моста.');
