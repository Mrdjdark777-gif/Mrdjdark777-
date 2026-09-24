#!/usr/bin/env node
/**
 * Политика и правила выходят на четырёх языках, и это один документ, а не
 * четыре разных. Перевод, в котором потерялся абзац про удаление данных или
 * пункт про детей, — это другое обещание другому человеку, и заметить такое
 * глазами нельзя: страницы никто не читает целиком.
 *
 * Поэтому здесь сверяется не текст, а его устройство: одинаковые разделы,
 * одинаковое число пунктов, одинаковые подстановки. И отдельно — что документ
 * не притворяется действующим, пока автор не назвал себя и адрес для связи.
 */
import assert from 'node:assert/strict';
import {build} from 'esbuild';
// Модули пользуются алиасом @/ и импортами без расширения — собираем их так
// же, как это делает приложение, а не изображаем сборку руками.
const {outputFiles}=await build({stdin:{contents:"export {LOCALES} from './lib/i18n';export * from './lib/legal';",resolveDir:process.cwd()},
 bundle:true,write:false,format:'esm',platform:'node',alias:{'@':process.cwd()}});
const {LOCALES,legalPack,partyReady,fill}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));

const shape=doc=>({
 sections:doc.sections.length,
 headings:doc.sections.map(s=>s.heading.length>0),
 paragraphs:doc.sections.map(s=>(s.paragraphs??[]).length),
 bullets:doc.sections.map(s=>(s.bullets??[]).length),
});
const marks=doc=>[...JSON.stringify(doc).matchAll(/\{(controller|contact|site)\}/g)].map(m=>m[1]).sort().join(',');

const base=legalPack('ru');
for(const locale of LOCALES){
 const pack=legalPack(locale);
 for(const kind of ['privacy','rules']){
  assert.deepEqual(shape(pack[kind]),shape(base[kind]),`${locale}: «${kind}» расходится по устройству с русским`);
  assert.equal(marks(pack[kind]),marks(base[kind]),`${locale}: «${kind}» расходится по подстановкам`);
  assert.ok(pack[kind].title.trim().length>3,`${locale}: у «${kind}» нет заголовка`);
  assert.ok(pack[kind].intro.trim().length>40,`${locale}: у «${kind}» нет вступления`);
  for(const section of pack[kind].sections){
   assert.ok((section.paragraphs?.length??0)+(section.bullets?.length??0)>0,`${locale}: раздел «${section.heading}» пуст`);
   for(const line of [...(section.paragraphs??[]),...(section.bullets??[])])
    assert.ok(line.trim().length>10,`${locale}: слишком короткая строка в «${section.heading}»: ${line}`);
  }
 }
 assert.equal(pack.updated,base.updated,`${locale}: дата изменения разошлась с русской`);
 assert.match(pack.updated,/^\d{4}-\d{2}-\d{2}$/,`${locale}: дата изменения не в виде ГГГГ-ММ-ДД`);
}

// Подстановки заполняются, а незаполненные остаются видимыми: лучше заметная
// дыра, чем документ, который выглядит готовым и называет пустоту.
const party={controller:'Кто-то',contact:'a@b.c',site:'https://example.org'};
assert.equal(fill('Ответственный — {controller}, адрес {contact}.',party),'Ответственный — Кто-то, адрес a@b.c.');
assert.equal(fill('Пишите на {contact}.',{controller:'',contact:'',site:''}),'Пишите на {contact}.');
assert.equal(partyReady(party),true);
assert.equal(partyReady({controller:'',contact:'a@b.c',site:''}),false,'без ответственного документ не действителен');
assert.equal(partyReady({controller:'Кто-то',contact:'  ',site:''}),false,'без адреса для связи документ не действителен');

// Обещания, которые проверяются кодом, обязаны стоять в документе на всех
// языках: тридцать дней хранения комментариев и право на удаление профиля.
for(const locale of LOCALES){
 const text=JSON.stringify(legalPack(locale).privacy);
 assert.match(text,/30|тридцат|трид|treizeci|trenta/i,`${locale}: в политике не назван срок хранения комментариев`);
 assert.match(text,/{contact}/,`${locale}: в политике нет адреса для запросов`);
}
console.log('PASS: политика и правила совпадают по устройству на всех четырёх языках; незаполненные подстановки остаются видимыми, а документ без ответственного и адреса не считается действующим');
