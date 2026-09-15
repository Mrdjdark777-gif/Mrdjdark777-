import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { audioPeaks, posts } from '@/db/schema';
import { failure, owner, result } from '@/lib/server';

/**
 * Форма звука выпуска. Ничего не считает: только отдаёт то, что воркер уже
 * посчитал вне запроса. Пока пиков нет, честно отвечает pending — плеер
 * показывает спокойное состояние и работающую полосу, а не выдуманные палочки.
 */
export async function GET(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get('id') ?? '';
    const post = await getDb().select().from(posts).where(eq(posts.id, id)).get();
    if (!post?.audioKey) return new Response('#err.notFound', { status: 404 });
    if (!post.published && !(await owner(req))) return new Response('#err.notFound', { status: 404 });
    const row = await getDb().select().from(audioPeaks).where(eq(audioPeaks.audioKey, post.audioKey)).get();
    // Публикацию можно скрыть или удалить. Даже готовые пики не кэшируем:
    // иначе proxy/браузер продолжает отдавать их после отзыва доступа,
    // включая данные черновика, который ранее открыл владелец.
    const state = row?.state === 'ready' && row.peaks ? 'ready' : row?.state === 'error' ? 'error' : 'pending';
    return result({ state, peaks: state === 'ready' ? row!.peaks : '' });
  } catch (e) { return failure(e); }
}
