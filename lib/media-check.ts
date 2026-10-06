import { execFile } from 'node:child_process';

/**
 * Что пришло под видом звука или картинки — на самом деле звук или картинка.
 *
 * Сервер сверял тип из заголовка, размер и права автора, но не содержимое:
 * двенадцать байт «NOT AN AUDIO» с audio/wav сохранялись как выпуск (аудит
 * 6 октября, п. 7). Студия проверяет файл раньше, но прямой запрос это
 * обходил, а битый файл потом ломал плеер и обработку.
 *
 * 'skip' — проверить нечем (на машине нет ffprobe или sharp). На сервере
 * ffprobe ставит install-operations.sh, а sharp приезжает с next; без них
 * загрузка ведёт себя как раньше, а не отказывает во всём подряд.
 */
export type Verdict = 'ok' | 'bad' | 'skip';

/** В файле есть звуковая дорожка. Смотрится только заголовок, не весь файл. */
export function probeAudio(file: string): Promise<Verdict> {
  return new Promise((resolve) => {
    execFile('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', file],
      { timeout: 20000, maxBuffer: 1 << 20 },
      (err, stdout) => {
        if (err && (err as NodeJS.ErrnoException).code === 'ENOENT') return resolve('skip');
        if (err) return resolve('bad');
        resolve(String(stdout).split(/\s+/).includes('audio') ? 'ok' : 'bad');
      });
  });
}

/** Не больше 80 мегапикселей: обложке столько не нужно, а распаковка такой
 *  картинки при уменьшении заняла бы сотни мегабайт памяти. */
export const MAX_IMAGE_PIXELS = 80_000_000;
const IMAGE_FORMATS = ['jpeg', 'png', 'webp', 'gif'];

/** Картинка одного из разрешённых форматов, с размерами и не гигантская. */
export async function probeImage(file: string): Promise<Verdict> {
  // Тип описан здесь, а не взят у sharp: пакет необязательный (как в lib/thumbs.ts).
  type Meta = { format?: string; width?: number; height?: number };
  let sharp: (input: string) => { metadata(): Promise<Meta> };
  try {
    sharp = (await import('sharp')).default as unknown as typeof sharp;
  } catch {
    return 'skip';
  }
  try {
    const m = await sharp(file).metadata();
    if (!m.format || !IMAGE_FORMATS.includes(m.format) || !m.width || !m.height) return 'bad';
    return m.width * m.height <= MAX_IMAGE_PIXELS ? 'ok' : 'bad';
  } catch {
    return 'bad';
  }
}
