#!/usr/bin/env node
/**
 * Восстановление воспроизведения после пересоздания экрана.
 *
 * Нативный плеер живёт дольше веб-страницы: экран можно пересоздать поворотом
 * или возвратом в приложение, а звук всё это время идёт сам. Страница при
 * запуске спрашивает плеер, что у него происходит, и должна показать это как
 * есть. Две поломки, которые здесь закрыты:
 *
 * - эфир на паузе начинал играть заново: player.live безусловно вызывал
 *   p.play(), и достаточно было открыть приложение, чтобы поставленный на
 *   паузу эфир заговорил в кармане;
 * - выпуск на паузе просто исчезал с экрана: плеер рисовался только при
 *   playing=true, хотя сам плеер никуда не девался.
 *
 * Проверяется договорённость между четырьмя файлами и мостом — «autoplay
 * доходит до плеера и по умолчанию истинен». На живом телефоне это не
 * проверено: поворот экрана и возврат в приложение проверяются руками.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (f) => readFileSync(path.join(root, f), 'utf8');

const bridge = read('android/app/src/main/java/com/truethrills/listener/PlayerBridge.java');
// Эфир: воспроизведение только по просьбе, как это давно устроено у выпусков.
const live = bridge.slice(bridge.indexOf('case "live"'), bridge.indexOf('case "volume"'));
assert.ok(!/^\s*p\.play\(\);\s*break;$/m.test(live), 'player.live снова навязывает воспроизведение: эфир на паузе заговорит сам при открытии приложения');
assert.match(live, /if \(args\.optBoolean\("autoplay", true\)\) p\.play\(\);/, 'player.live должен спрашивать autoplay');
// У выпусков то же правило и та же запись по умолчанию.
const audio = bridge.slice(bridge.indexOf('case "load"') === -1 ? bridge.indexOf('case "audio"') : bridge.indexOf('case "load"'), bridge.indexOf('case "live"'));
assert.match(audio, /if \(args\.optBoolean\("autoplay", true\)\) p\.play\(\);/, 'player.load должен спрашивать autoplay');

const hook = read('hooks/use-live.ts');
assert.match(hook, /async function listen\(id:string,title=t\('liveHook\.title'\),autoplay=true\)/, 'listen должен принимать autoplay и по умолчанию запускать');
assert.match(hook, /nativeCall\('player\.live',\{[^}]*autoplay/, 'listen не передаёт autoplay нативному плееру');
assert.match(hook, /if\(!autoplay\)\{[\s\S]{0,200}setPhase\('paused'\)/, 'в браузере при autoplay=false эфир должен показываться на паузе, а не запускаться');

const studio = read('app/studio.tsx');
assert.match(studio, /setPlayerAutoplay\(state\.playing\)/, 'восстановление должно решать судьбу автозапуска по состоянию нативного плеера');
assert.match(studio, /live\.listen\(state\.id\.slice\(5\),undefined,state\.playing\)/, 'восстановление эфира должно передавать autoplay, а не запускать всегда');
assert.ok(!/if\(state\.active&&state\.playing\)setPlaying\(post\)/.test(studio), 'выпуск на паузе снова прячется с экрана');
assert.match(studio, /if\(state\.active\)setPlaying\(post\)/, 'плеер выпуска должен показываться и на паузе');
assert.match(studio, /function playPost\(p:Post\)\{live\.leave\(\);setPlayerAutoplay\(true\)/, 'нажатие на выпуск должно включать автозапуск обратно');
assert.match(studio, /autoplay=\{playerAutoplay\}/, 'решение об автозапуске не доходит до плеера');

for (const file of ['components/studio/podcast-player.tsx', 'components/studio/native-podcast-player.tsx']) {
 const text = read(file);
 assert.match(text, /autoplay\?:boolean/, file + ': нет свойства autoplay');
 assert.match(text, /autoplay=true/, file + ': autoplay должен по умолчанию быть истинным, иначе обычное нажатие перестанет играть');
}
assert.match(read('components/studio/podcast-player.tsx'), /el\.load\(\);if\(autoplay\)void play\(\);/, 'веб-плеер играет независимо от autoplay');
assert.match(read('components/studio/native-podcast-player.tsx'), /'player\.load',\{id,title,autoplay/, 'нативный плеер не получает autoplay');

console.log('PASS: эфир и выпуск на паузе переживают пересоздание экрана — показываются как есть и не запускаются сами; обычное нажатие по-прежнему играет');
