#!/usr/bin/env node
/**
 * Проверка, которая ищет то, чего в продукте уже нет, — это не проверка.
 *
 * Так ломались четыре проверки подряд: разметку переписывали, класс получал
 * новое имя, а прогон продолжал искать прежнее, ничего не находил и оставался
 * зелёным. Молча перестали работать симметрия кнопок площадок, вход в студию
 * с телефона, запрет оформления студии у слушателя и счёт шейдерных кругов —
 * блестящие кнопки после этого спокойно доехали до телефона владельца.
 *
 * Здесь собираются все классы и data-атрибуты, которые прогоны ищут на
 * странице, и сверяются с исходниками. Если селектор больше ничего не может
 * найти — прогон падает и называет файл и строку.
 *
 * Исключения перечислены поимённо и с причиной. Их два вида: имена, которые
 * рисует чужая библиотека, и надгробия — проверки вида «этого больше нет».
 * Надгробие живёт, пока кто-то не вернёт старое имя; добавлять новое можно,
 * но это осознанное действие, а не случайность.
 */
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');

/** Имена, которых в наших исходниках нет и быть не должно. */
const ALLOWED=new Map([
 ['data-beam','рисует border-beam во время работы'],
 ['data-sonner-toast','рисует sonner во время работы'],
 ['voice-columns','надгробие: строку разделов из каталога убрали'],
 ['catalog-scope','надгробие: переключатель записей эфиров из каталога убрали'],
 ['live-spectrum','надгробие: полосу спектра с экрана эфира убрали'],
 ['player-support','надгробие: широкую плашку поддержки из плеера убрали'],
]);

function walk(dir,out=[]){
 for(const name of readdirSync(dir)){
  const full=path.join(dir,name);
  if(statSync(full).isDirectory()){if(!['node_modules','.next','.git','outputs','dist'].includes(name))walk(full,out);}
  else out.push(full);
 }
 return out;
}

const sources=['app','components','lib'].flatMap(d=>walk(path.join(root,d)))
 .filter(f=>/\.(tsx|ts|css)$/.test(f));
assert.ok(sources.length>30,'исходники не прочитаны: '+sources.length);
const words=new Set();
for(const file of sources)
 for(const word of readFileSync(file,'utf8').matchAll(/[a-zA-Z0-9_-]+/g))words.add(word[0]);

// Селекторы узнаём по месту вызова: querySelector, locator и их родня.
const CALLS=/(?:querySelectorAll|querySelector|locator|closest|matches|\$\$eval|\$eval|\$\$|\$)\(\s*(['"`])([^'"`]+)\1/g;
// classList.contains('x') — тот же поиск класса, только без точки впереди.
const CLASSES=/classList\.contains\(\s*(['"`])([a-z][a-z0-9-]*)\1/gi;
const dead=[];
let checked=0;
for(const file of readdirSync(path.join(root,'tests')).filter(f=>f.endsWith('.mjs'))){
 const lines=readFileSync(path.join(root,'tests',file),'utf8').split('\n');
 lines.forEach((line,index)=>{
  for(const call of line.matchAll(CALLS)){
   const selector=call[2];
   if(!/^[.#[a-zA-Z]/.test(selector))continue;
   const names=[...selector.matchAll(/\.([a-z][a-z0-9-]*)/gi)].map(m=>m[1])
    .concat([...selector.matchAll(/\[(data-[a-z-]+)/gi)].map(m=>m[1]));
   for(const name of names){
    checked++;
    if(words.has(name)||ALLOWED.has(name))continue;
    dead.push(`${file}:${index+1} — «${name}» из селектора «${selector}» в продукте не встречается`);
   }
  }
  for(const call of line.matchAll(CLASSES)){
   checked++;
   if(words.has(call[2])||ALLOWED.has(call[2]))continue;
   dead.push(`${file}:${index+1} — класс «${call[2]}» из classList.contains в продукте не встречается`);
  }
 });
}
assert.ok(checked>150,'селекторы не собраны: '+checked);
assert.deepEqual(dead,[],'проверки ищут то, чего в продукте нет:\n'+dead.join('\n'));

// Надгробие без проверки — мусор: если имя больше нигде не ищут, строку из
// списка исключений нужно убрать, иначе список зарастёт.
// Себя из выборки исключаем: иначе каждое имя нашлось бы в собственном
// списке исключений и проверка всегда была бы довольна.
const allTests=readdirSync(path.join(root,'tests')).filter(f=>f.endsWith('.mjs')&&f!=='selectors-alive.mjs')
 .map(f=>readFileSync(path.join(root,'tests',f),'utf8')).join('\n');
const stale=[...ALLOWED.keys()].filter(name=>!allTests.includes(name));
assert.deepEqual(stale,[],'исключения, которые никто не ищет — их пора убрать из списка:\n'+stale.join('\n'));

console.log('PASS: все '+checked+' селекторов в проверках ещё могут что-то найти; исключений '+ALLOWED.size+', и каждое названо по имени');
