package com.truethrills.listener;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.widget.FrameLayout;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.google.android.gms.tasks.Tasks;
import com.google.firebase.messaging.FirebaseMessaging;
import org.json.JSONObject;

public class MainActivity extends Activity {
    private static final String BASE_HOST = Uri.parse(PushClient.BASE).getHost();
    private WebView webView;
    private FrameLayout root;
    private View fullscreenView;
    private WebChromeClient.CustomViewCallback fullscreenCallback;
    private WebChromeClient chrome;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Android 15 (targetSdk 35) enables edge-to-edge by default, drawing
        // content behind the status/navigation bars. Opt back out so the
        // WebView is automatically inset away from them, like before.
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(true);
        }
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] {Manifest.permission.POST_NOTIFICATIONS}, 1);
        }
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(16, 17, 19));
        webView.setLayoutParams(new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        // Without these, WebView can ignore the site's own
        // width=device-width viewport meta tag and lay the page out at a
        // fixed desktop-ish width, spilling content past the screen edges.
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        webView.addJavascriptInterface(new PushBridge(), "AndroidPush");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                // Встроенные плееры (YouTube, Rutube, VK) грузятся во вложенных
                // фреймах: их нельзя выкидывать во внешний браузер, иначе видео
                // не проигрывается внутри приложения.
                if (!request.isForMainFrame()) return false;
                if (BASE_HOST.equals(uri.getHost())) return false;
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
                return true;
            }
        });
        chrome = new WebChromeClient() {
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (fullscreenView != null) { callback.onCustomViewHidden(); return; }
                fullscreenView = view;
                fullscreenCallback = callback;
                webView.setVisibility(View.GONE);
                root.addView(view, new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                setSystemBarsHidden(true);
            }

            @Override
            public void onHideCustomView() {
                if (fullscreenView == null) return;
                root.removeView(fullscreenView);
                fullscreenView = null;
                webView.setVisibility(View.VISIBLE);
                setSystemBarsHidden(false);
                if (fullscreenCallback != null) { fullscreenCallback.onCustomViewHidden(); fullscreenCallback = null; }
            }
        };
        webView.setWebChromeClient(chrome);
        root = new FrameLayout(this);
        root.addView(webView);
        setContentView(root);
        String deepLink = savedInstanceState == null ? getIntent().getStringExtra("url") : null;
        if (savedInstanceState != null) webView.restoreState(savedInstanceState);
        else webView.loadUrl(deepLink != null ? resolveUrl(deepLink) : url("home"));
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        String deepLink = intent.getStringExtra("url");
        if (deepLink != null) webView.loadUrl(resolveUrl(deepLink));
    }

    private String url(String view) {
        return PushClient.BASE + "?mode=listen&client=android&view=" + view;
    }

    // Notice.url from the server is always root-relative ("/?mode=...") — see
    // lib/push.ts — so this only needs to graft its query string onto BASE.
    private String resolveUrl(String relative) {
        String query = relative.startsWith("/") ? relative.substring(1) : relative;
        String glue = query.contains("?") ? "&" : "?";
        return PushClient.BASE + query + glue + "client=android";
    }

    @Override
    public void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    /** Во время полноэкранного видео системные панели убираются, потом возвращаются. */
    private void setSystemBarsHidden(boolean hidden) {
        if (Build.VERSION.SDK_INT < 30) return;
        getWindow().setDecorFitsSystemWindows(!hidden);
        WindowInsetsController bars = getWindow().getInsetsController();
        if (bars == null) return;
        if (hidden) {
            bars.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            bars.hide(WindowInsets.Type.systemBars());
        } else {
            bars.show(WindowInsets.Type.systemBars());
        }
    }

    @Override
    public void onBackPressed() {
        if (fullscreenView != null) { chrome.onHideCustomView(); return; }
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        webView.destroy();
        super.onDestroy();
    }

    private void callback(int requestId, JSONObject data) {
        runOnUiThread(() -> webView.evaluateJavascript(
                "window.__ttPushCallback&&window.__ttPushCallback(" + requestId + "," + data.toString() + ")", null));
    }

    private JSONObject error(String message) {
        try {
            return new JSONObject().put("error", message);
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    /** Bridges the site's notification settings UI (hooks/use-notifications.ts) to native FCM. */
    private class PushBridge {
        @JavascriptInterface
        public String getState() {
            SharedPreferences prefs = PushClient.prefs(MainActivity.this);
            try {
                return new JSONObject()
                        .put("enabled", prefs.contains("id"))
                        .put("preferences", prefs.getInt("preferences", 7))
                        .toString();
            } catch (Exception e) {
                return "{}";
            }
        }

        @JavascriptInterface
        public void enable(int preferences, int requestId) {
            register(preferences, requestId);
        }

        @JavascriptInterface
        public void update(int preferences, int requestId) {
            register(preferences, requestId);
        }

        private void register(int preferences, int requestId) {
            new Thread(() -> {
                try {
                    String token = Tasks.await(FirebaseMessaging.getInstance().getToken());
                    JSONObject body = new JSONObject()
                            .put("action", "subscribe")
                            .put("kind", "fcm")
                            .put("token", token)
                            .put("preferences", preferences);
                    JSONObject res = PushClient.post(body, PushClient.prefs(MainActivity.this).getString("manageToken", ""));
                    if (res.has("error")) {
                        callback(requestId, res);
                        return;
                    }
                    SharedPreferences.Editor editor = PushClient.prefs(MainActivity.this).edit().putString("id", res.getString("id")).putInt("preferences", preferences);
                    if (res.has("token") && !res.isNull("token")) editor.putString("manageToken", res.getString("token"));
                    editor.apply();
                    callback(requestId, new JSONObject().put("enabled", true).put("preferences", preferences));
                } catch (Exception e) {
                    callback(requestId, error("Не удалось включить уведомления. Проверь соединение."));
                }
            }).start();
        }

        @JavascriptInterface
        public void disable(int requestId) {
            new Thread(() -> {
                try {
                    SharedPreferences prefs = PushClient.prefs(MainActivity.this);
                    String id = prefs.getString("id", null);
                    if (id != null) PushClient.post(new JSONObject().put("action", "unsubscribe").put("id", id), prefs.getString("manageToken", ""));
                    prefs.edit().clear().apply();
                    callback(requestId, new JSONObject().put("enabled", false));
                } catch (Exception e) {
                    callback(requestId, error("Не удалось выключить уведомления."));
                }
            }).start();
        }

        @JavascriptInterface
        public void test(int requestId) {
            new Thread(() -> {
                try {
                    SharedPreferences prefs = PushClient.prefs(MainActivity.this);
                    String id = prefs.getString("id", null);
                    if (id == null) {
                        callback(requestId, error("Сначала включи уведомления."));
                        return;
                    }
                    JSONObject res = PushClient.post(new JSONObject().put("action", "test").put("id", id), prefs.getString("manageToken", ""));
                    callback(requestId, res.has("error") ? res : new JSONObject().put("accepted", true));
                } catch (Exception e) {
                    callback(requestId, error("Проверка не удалась."));
                }
            }).start();
        }
    }
}
