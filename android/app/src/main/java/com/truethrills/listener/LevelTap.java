package com.truethrills.listener;

import androidx.media3.exoplayer.audio.TeeAudioProcessor;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Снимает звук прямо с того потока, который сейчас играет: ExoPlayer отдаёт
 * сюда уже декодированный PCM через TeeAudioProcessor. Это наш собственный
 * конвейер воспроизведения, поэтому никаких разрешений не нужно — в отличие от
 * android.media.audiofx.Visualizer, который читает общий вывод и требует
 * RECORD_AUDIO у каждого слушателя.
 *
 * Отдаём 32 полосы спектра для кругового индикатора. Алгоритм здесь повторяет
 * lib/spectrum.ts один в один — константы, окно Ханна, границы полос и шкала
 * громкости. Если считать по-разному, круг в приложении и в браузере двигался
 * бы по-разному на одном и том же звуке.
 *
 * Сервис воспроизведения и мост живут в одном процессе, так что буфер лежит в
 * статике: пишет аудиопоток, читает мост по запросу из WebView.
 */
@androidx.annotation.OptIn(markerClass = androidx.media3.common.util.UnstableApi.class)
final class LevelTap implements TeeAudioProcessor.AudioBufferSink {
    private static final int FFT_SIZE = 1024, BANDS = 32;
    private static final double MIN_DB = -75, MAX_DB = -15;

    private static final Object LOCK = new Object();
    /** Кольцо последних отсчётов: writer идёт по кругу, чтение берёт хвост. */
    private static final float[] RING = new float[FFT_SIZE];
    private static int writeAt;
    private static boolean filled;
    private static volatile int encoding = androidx.media3.common.C.ENCODING_INVALID;
    private static volatile int rate = 48000;
    private static volatile int channels = 2;

    static JSONObject snapshot() throws Exception {
        double[] re = new double[FFT_SIZE], im = new double[FFT_SIZE];
        boolean ready;
        synchronized (LOCK) {
            ready = filled;
            if (ready) {
                for (int i = 0; i < FFT_SIZE; i++) {
                    float sample = RING[(writeAt + i) % FFT_SIZE];
                    re[i] = sample * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (FFT_SIZE - 1)));
                }
            }
        }
        JSONArray bands = new JSONArray();
        if (!ready) {
            for (int b = 0; b < BANDS; b++) bands.put(0);
            return new JSONObject().put("bands", bands);
        }
        fft(re, im);
        int[] edges = bandEdges(rate);
        for (int b = 0; b < BANDS; b++) {
            double peak = 0;
            for (int k = edges[b]; k < edges[b + 1]; k++) {
                double mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]) / (FFT_SIZE / 2.0);
                if (mag > peak) peak = mag;
            }
            double db = 20 * Math.log10(peak + 1e-12);
            double value = Math.max(0, Math.min(1, (db - MIN_DB) / (MAX_DB - MIN_DB)));
            bands.put(Math.round(value * 1000) / 1000.0);
        }
        return new JSONObject().put("bands", bands);
    }

    static void silence() {
        synchronized (LOCK) {
            java.util.Arrays.fill(RING, 0f);
            writeAt = 0;
            filled = false;
        }
    }

    /** Преобразование Фурье, radix-2, на месте. */
    private static void fft(double[] re, double[] im) {
        int n = re.length;
        for (int i = 1, j = 0; i < n; i++) {
            int bit = n >> 1;
            for (; (j & bit) != 0; bit >>= 1) j ^= bit;
            j ^= bit;
            if (i < j) {
                double tr = re[i]; re[i] = re[j]; re[j] = tr;
                double ti = im[i]; im[i] = im[j]; im[j] = ti;
            }
        }
        for (int len = 2; len <= n; len <<= 1) {
            double angle = -2 * Math.PI / len, wr = Math.cos(angle), wi = Math.sin(angle);
            for (int i = 0; i < n; i += len) {
                double cr = 1, ci = 0;
                for (int k = 0; k < len / 2; k++) {
                    double ur = re[i + k], ui = im[i + k];
                    double vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
                    double vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
                    re[i + k] = ur + vr; im[i + k] = ui + vi;
                    re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
                    double nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
                }
            }
        }
    }

    /**
     * Границы полос в номерах корзин, логарифмически от 60 Гц до 16 кГц.
     * Каждой полосе достаётся хотя бы одна своя корзина: на низах шаг логарифма
     * мельче разрешения БПФ, и без этого первые полосы показывали бы одно и то
     * же число — в круге это читалось бы как слипшийся кусок.
     */
    private static int[] bandEdges(int sampleRate) {
        int top = FFT_SIZE / 2 - 1;
        int[] edges = new int[BANDS + 1];
        edges[0] = 1;
        for (int b = 1; b <= BANDS; b++) {
            double hz = 60 * Math.pow(16000.0 / 60.0, (double) b / BANDS);
            edges[b] = Math.min(top, Math.max(edges[b - 1] + 1, (int) Math.round(hz * FFT_SIZE / sampleRate)));
        }
        return edges;
    }

    @Override public void flush(int sampleRateHz, int channelCount, int pcmEncoding) {
        encoding = pcmEncoding;
        rate = sampleRateHz > 0 ? sampleRateHz : 48000;
        channels = channelCount > 0 ? channelCount : 2;
        silence();
    }

    @Override public void handleBuffer(ByteBuffer buffer) {
        int enc = encoding;
        // Обычно декодер отдаёт 16 бит; float появляется, если устройство
        // включило вывод с плавающей точкой. Остальное (passthrough, offload)
        // сюда вообще не доходит.
        boolean isFloat = enc == androidx.media3.common.C.ENCODING_PCM_FLOAT;
        if (!isFloat && enc != androidx.media3.common.C.ENCODING_PCM_16BIT) return;
        int width = isFloat ? 4 : 2, ch = channels;
        // duplicate(), чтобы не сдвинуть позицию у буфера, который пойдёт дальше
        // на воспроизведение; порядок байт после duplicate() сбрасывается.
        // Буфер приходит read-only, поэтому читаем только по абсолютным индексам.
        ByteBuffer view = buffer.duplicate().order(ByteOrder.LITTLE_ENDIAN);
        int base = view.position(), frames = view.remaining() / (width * ch);
        if (frames <= 0) return;
        synchronized (LOCK) {
            for (int f = 0; f < frames; f++) {
                // Каналы в кадре лежат подряд; спектру нужен один сигнал, поэтому
                // усредняем их в моно.
                double sum = 0;
                for (int c = 0; c < ch; c++) {
                    int at = base + (f * ch + c) * width;
                    sum += isFloat ? view.getFloat(at) : view.getShort(at) / 32768.0;
                }
                RING[writeAt] = (float) (sum / ch);
                writeAt = (writeAt + 1) % FFT_SIZE;
                if (writeAt == 0) filled = true;
            }
        }
    }
}
