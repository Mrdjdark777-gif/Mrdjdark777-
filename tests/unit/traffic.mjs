#!/usr/bin/env node
/**
 * Счётчик трафика за месяц (server/traffic.mjs) и готовность Telegram
 * (server/notify.mjs). На этом держится «трафик всегда бесплатный»: если
 * счётчик теряет байты при перезагрузке или не обнуляется с новым месяцем,
 * стоп-кран сработает не тогда.
 */
import assert from 'node:assert/strict';
import {account,human,levelOf,monthOf,transmittedBytes} from '../../server/traffic.mjs';
import {chatFromUpdates,setEnvLines,telegramReady} from '../../server/notify.mjs';

const dev=`Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo: 999999 10 0 0 0 0 0 0 999999 10 0 0 0 0 0 0
enp0s6: 5000 40 0 0 0 0 0 0 7000 50 0 0 0 0 0 0
  ens3: 100 1 0 0 0 0 0 0 300 2 0 0 0 0 0 0`;
assert.equal(transmittedBytes(dev),7300,'отправленные байты — девятое число, петля lo не считается');

const GB=1e9,limit=100*GB,oct=Date.UTC(2026,9,15),nov=Date.UTC(2026,10,1,0,5);
assert.equal(monthOf(oct),'2026-10');
// Первый замер — только отправная точка.
let r=account(null,40*GB,oct,limit);
assert.equal(r.used,0);assert.equal(r.level,'ok');assert.equal(r.notify,null);
// Прирост считается.
r=account(r.state,90*GB,oct+1,limit);
assert.equal(r.used,50*GB);assert.equal(r.level,'half');assert.equal(r.notify,'half','на половине — одно уведомление');
r=account(r.state,91*GB,oct+2,limit);
assert.equal(r.notify,null,'о том же уровне второй раз не сообщаем');
// Перезагрузка: счётчик ядра начался заново — прибавляется всё, что ушло с загрузки.
r=account(r.state,35*GB,oct+3,limit);
assert.equal(r.used,86*GB,'после перезагрузки байты не теряются и не считаются дважды');
assert.equal(r.level,'warn');assert.equal(r.notify,'warn');
r=account(r.state,50*GB,oct+4,limit);
assert.equal(r.level,'stop');assert.equal(r.notify,'stop','на пределе — стоп и уведомление');
// Новый месяц — с нуля, стоп снимается.
r=account(r.state,51*GB,nov,limit);
assert.equal(r.state.month,'2026-11');assert.equal(r.used,1*GB,'новый месяц не обнулил счётчик');assert.equal(r.level,'ok');assert.equal(r.notify,null);
assert.equal(levelOf(5,0),'ok','без предела стоп-кран не срабатывает');
assert.equal(human(1234567890123),'1,23 ТБ');

assert.equal(telegramReady({TELEGRAM_BOT_TOKEN:'123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw',TELEGRAM_CHAT_ID:'987654321'}),true);
assert.equal(telegramReady({TELEGRAM_BOT_TOKEN:'',TELEGRAM_CHAT_ID:'987654321'}),false,'без токена Telegram не включается');
assert.equal(telegramReady({TELEGRAM_BOT_TOKEN:'123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw',TELEGRAM_CHAT_ID:'@me'}),false,'chat id — число');
// Подключение Telegram (server/set-telegram.mjs): в .env меняются только две строки.
assert.equal(setEnvLines('ADMIN_PASSWORD=x\nTELEGRAM_CHAT_ID=1\n',{TELEGRAM_BOT_TOKEN:'t',TELEGRAM_CHAT_ID:'2'}),'ADMIN_PASSWORD=x\nTELEGRAM_CHAT_ID=2\nTELEGRAM_BOT_TOKEN=t\n','строки .env заменяются и дописываются, остальные не трогаются');
assert.equal(setEnvLines('A=1',{B:'$&'}),'A=1\nB=$&\n','значение пишется как есть, без подстановок');
assert.equal(chatFromUpdates({ok:true,result:[{message:{chat:{id:-100,type:'group'}}},{message:{chat:{id:42,type:'private'}}}]}),'42','берётся личный чат владельца');
assert.equal(chatFromUpdates({ok:true,result:[{message:{chat:{id:-100,type:'group'}}}]}),'','чужие группы не годятся');
console.log('PASS: трафик за месяц — отправная точка, прирост, перезагрузка без потерь, 50/80/100 % по одному разу, обнуление с новым месяцем; Telegram включается только с токеном и числовым chat id; подключение меняет в .env только свои строки и берёт личный чат');
