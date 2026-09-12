package com.truethrills.listener;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

final class PushClient {
    static final String BASE = "https://truethrills.com/";
    static SharedPreferences prefs(Context context) { return context.getSharedPreferences("tt-push", Context.MODE_PRIVATE); }
    static JSONObject post(JSONObject body, String manageToken) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(BASE + "api/notifications").openConnection();
        try {
            c.setInstanceFollowRedirects(false);
            c.setRequestMethod("POST"); c.setDoOutput(true);
            c.setConnectTimeout(8000); c.setReadTimeout(8000);
            c.setRequestProperty("Content-Type", "application/json");
            if (manageToken != null && !manageToken.isEmpty()) c.setRequestProperty("X-Push-Token", manageToken);
            try (OutputStream out = c.getOutputStream()) { out.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
            int status = c.getResponseCode();
            JSONObject result;
            // Buffered reads work on API 26; InputStream.readAllBytes requires API 33.
            try (InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream(); ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
                if (in != null) { byte[] buffer = new byte[4096]; int n;
                    while ((n = in.read(buffer)) != -1) { if (bytes.size() + n > 65536) throw new IOException("#err.request"); bytes.write(buffer, 0, n); }
                }
                String text = new String(bytes.toByteArray(), StandardCharsets.UTF_8);
                result = text.isEmpty() ? new JSONObject() : new JSONObject(text);
            }
            if (status < 200 || status >= 300 || result.has("error")) throw new IOException(result.optString("error", "#err.request"));
            return result;
        } finally { c.disconnect(); }
    }
    static synchronized void subscribe(Context context, String token, int preferences, String locale) throws Exception {
        SharedPreferences p = prefs(context);
        JSONObject res = post(new JSONObject().put("action", "subscribe").put("kind", "fcm").put("token", token)
            .put("previousId", p.getString("id", "")).put("preferences", preferences).put("locale", locale), p.getString("manageToken", ""));
        SharedPreferences.Editor edit = p.edit().putString("id", res.getString("id")).putString("fcmToken", token)
            .putInt("preferences", preferences).putString("locale", locale).putBoolean("muted", false);
        if (res.has("token") && !res.isNull("token")) edit.putString("manageToken", res.getString("token"));
        edit.apply();
    }
    static synchronized void unsubscribe(Context context) throws Exception {
        SharedPreferences p = prefs(context);
        // Suppress locally even offline; keep credentials until the server confirms deletion.
        p.edit().putBoolean("muted", true).apply();
        if (p.contains("id")) post(new JSONObject().put("action", "unsubscribe").put("id", p.getString("id", "")), p.getString("manageToken", ""));
        p.edit().remove("id").remove("manageToken").remove("fcmToken").apply();
    }
    static synchronized void resubscribeQuietly(Context context, String token) {
        SharedPreferences p = prefs(context);
        if (!p.contains("id") || p.getBoolean("muted", false) || token.equals(p.getString("fcmToken", ""))) return;
        try { subscribe(context, token, p.getInt("preferences", 7), p.getString("locale", "ru")); } catch (Exception ignored) { /* Retried when the app resumes. */ }
    }
}
