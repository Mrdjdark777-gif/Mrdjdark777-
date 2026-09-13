#!/usr/bin/env node
/**
 * Проверяет решения об уведомлениях в приложении Android: язык пуша и
 * автоподписку после «Разрешить».
 *
 * Класс PushPolicy намеренно без единого импорта Android, поэтому здесь
 * компилируется настоящий исходник из android/app/src/main — не копия и не
 * заглушка — и вызывается обычной JVM. Так проверка живёт в общем наборе и
 * не требует ни SDK, ни эмулятора.
 */
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {readFileSync} from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const source = path.join(root, 'android/app/src/main/java/com/truethrills/listener/PushPolicy.java');
const work = await mkdtemp(path.join(tmpdir(), 'tt-android-'));
const fail = (message) => { console.error('FAIL: ' + message); process.exit(1); };

try {
 // Драйвер печатает по строке на проверку; сравниваем ожидаемое целиком,
 // чтобы молчаливо пропущенная проверка была заметна. Класс package-private,
 // поэтому драйвер лежит в том же пакете.
 const driver = path.join(work, 'com/truethrills/listener/Driver.java');
 await mkdir(path.dirname(driver), {recursive: true});
 await writeFile(driver, `package com.truethrills.listener;
public class Driver {
 public static void main(String[] a) {
  for (String tag : new String[]{"uk", "uk-UA", "ro", "ro-MD", "mo", "it", "it-CH", "ru", "ru-RU", "en-US", "de", null, "", "  UK-ua  "})
   System.out.println("locale " + tag + " -> " + PushPolicy.locale(tag));
  System.out.println("fresh " + PushPolicy.shouldAutoEnable(true, false, false, false));
  System.out.println("denied " + PushPolicy.shouldAutoEnable(false, false, false, false));
  System.out.println("retry-after-failure " + PushPolicy.shouldAutoEnable(true, false, false, false));
  System.out.println("already-done " + PushPolicy.shouldAutoEnable(true, true, true, false));
  System.out.println("user-off " + PushPolicy.shouldAutoEnable(true, false, false, true));
  System.out.println("user-off-then-permitted-again " + PushPolicy.shouldAutoEnable(true, true, false, true));
  System.out.println("subscribed-elsewhere " + PushPolicy.shouldAutoEnable(true, false, true, false));
  System.out.println("migrate-ru-to-uk " + PushPolicy.shouldRefreshLocale("ru", "uk-UA"));
  System.out.println("migrate-ru-to-ro " + PushPolicy.shouldRefreshLocale("ru", "ro-MD"));
  System.out.println("migrate-none " + PushPolicy.shouldRefreshLocale("it", "it-IT"));
  System.out.println("migrate-unknown-stays " + PushPolicy.shouldRefreshLocale("ru", "en-GB"));
  System.out.println("migrate-empty " + PushPolicy.shouldRefreshLocale(null, "ru"));
 }
}
`);

 try {
  execFileSync('javac', ['-d', path.join(work, 'classes'), source, driver], {stdio: 'pipe'});
 } catch (e) {
  fail('PushPolicy не компилируется — значит, в нём появилась зависимость от Android:\n' + String(e.stderr || e));
 }
 const out = execFileSync('java', ['-cp', path.join(work, 'classes'), 'com.truethrills.listener.Driver'], {encoding: 'utf8'}).trim();

 const expected = [
  'locale uk -> uk', 'locale uk-UA -> uk', 'locale ro -> ro', 'locale ro-MD -> ro', 'locale mo -> ro',
  'locale it -> it', 'locale it-CH -> it', 'locale ru -> ru', 'locale ru-RU -> ru',
  'locale en-US -> ru', 'locale de -> ru', 'locale null -> ru', 'locale  -> ru', 'locale   UK-ua   -> uk',
  'fresh true', 'denied false', 'retry-after-failure true', 'already-done false', 'user-off false',
  'user-off-then-permitted-again false', 'subscribed-elsewhere false',
  'migrate-ru-to-uk true', 'migrate-ru-to-ro true', 'migrate-none false',
  'migrate-unknown-stays false', 'migrate-empty true',
 ].join('\n');
 if (out !== expected) fail('поведение разошлось с ожидаемым.\n--- получено ---\n' + out + '\n--- ожидалось ---\n' + expected);

 // Мост обязан пользоваться этой политикой, а не собственным «it или ru»:
 // без этой проверки правило легко потерять при следующей правке.
 const bridge = readFileSync(path.join(root, 'android/app/src/main/java/com/truethrills/listener/NativeBridge.java'), 'utf8');
 const client = readFileSync(path.join(root, 'android/app/src/main/java/com/truethrills/listener/PushClient.java'), 'utf8');
 if (/"it"\s*\.equals\([\s\S]*?\)\s*\?\s*"it"\s*:\s*"ru"/.test(bridge)) fail('в NativeBridge остался старый выбор языка «it или ru» — украинец и румын снова получат пуш по-русски.');
 if (!/PushPolicy\.locale\(/.test(bridge)) fail('NativeBridge не приводит язык через PushPolicy.locale.');
 if (!/PushPolicy\.shouldAutoEnable\(/.test(bridge)) fail('NativeBridge не спрашивает PushPolicy.shouldAutoEnable — значит, решает сам.');
 if (!/PushPolicy\.shouldRefreshLocale\(/.test(client + bridge)) fail('никто не переводит уже зарегистрированные устройства на их язык.');
 // Отметка «сделано» должна ставиться после удачной подписки, а не до попытки.
 const auto = bridge.slice(bridge.indexOf('void autoEnableIfNeeded'));
 const block = auto.slice(0, auto.indexOf('\n    /**'));
 const mark = block.indexOf('putBoolean("auto-enable-done", true)'), subscribe = block.indexOf('PushClient.subscribe');
 if (mark === -1 || subscribe === -1) fail('в autoEnableIfNeeded не найдены подписка и отметка о ней.');
 if (mark < subscribe) fail('отметка об автоподписке ставится до попытки: один запуск без сети навсегда лишит слушателя уведомлений.');

 console.log('PASS: язык пуша покрывает ru/it/uk/ro и региональные теги; автоподписка повторяется после неудачи, не спорит с выбором слушателя и переводит старые регистрации на их язык');
} finally {
 await rm(work, {recursive: true, force: true});
}
