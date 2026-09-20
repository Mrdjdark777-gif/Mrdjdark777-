/**
 * Смахивание мини-плеера в сторону.
 *
 * Жест начинается только когда палец ушёл по горизонтали заметно дальше, чем
 * по вертикали: иначе обычная прокрутка страницы пальцем поперёк плеера
 * утаскивала бы его за собой. Закрытие — после четверти ширины экрана, но не
 * меньше 70 пикселей: на узком телефоне четверть слишком мала, на планшете
 * фиксированные 70 слишком много.
 */
export const SWIPE_START = 12;

export function swipeAxis(dx: number, dy: number): 'horizontal' | 'vertical' | 'none' {
  if (Math.abs(dx) < SWIPE_START && Math.abs(dy) < SWIPE_START) return 'none';
  return Math.abs(dx) > Math.abs(dy) * 1.4 ? 'horizontal' : 'vertical';
}

export function swipeCloses(dx: number, width: number): boolean {
  return Math.abs(dx) >= Math.max(70, width * 0.25);
}

/** Прозрачность падает вместе со сдвигом, но не до нуля — панель видно до конца. */
export function swipeFade(dx: number, width: number): number {
  const limit = Math.max(70, width * 0.25);
  return Math.max(0.35, 1 - Math.abs(dx) / (limit * 1.6));
}
