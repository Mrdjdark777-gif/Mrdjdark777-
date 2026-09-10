package com.truethrills.listener;

import androidx.media3.exoplayer.audio.TeeAudioProcessor;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Снимает уровень звука прямо с того потока, который сейчас играет: ExoPlayer
 * отдаёт сюда уже декодированный PCM через TeeAudioProcessor. Это наш
 * собственный конвейер воспроизведения, поэтому никаких разрешений не нужно —
 * в отличие от android.media.audiofx.Visualizer, который читает общий вывод
 * и требует RECORD_AUDIO у каждого слушателя.
 *
 * Сервис воспроизведения и мост живут в одном процессе, так что значения
 * лежат в статике: писатель — аудиопоток, читатель — мост по запросу из
 * WebView.
 */
@androidx.annotation.OptIn(markerClass = androidx.media3.common.util.UnstableApi.class)
final class LevelTap implements TeeAudioProcessor.AudioBufferSink {
    static final int BARS = 28;
    private static final float[] LEVELS = new float[BARS];
    private static volatile int encoding = androidx.media3.common.C.ENCODING_INVALID;

    static JSONObject snapshot() throws Exception {
        JSONArray out = new JSONArray();
        synchronized (LEVELS) {
            for (int i = 0; i < BARS; i++) out.put(Math.round(LEVELS[i] * 1000) / 1000f);
        }
        return new JSONObject().put("levels", out);
    }

    static void silence() {
        synchronized (LEVELS) { java.util.Arrays.fill(LEVELS, 0f); }
    }

    @Override public void flush(int sampleRateHz, int channelCount, int pcmEncoding) {
        encoding = pcmEncoding;
        silence();
    }

    @Override public void handleBuffer(ByteBuffer buffer) {
        int enc = encoding;
        // Обычно декодер отдаёт 16 бит; float появляется, если устройство
        // включило вывод с плавающей точкой. Остальное (passthrough, offload)
        // сюда вообще не доходит.
        boolean isFloat = enc == androidx.media3.common.C.ENCODING_PCM_FLOAT;
        if (!isFloat && enc != androidx.media3.common.C.ENCODING_PCM_16BIT) return;
        int width = isFloat ? 4 : 2;
        // duplicate(), чтобы не сдвинуть позицию у буфера, который пойдёт дальше
        // на воспроизведение; порядок байт после duplicate() сбрасывается.
        // Буфер приходит read-only, поэтому читаем только по абсолютным индексам.
        ByteBuffer view = buffer.duplicate().order(ByteOrder.LITTLE_ENDIAN);
        int base = view.position(), samples = view.remaining() / width;
        if (samples <= 0) return;
        int per = Math.max(1, samples / BARS);
        synchronized (LEVELS) {
            for (int i = 0; i < BARS; i++) {
                int start = i * per, end = Math.min(samples, start + per);
                float peak = 0f;
                for (int j = start; j < end; j++) {
                    int at = base + j * width;
                    float v = isFloat ? Math.abs(view.getFloat(at)) : Math.abs(view.getShort(at) / 32768f);
                    if (v > peak) peak = v;
                }
                // Мгновенный подъём и мягкий спад: полоска успевает отработать
                // удар, но не дёргается на каждом буфере.
                LEVELS[i] = peak > LEVELS[i] ? peak : LEVELS[i] * 0.76f + peak * 0.24f;
            }
        }
    }
}
