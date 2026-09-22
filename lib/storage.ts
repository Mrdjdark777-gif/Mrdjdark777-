import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, relative } from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';

/**
 * Local filesystem object store with the R2 subset the API routes use
 * (put/get with byte ranges/head/delete). Replaces Cloudflare R2 so the app
 * runs as a plain Node process on a self-hosted VPS.
 */

const ROOT = normalize(process.env.STORAGE_DIR ?? './data/storage');

/**
 * `sha256` — контрольная сумма содержимого, посчитанная на лету при записи.
 * Без неё проверка бэкапа могла сверить только размер, а повреждённый файл
 * того же размера проходил молча. Она же служит ETag: прежний случайный UUID
 * менялся при каждой перезаписи и ничего не говорил о содержимом.
 */
type Meta = { contentType: string; customMetadata: Record<string, string>; size: number; etag: string; sha256: string };

function dataPath(key: string) {
  const target = normalize(join(/*turbopackIgnore: true*/ ROOT, key));
  if (target !== ROOT && !target.startsWith(ROOT + '/')) throw new Error('#err.badStorageKey');
  if (relative(ROOT, target).startsWith('..')) throw new Error('#err.badStorageKey');
  return target;
}
function metaPath(key: string) {
  return dataPath(key) + '.meta.json';
}

async function readMeta(key: string): Promise<Meta | null> {
  try {
    return JSON.parse(await readFile(metaPath(key), 'utf8')) as Meta;
  } catch {
    return null;
  }
}

export type StoredObject = {
  size: number;
  httpEtag: string;
  body: ReadableStream<Uint8Array>;
  range?: { offset: number; length: number };
  /** Запрошенный диапазон не пересекается с файлом — маршрут обязан ответить 416. */
  unsatisfiable?: boolean;
  writeHttpMetadata(headers: Headers): void;
};

/**
 * Разбор заголовка Range по RFC 9110 в том объёме, в каком его присылают
 * плееры: `bytes=NNN-MMM`, `bytes=NNN-` (до конца) и `bytes=-NNN` (последние
 * NNN байт — так перематывает Safari, и так плееры читают хвост файла, где у
 * M4A лежит индекс).
 *
 * Конец диапазона обязательно прижимается к размеру файла: плеер, попросивший
 * больше, чем есть, раньше получал Content-Length с недостижимым числом и ждал
 * байтов, которых нет, — перемотка «зависала» на последних секундах.
 * Начало за пределами файла — не ошибка клиента и не повод отдать всё целиком:
 * это 416, и ответ должен назвать настоящий размер.
 */
export function parseRange(header: string | null | undefined, size: number): {offset: number; length: number} | 'unsatisfiable' | null {
  const raw = String(header ?? '').trim();
  if (!raw) return null;
  const match = raw.match(/^bytes=(\d*)-(\d*)$/i);
  if (!match) return null;
  const [, from, to] = match;
  if (!from && !to) return null;
  if (!from) {
    // Суффикс: последние N байт. Ноль байтов запросить нельзя.
    const wanted = Number(to);
    if (!Number.isFinite(wanted) || wanted <= 0) return 'unsatisfiable';
    if (size === 0) return 'unsatisfiable';
    const offset = Math.max(0, size - wanted);
    return {offset, length: size - offset};
  }
  const offset = Number(from);
  if (!Number.isFinite(offset) || offset >= size) return 'unsatisfiable';
  const last = to ? Math.min(Number(to), size - 1) : size - 1;
  if (!Number.isFinite(last) || last < offset) return 'unsatisfiable';
  return {offset, length: last - offset + 1};
}

class LocalBucket {
  async put(
    key: string,
    body: ReadableStream<Uint8Array>,
    opts: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string>; maxBytes?: number } = {},
  ) {
    const path = dataPath(key);
    await mkdir(dirname(path), { recursive: true });
    const node = Readable.fromWeb(body as NodeWebReadableStream<Uint8Array>);
    let size = 0;
    const digest = createHash('sha256');
    const limit = opts.maxBytes ?? Infinity;
    const { createWriteStream } = await import('node:fs');
    try {
      await new Promise<void>((resolvePromise, reject) => {
        const out = createWriteStream(path);
        // Предел проверяется по ходу чтения, а не после. Раньше весь поток
        // сначала оседал на диск и только потом сверялся заявленный размер:
        // отправитель мог соврать в заголовке и занять место чем угодно.
        node.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > limit) {
            node.destroy(new Error('#err.uploadSize'));
            out.destroy();
            return;
          }
          digest.update(chunk);
        });
        node.pipe(out);
        out.on('finish', resolvePromise);
        out.on('error', reject);
        node.on('error', reject);
      });
    } catch (e) {
      // Оборванная или слишком большая загрузка не должна оставлять мусор.
      await rm(path, { force: true }).catch(() => {});
      await rm(metaPath(key), { force: true }).catch(() => {});
      throw e;
    }
    const sha256 = digest.digest('hex');
    const meta: Meta = {
      contentType: opts.httpMetadata?.contentType ?? 'application/octet-stream',
      customMetadata: opts.customMetadata ?? {},
      size,
      etag: sha256,
      sha256,
    };
    await writeFile(metaPath(key), JSON.stringify(meta));
    return { key, size };
  }

  async get(key: string, opts: { range?: Headers } = {}): Promise<StoredObject | null> {
    const meta = await readMeta(key);
    if (!meta) return null;
    const path = dataPath(key);
    try {
      await stat(path);
    } catch {
      return null;
    }
    const parsed = parseRange(opts.range?.get('range'), meta.size);
    if (parsed === 'unsatisfiable') {
      return {
        size: meta.size,
        httpEtag: meta.etag,
        body: new ReadableStream<Uint8Array>({ start(controller) { controller.close(); } }),
        unsatisfiable: true,
        writeHttpMetadata(headers: Headers) {
          headers.set('Content-Type', meta.contentType);
        },
      };
    }
    const offset = parsed ? parsed.offset : 0;
    const length = parsed ? parsed.length : meta.size;
    const isRange = !!parsed;
    const nodeStream = createReadStream(path, { start: offset, end: offset + length - 1 });
    const body = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
    return {
      size: meta.size,
      httpEtag: meta.etag,
      body,
      range: isRange ? { offset, length } : undefined,
      writeHttpMetadata(headers: Headers) {
        headers.set('Content-Type', meta.contentType);
      },
    };
  }

  async head(key: string): Promise<{ customMetadata: Record<string, string> } | null> {
    const meta = await readMeta(key);
    if (!meta) return null;
    return { customMetadata: meta.customMetadata };
  }

  async delete(key: string) {
    await rm(dataPath(key), { force: true });
    await rm(metaPath(key), { force: true });
  }
}

let instance: LocalBucket | undefined;
export function localBucket() {
  return (instance ??= new LocalBucket());
}
