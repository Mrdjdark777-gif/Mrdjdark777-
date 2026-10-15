/**
 * Счётчик исходящего трафика сервера за календарный месяц (UTC).
 *
 * Зачем. Сервер стоит в Oracle Cloud на бесплатном тарифе: исходящий трафик
 * бесплатен до 10 ТБ в месяц. Владелец (14 октября): «я пока не буду тратить
 * деньги на это приложение… установить лимит трафика, чтоб он всегда был
 * бесплатный». Поэтому монитор каждые пять минут прибавляет к счётчику месяца
 * то, что ушло с сетевых карт, предупреждает на половине и на 80 % предела, а
 * на пределе включает «стоп-кран»: звук и эфир перестают отдаваться
 * слушателям до начала следующего месяца (см. lib/traffic-pause.ts).
 *
 * Здесь только расчёт, без чтения файлов и сети, — его проверяет
 * tests/unit/traffic.mjs.
 */

/** Сколько байт ушло со всех сетевых карт, кроме петли (lo), по /proc/net/dev. */
export function transmittedBytes(procNetDev){
 let total=0;
 for(const line of String(procNetDev).split('\n')){
  const m=/^\s*([^:\s]+):\s*(.*)$/.exec(line);if(!m||m[1]==='lo')continue;
  const fields=m[2].trim().split(/\s+/).map(Number);
  // Первые восемь чисел — приём, девятое — отправленные байты.
  if(fields.length>=9&&Number.isFinite(fields[8]))total+=fields[8];
 }
 return total;
}

/** Месяц в виде 2026-10 — по нему счётчик обнуляется. */
export function monthOf(ms){return new Date(ms).toISOString().slice(0,7);}

/** Уровень расхода: ok, half (50 %), warn (80 %), stop (100 %). */
export function levelOf(used,limit){
 if(!(limit>0))return 'ok';
 const share=used/limit;
 return share>=1?'stop':share>=0.8?'warn':share>=0.5?'half':'ok';
}
const RANK={ok:0,half:1,warn:2,stop:3};

/**
 * Новое состояние счётчика после очередного замера.
 * state — {month, used, lastTx, alerted}; tx — отправлено с загрузки системы.
 * Счётчик ядра обнуляется при перезагрузке: тогда прирост — всё, что ушло с
 * загрузки. Самый первый замер только запоминает отправную точку: что ушло
 * до установки счётчика, неизвестно, в каком месяце это было.
 * notify — уровень, о котором пора сообщить (растёт только вверх за месяц).
 */
export function account(state,tx,now,limit){
 const month=monthOf(now);
 const fresh=!state||typeof state.lastTx!=='number';
 const delta=fresh?0:tx>=state.lastTx?tx-state.lastTx:tx;
 const sameMonth=!fresh&&state.month===month;
 const used=(sameMonth?state.used:0)+delta;
 const level=levelOf(used,limit);
 const alerted=sameMonth?state.alerted||'ok':'ok';
 const notify=RANK[level]>RANK[alerted]?level:null;
 return {state:{month,used,lastTx:tx,alerted:notify??alerted},used,level,notify};
}

/** 1234567890123 → «1,23 ТБ». */
export function human(bytes){
 const units=['Б','КБ','МБ','ГБ','ТБ'];let v=bytes,i=0;
 while(v>=1000&&i<units.length-1){v/=1000;i++;}
 return (i?v.toFixed(2).replace('.',','):String(v))+' '+units[i];
}
