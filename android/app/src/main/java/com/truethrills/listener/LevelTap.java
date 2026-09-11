package com.truethrills.listener;

import androidx.media3.exoplayer.audio.TeeAudioProcessor;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import org.json.JSONObject;

/**
 * Снимает громкость прямо с того потока, который сейчас играет: ExoPlayer
 * отдаёт сюда уже декодированный PCM через TeeAudioProcessor. Это наш
 * собственный конвейер воспроизведения, поэтому никаких разрешений не нужно —
 * в отличие от android.media.audiofx.Visualizer, который читает общий вывод
 * и требует RECORD_AUDIO у каждого слушателя.
 *
 * Отдаём одно число — среднеквадратичную громкость с прошлого запроса. Сама
 * волна собирается на стороне WebView из истории таких замеров, поэтому в
 * приложении и в браузере она выглядит и движется одинаково.
 *
 * Сервис воспроизведения и мост живут в одном процессе, так что счётчики
 * лежат в статике: пишет аудиопоток, читает мост по запросу из WebView.
 */
@androidx.annotation.OptIn(markerClass = androidx.media3.common.util.UnstableApi.class)
final class LevelTap implements TeeAudioProcessor.AudioBufferSink {
    private static final Object LOCK = new Object();
    private static double squares;
    private static long counted;
    private static volatile int encoding = androidx.media3.common.C.ENCODING_INVALID;

    /** Громкость с прошлого запроса; счётчики при этом обнуляются. */
    static JSONObject snapshot() throws Exception {
        double level;
        synchronized (LOCK) {
            level = counted > 0 ? Math.sqrt(squares / counted) : 0;
            squares = 0;
            counted = 0;
        }
        return new JSONObject().put("level", Math.round(level * 1000) / 1000.0);
    }

    static void silence() {
        synchronized (LOCK) { squares = 0; counted = 0; }
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
        double sum = 0;
        for (int i = 0; i < samples; i++) {
            int at = base + i * width;
            double v = isFloat ? view.getFloat(at) : view.getShort(at) / 32768.0;
            sum += v * v;
        }
        synchronized (LOCK) {
            // Если WebView долго не спрашивает (эфир свёрнут), копить незачем:
            // старый звук всё равно не покажут, а окно замера должно оставаться
            // коротким. Секунды с запасом хватает на любой интервал опроса.
            if (counted > 96000) { squares = 0; counted = 0; }
            squares += sum;
            counted += samples;
        }
    }
}
