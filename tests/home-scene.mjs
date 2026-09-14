#!/usr/bin/env node
/**
 * Порядок сюжетов на главной: идущий эфир → продолжить → новый непрослушанный
 * → самый свежий → пусто. Правило проверяется напрямую, без браузера.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import {build} from 'esbuild';
const root = path.resolve(import.meta.dirname, '..');
const {outputFiles} = await build({entryPoints: [path.join(root, 'lib/home-scene.ts')], bundle: true, write: false, format: 'esm', platform: 'node'});
const {homeScene} = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64'));

const post = (id, over = {}) => ({id, kind: 'podcast', title: 'Выпуск ' + id, description: '', duration: 600, published: 1, createdAt: Number(id), coverKey: null, coverUrl: null, ...over});
const base = {posts: [post('3'), post('2'), post('1')], live: null, progress: [], seen: [], hidden: []};
const live = {id: 'air', title: 'Вечерний эфир', cover: false};

// Эфир важнее всего: он идёт прямо сейчас и ждать не будет.
assert.deepEqual(homeScene({...base, live, progress: [{id: '2', position: 100, duration: 600}], seen: ['3', '2', '1']}), {kind: 'live', live});

// Продолжить — раньше, чем новинка: человек уже начал слушать.
let scene = homeScene({...base, progress: [{id: '2', position: 100, duration: 600}]});
assert.equal(scene.kind, 'resume');
assert.equal(scene.post.id, '2');
assert.equal(scene.position, 100);

// Дослушанный до конца выпуск продолжать нечего — показываем новинку.
assert.equal(homeScene({...base, progress: [{id: '2', position: 599, duration: 600}]}).kind, 'fresh');
// Нулевая позиция — это не «начал слушать».
assert.equal(homeScene({...base, progress: [{id: '2', position: 0, duration: 600}]}).kind, 'fresh');
// Прогресс по истории или видео не даёт «продолжить»: продолжают подкаст.
assert.equal(homeScene({...base, posts: [post('3', {kind: 'story'})], progress: [{id: '3', position: 50, duration: 600}]}).kind, 'fresh');
// Прогресс по выпуску, которого больше нет, не должен ронять экран.
assert.equal(homeScene({...base, progress: [{id: 'исчез', position: 50, duration: 600}]}).kind, 'fresh');

// Новинка — самая свежая из неоткрытых.
scene = homeScene({...base, seen: ['3']});
assert.equal(scene.kind, 'fresh');
assert.equal(scene.post.id, '2');

// Всё открыто — показываем самый свежий материал.
scene = homeScene({...base, seen: ['3', '2', '1']});
assert.equal(scene.kind, 'latest');
assert.equal(scene.post.id, '3');

// Убранное с главной пропускается на шагах «продолжить» и «новый»…
assert.equal(homeScene({...base, progress: [{id: '2', position: 100, duration: 600}], hidden: ['2']}).kind, 'fresh');
scene = homeScene({...base, hidden: ['3']});
assert.equal(scene.post.id, '2');
// …но самый свежий показывается всё равно: пустая главная при непустом канале
// хуже, чем карточка, которую однажды убрали.
scene = homeScene({...base, seen: ['3', '2', '1'], hidden: ['3', '2', '1']});
assert.equal(scene.kind, 'latest');
assert.equal(scene.post.id, '3');

// Черновики автора на главную слушателя не попадают.
assert.equal(homeScene({...base, posts: [post('9', {published: 0})]}).kind, 'empty');
assert.equal(homeScene({...base, posts: []}).kind, 'empty');

console.log('PASS: главная показывает эфир раньше продолжения, продолжение раньше новинки, новинку раньше свежего, и не остаётся пустой при непустом канале');
