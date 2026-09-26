/**
 * Что показывает главный экран S01 «Погружение».
 *
 * На листе это два независимых места, и ТЗ отдельно требует не смешивать их id:
 *
 *   • герой — одна публикация крупным планом с кнопкой «Слушать»;
 *   • строка «Продолжить · 12:48» — тот выпуск, на котором слушатель
 *     остановился, со своей позицией. Продолжать нечего — строки нет, и она
 *     не заполняется примером.
 *
 * Кадром распоряжается автор. Без закрепления в нём стоит самая свежая
 * публикация — но тогда видео, ради которого всё затевалось, вытесняется
 * парой историй, выложенных следом. Закреплённая публикация держится в кадре,
 * пока автор не сменит её сам; если её сняли с публикации или убрали с
 * главной, правило возвращается к обычному.
 *
 * Идущий эфир героя не подменяет: ТЗ рекомендует отдельную живую строку, чтобы
 * публикация в кадре не менялась под человеком неожиданно. Эфир возвращается
 * рядом, а экран решает сам, как его показать.
 *
 * Правило живёт здесь чистой функцией, потому что это правило, а не разметка:
 * его видно целиком и оно проверяется без браузера (tests/home-scene.mjs).
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
export type SceneProgress = {id: string; position: number; duration: number};
export type HomeScene = {
  /** Публикация в кадре: непрослушанная новинка, иначе самая свежая. */
  hero: ScenePost | null;
  /** Строка «Продолжить», если есть что продолжать. */
  resume: {post: ScenePost; position: number; duration: number} | null;
};

/** Дослушанным считаем выпуск, до конца которого осталось меньше двух секунд. */
const finished = (position: number, duration: number) => duration > 0 && position >= duration - 2;

export function homeScene(input: {
  posts: ScenePost[];
  progress: SceneProgress[];
  seen: string[];
  hidden: string[];
  /** Публикация, закреплённая автором в кадре. */
  pinned?: string | null;
  /**
   * Публикации, которым в кадре не место. Записи эфиров лежат в карусели
   * наравне с остальными выпусками — это настоящие выпуски, — но сами в кадр
   * не встают: кадром распоряжается автор, и случайная запись не должна
   * вытеснять оттуда то, ради чего снимали.
   */
  noHero?: string[];
}): HomeScene {
  const published = input.posts.filter(p => p.published === 1);
  const byDate = [...published].sort((a, b) => b.createdAt - a.createdAt);

  // Прогресс приходит отсортированным по времени последнего прослушивания,
  // поэтому берём первую запись, которую ещё можно продолжить.
  let resume: HomeScene['resume'] = null;
  for (const mark of input.progress) {
    if (mark.position <= 0 || input.hidden.includes(mark.id)) continue;
    const post = published.find(p => p.id === mark.id && p.kind === 'podcast');
    if (!post || finished(mark.position, mark.duration)) continue;
    resume = {post, position: mark.position, duration: mark.duration || post.duration};
    break;
  }

  // В кадре — самая свежая публикация, которую ещё не открывали; если открыты
  // все, просто самая свежая. Убранное с главной пропускается, но когда убрано
  // всё, кадр остаётся: пустая главная при непустом канале хуже.
  const pinned = input.pinned
    ? published.find(p => p.id === input.pinned && !input.hidden.includes(p.id)) ?? null
    : null;
  // Закрепление автора сильнее запрета: закрепил запись эфира сам — значит так
  // и задумано. Запрет действует только когда кадр выбирается сам.
  const noHero = input.noHero ?? [];
  const free = byDate.filter(p => !noHero.includes(p.id));
  const hero = pinned
    ?? free.find(p => !input.seen.includes(p.id) && !input.hidden.includes(p.id))
    ?? free.find(p => !input.hidden.includes(p.id))
    ?? free[0]
    ?? null;
  return {hero, resume};
}

/**
 * В каких разделах есть свежее, ещё не открытое. Кадр показывает одну
 * публикацию, и без этих меток человек не узнаёт, что вышло что-то ещё.
 * Публикация, стоящая в кадре, меткой не считается — она и так видна.
 */
export function freshSections(input: {
  posts: ScenePost[];
  seen: string[];
  hidden: string[];
  heroId?: string | null;
}): Set<string> {
  const fresh = new Set<string>();
  for (const post of input.posts) {
    if (post.published !== 1) continue;
    if (post.id === input.heroId) continue;
    if (input.seen.includes(post.id) || input.hidden.includes(post.id)) continue;
    fresh.add(post.kind);
  }
  return fresh;
}
