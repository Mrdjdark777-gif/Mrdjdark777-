import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';

/**
 * Уменьшенные обложки для плиток.
 *
 * Почему это понадобилось. /api/cover отдавал загруженный файл как есть, без
 * единого изменения. Обложки у владельца — 1080×1350, а плитка карусели на
 * телефоне шириной около 145 точек. Браузер всё равно обязан распаковать
 * картинку целиком: полтора миллиона точек на плитку, около шести мегабайт
 * распакованного вида. В карусели выпусков двенадцать, и лента выложена
 * трижды.
 *
 * Пока палец листает медленно, плитка открывается по одной и распаковка
 * успевает между кадрами. Брошенная лента открывает их пачкой — и телефон
 * встаёт. А когда памяти под распакованные картинки не хватает, WebView
 * выбрасывает их и при следующем проходе распаковывает заново. Это ровно то,
 * что владелец описал словами: «листнул быстро и заново — зависает», и ровно
 * поэтому ни одна правка в коде прокрутки ничего не меняла. Работа была не в
 * прокрутке.
 *
 * Уменьшенная до 480 точек обложка — это 0,29 миллиона точек вместо 1,46:
 * впятеро меньше работы на распаковку и впятеро меньше памяти.
 *
 * Уменьшенные лежат отдельно от хранилища объектов. В хранилище живут
 * оригиналы, их считает резервная копия и по нему же ходит уборка сирот:
 * производные файлы там выглядели бы потерянными и попадали бы в архив
 * впустую. Этот каталог можно стереть в любой момент — он соберётся заново.
 */
const DIR = normalize(/*turbopackIgnore: true*/ process.env.THUMB_DIR ?? 'data/thumbs');

/**
 * Разрешённые ширины — список, а не любое число из адреса.
 *
 * Иначе любой желающий закажет тысячу разных ширин и заставит сервер тысячу
 * раз пересжать картинку, а каталог раздуется до диска. Список закрывает это
 * начисто: чужой ширины просто не существует.
 */
export const WIDTHS = [160, 320, 480, 640, 960] as const;
export type Width = (typeof WIDTHS)[number];

/** Ширина из адреса: либо одна из разрешённых, либо никакой. */
export function askedWidth(raw: string | null): Width | 0 {
  const n = Number(raw);
  return (WIDTHS as readonly number[]).includes(n) ? (n as Width) : 0;
}

function fileFor(key: string, width: number) {
  // Имя — от ключа загрузки, а не от номера выпуска: ключ у каждой загрузки
  // свой, и заменённая обложка не может подхватить уменьшенную от прежней.
  return join(DIR, createHash('sha256').update(key).digest('hex') + '-' + width + '.webp');
}

/**
 * Тело ответа ровно по длине картинки.
 *
 * Buffer в Node для небольших данных выдаётся куском заранее выделенного пула,
 * и `.buffer` у него шире самих данных — у стобайтовой картинки это восемь
 * килобайт. Отдай такой буфер целиком, и к картинке приедет хвост чужой
 * памяти, а объявленная длина перестанет совпадать с телом.
 *
 * Резать нужно сам буфер, а не вид на него. У Uint8Array метод slice() копирует,
 * а у Buffer то же имя означает subarray — вид на ту же память. Я написал
 * bytes.slice().buffer и получил ровно ту беду, от которой защищался: восемь
 * килобайт пула вместо ста байт картинки. Нашла это проверка ниже, не я.
 */
export function bodyOf(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** Метка ответа: меняется вместе с ключом загрузки и шириной, и только. */
export function thumbTag(key: string, width: number) {
  return '"' + createHash('sha256').update(key + ':' + width).digest('hex').slice(0, 32) + '"';
}

/**
 * Уменьшенная обложка. Готовой нет — делается один раз и остаётся на диске.
 *
 * `source` вызывается только когда делать действительно надо: на готовой
 * уменьшенной оригинал не читается вовсе.
 *
 * Любая неудача — это `null`, а не ошибка. Маршрут тогда отдаёт оригинал, как
 * отдавал всегда. Картинка на экране важнее её веса: sharp приезжает
 * необязательной зависимостью next, и на машине, где он не собрался, экран
 * обязан остаться целым.
 */
const pending = new Map<string, Promise<Uint8Array | null>>();

export function thumbnail(key: string, width: Width | 0, source: () => Promise<Uint8Array>): Promise<Uint8Array | null> {
  if (!width) return Promise.resolve(null);
  const cacheKey = fileFor(key, width);
  const running = pending.get(cacheKey);
  if (running) return running;
  const job = createThumbnail(key, width, source).finally(() => pending.delete(cacheKey));
  pending.set(cacheKey, job);
  return job;
}

async function createThumbnail(
  key: string,
  width: Width | 0,
  source: () => Promise<Uint8Array>,
): Promise<Uint8Array | null> {
  if (!width) return null;
  const file = fileFor(key, width);
  try {
    return await readFile(file);
  } catch {
    /* готовой нет — делаем ниже */
  }
  // Тип описан здесь, а не взят у самого sharp: пакет необязательный, и его
  // объявления могут не приехать вовсе — тогда сборка встанет на пустом месте.
  // Нам нужны ровно четыре вызова, и они записаны.
  type Chain = {
    rotate(): Chain;
    resize(o: { width: number; withoutEnlargement: boolean }): Chain;
    webp(o: { quality: number }): Chain;
    toBuffer(): Promise<Uint8Array>;
  };
  let sharp: (input: Uint8Array, options?: { failOn?: string }) => Chain;
  try {
    sharp = (await import('sharp')).default as unknown as typeof sharp;
  } catch {
    return null;
  }
  let temp: string | undefined;
  try {
    const small = await sharp(await source(), { failOn: 'none' })
      // Поворот по метке камеры: без него снятая боком обложка ложится боком.
      .rotate()
      // Увеличивать нечего: картинка меньше запрошенной ширины остаётся собой.
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    await mkdir(DIR, { recursive: true });
    // Через временное имя: оборванная запись не должна оставить обрезанный
    // файл, который потом раздавался бы как готовый.
    temp = file + '.' + randomUUID() + '.tmp';
    await writeFile(temp, small);
    await rename(temp, file);
    return small;
  } catch {
    return null;
  } finally {
    if (temp) await rm(temp, { force: true }).catch(() => {});
  }
}
