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
