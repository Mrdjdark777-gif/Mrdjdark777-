package com.truethrills.listener;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** Full-screen in-app WebView: no visible address bar or browser chrome, feels like a native app. */
public class MainActivity extends Activity {
 private static final String BASE="https://truethrills.com/";
 private static final String BASE_HOST=Uri.parse(BASE).getHost();
 private WebView webView;

 @Override public void onCreate(Bundle savedInstanceState){
  super.onCreate(savedInstanceState);
  webView=new WebView(this);
  webView.setBackgroundColor(Color.rgb(16,17,19));
  webView.setLayoutParams(new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.MATCH_PARENT));
  WebSettings settings=webView.getSettings();
  settings.setJavaScriptEnabled(true);
  settings.setDomStorageEnabled(true);
  settings.setMediaPlaybackRequiresUserGesture(false);
  webView.setWebViewClient(new WebViewClient(){
   // Keep truethrills.com navigation inside the app; hand anything else to a real browser.
   @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
    Uri uri=request.getUrl();
    if(BASE_HOST.equals(uri.getHost()))return false;
    startActivity(new Intent(Intent.ACTION_VIEW,uri));
    return true;
   }
  });
  webView.setWebChromeClient(new WebChromeClient());
  setContentView(webView);
  if(savedInstanceState!=null)webView.restoreState(savedInstanceState);
  else webView.loadUrl(url("podcasts"));
 }

 private String url(String view){return BASE+"?mode=listen&client=android&view="+view;}

 @Override public void onSaveInstanceState(Bundle outState){super.onSaveInstanceState(outState);webView.saveState(outState);}
 @Override public void onBackPressed(){if(webView.canGoBack())webView.goBack();else super.onBackPressed();}
 @Override protected void onDestroy(){webView.destroy();super.onDestroy();}
}
