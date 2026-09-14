/**
 * Что показывает главный экран крупным планом.
 *
 * Порядок из ТЗ «Кино»: идущий эфир → продолжить прослушивание → новый
 * непрослушанный выпуск → самый свежий опубликованный материал → пустое
 * состояние. Решение вынесено сюда чистой функцией, потому что это правило,
 * а не разметка: его видно целиком, и оно проверяется без браузера
 * (tests/home-scene.mjs).
 */
export type ScenePost = {
  id: string;
  kind: string;
  title: string;
  description: string;
  duration: number;
  published: number;
  createdAt: number;
  coverKey: string | null;
  coverUrl: string | null;
};
export type SceneLive = {id: string; title: string; cover: boolean};
export type SceneProgress = {id: string; position: number; duration: number};
export type Scene =
  | {kind: 'live'; live: SceneLive}
  | {kind: 'resume'; post: ScenePost; position: number; duration: number}
  | {kind: 'fresh'; post: ScenePost}
  | {kind: 'latest'; post: ScenePost}
  | {kind: 'empty'};

/**
 * @param hidden публикации, которые слушатель убрал с главной; они пропускаются
 *   на шагах «продолжить» и «новый», но самый свежий материал показывается всё
 *   равно — иначе главная осталась бы пустой при непустом канале.
 */
export function homeScene(input: {
  posts: ScenePost[];
  live: SceneLive | null;
  progress: SceneProgress[];
  seen: string[];
  hidden: string[];
}): Scene {
  if (input.live) return {kind: 'live', live: input.live};
  const published = input.posts.filter(p => p.published === 1);
  if (!published.length) return {kind: 'empty'};
  const byDate = [...published].sort((a, b) => b.createdAt - a.createdAt);

  // Прогресс уже отсортирован по времени последнего прослушивания, поэтому
  // берём первую запись, которую ещё можно продолжить.
  for (const mark of input.progress) {
    if (mark.position <= 0) continue;
    if (input.hidden.includes(mark.id)) continue;
    const post = published.find(p => p.id === mark.id && p.kind === 'podcast');
    // Дослушанный до конца выпуск продолжать нечего.
    if (post && (!mark.duration || mark.position < mark.duration - 2)) {
      return {kind: 'resume', post, position: mark.position, duration: mark.duration || post.duration};
    }
  }
  const fresh = byDate.find(p => !input.seen.includes(p.id) && !input.hidden.includes(p.id));
  if (fresh) return {kind: 'fresh', post: fresh};
  return {kind: 'latest', post: byDate[0]};
}
