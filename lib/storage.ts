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

type Meta = { contentType: string; customMetadata: Record<string, string>; size: number; etag: string };

function dataPath(key: string) {
  const target = normalize(join(ROOT, key));
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
  writeHttpMetadata(headers: Headers): void;
};

class LocalBucket {
  async put(
    key: string,
    body: ReadableStream<Uint8Array>,
    opts: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> } = {},
  ) {
    const path = dataPath(key);
    await mkdir(dirname(path), { recursive: true });
    const node = Readable.fromWeb(body as NodeWebReadableStream<Uint8Array>);
    let size = 0;
    node.on('data', (chunk: Buffer) => {
      size += chunk.length;
    });
    const { createWriteStream } = await import('node:fs');
    await new Promise<void>((resolvePromise, reject) => {
      const out = createWriteStream(path);
      node.pipe(out);
      out.on('finish', resolvePromise);
      out.on('error', reject);
      node.on('error', reject);
    });
    const meta: Meta = {
      contentType: opts.httpMetadata?.contentType ?? 'application/octet-stream',
      customMetadata: opts.customMetadata ?? {},
      size,
      etag: crypto.randomUUID(),
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
    let offset = 0;
    let length = meta.size;
    const rangeHeader = opts.range?.get('range');
    const match = rangeHeader?.match(/^bytes=(\d+)-(\d*)$/);
    let isRange = false;
    if (match) {
      offset = Number(match[1]);
      length = (match[2] ? Number(match[2]) : meta.size - 1) - offset + 1;
      isRange = true;
    }
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
