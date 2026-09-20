package com.truethrills.listener;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;
import android.webkit.WebView;
import androidx.webkit.*;
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
    NativeBridge(MainActivity activity, WebView view) {
        this.activity = activity; player = new PlayerBridge(activity);
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return;
        WebViewCompat.addWebMessageListener(view, "TrueThrillsNative", Collections.singleton("https://truethrills.com"), (webView, message, origin, mainFrame, proxy) -> {
            if (closed || !mainFrame || !"https".equals(origin.getScheme()) || !"truethrills.com".equals(origin.getHost()) || (origin.getPort() != -1 && origin.getPort() != 443)) return;
            String text = message.getData(); if (text == null || text.length() > 8192) return;
            try {
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
        if (method.equals("ui.haptic")) { haptic(); reply.accept(new JSONObject()); return; }
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
    private void haptic() {
        Vibrator vibrator = (Vibrator) activity.getSystemService(Context.VIBRATOR_SERVICE);
        if (vibrator == null || !vibrator.hasVibrator()) return;
        if (Build.VERSION.SDK_INT >= 29) vibrator.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_CLICK));
        else vibrator.vibrate(VibrationEffect.createOneShot(30, VibrationEffect.DEFAULT_AMPLITUDE));
    }
    void close() { closed = true; permissionAction = null; permissionReply = null; network.shutdownNow(); player.close(); }
}
