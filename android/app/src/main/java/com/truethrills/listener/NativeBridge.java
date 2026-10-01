package com.truethrills.listener;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;
import android.webkit.WebView;
import androidx.webkit.*;
import androidx.webkit.JavaScriptReplyProxy;
import com.google.android.gms.tasks.Tasks;
import com.google.firebase.messaging.FirebaseMessaging;
import java.util.Collections;
import java.util.concurrent.*;
import java.util.function.Consumer;
import org.json.JSONObject;

/** The bridge exists only on the trusted origin; frames cannot invoke native capabilities. */
final class NativeBridge {
    private final MainActivity activity;
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private final PlayerBridge player;
    private boolean closed;
    private Runnable permissionAction;
    private Consumer<JSONObject> permissionReply;
    /** Последний канал к странице: по нему уходит поток датчика. */
    private JavaScriptReplyProxy channel;
    private SensorEventListener motion;
    NativeBridge(MainActivity activity, WebView view) {
        this.activity = activity; player = new PlayerBridge(activity);
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return;
        WebViewCompat.addWebMessageListener(view, "TrueThrillsNative", Collections.singleton("https://truethrills.com"), (webView, message, origin, mainFrame, proxy) -> {
            if (closed || !mainFrame || !"https".equals(origin.getScheme()) || !"truethrills.com".equals(origin.getHost()) || (origin.getPort() != -1 && origin.getPort() != 443)) return;
            String text = message.getData(); if (text == null || text.length() > 8192) return;
            try {
                channel = proxy;
                JSONObject request = new JSONObject(text); int id = request.getInt("id");
                Consumer<JSONObject> reply = data -> activity.runOnUiThread(() -> { if (!closed) try { proxy.postMessage(new JSONObject().put("id", id).put("data", data).toString()); } catch (Exception ignored) {} });
                String method = request.getString("method"); JSONObject args = request.optJSONObject("args");
                try { dispatch(method, args == null ? new JSONObject() : args, reply); } catch (Exception e) { reply.accept(error("#err.request")); }
            } catch (Exception ignored) {}
        });
    }
    /** Системный лист «Поделиться»: те же приложения, что и в любом другом месте телефона. */
    private void share(JSONObject args) {
        String url = args.optString("url"), title = args.optString("title");
        if (url.isEmpty()) return;
        android.net.Uri uri = android.net.Uri.parse(url);
        String scheme = uri.getScheme();
        if (!"https".equals(scheme) || !"truethrills.com".equals(uri.getHost())) return;
        Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain")
            .putExtra(Intent.EXTRA_TEXT, title.isEmpty() ? url : title + "\n" + url);
        if (!title.isEmpty()) send.putExtra(Intent.EXTRA_SUBJECT, title);
        activity.startActivity(Intent.createChooser(send, title.isEmpty() ? null : title));
    }
    private JSONObject error(String message) { try { return new JSONObject().put("error", message != null && message.startsWith("#err.") ? message : "#err.request"); } catch (Exception e) { return new JSONObject(); } }
    private JSONObject state() throws Exception {
        SharedPreferences p = PushClient.prefs(activity); boolean permitted = PushService.allowed(activity), subscribed = p.contains("id"), muted = p.getBoolean("muted", false);
        return new JSONObject().put("enabled", subscribed && permitted && !muted).put("subscribed", subscribed).put("permitted", permitted).put("muted", muted)
            .put("preferences", p.getInt("preferences", 7)).put("locale", p.getString("locale", "ru")).put("lastReceivedAt", p.getLong("lastReceivedAt", 0));
    }
    private void dispatch(String method, JSONObject args, Consumer<JSONObject> reply) throws Exception {
        if (method.startsWith("player.")) { player.command(method.substring(7), args, reply); return; }
        if (method.equals("push.state")) { reply.accept(state()); return; }
        if (method.equals("push.settings")) {
            activity.startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, activity.getPackageName())); reply.accept(new JSONObject()); return;
        }
        if (method.equals("ui.haptic")) { haptic(args.optString("strength", "click")); reply.accept(new JSONObject()); return; }
        if (method.equals("motion.start")) { startMotion(); reply.accept(new JSONObject()); return; }
        if (method.equals("motion.stop")) { stopMotion(); reply.accept(new JSONObject()); return; }
        if (method.equals("ui.share")) { share(args); reply.accept(new JSONObject()); return; }
        Runnable task = () -> network.execute(() -> {
            try {
                SharedPreferences p = PushClient.prefs(activity);
                switch (method) {
                    case "push.enable": case "push.update":
                        if (!PushService.allowed(activity)) throw new Exception("#err.notificationsBlocked");
                        int preferences = args.optInt("preferences", 7);
                        if (preferences < 0 || preferences > 7) throw new Exception("#err.badPreferences");
                        String token = Tasks.await(FirebaseMessaging.getInstance().getToken(), 15, TimeUnit.SECONDS);
                        PushClient.subscribe(activity, token, preferences, PushPolicy.locale(args.optString("locale"))); break;
                    case "push.disable": PushClient.unsubscribe(activity); break;
                    case "push.test":
                        if (!PushService.allowed(activity)) throw new Exception("#err.notificationsBlocked");
                        PushClient.post(new JSONObject().put("action", "test").put("id", p.getString("id", "")), p.getString("manageToken", "")); break;
                    default: throw new Exception("#err.request");
                }
                reply.accept(state());
            } catch (Exception e) { reply.accept(error(e.getMessage())); }
        });
        if (method.equals("push.enable") && Build.VERSION.SDK_INT >= 33 && activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            if (permissionAction != null) { reply.accept(error("#err.request")); return; }
            permissionAction = task; permissionReply = reply;
            activity.requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 71);
        } else task.run();
    }
    void permissionResult() {
        Runnable action = permissionAction; Consumer<JSONObject> reply = permissionReply;
        permissionAction = null; permissionReply = null;
        if (action != null) { if (PushService.allowed(activity)) action.run(); else reply.accept(error("#err.notificationsBlocked")); }
    }
    void resume() {
        if (closed) return;
        network.execute(() -> { try { String token = Tasks.await(FirebaseMessaging.getInstance().getToken(), 15, TimeUnit.SECONDS); PushClient.resubscribeQuietly(activity, token); } catch (Exception ignored) {} });
        // Неудавшаяся при установке автоподписка — временная: пробуем снова.
        autoEnableIfNeeded();
    }
    /**
     * Вызывается сразу после того, как выдано системное разрешение на
     * уведомления (или оно уже было выдано раньше) — чтобы «Разрешить» в
     * диалоге и правда включало их, без похода слушателя в настройки
     * приложения.
     *
     * Отметка ставится только после удачной подписки. Первый запуск часто
     * бывает без сети, и прежняя отметка «до попытки» тогда закрывала
     * автоподписку навсегда: разрешение выдано, а уведомлений нет. Теперь
     * неудача — временная, следующий запуск попробует снова.
     *
     * Выключил слушатель уведомления сам (push.disable оставляет muted) —
     * ничего не включаем, это его решение.
     */
    void autoEnableIfNeeded() {
        SharedPreferences prefs = PushClient.prefs(activity);
        if (!PushPolicy.shouldAutoEnable(PushService.allowed(activity), prefs.getBoolean("auto-enable-done", false),
                prefs.contains("id"), prefs.getBoolean("muted", false))) return;
        if (closed) return;
        network.execute(() -> {
            try {
                String token = Tasks.await(FirebaseMessaging.getInstance().getToken(), 15, TimeUnit.SECONDS);
                PushClient.subscribe(activity, token, 7, PushPolicy.locale(java.util.Locale.getDefault().toLanguageTag()));
                prefs.edit().putBoolean("auto-enable-done", true).apply();
            } catch (Exception ignored) {
                // Сети ещё нет или сервер недоступен: отметка не поставлена,
                // попытка повторится при следующем открытии приложения.
            }
        });
    }

    /**
     * Тап по нижней навигации отзывается коротким щелчком. EFFECT_CLICK — это
     * калиброванная производителем волна, а не просто «вибрируй N мс»: на
     * современных телефонах ощущается отчётливее и «собраннее», ближе к
     * тактильному отклику клавиатуры вроде SwiftKey, чем raw one-shot.
     */
    private void haptic(String strength) {
        Vibrator vibrator = (Vibrator) activity.getSystemService(Context.VIBRATOR_SERVICE);
        if (vibrator == null || !vibrator.hasVibrator()) return;
        boolean heavy = "heavy".equals(strength);
        if (Build.VERSION.SDK_INT >= 29) {
            vibrator.vibrate(VibrationEffect.createPredefined(
                heavy ? VibrationEffect.EFFECT_HEAVY_CLICK : VibrationEffect.EFFECT_CLICK));
        } else {
            vibrator.vibrate(VibrationEffect.createOneShot(heavy ? 55 : 30, VibrationEffect.DEFAULT_AMPLITUDE));
        }
    }
    /**
     * Положение телефона — странице.
     *
     * WebView не поднимает службу датчиков Chromium: событие deviceorientation
     * в странице не приходит ни разу, ни ошибки, ни значения. Поэтому датчик
     * читает оболочка, а странице отдаёт те же два числа, что дало бы само
     * событие: beta — наклон вперёд-назад, gamma — влево-вправо.
     *
     * Берём акселерометр, а не вектор поворота: акселерометр есть на любом
     * телефоне, а вектор поворота на дешёвых аппаратах отсутствует. Нам нужно
     * направление силы тяжести, и акселерометр его даёт напрямую.
     *
     * SENSOR_DELAY_UI — примерно шестнадцать значений в секунду. Для едва
     * заметного сдвига этого с запасом, а мост не захлёбывается.
     */
    private void startMotion() {
        if (closed || motion != null) return;
        SensorManager sensors = (SensorManager) activity.getSystemService(Context.SENSOR_SERVICE);
        if (sensors == null) return;
        Sensor accelerometer = sensors.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
        if (accelerometer == null) return;
        motion = new SensorEventListener() {
            private float ax, ay, az;
            private boolean started;
            @Override public void onSensorChanged(SensorEvent event) {
                // Низкочастотный фильтр: сырой акселерометр дрожит вместе с
                // рукой, и без сглаживания карточка дёргается на каждый шаг.
                float rate = started ? 0.2f : 1f; started = true;
                ax += (event.values[0] - ax) * rate;
                ay += (event.values[1] - ay) * rate;
                az += (event.values[2] - az) * rate;
                double beta = Math.toDegrees(Math.atan2(ay, Math.hypot(ax, az)));
                double gamma = Math.toDegrees(Math.atan2(-ax, Math.hypot(ay, az)));
                send(beta, gamma);
            }
            @Override public void onAccuracyChanged(Sensor sensor, int accuracy) {}
        };
        sensors.registerListener(motion, accelerometer, SensorManager.SENSOR_DELAY_UI);
    }
    private void stopMotion() {
        if (motion == null) return;
        SensorManager sensors = (SensorManager) activity.getSystemService(Context.SENSOR_SERVICE);
        if (sensors != null) sensors.unregisterListener(motion);
        motion = null;
    }
    private void send(double beta, double gamma) {
        JavaScriptReplyProxy proxy = channel;
        if (closed || proxy == null) return;
        activity.runOnUiThread(() -> {
            if (closed) return;
            try { proxy.postMessage(new JSONObject().put("event", "motion")
                .put("beta", Math.round(beta * 10) / 10.0)
                .put("gamma", Math.round(gamma * 10) / 10.0).toString()); } catch (Exception ignored) {}
        });
    }
    void close() { closed = true; stopMotion(); channel = null; permissionAction = null; permissionReply = null; network.shutdownNow(); player.close(); }
}
