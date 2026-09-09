package com.truethrills.listener;

import android.Manifest;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
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
        Runnable task = () -> network.execute(() -> {
            try {
                SharedPreferences p = PushClient.prefs(activity);
                switch (method) {
                    case "push.enable": case "push.update":
                        if (!PushService.allowed(activity)) throw new Exception("#err.notificationsBlocked");
                        int preferences = args.optInt("preferences", 7);
                        if (preferences < 0 || preferences > 7) throw new Exception("#err.badPreferences");
                        String token = Tasks.await(FirebaseMessaging.getInstance().getToken(), 15, TimeUnit.SECONDS);
                        PushClient.subscribe(activity, token, preferences, "it".equals(args.optString("locale")) ? "it" : "ru"); break;
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
        if (!closed) network.execute(() -> { try { String token = Tasks.await(FirebaseMessaging.getInstance().getToken(), 15, TimeUnit.SECONDS); PushClient.resubscribeQuietly(activity, token); } catch (Exception ignored) {} });
    }
    void close() { closed = true; permissionAction = null; permissionReply = null; network.shutdownNow(); player.close(); }
}
