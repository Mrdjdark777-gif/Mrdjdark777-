import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { posts } from '@/db/schema';
import { bucket, failure, owner, requireOwner, result, setting, userId } from '@/lib/server';
const MAX = 12 * 1024 * 1024;
export async function POST(req: Request) {
  try {
    await requireOwner(req);
    const mime = (req.headers.get('content-type') ?? '').split(';')[0];
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mime)) throw new Error('#err.coverType');
    const size = Number(req.headers.get('x-upload-size') ?? req.headers.get('content-length'));
    if (!Number.isSafeInteger(size) || size <= 0 || size > MAX) throw new Error('#err.coverSize');
    if (!req.body) throw new Error('#err.coverEmpty');
    const key = 'cover/' + crypto.randomUUID();
    const stored = await bucket().put(key, req.body, { httpMetadata: { contentType: mime }, customMetadata: { owner: userId(req)! } });
    if (stored.size !== size) { await bucket().delete(key); throw new Error('#err.uploadMismatch'); }
    return result({ key });
  } catch (e) { return failure(e); }
}
// id=channel обслуживает общий фон для эфира (настраивается в Settings), иначе — обложку конкретного поста.
export async function GET(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get('id') ?? '';
    let key: string | null, isPublic: boolean;
    if (id === 'channel') { key = (await setting('channelArt')) || null; isPublic = true; }
    else {
      const p = await getDb().select().from(posts).where(eq(posts.id, id)).get();
      key = p?.coverKey ?? null; isPublic = !!p?.published;
      if (!isPublic && !(await owner(req))) return new Response('#err.notFound', { status: 404 });
    }
    if (!key) return new Response('#err.notFound', { status: 404 });
    const obj = await bucket().get(key);
    if (!obj) return new Response('#err.notFound', { status: 404 });
    const h = new Headers({ 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
    obj.writeHttpMetadata(h); h.set('ETag', obj.httpEtag); h.set('Content-Length', String(obj.size));
    return new Response(obj.body, { headers: h });
  } catch (e) { return failure(e); }
}
