#!/usr/bin/env node
/**
 * «Поделиться» — один путь для всех кнопок.
 *
 * На телефоне лист даёт система, на ПК его нет, и окно рисуем сами. Проверяем
 * сам выбор пути и ссылки площадок: ошибка здесь тихая — кнопка нажимается, а
 * человек попадает не туда или в пустоту.
 */
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {rm,mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
const dir=await mkdtemp(path.join(tmpdir(),'tt-share-'));
try{
 const out=path.join(dir,'share.mjs');
 await build({entryPoints:['lib/share.ts'],outfile:out,format:'esm',bundle:true,platform:'node'});
 // Путь в адрес: на Windows «C:\…» без этого читается как протокол «c:».
 const {shareTargets,shareRoute,shareUrl,shareHere,viewPath,postPath}=await import(pathToFileURL(out).href);

 // Путь: сначала система телефона, потом браузер, и только затем своё окно.
 assert.equal(shareRoute({native:true,webShare:true}),'native');
 assert.equal(shareRoute({native:true,webShare:false}),'native');
 assert.equal(shareRoute({native:false,webShare:true}),'web');
 assert.equal(shareRoute({native:false,webShare:false}),'sheet');

 // Кнопка делится тем, над чем стоит.
 //
 // Владелец спросил: «она делится какой ссылкой и чем вообще я делюсь?» Шапка
 // отдавала канал всегда, в каком бы разделе человек ни стоял: из «Историй»
 // уходила ссылка на главную.
 for(const [view,expect,key] of [
  ['stories','view=stories','heading.stories'],
  ['videos','view=videos','heading.videos'],
  ['podcasts','view=podcasts','heading.podcasts'],
  ['live','view=live','share.live'],
  ['home','view=home','share.channel'],
 ]){
  const here=shareHere(view);
  assert.equal(viewPath(here.view),'/?mode=listen&'+expect,'раздел «'+view+'» делится не собой');
  assert.equal(here.titleKey,key,'у раздела «'+view+'» не то название при отправке');
 }
 // Настройки своей ссылки не имеют: делиться чужим экраном настроек незачем.
 assert.equal(shareHere('settings').view,'home','из настроек обязан уходить канал');
 assert.equal(shareHere('чего-то такого нет').view,'home','неизвестный раздел обязан падать на канал, а не ломать ссылку');
 // Выпуск, история и запись эфира делятся собой, и имя в адресе экранируется.
 assert.equal(postPath('abc'),'/?mode=listen&post=abc');
 assert.equal(postPath('a b&c=d'),'/?mode=listen&post=a%20b%26c%3Dd',
  'имя выпуска обязано экранироваться: иначе чужой параметр уедет в адрес');

 // Адрес всегда абсолютный: относительный в чужом мессенджере бесполезен.
 assert.equal(shareUrl('/?mode=listen&view=home','https://truethrills.com'),'https://truethrills.com/?mode=listen&view=home');
 assert.equal(shareUrl('https://truethrills.com/x','https://example.com'),'https://truethrills.com/x');

 const url='https://truethrills.com/?mode=listen&post=a b',title='Эфир «Тест» & друзья';
 const targets=shareTargets({url,title});
 assert.equal(targets.length,6,'площадок должно быть шесть');
 assert.deepEqual(targets.map(x=>x.kind),['telegram','whatsapp','vk','facebook','x','email']);
 for(const target of targets){
  // Ничего не должно утечь сырым: пробел и амперсанд ломают чужой разбор.
  const tail=target.href.slice(target.href.indexOf('?')+1);
  assert.ok(!/ /.test(tail),target.kind+': в параметрах остался пробел — '+target.href);
  assert.ok(target.href.includes(encodeURIComponent(url))||target.href.includes(encodeURIComponent(title+' '+url))||target.href.includes(encodeURIComponent(title+'\n'+url)),
   target.kind+': в ссылке нет адреса — '+target.href);
 }
 assert.ok(targets[0].href.startsWith('https://t.me/share/url?'),'Telegram должен открываться своей ссылкой');
 assert.ok(targets[5].href.startsWith('mailto:?'),'почта должна открываться письмом');
 console.log('PASS: «поделиться» выбирает системный лист раньше своего окна, адрес абсолютный, шесть площадок получают экранированные ссылки');
}finally{await rm(dir,{recursive:true,force:true});}
