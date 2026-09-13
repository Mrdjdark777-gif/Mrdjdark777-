'use client';
/**
 * Что слушатель уже открывал. Нужно, чтобы карточка «Последняя публикация» с
 * главного экрана исчезала после просмотра, а не висела там вечно.
 *
 * Хранится у слушателя, как и прогресс прослушивания: на сервере это заводить
 * незачем — у слушателей нет учётных записей, и знать, кто что открывал, нам
 * не нужно.
 */
const key = 'tt-seen-v1';
const LIMIT = 200;

export function readSeen(): string[] {
  try {
    const data = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(data) ? data.filter(id => typeof id === 'string').slice(0, LIMIT) : [];
  } catch { return []; }
}

export function markSeen(id: string) {
  if (!id) return;
  try {
    const seen = readSeen();
    if (seen[0] === id) return;
    localStorage.setItem(key, JSON.stringify([id, ...seen.filter(x => x !== id)].slice(0, LIMIT)));
    window.dispatchEvent(new Event('tt-seen'));
  } catch { /* приватный режим или запрет на хранилище — не повод ломать открытие */ }
}

/**
 * Карточки, которые слушатель сам убрал с главной долгим нажатием. Хранится
 * не просто id, а метка того состояния, которое он скрыл: для «продолжить
 * слушать» это место остановки в секундах, для «последней публикации» — время
 * выхода выпуска. Обе метки переживают перезапуск приложения (в отличие от
 * текущего времени), поэтому скрытая карточка остаётся скрытой, а вернётся
 * только когда состояние действительно изменится — например, слушатель
 * продвинулся дальше по выпуску.
 */
const hiddenKey = 'tt-hidden-v1';
export type Hidden = {id: string; at: number};

export function readHidden(): Hidden[] {
  try {
    const data = JSON.parse(localStorage.getItem(hiddenKey) || '[]');
    return Array.isArray(data) ? data.filter(h => typeof h?.id === 'string' && Number.isFinite(h.at)).slice(0, LIMIT) : [];
  } catch { return []; }
}

export function hideHighlight(id: string, at: number) {
  if (!id || !Number.isFinite(at)) return;
  try {
    localStorage.setItem(hiddenKey, JSON.stringify([{id, at}, ...readHidden().filter(h => h.id !== id)].slice(0, LIMIT)));
    window.dispatchEvent(new Event('tt-hidden'));
  } catch { /* приватный режим или запрет на хранилище — не повод ломать экран */ }
}
