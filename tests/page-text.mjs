#!/usr/bin/env node
/**
 * Разбивка рассказа на строки и страницы — без браузера.
 *
 * Мерка здесь поддельная и потому точная: каждая буква ровно десять пикселей,
 * пробел тоже. Значит, можно считать на пальцах, сколько слов обязано остаться
 * в строке и сколько строк — на странице, и сверять с этим, а не с догадкой.
 */
import {build} from 'esbuild';
import assert from 'node:assert/strict';
import path from 'node:path';

const root = process.cwd();
const {outputFiles} = await build({entryPoints: [path.join(root, 'lib/page-text.ts')],
 bundle: true, write: false, format: 'esm', platform: 'node'});
const {wrap, paginate, blocksOf} = await import(
 'data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64'));

/** Десять пикселей на знак. Заголовок вдвое крупнее и занимает две строки. */
const metrics = (width, rows, extra = {}) => ({
 width, rows,
 measure: (text, kind) => text.length * (kind === 'title' ? 20 : 10),
 height: kind => (kind === 'title' ? 2 : 1),
 after: () => 1,
 ...extra,
});

// 1. Перенос по словам. В полосе сто пикселей — десять знаков.
{
 // «один два» — восемь знаков, ровно восемьдесят пикселей; «один два три» уже
 // сто двадцать и не влезает. Дальше «три четыре» — ровно сто, то есть впору.
 const lines = wrap({kind: 'para', text: 'один два три четыре пять'}, metrics(100, 10));
 assert.deepEqual(lines.map(l => l.text), ['один два', 'три четыре', 'пять'],
  'строки должны набираться жадно и обрываться на пробеле');
 assert.equal(lines[0].first, true, 'первая строка куска должна быть отмечена');
 assert.equal(lines[1].first, false, 'вторая строка куска первой не является');
}

// 2. Отступ первой строки съедает место именно у первой строки.
{
 const lines = wrap({kind: 'para', text: 'один два три'}, metrics(100, 10, {indent: 30}));
 assert.deepEqual(lines.map(l => l.text), ['один', 'два три'],
  'на первую строку с отступом влезает меньше слов, чем на следующие');
}

// 3. Слово шире полосы рвётся по буквам, а не вылезает за край.
{
 const lines = wrap({kind: 'para', text: 'сверхдлинноеслово да'}, metrics(100, 10));
 for (const line of lines)
  assert.ok(line.text.length <= 10,
   'ни одна строка не имеет права быть шире полосы: «' + line.text + '»');
 const letters = text => text.replace(/\s+/g, '');
 assert.equal(letters(lines.map(l => l.text).join('')), letters('сверхдлинноеслово да'),
  'при разрыве по буквам ни одна буква не должна потеряться');
}

// 4. Пустой кусок строк не даёт.
assert.deepEqual(wrap({kind: 'para', text: '   '}, metrics(100, 10)), [],
 'из пробелов строка получаться не должна');

// 5. Страницы набираются до предела сетки и ни на строку больше.
{
 const blocks = Array.from({length: 12}, (_, i) => ({kind: 'para', text: 'абзац' + i}));
 const pages = paginate(blocks, metrics(100, 4));
 for (const page of pages) {
  const rows = page.reduce((sum, line) => sum + line.rows, 0);
  assert.ok(rows <= 4, 'на странице не может быть больше строк, чем помещается: ' + rows);
 }
 const all = pages.flat().map(l => l.text).filter(Boolean);
 assert.equal(all.length, 12, 'ни один абзац не должен пропасть при разбивке');
 assert.deepEqual(all, blocks.map(b => b.text), 'порядок абзацев обязан сохраниться');
 // Пустая строка между абзацами возвращается настоящей строкой без текста.
 // Пока её только считали, но не возвращали, абзацы на экране слипались, а низ
 // страницы оставался пустым — это было видно на первом же снимке.
 assert.ok(pages.flat().some(line => line.text === '' && line.rows > 0),
  'пустая строка между абзацами должна вернуться строкой, а не остаться в счёте');
 assert.ok(pages.length >= 4, 'двенадцать абзацев с пустыми строками не влезают в три страницы по четыре');
}

// 6. Длинный абзац разрывается между страницами — так набирают книги.
{
 const pages = paginate([{kind: 'para', text: 'раз два три четыре пять шесть'}], metrics(100, 2));
 assert.ok(pages.length > 1, 'абзац длиннее страницы обязан продолжиться на следующей');
 assert.equal(pages.flat().map(l => l.text).join(' '), 'раз два три четыре пять шесть',
  'при разрыве абзаца текст не должен измениться');
}

// 7. Заголовок не остаётся один на дне страницы.
{
 // Страница в три строки, пустых строк между кусками нет. Одна строка уже
 // занята, заголовок занимает две — по месту он на дне помещается ровно, но
 // тогда под ним не встанет ни одной строки текста. Такой заголовок обязан
 // уйти на следующую страницу целиком, а не висеть над пустотой.
 //
 // Пустые строки здесь нарочно убраны: с ними заголовок и так не влезал по
 // пределу страницы, и правило про одиночество не выполнялось ни разу —
 // проверка проходила и с выломанным правилом.
 const pages = paginate([
  {kind: 'para', text: 'начало'},
  {kind: 'title', text: 'Глава'},
  {kind: 'para', text: 'дальше'},
 ], metrics(100, 3, {after: () => 0}));
 const where = pages.findIndex(page => page.some(line => line.kind === 'title'));
 assert.ok(where >= 0, 'заголовок обязан оказаться на какой-то странице');
 const page = pages[where];
 const last = page[page.length - 1];
 assert.notEqual(last.kind, 'title',
  'заголовок не имеет права быть последней строкой страницы: под ним обязан идти его текст');
}

// 7б. Абзацы не слипаются внизу страницы. Пустая строка, которой не хватило
//     места, раньше выбрасывалась, а следующий абзац вставал на ту же страницу
//     вплотную к предыдущему — владелец видел это в читалке. Внутри страницы
//     перед первой строкой нового абзаца всегда стоит пустая строка.
{
 for (const rows of [3, 4, 5, 6, 7]) {
  const blocks = Array.from({length: 9}, (_, i) => ({kind: 'para', text: i % 3 ? 'короткий' : 'длинный абзац на две'}));
  const pages = paginate(blocks, metrics(100, rows));
  for (const page of pages) for (let i = 1; i < page.length; i++) {
   if (page[i].first && page[i].text) assert.equal(page[i - 1].text, '',
    'на странице в ' + rows + ' строк абзац «' + page[i].text + '» прилип к предыдущему без пустой строки');
  }
  assert.equal(pages.flat().filter(l => l.first).length, 9, 'ни один абзац не должен пропасть');
 }
}

// 8. Состав рассказа: название, вступление, абзацы.
{
 const blocks = blocksOf('Название', 'Вступление', 'первый\n\nвторой\n\n\nтретий');
 assert.deepEqual(blocks.map(b => b.kind), ['title', 'intro', 'para', 'para', 'para'],
  'название и вступление обязаны стать своими кусками, а пустые строки — делить абзацы');
 assert.deepEqual(blocksOf('', undefined, 'один').map(b => b.kind), ['para'],
  'без названия и вступления остаются только абзацы');
}

// 9. Пустой рассказ даёт одну пустую страницу, а не ноль: читалке нечего было
//    бы показать, и номер страницы стал бы нулём из нуля.
assert.deepEqual(paginate([], metrics(100, 4)), [[]],
 'из пустого рассказа должна получаться одна пустая страница');

console.log('PASS: строки набираются жадно и не шире полосы, длинное слово рвётся без потерь, страницы не перебирают сетку, абзац переносится, заголовок не висит один на дне');
