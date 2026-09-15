/**
 * Форма звука для S04. Пики считает воркер вне запроса и кладёт в базу; здесь
 * только чистые преобразования, которые одинаково нужны и серверу, и клиенту.
 *
 * Хранится строка из символов 0-9a-z: один символ на столбик, 36 уровней.
 * Так пики целого выпуска весят меньше сотни байт и переживают любой перенос
 * через JSON, а не превращаются в массив из тысяч чисел.
 */
export const PEAK_COUNT=96;
const ALPHABET='0123456789abcdefghijklmnopqrstuvwxyz';

/** Сводит моно-PCM 16 бит в PEAK_COUNT столбиков по максимуму модуля. */
export function peaksFromPcm(pcm:Int16Array,count:number=PEAK_COUNT):number[]{
 if(count<1)return [];
 if(pcm.length===0)return new Array(count).fill(0);
 const bars=new Array<number>(count).fill(0);
 for(let i=0;i<pcm.length;i++){
  const bar=Math.min(count-1,Math.floor(i*count/pcm.length));
  const value=Math.abs(pcm[i]);
  if(value>bars[bar])bars[bar]=value;
 }
 const loudest=Math.max(...bars);
 if(loudest<=0)return bars.map(()=>0);
 // Корень сглаживает провалы: иначе тихая речь читается как пустая полоса.
 return bars.map(v=>Math.round(Math.sqrt(v/loudest)*35));
}

export function encodePeaks(bars:number[]):string{
 return bars.map(v=>ALPHABET[Math.max(0,Math.min(35,Math.round(v)))]).join('');
}

export function decodePeaks(encoded:string):number[]{
 const bars:number[]=[];
 for(const ch of encoded){const index=ALPHABET.indexOf(ch);if(index>=0)bars.push(index);}
 return bars;
}

/** Высота столбика в процентах: даже тишина остаётся видимой линией, а не дырой. */
export function barHeight(level:number):number{
 return Math.max(6,Math.round((level/35)*100));
}
