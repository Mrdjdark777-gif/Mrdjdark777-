#!/usr/bin/env node
/**
 * Главная S01: что стоит в кадре и когда появляется строка «Продолжить».
 * Проверяется напрямую, без браузера.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import {build} from 'esbuild';
const root = path.resolve(import.meta.dirname, '..');
const {outputFiles} = await build({entryPoints: [path.join(root, 'lib/home-scene.ts')], bundle: true, write: false, format: 'esm', platform: 'node'});
const {homeScene} = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64'));

const post = (id, over = {}) => ({id, kind: 'podcast', title: 'Выпуск ' + id, description: '', duration: 600, published: 1, createdAt: Number(id), coverKey: null, coverUrl: null, ...over});
const base = {posts: [post('3'), post('2'), post('1')], progress: [], seen: [], hidden: []};

// В кадре — самая свежая публикация.
assert.equal(homeScene(base).hero.id, '3');
assert.equal(homeScene(base).resume, null, 'нечего продолжать — строки нет');

// Открытая публикация перестаёт быть новинкой, кадр уходит к следующей.
assert.equal(homeScene({...base, seen: ['3']}).hero.id, '2');
// Открыты все — остаётся самая свежая, а не пустота.
assert.equal(homeScene({...base, seen: ['3', '2', '1']}).hero.id, '3');

// Герой и «Продолжить» — разные выпуски и не смешиваются.
let scene = homeScene({...base, progress: [{id: '1', position: 120, duration: 600}]});
assert.equal(scene.hero.id, '3');
assert.equal(scene.resume.post.id, '1');
assert.equal(scene.resume.position, 120);
assert.equal(scene.resume.duration, 600);

// Дослушанный до конца выпуск продолжать нечего.
assert.equal(homeScene({...base, progress: [{id: '1', position: 599, duration: 600}]}).resume, null);
// Нулевая позиция — это не «начал слушать».
assert.equal(homeScene({...base, progress: [{id: '1', position: 0, duration: 600}]}).resume, null);
// Продолжают подкаст: прогресс по истории или видео строку не даёт.
assert.equal(homeScene({...base, posts: [post('3', {kind: 'story'})], progress: [{id: '3', position: 50, duration: 600}]}).resume, null);
// Выпуск, которого больше нет, не должен ронять экран.
assert.equal(homeScene({...base, progress: [{id: 'исчез', position: 50, duration: 600}]}).resume, null);
// Неизвестная длительность берётся из самой публикации, а не остаётся нулём.
assert.equal(homeScene({...base, progress: [{id: '1', position: 50, duration: 0}]}).resume.duration, 600);

// Убранное с главной пропускается и в кадре, и в строке продолжения…
assert.equal(homeScene({...base, hidden: ['3']}).hero.id, '2');
assert.equal(homeScene({...base, progress: [{id: '1', position: 50, duration: 600}], hidden: ['1']}).resume, null);
// …но когда убрано всё, кадр остаётся: пустая главная при непустом канале хуже.
assert.equal(homeScene({...base, seen: ['3', '2', '1'], hidden: ['3', '2', '1']}).hero.id, '3');

// Черновики автора на главную слушателя не попадают.
assert.equal(homeScene({...base, posts: [post('9', {published: 0})]}).hero, null);
assert.equal(homeScene({...base, posts: []}).hero, null);

console.log('PASS: в кадре самая свежая неоткрытая публикация, «Продолжить» — отдельный выпуск со своей позицией, дослушанное и убранное не показываются');
