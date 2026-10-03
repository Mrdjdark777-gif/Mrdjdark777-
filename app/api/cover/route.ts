import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { broadcasts, posts } from '@/db/schema';
import { bucket, failure, owner, requireOwner, result, setting, userId } from '@/lib/server';
import { askedWidth, bodyOf, thumbnail, thumbTag } from '@/lib/thumbs';
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
    const stored = await bucket().put(key, req.body, { httpMetadata: { contentType: mime }, customMetadata: { owner: userId(req)! }, maxBytes: MAX });
    if (stored.size !== size) { await bucket().delete(key); throw new Error('#err.uploadMismatch'); }
    return result({ key });
  } catch (e) { return failure(e); }
}
// id=channel обслуживает общий фон для эфира (настраивается в Settings), id=hero — постер главной, иначе — обложку конкретного поста.
export async function GET(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get('id') ?? '';
    let key: string | null, isPublic: boolean;
    if (id === 'channel') { key = (await setting('channelArt')) || null; isPublic = true; }
    // Картинка круга покоя: её видит любой, кто открыл экран эфира без эфира.
    else if (id === 'calm') { key = (await setting('calmArt')) || null; isPublic = true; }
    // Постер главной: его видит каждый, кто открыл приложение.
    else if (id === 'hero') { key = (await setting('heroArt')) || null; isPublic = true; }
    // Картинка для уведомления о воспроизведении (шторка, экран блокировки).
    // Правило владельца: загрузил «Фон уведомлений» — он стоит у всего, что
    // играет; не загрузил — обложка того, что играет. Решает сервер, а не
    // приложение: так одинаково и в браузере, и в уже установленном APK, и
    // замена картинки в студии не требует ничего пересобирать.
    else if (id.startsWith('notify:')) {
      const target = id.slice(7);
      key = (await setting('channelArt')) || null; isPublic = true;
      if (!key && target.startsWith('live:')) {
        key = (await getDb().select().from(broadcasts).where(eq(broadcasts.id, target.slice(5))).get())?.coverKey ?? null;
      } else if (!key) {
        const p = await getDb().select().from(posts).where(eq(posts.id, target)).get();
        key = p?.coverKey ?? null; isPublic = !!p?.published;
        if (!isPublic && !(await owner(req))) return new Response('#err.notFound', { status: 404 });
      }
      // Ни картинки, ни обложки — знак канала, как было: пустая карточка в
      // шторке выглядит поломкой.
      if (!key) return new Response(null, { status: 302, headers: { Location: '/brand/logo.png?v=0.4.1', 'Cache-Control': 'no-store' } });
    }
    // Обложка конкретного эфира: сам эфир публичный, значит и она тоже.
    else if (id.startsWith('live:')) {
      const b = await getDb().select().from(broadcasts).where(eq(broadcasts.id, id.slice(5))).get();
      // Своей обложки у эфира может не быть. Тогда отдаём оформление канала,
      // а не 404: на экране блокировки телефона пустая карточка выглядит
      // поломкой. Раньше клиент ради этого всегда просил channel art, и
      // собственная обложка эфира не показывалась никогда.
      key = b?.coverKey ?? ((await setting('channelArt')) || null); isPublic = true;
    }
    else {
      const p = await getDb().select().from(posts).where(eq(posts.id, id)).get();
      key = p?.coverKey ?? null; isPublic = !!p?.published;
      if (!isPublic && !(await owner(req))) return new Response('#err.notFound', { status: 404 });
    }
    if (!key) return new Response('#err.notFound', { status: 404 });
    // Плитке не нужна обложка в полный размер.
    //
    // Браузер распаковывает картинку целиком, какой бы маленькой её ни
    // показывали: 1080×1350 — это полтора миллиона точек и около шести
    // мегабайт распакованного вида на каждую плитку. Брошенная лента открывает
    // их пачкой, и телефон встаёт. Поэтому плитки просят ширину, а здесь она
    // отдаётся — один раз уменьшается и дальше берётся с диска.
    //
    // Готовая уменьшенная отдаётся не читая оригинал: иначе смысл теряется.
    const width = askedWidth(new URL(req.url).searchParams.get('w'));
    // Обложки выпусков неизменны: у каждой загрузки свой ключ, их можно
    // держать в кэше сутки. Оформление канала и картинка круга покоя живут
    // под одним адресом и меняются — закэшированное на сутки изображение
    // возвращалось даже после замены, пока кэш не истечёт.
    const single = id === 'channel' || id === 'calm' || id === 'hero' || id.startsWith('notify:');
    // Черновик виден только автору, и его обложка не должна оседать в общих
    // кэшах: прежний `public, max-age=86400` разрешал прокси или CDN отдать
    // её кому угодно, кто спросит тот же адрес. Ответ приватный — значит и
    // политика кэша приватная.
    // Постер главной открывается при каждом запуске приложения, и качать его
    // заново каждый раз незачем. Адрес из приложения несёт версию — ключ
    // загрузки. Совпала с нынешней — этот ответ не изменится никогда, его можно
    // держать сколько угодно; заменили постер — у нового другая версия и
    // другой адрес. Без версии или со старой — как прежде, без кэша.
    const pinnedVersion = id === 'hero' && new URL(req.url).searchParams.get('v') === key.replace(/^cover\//, '');
    const cache = pinnedVersion ? 'public, max-age=31536000, immutable' : single ? 'no-store' : isPublic ? 'public, max-age=86400' : 'private, no-store';
    const h = new Headers({ 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' });
    if (!isPublic) h.set('Vary', 'Cookie');

    if (width) {
      const small = await thumbnail(key, width, async () => {
        const full = await bucket().get(key);
        if (!full) throw new Error('#err.notFound');
        return new Uint8Array(await new Response(full.body).arrayBuffer());
      });
      if (small) {
        h.set('Content-Type', 'image/webp');
        h.set('ETag', thumbTag(key, width));
        h.set('Content-Length', String(small.byteLength));
        return new Response(bodyOf(small), { headers: h });
      }
      // Уменьшить не вышло — отдаём оригинал, как отдавали всегда. Пустая
      // плитка хуже тяжёлой.
    }

    const obj = await bucket().get(key);
    if (!obj) return new Response('#err.notFound', { status: 404 });
    obj.writeHttpMetadata(h); h.set('ETag', obj.httpEtag); h.set('Content-Length', String(obj.size));
    return new Response(obj.body, { headers: h });
  } catch (e) { return failure(e); }
}
