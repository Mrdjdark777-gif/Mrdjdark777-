package com.truethrills.listener;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import androidx.media3.common.*;
import androidx.media3.common.audio.AudioProcessor;
import androidx.media3.common.audio.TeeAudioProcessor;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.audio.AudioSink;
import androidx.media3.exoplayer.audio.DefaultAudioSink;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;

@androidx.annotation.OptIn(markerClass = androidx.media3.common.util.UnstableApi.class)
public class PlaybackService extends MediaSessionService {
    private ExoPlayer player;
    private MediaSession session;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private int ticks;
    private int networkRetries;
    private final Runnable tick = new Runnable() { public void run() {
        long until = prefs().getLong("sleepUntil", 0);
        if (until > 0 && System.currentTimeMillis() >= until) { player.pause(); prefs().edit().remove("sleepUntil").apply(); }
        if (++ticks % 5 == 0) save();
        handler.postDelayed(this, 1000);
    }};
    private SharedPreferences prefs() { return getSharedPreferences("tt-player", MODE_PRIVATE); }
    private void save() {
        MediaItem item = player.getCurrentMediaItem(); if (item == null || item.mediaId.startsWith("live:")) return;
        prefs().edit().putString("id", item.mediaId).putString("title", String.valueOf(item.mediaMetadata.title))
            .putLong("position", player.getPlaybackState() == Player.STATE_ENDED ? 0 : player.getCurrentPosition())
            .putLong("duration", Math.max(0, player.getDuration())).putFloat("rate", player.getPlaybackParameters().speed).apply();
    }
    @Override public void onCreate() {
        super.onCreate();
        // Ответвление PCM для индикатора звука у слушателя: TeeAudioProcessor
        // отдаёт копию уже декодированного потока, ничего не меняя в нём.
        DefaultRenderersFactory renderers = new DefaultRenderersFactory(this) {
            @Override protected AudioSink buildAudioSink(Context context, boolean enableFloatOutput, boolean enableAudioTrackPlaybackParams) {
                return new DefaultAudioSink.Builder(context)
                    .setAudioProcessors(new AudioProcessor[]{ new TeeAudioProcessor(new LevelTap()) })
                    .build();
            }
        };
        player = new ExoPlayer.Builder(this, renderers).build();
        player.setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_SPEECH).build(), true);
        player.setHandleAudioBecomingNoisy(true); player.setWakeMode(C.WAKE_MODE_NETWORK);
        player.addListener(new Player.Listener() {
            @Override public void onIsPlayingChanged(boolean playing) { if(playing) networkRetries=0; save(); }
            @Override public void onPlayerError(PlaybackException error) {
                final MediaItem failed=player.getCurrentMediaItem();
                if(failed==null || !player.getPlayWhenReady() || networkRetries>=12) return;
                if(error.errorCode!=PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED && error.errorCode!=PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT && error.errorCode!=PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW) return;
                long wait=Math.min(15000,1000L << Math.min(networkRetries++,4));
                handler.postDelayed(() -> {
                    if(player.getCurrentMediaItem()==failed && player.getPlayWhenReady()) {
                        if(failed.mediaId.startsWith("live:")) player.seekToDefaultPosition();
                        player.prepare(); player.play();
                    }
                },wait);
            }
        });
        PendingIntent launch = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        session = new MediaSession.Builder(this, player).setSessionActivity(launch).setCallback(new MediaSession.Callback() {
            @Override public MediaSession.ConnectionResult onConnect(MediaSession s, MediaSession.ControllerInfo controller) {
                if (getPackageName().equals(controller.getPackageName()) || controller.isTrusted()) return MediaSession.Callback.super.onConnect(s, controller);
                return MediaSession.ConnectionResult.reject();
            }
        }).build();
        handler.post(tick);
    }
    @Override public MediaSession onGetSession(MediaSession.ControllerInfo controller) { return session; }
    @Override public void onDestroy() {
        handler.removeCallbacksAndMessages(null); save(); session.release(); player.release(); super.onDestroy();
    }
}
