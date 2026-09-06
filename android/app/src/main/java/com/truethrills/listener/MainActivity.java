package com.truethrills.listener;

import android.app.Activity;
import android.app.AlertDialog;
import android.os.Bundle;
import android.content.pm.ResolveInfo;
import android.content.Intent;
import android.content.ActivityNotFoundException;
import android.graphics.Color;
import android.net.Uri;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.ImageView;
import java.util.List;

/** Chrome-backed client preserves normal sign-in and the browser's media playback. */
public class MainActivity extends Activity {
 private static final String BASE="https://true-thrills.mrdjdark777.chatgpt.site/";
 private String provider;
 private TextView status;
 @Override public void onCreate(Bundle savedInstanceState){
  super.onCreate(savedInstanceState);
  LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setGravity(Gravity.CENTER);root.setPadding(60,50,60,50);root.setBackgroundColor(Color.rgb(16,17,19));
  root.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(60,insets.getSystemWindowInsetTop()+35,60,insets.getSystemWindowInsetBottom()+35);return insets;});
  ImageView logo=new ImageView(this);logo.setImageDrawable(getApplicationInfo().loadIcon(getPackageManager()));logo.setContentDescription("True Thrills");int logoSize=(int)(160*getResources().getDisplayMetrics().density);root.addView(logo,new LinearLayout.LayoutParams(logoSize,logoSize));
  TextView title=new TextView(this);title.setText("TRUE THRILLS");title.setTextColor(Color.WHITE);title.setTextSize(28);title.setGravity(Gravity.CENTER);root.addView(title);
  status=new TextView(this);status.setText("Подкасты, истории и прямые эфиры");status.setTextColor(Color.rgb(182,185,195));status.setTextSize(16);status.setGravity(Gravity.CENTER);status.setPadding(0,30,0,35);root.addView(status);
  Button open=new Button(this);open.setText("Открыть True Thrills");open.setOnClickListener(v->open("podcasts"));root.addView(open,new LinearLayout.LayoutParams(-1,-2));
  Button live=new Button(this);live.setText("Прямой эфир");live.setOnClickListener(v->open("live"));root.addView(live,new LinearLayout.LayoutParams(-1,-2));
  TextView note=new TextView(this);note.setText("Для прослушивания нужен интернет и браузер с поддержкой Chrome Custom Tabs. При первом входе используй свой аккаунт ChatGPT.");note.setTextColor(Color.rgb(145,150,160));note.setTextSize(14);note.setPadding(0,30,0,0);note.setGravity(Gravity.CENTER);root.addView(note);
  setContentView(root);
  provider=findBrowser();
  if(provider==null){status.setText("Нужен Chrome или совместимый браузер");return;}
  if(savedInstanceState==null)open("podcasts");
 }
 private String findBrowser(){
  Intent service=new Intent("android.support.customtabs.action.CustomTabsService");
  List<ResolveInfo> browsers=getPackageManager().queryIntentServices(service,0);
  for(ResolveInfo info:browsers)if("com.android.chrome".equals(info.serviceInfo.packageName))return "com.android.chrome";
  return browsers.isEmpty()?null:browsers.get(0).serviceInfo.packageName;
 }

 private Uri url(String view){return Uri.parse(BASE+"?mode=listen&client=android&view="+view);}
 private void open(String view){
  if(provider==null){new AlertDialog.Builder(this).setTitle("Установи Chrome").setMessage("True Thrills использует браузер для входа и воспроизведения звука.").setPositiveButton("Открыть Google Play",(d,w)->{try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse("https://play.google.com/store/apps/details?id=com.android.chrome")));}catch(ActivityNotFoundException e){status.setText("Установи Chrome из Google Play.");}}).setNegativeButton("Закрыть",null).show();return;}
  try{
   // Official Custom Tabs low-level protocol; a null SESSION opens a normal Custom Tab.
   // https://developer.chrome.com/docs/android/custom-tabs/howto-custom-tab-low-level-api
   Intent intent=new Intent(Intent.ACTION_VIEW,url(view));intent.setPackage(provider);
   Bundle extras=new Bundle();extras.putBinder("android.support.customtabs.extra.SESSION",null);intent.putExtras(extras);
   intent.putExtra("android.support.customtabs.extra.TOOLBAR_COLOR",Color.rgb(16,17,19));
   intent.putExtra("androidx.browser.customtabs.extra.COLOR_SCHEME",2);
   intent.putExtra("android.support.customtabs.extra.TITLE_VISIBILITY",1);
   startActivity(intent);status.setText("Подкасты, истории и прямые эфиры");
  }catch(ActivityNotFoundException e){provider=findBrowser();status.setText("Не удалось открыть браузер. Обнови Chrome и попробуй ещё раз.");}
 }
}
