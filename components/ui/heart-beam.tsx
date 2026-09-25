'use client';
import './heart-beam.css';

/**
 * Сердце, по контуру которого бежит свет.
 *
 * Прежний вариант обводил лучом саму кнопку: светлая дуга шла по кругу
 * диаметром 46 пикселей, а сердце внутри — 20. Свет и знак не имели друг к
 * другу отношения, и полосы читались как пролетающие мимо.
 *
 * Здесь светится сам контур сердца. Длина пути объявлена как 100 (pathLength),
 * поэтому штрих задаётся в долях контура и не зависит от того, каким мы
 * нарисовали сердце: короткий яркий отрезок обходит форму целиком.
 *
 * Оборот десять секунд — медленно, чтобы не мельтешить: проверка оформления
 * держит порог в восемь секунд на бесконечную анимацию.
 */
const HEART='M12 21S4.5 16.3 2.6 11.8C1.2 8.4 3 4.8 6.4 4.1 8.6 3.6 10.7 4.5 12 6.3c1.3-1.8 3.4-2.7 5.6-2.2 3.4.7 5.2 4.3 3.8 7.7C19.5 16.3 12 21 12 21z';

export function HeartBeam({size=20}:{size?:number}){
 return <svg className="tt-heart-beam" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
  <defs>
   <linearGradient id="tt-heart-beam-line" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stopColor="#6FE7DE"/>
    <stop offset="100%" stopColor="#4AA8FF"/>
   </linearGradient>
  </defs>
  <path className="tt-heart-line" d={HEART} pathLength={100}/>
  <path className="tt-heart-spark" d={HEART} pathLength={100}/>
 </svg>;
}
