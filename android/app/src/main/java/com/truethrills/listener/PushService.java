package com.truethrills.listener;

import android.app.*;
import android.content.Context;
import android.content.Intent;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

public class PushService extends FirebaseMessagingService {
    static final String CHANNEL_ID = "true-thrills";
    static void ensureChannel(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager.getNotificationChannel(CHANNEL_ID) == null) manager.createNotificationChannel(new NotificationChannel(CHANNEL_ID, "True Thrills", NotificationManager.IMPORTANCE_HIGH));
    }
    static boolean allowed(Context context) {
        ensureChannel(context);
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        return manager.areNotificationsEnabled() && manager.getNotificationChannel(CHANNEL_ID).getImportance() != NotificationManager.IMPORTANCE_NONE;
    }
    @Override public void onMessageReceived(RemoteMessage message) {
        if (PushClient.prefs(this).getBoolean("muted", false) || !allowed(this)) return;
        Map<String, String> data = message.getData();
        String tag = data.getOrDefault("tag", "true-thrills");
        try {
            long expiry = Long.parseLong(data.getOrDefault("expiresAt", "0"));
            if ((expiry > 0 && expiry <= System.currentTimeMillis()) || (expiry == 0 && tag.startsWith("live:"))) return;
        } catch (NumberFormatException e) { return; }
        Intent intent = new Intent(this, MainActivity.class).putExtra("url", data.getOrDefault("url", "/"));
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pending = PendingIntent.getActivity(this, tag.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification notification = new Notification.Builder(this, CHANNEL_ID)
            .setContentTitle(data.getOrDefault("title", "True Thrills")).setContentText(data.getOrDefault("body", ""))
            .setSmallIcon(R.drawable.ic_notification).setContentIntent(pending).setAutoCancel(true).build();
        try {
            getSystemService(NotificationManager.class).notify(tag.hashCode(), notification);
            PushClient.prefs(this).edit().putLong("lastReceivedAt", System.currentTimeMillis()).apply();
        } catch (SecurityException ignored) { /* Permission may be revoked between checking and posting. */ }
    }
    @Override public void onNewToken(String token) { new Thread(() -> PushClient.resubscribeQuietly(getApplicationContext(), token)).start(); }
}
