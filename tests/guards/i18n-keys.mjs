#!/usr/bin/env node
/**
 * Ключ словаря, которого нет, слушатель видит как есть: вместо надписи в
 * кнопке появляется `community.send`. Типы такой промах не ловят — они
 * требуют одинаковые ключи в четырёх словарях, но не требуют, чтобы ключ,
 * написанный в компоненте, вообще существовал.
 *
 * И вторая проверка: в экране сообщества не должно быть русского текста
 * прямо в разметке. Приложение выходит на четырёх языках, а пакет сообщества
 * пришёл с зашитыми русскими строками — такую подстановку нужно ловить сразу,
 * а не после того, как итальянец увидит кириллицу.
 */
import assert from 'node:assert/strict';
import {readdirSync,readFileSync,statSync} from 'node:fs';
import path from 'node:path';
import {ru} from '../lib/i18n/ru.ts';
import {it} from '../lib/i18n/it.ts';
import {uk} from '../lib/i18n/uk.ts';
import {ro} from '../lib/i18n/ro.ts';

const root=path.resolve(import.meta.dirname,'..');
const DICTS={ru,it,uk,ro};
const LOCALES=Object.keys(DICTS);
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS '+name);}

function sources(dir,out=[]){
  for(const name of readdirSync(dir)){
    const full=path.join(dir,name);
    if(statSync(full).isDirectory()){if(name!=='node_modules')sources(full,out);}
    else if(/\.(tsx|ts)$/.test(name)&&!full.includes(path.join('lib','i18n')))out.push(full);
  }
  return out;
}
const files=[...sources(path.join(root,'app')),...sources(path.join(root,'components')),...sources(path.join(root,'lib'))];
assert.ok(files.length>20,'исходники не найдены');

// Ключи узнаём по началу: «donate.», «community.» и так далее — ровно те
// разделы, что есть в словаре. Поэтому в список попадают и ключи, которые
// передают через переменную, а не прямо в t().
const PREFIXES=new Set(Object.keys(ru).map(k=>k.split('.')[0]));
const used=new Map();
for(const file of files){
  // `nativeCall('player.load')` — это команда мосту Android, а не ключ
  // словаря, хотя выглядит так же. Такие вызовы из разбора убираем.
  const text=readFileSync(file,'utf8').replace(/nativeCall(<[^>]*>)?\(\s*['"][^'"]*['"]/g,'nativeCall(');
  for(const m of text.matchAll(/['"]([a-z][A-Za-z]*)\.([A-Za-z][A-Za-z0-9]*)['"]/g)){
    if(PREFIXES.has(m[1]))used.set(m[1]+'.'+m[2],path.relative(root,file));
  }
}

test('каждый ключ из кода есть во всех четырёх словарях',()=>{
  assert.ok(used.size>100,'ключи не собраны: '+used.size);
  const missing=[];
  for(const [key,file] of used)
    for(const [lang,dict] of Object.entries(DICTS))
      if(!(key in dict))missing.push(`${key} (${file}) → ${lang}.ts`);
  assert.deepEqual(missing,[],'ключей нет в словаре:\n'+missing.join('\n'));
});

test('экран сообщества не содержит русского текста мимо словаря',()=>{
  const guarded=[path.join(root,'components','community'),path.join(root,'app','account')];
  const bad=[];
  for(const dir of guarded)for(const file of sources(dir)){
    // Комментарии на русском — норма во всём проекте, поэтому их убираем и
    // смотрим только на сам код: там кириллицы быть не должно вовсе, ни в
    // кавычках, ни голым текстом между тегами.
    const code=readFileSync(file,'utf8').replace(/\/\*[\s\S]*?\*\//g,m=>m.replace(/[^\n]/g,' '));
    code.split('\n').forEach((line,i)=>{
      const bare=line.replace(/\/\/.*$/,'');
      if(/[А-Яа-яЁё]/.test(bare))bad.push(`${path.relative(root,file)}:${i+1} ${bare.trim().slice(0,60)}`);
    });
  }
  assert.deepEqual(bad,[],'русский текст мимо словаря:\n'+bad.join('\n'));
});

test('служебный поток говорит на всех языках приложения',()=>{
  // sw.js живёт вне сборки и вне словарей: туда не доходит ни типизация, ни
  // проверка ключей. Украинский и румынский здесь однажды забыли, и их
  // слушатели видели русский текст на странице «нет сети» и в уведомлении
  // без текста.
  const source=readFileSync(path.join(root,'public','sw.js'),'utf8');
  const block=source.match(/const SW_TEXT_ALL=(\{[\s\S]*?\n\});/);
  assert.ok(block,'в sw.js не найден словарь SW_TEXT_ALL');
  const texts=new Function('return '+block[1])();
  assert.deepEqual(Object.keys(texts).sort(),[...LOCALES].sort(),'языки sw.js разошлись с языками приложения');
  const shape=Object.keys(texts[LOCALES[0]]).sort();
  for(const [lang,entry] of Object.entries(texts)){
   assert.deepEqual(Object.keys(entry).sort(),shape,'в sw.js у «'+lang+'» другой набор строк');
   for(const [key,value] of Object.entries(entry))
    assert.ok(typeof value==='string'&&value.trim().length>2,'в sw.js пустая строка '+lang+'.'+key);
   if(lang!=='ru')for(const [key,value] of Object.entries(entry))
    assert.notEqual(value,texts.ru[key],'в sw.js «'+lang+'.'+key+'» не переведён — он совпадает с русским');
  }
});

console.log('TOTAL '+passed+' passed');
