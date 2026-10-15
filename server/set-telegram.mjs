#!/usr/bin/env node
/**
 * Подключить уведомления в Telegram: токен бота приходит со стандартного
 * входа (из TrueThrills-Server.ps1 -Action Telegram по ssh), chat id сервер
 * находит сам — по последнему сообщению, которое владелец написал боту.
 * Оба значения записываются в .env (остальные строки не трогаются), и сразу
 * уходит пробное сообщение. Токен в журнал и на экран не печатается.
 *
 * Запуск на сервере: cd /opt/truethrills && sudo node server/set-telegram.mjs
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {chatFromUpdates,notify,setEnvLines,telegramReady} from './notify.mjs';

const token=readFileSync(0,'utf8').trim();
if(!/^\d{5,}:[A-Za-z0-9_-]{30,}$/.test(token)){console.error('Это не похоже на токен бота от @BotFather (вид: 123456789:AA…).');process.exit(2);}
let updates;
try{updates=await (await fetch(`https://api.telegram.org/bot${token}/getUpdates`,{signal:AbortSignal.timeout(15000)})).json();}
catch{console.error('Telegram не ответил. Проверь интернет на сервере и попробуй ещё раз.');process.exit(3);}
if(!updates?.ok){console.error('Telegram не принял токен. Скопируй его из @BotFather заново.');process.exit(4);}
const chat=chatFromUpdates(updates);
if(!chat){console.error('Бот пока не получил от тебя ни одного сообщения. Открой своего бота в Telegram, нажми «Старт» (или напиши «привет») и запусти ещё раз.');process.exit(5);}
const env={...process.env,TELEGRAM_BOT_TOKEN:token,TELEGRAM_CHAT_ID:chat};
if(!telegramReady(env)){console.error('Не получилось собрать настройки Telegram.');process.exit(6);}
const file='/opt/truethrills/.env';
// Запись поверх существующего файла сохраняет его владельца и права (640, root:truethrills).
writeFileSync(file,setEnvLines(readFileSync(file,'utf8'),{TELEGRAM_BOT_TOKEN:token,TELEGRAM_CHAT_ID:chat}));
const failed=await notify('True Thrills\n✅ Уведомления подключены. Сюда придут сбои сервера, сертификат, копии и трафик.',null,{...env,MONITOR_WEBHOOK_URL:''});
if(failed.length){console.error('Настройки записаны, но пробное сообщение не ушло: '+failed.join(', '));process.exit(7);}
console.log('Telegram connected: chat '+chat);
