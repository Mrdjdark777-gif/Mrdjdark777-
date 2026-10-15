import {existsSync} from 'node:fs';
import path from 'node:path';

/**
 * «Стоп-кран» трафика. Монитор (server/monitor.mjs, раз в пять минут) кладёт
 * файл data/operations/traffic-stop, когда исходящий трафик за месяц дошёл
 * до предела TRAFFIC_MONTH_LIMIT_GB, и убирает его с началом нового месяца.
 * Пока файл есть, слушателям не отдаются звук выпусков и эфир — это и есть
 * почти весь трафик. Автор работает как обычно.
 *
 * Владелец (14 октября): трафик должен оставаться бесплатным всегда. Лучше
 * несколько дней тишины в конце месяца, чем счёт от облака.
 *
 * Проверка — один stat файла на запрос звука: это микросекунды, а кэш здесь
 * дал бы до полуминуты расхождения между монитором и приложением.
 */
/** Каталог служебных файлов монитора; TT_OPERATIONS_DIR — для проверок. */
const flag=()=>path.join(process.env.TT_OPERATIONS_DIR||path.join(process.cwd(),'data','operations'),'traffic-stop');
export function trafficPaused(){return existsSync(flag());}
