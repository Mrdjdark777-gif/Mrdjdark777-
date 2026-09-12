/**
 * Спектр для кругового индикатора. Один и тот же алгоритм живёт здесь и в
 * LevelTap.java: в приложении эфир играет нативно, и если считать полосы
 * разными способами, круг в приложении и в браузере двигался бы по-разному.
 *
 * Ставку на getByteFrequencyData делать нельзя ровно поэтому: у Web Audio своя
 * внутренняя нормировка, повторить её в Java точно не выйдет. Берём сырые
 * отсчёты и считаем сами.
 */
export const BANDS = 32;
export const FFT_SIZE = 1024;
/** Окно громкости. Ниже нижней границы — тишина, выше верхней — полная полоса. */
const MIN_DB = -75, MAX_DB = -15;

/** Преобразование Фурье, radix-2, на месте. */
function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = -2 * Math.PI / len, wr = Math.cos(angle), wi = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

/**
 * Границы полос в номерах корзин, логарифмически от 60 Гц до 16 кГц.
 * Каждой полосе достаётся хотя бы одна своя корзина: на низах шаг логарифма
 * мельче разрешения БПФ, и без этого первые пять полос показывали бы одно и
 * то же число — в круге это читалось бы как слипшийся кусок.
 */
export function bandEdges(sampleRate: number): number[] {
  const top = FFT_SIZE / 2 - 1, edges = [1];
  for (let b = 1; b <= BANDS; b++) {
    const hz = 60 * Math.pow(16000 / 60, b / BANDS);
    edges.push(Math.min(top, Math.max(edges[b - 1] + 1, Math.round(hz * FFT_SIZE / sampleRate))));
  }
  return edges;
}

/** Полосы 0..1 из окна отсчётов; длиной меньше FFT_SIZE дополняется нулями. */
export function spectrum(samples: Float32Array | number[], sampleRate: number): number[] {
  const re = new Float64Array(FFT_SIZE), im = new Float64Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++) {
    // Окно Ханна: без него у любого тона расползаются боковые лепестки и
    // соседние полосы поднимаются вместе с ним.
    re[i] = (samples[i] ?? 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (FFT_SIZE - 1)));
  }
  fft(re, im);
  const edges = bandEdges(sampleRate), out: number[] = [];
  for (let b = 0; b < BANDS; b++) {
    let peak = 0;
    for (let k = edges[b]; k < edges[b + 1]; k++) {
      const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]) / (FFT_SIZE / 2);
      if (mag > peak) peak = mag;
    }
    const db = 20 * Math.log10(peak + 1e-12);
    out.push(Math.max(0, Math.min(1, (db - MIN_DB) / (MAX_DB - MIN_DB))));
  }
  return out;
}
