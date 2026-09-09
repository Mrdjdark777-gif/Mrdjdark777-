package com.truethrills.listener;

import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import androidx.media3.common.*;
import androidx.media3.session.MediaController;
import androidx.media3.session.SessionToken;
import com.google.common.util.concurrent.ListenableFuture;
import java.util.function.Consumer;
import org.json.JSONObject;

@androidx.annotation.OptIn(markerClass = androidx.media3.common.util.UnstableApi.class)
final class PlayerBridge {
    private final Context context;
    private final ListenableFuture<MediaController> future;
    private boolean closed;
    PlayerBridge(Context context) {
        this.context = context;
        future = new MediaController.Builder(context, new SessionToken(context, new ComponentName(context, PlaybackService.class))).buildAsync();
    }
    void command(String method, JSONObject args, Consumer<JSONObject> reply) {
        future.addListener(() -> {
            if (closed) return;
            try {
                MediaController p = future.get();
                SharedPreferences saved = context.getSharedPreferences("tt-player", Context.MODE_PRIVATE);
                switch (method) {
                    case "load": {
                        String id = args.getString("id");
                        if (!id.matches("[a-fA-F0-9-]{36}")) throw new Exception("#err.playback");
                        MediaItem current = p.getCurrentMediaItem();
                        if (current == null || !id.equals(current.mediaId)) {
                            String title = args.optString("title", "True Thrills");
                            MediaMetadata metadata = new MediaMetadata.Builder().setTitle(title.substring(0, Math.min(160, title.length())))
                                .setArtist("True Thrills").setArtworkUri(Uri.parse(PushClient.BASE + "brand/logo.png")).build();
                            long position = args.has("position") ? args.optLong("position", 0) : id.equals(saved.getString("id", "")) ? saved.getLong("position", 0) : 0;
                            p.setMediaItem(new MediaItem.Builder().setMediaId(id).setUri(PushClient.BASE + "api/audio?id=" + id).setMediaMetadata(metadata).build(), Math.max(0, position));
                            p.prepare(); p.setPlaybackSpeed(saved.getFloat("rate", 1));
                        } else if (p.getPlaybackState() == Player.STATE_IDLE) p.prepare();
                        if (args.optBoolean("autoplay", true)) p.play();
                        break;
                    }
                    case "play": if (p.getPlaybackState() == Player.STATE_IDLE) p.prepare(); if (p.getPlaybackState() == Player.STATE_ENDED) p.seekTo(0); p.play(); break;
                    case "pause": p.pause(); break;
                    case "stop": p.pause(); p.stop(); p.clearMediaItems(); break;
                    case "seek": p.seekTo(Math.max(0, args.optLong("position", 0))); break;
                    case "rate": p.setPlaybackSpeed((float) Math.max(0.5, Math.min(2, args.optDouble("rate", 1)))); break;
                    case "sleep": saved.edit().putLong("sleepUntil", args.optInt("minutes", 0) <= 0 ? 0 : System.currentTimeMillis() + Math.min(120, args.optInt("minutes")) * 60000L).apply(); break;
                    case "state": break;
                    default: throw new Exception("#err.playback");
                }
                MediaItem item = p.getCurrentMediaItem();
                reply.accept(new JSONObject().put("id", item == null ? saved.getString("id", "") : item.mediaId)
                    .put("title", item == null ? saved.getString("title", "") : item.mediaMetadata.title)
                    .put("active", item != null).put("playing", p.isPlaying()).put("loading", p.getPlaybackState() == Player.STATE_BUFFERING)
                    .put("position", item == null ? saved.getLong("position", 0) : p.getCurrentPosition())
                    .put("duration", item == null ? saved.getLong("duration", 0) : Math.max(0, p.getDuration()))
                    .put("rate", p.getPlaybackParameters().speed).put("sleepUntil", saved.getLong("sleepUntil", 0))
                    .put("playbackError", p.getPlayerError() == null ? JSONObject.NULL : "#err.playback"));
            } catch (Exception e) { try { reply.accept(new JSONObject().put("error", "#err.playback")); } catch (Exception ignored) {} }
        }, command -> new android.os.Handler(android.os.Looper.getMainLooper()).post(command));
    }
    void close() { closed = true; MediaController.releaseFuture(future); }
}
