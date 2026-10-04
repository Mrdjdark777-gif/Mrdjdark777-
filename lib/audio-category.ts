/**
 * Тип аудиоматериала — классификация содержания, а не формата файла.
 *
 * Значения внутренние и стабильные: их хранит база (posts.audio_category), их
 * присылает студия, их проверяет сервер. Подписи живут в словарях, а ключи
 * подписей — только здесь, чтобы карточка, карусель, постер и студия говорили
 * одним языком. Тип приходит из данных записи и никогда не угадывается по
 * названию, длительности или расширению файла.
 *
 * Старые записи типа не имеют. Им остаётся нейтральное «АУДИО», пока автор не
 * выберет тип в студии: присвоить всем «Аудиоисторию» молча нельзя.
 */
export const AUDIO_CATEGORIES = ['audio_story', 'podcast', 'music'] as const;
export type AudioCategory = typeof AUDIO_CATEGORIES[number];

/** Пустое, незнакомое или не строка — null. Проверяют и сервер, и студия. */
export function audioCategoryOf(value: unknown): AudioCategory | null {
  return typeof value === 'string' && (AUDIO_CATEGORIES as readonly string[]).includes(value) ? value as AudioCategory : null;
}

/** Подпись над названием — АУДИОИСТОРИЯ, ПОДКАСТ, МУЗЫКА или прежнее АУДИО. */
export function audioTagKey(category: unknown): string {
  const c = audioCategoryOf(category);
  return c ? 'audio.tag.' + c : 'post.podcast';
}

/** Подпись вида публикации для карточек любого раздела. */
export function kindTagKey(post: {kind: string; audioCategory?: string | null}): string {
  if (post.kind === 'video') return 'post.video';
  if (post.kind === 'story') return 'post.story';
  return audioTagKey(post.audioCategory);
}
