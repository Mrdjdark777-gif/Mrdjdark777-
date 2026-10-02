'use client';
import {useEffect} from 'react';
import {aim,ease,follow,shiftOf,type Tilt} from '@/lib/device-tilt';
import {hasNativeClient,nativeCall,onNative} from '@/lib/native-client';

/**
 * Карточки живут вслед за рукой.
 *
 * Почему прошлая попытка не работала. В браузере телефона положение приносит
 * событие `deviceorientation`. В оболочке Android его нет: WebView не поднимает
 * службу датчиков Chromium, и обработчик не вызывается ни разу — ни ошибки, ни
 * события. Владелец это и увидел: «карточки не двигаются вообще». Повторять
 * подписку на то же событие бессмысленно, сколько ни пробуй.
 *
 * Выход — тот же, которым пользуются все приложения с WebView: датчик читает
 * оболочка, а странице отдаёт готовые числа через мост. Мост в приложении уже
 * есть — им ходят вибрация, плеер и уведомления; добавлены две команды,
 * motion.start и motion.stop, и поток событий в обратную сторону.
 *
 * Сдвиг, а не поворот. Поворот WebView рисует заново, вместе со скруглением и
 * тенью, и на устройстве владельца это сыпало пиксели. Сдвиг выполняет
 * композитор над готовым слоем — он не трогает содержимое и не рябит. Это то
 * же правило, по которому в карусели на ходу меняется только прозрачность.
 *
 * Значения пишутся в стиль одного элемента — полосы карусели, — а карточки
 * наследуют их переменными. Одна запись в кадр на всю ленту, а не по записи на
 * карточку.
 */
export function useTilt(target: {current: HTMLElement | null}, enabled = true) {
 useEffect(() => {
  const node = target.current;
  if (!node || !enabled) return;
  if (typeof window === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  let goal: Tilt = {x: 0, y: 0};
  let now: Tilt = {x: 0, y: 0};
  let frame = 0;
  let alive = true;

  // Доводка идёт кадрами и только пока есть куда двигаться: замерла рука —
  // замирает и цикл, телефон не греется ради неподвижной картинки.
  const step = () => {
   frame = 0;
   now = ease(now, goal);
   const shift = shiftOf(now);
   node.style.setProperty('--tx', shift.x.toFixed(2) + 'px');
   node.style.setProperty('--ty', shift.y.toFixed(2) + 'px');
   if (Math.abs(goal.x - now.x) > 0.01 || Math.abs(goal.y - now.y) > 0.01) wake();
  };
  const wake = () => {if (alive && !frame) frame = requestAnimationFrame(step);};
  // Нейтраль стартует с привычного положения (38° от стола, без крена) и дальше
  // медленно идёт за рукой — см. follow в lib/device-tilt.ts. Наклон считается
  // от неё, а не от зашитого числа: держишь телефон круче — карточка не
  // упирается в край навсегда.
  let restForward: number | null = 38, restSide: number | null = 0;
  const take = (beta: number | null, gamma: number | null) => {
   goal = aim(beta, gamma, restForward ?? 38, restSide ?? 0);
   restForward = follow(restForward, beta);
   restSide = follow(restSide, gamma);
   wake();
  };

  const handler = (event: DeviceOrientationEvent) => take(event.beta, event.gamma);
  const browser = () => {
   window.addEventListener('deviceorientation', handler);
   return () => window.removeEventListener('deviceorientation', handler);
  };

  let stop = () => {};
  if (hasNativeClient()) {
   const off = onNative(message => {
    if (message.event !== 'motion') return;
    take(typeof message.beta === 'number' ? message.beta : null,
         typeof message.gamma === 'number' ? message.gamma : null);
   });
   let back = () => {};
   // Оболочка старее страницы — обычное дело: страница приезжает с сервера
   // сама, а APK ставится руками. Старая оболочка про motion.start не знает и
   // отвечает отказом. Молчать на это нельзя: получится ровно то, что увидел
   // владелец, — «движения нет вообще» и ни одной зацепки почему. Поэтому на
   // отказ переходим на путь браузера. В WebView он, скорее всего, тоже
   // промолчит, но тогда это уже не наша догадка, а известное свойство
   // оболочки, и чинится оно установкой свежего APK.
   void nativeCall('motion.start').catch(() => {if (alive) back = browser();});
   stop = () => {off(); back(); void nativeCall('motion.stop').catch(() => {});};
  } else {
   stop = browser();
  }

  // Ушёл с экрана — датчик больше не нужен. Иначе он читается в фоне и ест
  // батарею у человека, который приложение даже не смотрит.
  const hidden = () => {
   if (document.visibilityState === 'visible') {if (hasNativeClient()) void nativeCall('motion.start').catch(() => {});}
   else if (hasNativeClient()) void nativeCall('motion.stop').catch(() => {});
  };
  document.addEventListener('visibilitychange', hidden);

  return () => {
   alive = false;
   if (frame) cancelAnimationFrame(frame);
   document.removeEventListener('visibilitychange', hidden);
   stop();
   node.style.removeProperty('--tx');
   node.style.removeProperty('--ty');
  };
 }, [target, enabled]);
}
