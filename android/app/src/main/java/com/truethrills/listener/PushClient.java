package com.truethrills.listener;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/** Talks to /api/notifications; shared by the JS bridge and the background FCM service. */
final class PushClient {
    static final String BASE = "https://truethrills.com/";
    private static final String PREFS = "tt-push";
    private PushClient() {}

    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static JSONObject post(JSONObject body, String manageToken) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(BASE + "api/notifications").openConnection();
        connection.setRequestMethod("POST");
        connection.setDoOutput(true);
        connection.setConnectTimeout(8000);
        connection.setReadTimeout(8000);
        connection.setRequestProperty("Content-Type", "application/json");
        if (manageToken != null && !manageToken.isEmpty()) connection.setRequestProperty("X-Push-Token", manageToken);
        try (OutputStream out = connection.getOutputStream()) {
            out.write(body.toString().getBytes(StandardCharsets.UTF_8));
        }
        int status = connection.getResponseCode();
        InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
        String text = stream == null ? "" : new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        JSONObject json = text.isEmpty() ? new JSONObject() : new JSONObject(text);
        if (status >= 400 && !json.has("error")) json.put("error", "Сервер вернул ошибку " + status);
        return json;
    }

    /** Re-registers a rotated FCM token under the existing subscription, without any UI listening. */
    static void resubscribeQuietly(Context context, String newToken) {
        SharedPreferences prefs = prefs(context);
        if (!prefs.contains("id")) return;
        try {
            JSONObject body = new JSONObject()
                    .put("action", "subscribe")
                    .put("kind", "fcm")
                    .put("token", newToken)
                    .put("preferences", prefs.getInt("preferences", 7));
            JSONObject res = post(body, prefs.getString("manageToken", ""));
            if (res.has("error")) return;
            SharedPreferences.Editor editor = prefs.edit().putString("id", res.getString("id"));
            if (res.has("token") && !res.isNull("token")) editor.putString("manageToken", res.getString("token"));
            editor.apply();
        } catch (Exception ignored) {
        }
    }
}
