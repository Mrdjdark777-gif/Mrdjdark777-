/**
 * Одна модель состояния — три представления плеера с листа: фотоплеер S02,
 * типографический S04 и запись эфира S06. Выбор делает не слушатель и не
 * автор: он выводится из самой публикации, поэтому правило живёт отдельной
 * чистой функцией и покрыто тестом, а не разбросано по разметке.
 *
 * archive → S06 (у записи эфира свой круглый прогресс),
 * есть обложка → S02, иначе → S04.
 */
export type Presentation='photo'|'type'|'archive';

/** Запись эфира публикуется под ключом audio/live-…; это существующая связь, не слово в названии. */
export function isLiveArchive(audioKey?:string|null):boolean{
 return !!audioKey&&audioKey.startsWith('audio/live-');
}

export function presentation(episode:{archived?:boolean;cover?:string|null}):Presentation{
 if(episode.archived)return 'archive';
 return episode.cover?'photo':'type';
}
