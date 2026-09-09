package com.truethrills.listener;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
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

import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    private static final String BASE_HOST = Uri.parse(PushClient.BASE).getHost();
    private WebView webView;
    private NativeBridge bridge;
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
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(16, 17, 19));
        // Android 12+ stretches the rendered page a little past its own edge
        // on a fling past the top or bottom ("overscroll" bounce) — that
        // stretch is a compositor effect and can visually bulge into the
        // status bar strip for an instant, even though the WebView's real
        // layout already stops below it. Turning the effect off is simpler
        // and more reliable than trying to mask a moving target.
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
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
        bridge = new NativeBridge(this, webView);
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] {Manifest.permission.POST_NOTIFICATIONS}, 1);
        } else {
            // Разрешение уже есть (Android 12 и старше, где системного диалога
            // вообще нет, либо оно было выдано раньше) — подписываемся сразу,
            // не дожидаясь, пока слушатель сам найдёт кнопку в настройках.
            bridge.autoEnableIfNeeded();
        }
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                // Встроенные плееры (YouTube, Rutube, VK) грузятся во вложенных
                // фреймах: их нельзя выкидывать во внешний браузер, иначе видео
                // не проигрывается внутри приложения.
                if (!request.isForMainFrame()) return false;
                if ("https".equals(uri.getScheme()) && BASE_HOST.equals(uri.getHost()) && (uri.getPort() == -1 || uri.getPort() == 443)) return false;
                if ("https".equals(uri.getScheme())) try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (android.content.ActivityNotFoundException ignored) {}
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
        if (!relative.equals("/") && !relative.startsWith("/?")) return url("home");
        Uri incoming = Uri.parse(relative);
        Uri.Builder target = Uri.parse(PushClient.BASE).buildUpon().appendQueryParameter("mode", "listen").appendQueryParameter("client", "android");
        for (String key : new String[]{"view", "post", "broadcast"}) {
            String value = incoming.getQueryParameter(key);
            if (value != null && value.length() <= 200) target.appendQueryParameter(key, value);
        }
        return target.build().toString();
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
        bridge.close();
        webView.destroy();
        super.onDestroy();
    }

    @Override protected void onResume() { super.onResume(); if (bridge != null) bridge.resume(); }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        // requestCode 1 — системный диалог при первом запуске (см. onCreate):
        // «Разрешить» здесь и должно означать «включить», а не просто выдать
        // OS-разрешение и ждать похода слушателя в настройки. requestCode 71 —
        // тот же диалог, но вызванный NativeBridge в ответ на нажатие «Включить»
        // в самом приложении; его подхватывает собственный колбэк моста.
        if (requestCode == 1 && grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED && bridge != null) {
            bridge.autoEnableIfNeeded();
        } else if (requestCode == 71 && bridge != null) {
            bridge.permissionResult();
        }
    }
}
