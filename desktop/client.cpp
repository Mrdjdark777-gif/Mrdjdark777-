#define UNICODE
#define _UNICODE
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shellapi.h>
#include <shlobj.h>
#include <wchar.h>
#include "WebView2.h"
#include "webview2-uuids.h"

static void runCommand(HWND h,WPARAM id);
static void setFullscreen(HWND h,bool on);
static bool fullscreen=false;
static const wchar_t* SITE=L"https://truethrills.com";
static HWND windowHandle;
static ICoreWebView2Controller* controller;
static ICoreWebView2* webview;
static bool active=false;
static const wchar_t* loadingText=L"Открываем True Thrills…";
static HBRUSH background;

static bool trusted(const wchar_t* uri){size_t n=wcslen(SITE);return uri&&wcsncmp(uri,SITE,n)==0&&(uri[n]==0||uri[n]=='/'||uri[n]=='?'||uri[n]=='#');}
static bool https(const wchar_t* uri){return uri&&wcsncmp(uri,L"https://",8)==0;}
static void external(const wchar_t* uri){if(https(uri))ShellExecuteW(windowHandle,L"open",uri,nullptr,nullptr,SW_SHOWNORMAL);}
static void activity(bool value){active=value;SetThreadExecutionState(ES_CONTINUOUS|(value?(ES_SYSTEM_REQUIRED|ES_DISPLAY_REQUIRED):0));SetWindowTextW(windowHandle,value?L"True Thrills — микрофон активен":L"True Thrills");}
static bool confirmLeave(){return !active||MessageBoxW(windowHandle,L"Сейчас идёт запись или прямой эфир. Закрытие или обновление окна прервёт его.\n\nПродолжить?",L"True Thrills",MB_YESNO|MB_ICONWARNING|MB_DEFBUTTON2)==IDYES;}
static void fail(const wchar_t* message){loadingText=message;InvalidateRect(windowHandle,nullptr,TRUE);MessageBoxW(windowHandle,message,L"True Thrills",MB_OK|MB_ICONERROR);}
static void runtimeHelp(){if(MessageBoxW(windowHandle,L"Для True Thrills нужен Microsoft Edge WebView2 Runtime.\n\nОткрыть официальную страницу Microsoft для установки? После установки запусти True Thrills снова.",L"Компонент WebView2 не найден",MB_YESNO|MB_ICONINFORMATION)==IDYES)external(L"https://developer.microsoft.com/microsoft-edge/webview2/#download-section");}

template<class T> class Callback:public T{
 volatile LONG refs=1;
 public:HRESULT STDMETHODCALLTYPE QueryInterface(REFIID id,void** obj) override{if(!obj)return E_POINTER;*obj=nullptr;if(IsEqualIID(id,__uuidof(IUnknown))||IsEqualIID(id,__uuidof(T))){*obj=static_cast<T*>(this);AddRef();return S_OK;}return E_NOINTERFACE;}
 ULONG STDMETHODCALLTYPE AddRef() override{return (ULONG)InterlockedIncrement(&refs);}
 ULONG STDMETHODCALLTYPE Release() override{LONG n=InterlockedDecrement(&refs);if(!n)delete this;return (ULONG)n;}
 protected:virtual ~Callback()=default;
};
class Permission:public Callback<ICoreWebView2PermissionRequestedEventHandler>{
 HRESULT STDMETHODCALLTYPE Invoke(ICoreWebView2*,ICoreWebView2PermissionRequestedEventArgs* args) override{
  LPWSTR uri=nullptr;COREWEBVIEW2_PERMISSION_KIND kind;args->get_Uri(&uri);args->get_PermissionKind(&kind);
  if(kind==COREWEBVIEW2_PERMISSION_KIND_MICROPHONE){
   bool allow=trusted(uri)&&MessageBoxW(windowHandle,L"Разрешить True Thrills использовать микрофон для записи и прямых эфиров?\n\nЗвук начнёт передаваться слушателям только после команды «Выйти в эфир».",L"Доступ к микрофону",MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2)==IDYES;
   args->put_State(allow?COREWEBVIEW2_PERMISSION_STATE_ALLOW:COREWEBVIEW2_PERMISSION_STATE_DENY);
  }else if(kind==COREWEBVIEW2_PERMISSION_KIND_CAMERA||kind==COREWEBVIEW2_PERMISSION_KIND_GEOLOCATION)args->put_State(COREWEBVIEW2_PERMISSION_STATE_DENY);
  CoTaskMemFree(uri);return S_OK;
 }
};
class NewWindow:public Callback<ICoreWebView2NewWindowRequestedEventHandler>{
 HRESULT STDMETHODCALLTYPE Invoke(ICoreWebView2*,ICoreWebView2NewWindowRequestedEventArgs* args) override{LPWSTR uri=nullptr;args->get_Uri(&uri);args->put_Handled(TRUE);external(uri);CoTaskMemFree(uri);return S_OK;}
};
class WebMessage:public Callback<ICoreWebView2WebMessageReceivedEventHandler>{
 HRESULT STDMETHODCALLTYPE Invoke(ICoreWebView2*,ICoreWebView2WebMessageReceivedEventArgs* args) override{
  LPWSTR source=nullptr,text=nullptr;args->get_Source(&source);
  if(trusted(source)&&SUCCEEDED(args->TryGetWebMessageAsString(&text))&&text){if(wcscmp(text,L"true-thrills:active")==0)activity(true);else if(wcscmp(text,L"true-thrills:idle")==0)activity(false);else if(wcscmp(text,L"true-thrills:reload")==0)runCommand(windowHandle,102);else if(wcscmp(text,L"true-thrills:browser")==0)runCommand(windowHandle,104);else if(wcscmp(text,L"true-thrills:about")==0)runCommand(windowHandle,105);else if(wcscmp(text,L"true-thrills:fullscreen")==0)runCommand(windowHandle,106);}
  CoTaskMemFree(source);CoTaskMemFree(text);return S_OK;
 }
};
class Navigation:public Callback<ICoreWebView2NavigationStartingEventHandler>{
 HRESULT STDMETHODCALLTYPE Invoke(ICoreWebView2*,ICoreWebView2NavigationStartingEventArgs* args) override{LPWSTR uri=nullptr;args->get_Uri(&uri);if(!https(uri)||!confirmLeave())args->put_Cancel(TRUE);else activity(false);CoTaskMemFree(uri);return S_OK;}
};
class NavigationDone:public Callback<ICoreWebView2NavigationCompletedEventHandler>{
 HRESULT STDMETHODCALLTYPE Invoke(ICoreWebView2*,ICoreWebView2NavigationCompletedEventArgs* args) override{BOOL ok=FALSE;args->get_IsSuccess(&ok);if(!ok){loadingText=L"Не удалось открыть приложение. Проверь интернет и выбери «Обновить» в меню.";InvalidateRect(windowHandle,nullptr,TRUE);}return S_OK;}
};
class ProcessFailed:public Callback<ICoreWebView2ProcessFailedEventHandler>{
 HRESULT STDMETHODCALLTYPE Invoke(ICoreWebView2*,ICoreWebView2ProcessFailedEventArgs*) override{activity(false);fail(L"Окно приложения потеряло соединение с WebView2. Если шла запись, проверь сохранённый черновик после перезапуска.");return S_OK;}
};
// Пока страница в фокусе, клавиатурой распоряжается WebView2 и WM_KEYDOWN до
// окна не доходит. Контроллер отдаёт нажатие сюда раньше, чем веб-содержимому,
// поэтому F11 перехватывается здесь.
class AcceleratorKey:public Callback<ICoreWebView2AcceleratorKeyPressedEventHandler>{
 HRESULT STDMETHODCALLTYPE Invoke(ICoreWebView2Controller*,ICoreWebView2AcceleratorKeyPressedEventArgs* args) override{
  COREWEBVIEW2_KEY_EVENT_KIND kind=COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN;UINT key=0;
  args->get_KeyEventKind(&kind);args->get_VirtualKey(&key);
  if(key==VK_F11&&(kind==COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN||kind==COREWEBVIEW2_KEY_EVENT_KIND_SYSTEM_KEY_DOWN)){args->put_Handled(TRUE);setFullscreen(windowHandle,!fullscreen);}
  return S_OK;
 }
};
class ControllerReady:public Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>{
 HRESULT STDMETHODCALLTYPE Invoke(HRESULT hr,ICoreWebView2Controller* c) override{
  if(FAILED(hr)||!c){fail(L"Не удалось запустить окно True Thrills. Обнови Microsoft Edge WebView2 Runtime и перезапусти приложение.");return S_OK;}
  controller=c;c->AddRef();c->get_CoreWebView2(&webview);RECT bounds;GetClientRect(windowHandle,&bounds);c->put_Bounds(bounds);c->put_IsVisible(TRUE);
  ICoreWebView2Settings* settings=nullptr;if(SUCCEEDED(webview->get_Settings(&settings))){settings->put_IsWebMessageEnabled(TRUE);settings->put_AreDevToolsEnabled(FALSE);settings->put_IsStatusBarEnabled(FALSE);settings->Release();}
  EventRegistrationToken token;
  auto permission=new Permission();webview->add_PermissionRequested(permission,&token);permission->Release();
  auto popup=new NewWindow();webview->add_NewWindowRequested(popup,&token);popup->Release();
  auto message=new WebMessage();webview->add_WebMessageReceived(message,&token);message->Release();
  auto nav=new Navigation();webview->add_NavigationStarting(nav,&token);nav->Release();
  auto done=new NavigationDone();webview->add_NavigationCompleted(done,&token);done->Release();
  auto failed=new ProcessFailed();webview->add_ProcessFailed(failed,&token);failed->Release();
  auto keys=new AcceleratorKey();c->add_AcceleratorKeyPressed(keys,&token);keys->Release();
  webview->Navigate(SITE);return S_OK;
 }
};
class EnvironmentReady:public Callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>{
 HRESULT STDMETHODCALLTYPE Invoke(HRESULT hr,ICoreWebView2Environment* environment) override{
  if(FAILED(hr)||!environment){runtimeHelp();return S_OK;}auto callback=new ControllerReady();HRESULT result=environment->CreateCoreWebView2Controller(windowHandle,callback);callback->Release();if(FAILED(result))fail(L"Не удалось создать окно WebView2.");return S_OK;
 }
};
static void initialize(){
 wchar_t dll[MAX_PATH],data[MAX_PATH];GetModuleFileNameW(nullptr,dll,MAX_PATH);wchar_t* end=wcsrchr(dll,L'\\');if(!end){fail(L"Не удалось определить папку приложения.");return;}wcscpy(end+1,L"WebView2Loader.dll");
 HMODULE loader=LoadLibraryExW(dll,nullptr,LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR|LOAD_LIBRARY_SEARCH_DEFAULT_DIRS);if(!loader){fail(L"Не найден WebView2Loader.dll. Установи True Thrills повторно из файла Setup.");return;}
 using CreateEnvironment=HRESULT(STDAPICALLTYPE*)(PCWSTR,PCWSTR,ICoreWebView2EnvironmentOptions*,ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler*);
 auto create=reinterpret_cast<CreateEnvironment>(GetProcAddress(loader,"CreateCoreWebView2EnvironmentWithOptions"));if(!create){fail(L"Компонент WebView2 повреждён. Установи True Thrills повторно.");return;}
 if(FAILED(SHGetFolderPathW(nullptr,CSIDL_LOCAL_APPDATA,nullptr,SHGFP_TYPE_CURRENT,data))){fail(L"Не удалось открыть папку данных пользователя.");return;}
 wcscat(data,L"\\TrueThrills");CreateDirectoryW(data,nullptr);wcscat(data,L"\\WebView2");CreateDirectoryW(data,nullptr);
 auto callback=new EnvironmentReady();HRESULT hr=create(nullptr,data,nullptr,callback);callback->Release();if(FAILED(hr))runtimeHelp();
}
// Тёмный заголовок окна. Светлая системная полоса над тёмной страницей была
// единственным светлым пятном в приложении. Атрибут 20 — Windows 10 2004 и
// новее, 19 — более ранние сборки; на старых системах вызов просто не удастся.
static void darkTitleBar(HWND h){
 HMODULE dwm=LoadLibraryW(L"dwmapi.dll");if(!dwm)return;
 using SetAttr=HRESULT(WINAPI*)(HWND,DWORD,LPCVOID,DWORD);
 auto setAttr=reinterpret_cast<SetAttr>(GetProcAddress(dwm,"DwmSetWindowAttribute"));
 if(setAttr){BOOL on=TRUE;if(FAILED(setAttr(h,20,&on,sizeof(on))))setAttr(h,19,&on,sizeof(on));}
 FreeLibrary(dwm);
}
// Три действия приложения. Строки меню над страницей больше нет, поэтому они
// живут в системном меню окна — правый клик по заголовку или Alt+Space. Это
// запасной путь: он работает, даже если страница не загрузилась.
static void appMenu(HWND h){
 HMENU menu=GetSystemMenu(h,FALSE);if(!menu)return;
 AppendMenuW(menu,MF_SEPARATOR,0,nullptr);
 AppendMenuW(menu,MF_STRING,102,L"Обновить");
 AppendMenuW(menu,MF_STRING,104,L"Открыть в браузере");
 AppendMenuW(menu,MF_STRING,105,L"О приложении");
 AppendMenuW(menu,MF_STRING,106,L"Полноэкранный режим (F11)");
}

// Полноэкранный режим без рамки. Окно теряет заголовок и границы и точно
// накрывает монитор — панель задач Windows прячет сама, пока такое окно
// впереди. WS_SYSMENU остаётся: без заголовка меню окна (Alt+Space) —
// единственный системный путь наружу, если страница не загрузилась.
static WINDOWPLACEMENT framedPlacement={sizeof(framedPlacement)};
static LONG_PTR framedStyle=0;
static void setFullscreen(HWND h,bool on){
 if(on==fullscreen)return;
 if(on){
  MONITORINFO monitor={sizeof(monitor)};
  if(!GetMonitorInfoW(MonitorFromWindow(h,MONITOR_DEFAULTTONEAREST),&monitor))return;
  framedStyle=GetWindowLongPtrW(h,GWL_STYLE);
  GetWindowPlacement(h,&framedPlacement);
  SetWindowLongPtrW(h,GWL_STYLE,(framedStyle&~(WS_CAPTION|WS_THICKFRAME|WS_MINIMIZEBOX|WS_MAXIMIZEBOX))|WS_POPUP);
  SetWindowPos(h,HWND_TOP,monitor.rcMonitor.left,monitor.rcMonitor.top,
   monitor.rcMonitor.right-monitor.rcMonitor.left,monitor.rcMonitor.bottom-monitor.rcMonitor.top,
   SWP_NOOWNERZORDER|SWP_FRAMECHANGED);
 }else{
  SetWindowLongPtrW(h,GWL_STYLE,framedStyle);
  SetWindowPlacement(h,&framedPlacement);
  SetWindowPos(h,nullptr,0,0,0,0,SWP_NOMOVE|SWP_NOSIZE|SWP_NOZORDER|SWP_NOOWNERZORDER|SWP_FRAMECHANGED);
 }
 fullscreen=on;
 HMENU menu=GetSystemMenu(h,FALSE);
 if(menu)CheckMenuItem(menu,106,MF_BYCOMMAND|(on?MF_CHECKED:MF_UNCHECKED));
}

// ---------------------------------------------------------------------------
// Окно «О приложении» в стиле самой студии.
//
// Раньше здесь стоял системный MessageBox: белое окно поверх тёмного
// приложения — единственное светлое пятно, которое выдавало, что это оболочка
// вокруг сайта. Рисуем своё: тёмный фон, бирюзовые заголовки разделов и одна
// кнопка. Системное окно остаётся только как запасной путь, если страница не
// загрузилась и нажать в ней нечего.
// ---------------------------------------------------------------------------
enum AboutLine{ABOUT_TITLE,ABOUT_SUB,ABOUT_RULE,ABOUT_HEAD,ABOUT_BODY,ABOUT_FOOT};
struct AboutPart{AboutLine kind;const wchar_t* text;};
static const AboutPart ABOUT[]={
 {ABOUT_TITLE,L"True Thrills — студия"},
 {ABOUT_SUB,L"Версия 0.9.2"},
 {ABOUT_BODY,L"Рабочее место автора: подкасты, видео, истории и прямые эфиры. Слушатели открывают канал в приложении на Android или в браузере."},
 {ABOUT_RULE,L""},
 {ABOUT_HEAD,L"КАК УСТРОЕНО"},
 {ABOUT_BODY,L"Окно приложения показывает твой сайт через Microsoft Edge WebView2. Сайт, база и все файлы живут на твоём собственном сервере, а не в чужом облаке. Во время эфира голос идёт с этого компьютера; запись, обработка и архив делаются на сервере и остаются доступны после того, как ПК выключен."},
 {ABOUT_HEAD,L"ЗВУК"},
 {ABOUT_BODY,L"Источник выбирается в разделе «Эфир»: микрофон, аудиоинтерфейс или виртуальный кабель из FL Studio. Приложение не пересобирает твой тракт и ничего не включает в системе без спроса."},
 {ABOUT_HEAD,L"ВХОД"},
 {ABOUT_BODY,L"Нужен пароль автора. Слушателям учётная запись не нужна, и приложение её не создаёт: прогресс прослушивания хранится на устройстве человека."},
 {ABOUT_HEAD,L"ПОДДЕРЖКА КАНАЛА"},
 {ABOUT_BODY,L"Всё бесплатно. Только добровольные донаты через внешние сервисы — приложение не обрабатывает платежи и не хранит данные карт."},
 {ABOUT_RULE,L""},
 {ABOUT_FOOT,L"© 2026 True Thrills. Все права защищены.\nCreated by DarK Creative Studio."},
};
static const COLORREF ABOUT_BG=RGB(16,17,19),ABOUT_TEXT=RGB(228,228,232),ABOUT_MUTED=RGB(165,169,179),
 ABOUT_ACCENT=RGB(111,231,222),ABOUT_LINE=RGB(42,44,49),ABOUT_INK=RGB(8,32,30);
static int aboutScroll=0,aboutHeight=0,aboutView=0;
static bool aboutHot=false;
static HFONT aboutFont(int px,int weight,int scale){
 return CreateFontW(-MulDiv(px,scale,96),0,0,0,weight,FALSE,FALSE,FALSE,DEFAULT_CHARSET,
  OUT_DEFAULT_PRECIS,CLIP_DEFAULT_PRECIS,CLEARTYPE_QUALITY,VARIABLE_PITCH,L"Segoe UI");
}
static int aboutScale(HWND h){HDC dc=GetDC(h);int dpi=dc?GetDeviceCaps(dc,LOGPIXELSY):96;if(dc)ReleaseDC(h,dc);return dpi>0?dpi:96;}
static RECT aboutButton(HWND h){
 RECT r;GetClientRect(h,&r);int s=aboutScale(h);
 int w=MulDiv(132,s,96),bh=MulDiv(42,s,96),pad=MulDiv(24,s,96);
 RECT b={r.right-pad-w,r.bottom-pad-bh,r.right-pad,r.bottom-pad};return b;
}
// Одна раскладка на измерение и на рисование: иначе высота окна и то, что в
// нём видно, разъезжаются на первом же изменении текста.
static int aboutLayout(HDC dc,int width,int scale,int top,bool draw){
 HFONT title=aboutFont(22,700,scale),sub=aboutFont(13,400,scale),head=aboutFont(12,700,scale),
  body=aboutFont(14,400,scale),foot=aboutFont(12,400,scale);
 int y=top;
 for(const AboutPart& part:ABOUT){
  if(part.kind==ABOUT_RULE){
   y+=MulDiv(14,scale,96);
   if(draw){HPEN pen=CreatePen(PS_SOLID,1,ABOUT_LINE);HGDIOBJ old=SelectObject(dc,pen);
    MoveToEx(dc,MulDiv(28,scale,96),y,nullptr);LineTo(dc,MulDiv(28,scale,96)+width,y);SelectObject(dc,old);DeleteObject(pen);}
   y+=MulDiv(14,scale,96);continue;
  }
  HFONT font=part.kind==ABOUT_TITLE?title:part.kind==ABOUT_SUB?sub:part.kind==ABOUT_HEAD?head:part.kind==ABOUT_FOOT?foot:body;
  COLORREF colour=part.kind==ABOUT_HEAD?ABOUT_ACCENT:part.kind==ABOUT_TITLE?ABOUT_TEXT:part.kind==ABOUT_BODY?ABOUT_TEXT:ABOUT_MUTED;
  if(part.kind==ABOUT_HEAD)y+=MulDiv(16,scale,96);
  SelectObject(dc,font);
  RECT r={MulDiv(28,scale,96),y,MulDiv(28,scale,96)+width,y+1};
  DrawTextW(dc,part.text,-1,&r,DT_WORDBREAK|DT_CALCRECT|DT_EXPANDTABS);
  if(draw){SetTextColor(dc,colour);DrawTextW(dc,part.text,-1,&r,DT_WORDBREAK|DT_EXPANDTABS);}
  y=r.bottom+MulDiv(part.kind==ABOUT_TITLE?2:part.kind==ABOUT_HEAD?6:10,scale,96);
 }
 DeleteObject(title);DeleteObject(sub);DeleteObject(head);DeleteObject(body);DeleteObject(foot);
 return y;
}
static LRESULT CALLBACK AboutProc(HWND h,UINT message,WPARAM w,LPARAM l){
 switch(message){
  case WM_ERASEBKGND:return 1;
  case WM_MOUSEWHEEL:{
   int hidden=aboutHeight-aboutView;if(hidden<=0)return 0;
   aboutScroll-=GET_WHEEL_DELTA_WPARAM(w)/2;
   if(aboutScroll<0)aboutScroll=0;if(aboutScroll>hidden)aboutScroll=hidden;
   InvalidateRect(h,nullptr,FALSE);return 0;}
  case WM_MOUSEMOVE:{
   POINT p={(short)LOWORD(l),(short)HIWORD(l)};RECT b=aboutButton(h);bool hot=PtInRect(&b,p)!=0;
   if(hot!=aboutHot){aboutHot=hot;InvalidateRect(h,&b,FALSE);}return 0;}
  case WM_LBUTTONUP:{
   POINT p={(short)LOWORD(l),(short)HIWORD(l)};RECT b=aboutButton(h);
   if(PtInRect(&b,p))DestroyWindow(h);return 0;}
  case WM_KEYDOWN:if(w==VK_ESCAPE||w==VK_RETURN||w==VK_SPACE){DestroyWindow(h);return 0;}break;
  case WM_CLOSE:DestroyWindow(h);return 0;
  case WM_PAINT:{
   PAINTSTRUCT ps;HDC screen=BeginPaint(h,&ps);RECT client;GetClientRect(h,&client);
   // Рисуем через буфер: без него длинный текст мерцает при каждой прокрутке.
   HDC dc=CreateCompatibleDC(screen);HBITMAP bmp=CreateCompatibleBitmap(screen,client.right,client.bottom);
   HGDIOBJ oldBmp=SelectObject(dc,bmp);
   HBRUSH fill=CreateSolidBrush(ABOUT_BG);FillRect(dc,&client,fill);DeleteObject(fill);
   SetBkMode(dc,TRANSPARENT);
   int scale=aboutScale(h),pad=MulDiv(28,scale,96);
   RECT b=aboutButton(h);
   aboutView=b.top-MulDiv(16,scale,96)-pad;
   aboutHeight=aboutLayout(dc,client.right-pad*2,scale,pad,false)-pad;
   HRGN clip=CreateRectRgn(0,0,client.right,b.top-MulDiv(16,scale,96));SelectClipRgn(dc,clip);
   aboutLayout(dc,client.right-pad*2,scale,pad-aboutScroll,true);
   SelectClipRgn(dc,nullptr);DeleteObject(clip);
   HBRUSH face=CreateSolidBrush(aboutHot?RGB(140,240,232):ABOUT_ACCENT);
   HGDIOBJ oldBrush=SelectObject(dc,face),oldPen=SelectObject(dc,GetStockObject(NULL_PEN));
   RoundRect(dc,b.left,b.top,b.right+1,b.bottom+1,MulDiv(14,scale,96),MulDiv(14,scale,96));
   SelectObject(dc,oldBrush);SelectObject(dc,oldPen);DeleteObject(face);
   HFONT label=aboutFont(14,600,scale);SelectObject(dc,label);SetTextColor(dc,ABOUT_INK);
   DrawTextW(dc,L"Понятно",-1,&b,DT_CENTER|DT_VCENTER|DT_SINGLELINE);
   BitBlt(screen,0,0,client.right,client.bottom,dc,0,0,SRCCOPY);
   SelectObject(dc,oldBmp);DeleteObject(bmp);DeleteDC(dc);DeleteObject(label);
   EndPaint(h,&ps);return 0;}
 }return DefWindowProcW(h,message,w,l);
}
static void showAbout(HWND owner){
 HINSTANCE instance=GetModuleHandleW(nullptr);
 static bool registered=false;
 if(!registered){
  WNDCLASSEXW cls={sizeof(cls)};cls.lpfnWndProc=AboutProc;cls.hInstance=instance;
  cls.hCursor=LoadCursorW(nullptr,IDC_ARROW);cls.hbrBackground=nullptr;cls.lpszClassName=L"TrueThrills.About";
  cls.hIcon=LoadIconW(instance,MAKEINTRESOURCEW(1));cls.hIconSm=cls.hIcon;
  if(!RegisterClassExW(&cls))return;registered=true;
 }
 aboutScroll=0;aboutHot=false;
 // Высоту считаем по тексту и упираем в рабочую область экрана: если не
 // помещается, окно прокручивается колесом, а не обрезает конец.
 HDC probe=GetDC(owner);int scale=aboutScale(owner),pad=MulDiv(28,scale,96);
 int width=MulDiv(560,scale,96),content=width-pad*2;
 int text=aboutLayout(probe,content,scale,pad,false)-pad;
 ReleaseDC(owner,probe);
 int height=text+pad+MulDiv(42+16+24,scale,96);
 RECT work={0,0,0,0};SystemParametersInfoW(SPI_GETWORKAREA,0,&work,0);
 int maxHeight=(work.bottom-work.top)*9/10;if(height>maxHeight)height=maxHeight;
 RECT frame={0,0,width,height};AdjustWindowRectEx(&frame,WS_POPUP|WS_CAPTION|WS_SYSMENU,FALSE,WS_EX_DLGMODALFRAME);
 int fw=frame.right-frame.left,fh=frame.bottom-frame.top;
 RECT host;GetWindowRect(owner,&host);
 int x=host.left+((host.right-host.left)-fw)/2,y=host.top+((host.bottom-host.top)-fh)/2;
 if(y<work.top)y=work.top;
 HWND dialog=CreateWindowExW(WS_EX_DLGMODALFRAME,L"TrueThrills.About",L"О True Thrills",
  WS_POPUP|WS_CAPTION|WS_SYSMENU,x,y,fw,fh,owner,nullptr,instance,nullptr);
 if(!dialog)return;
 darkTitleBar(dialog);
 EnableWindow(owner,FALSE);
 ShowWindow(dialog,SW_SHOW);UpdateWindow(dialog);SetFocus(dialog);
 MSG msg;
 while(IsWindow(dialog)){
  BOOL got=GetMessageW(&msg,nullptr,0,0);
  if(got<=0){if(got==0)PostQuitMessage((int)msg.wParam);break;}
  TranslateMessage(&msg);DispatchMessageW(&msg);
 }
 EnableWindow(owner,TRUE);SetActiveWindow(owner);SetForegroundWindow(owner);
}

static LRESULT CALLBACK WindowProc(HWND h,UINT message,WPARAM w,LPARAM l){
 switch(message){
  case WM_SIZE:if(controller){RECT rect;GetClientRect(h,&rect);controller->put_Bounds(rect);}return 0;
  case WM_MOVE:if(controller)controller->NotifyParentWindowPositionChanged();return 0;
  case WM_SETFOCUS:if(controller)controller->MoveFocus(COREWEBVIEW2_MOVE_FOCUS_REASON_PROGRAMMATIC);return 0;
  case WM_COMMAND:runCommand(h,LOWORD(w));return 0;
  case WM_SYSCOMMAND:if(w==102||w==104||w==105||w==106){runCommand(h,w);return 0;}break;
  case WM_CLOSE:if(confirmLeave())DestroyWindow(h);return 0;
  case WM_DESTROY:activity(false);if(controller){controller->Close();controller->Release();controller=nullptr;}if(webview){webview->Release();webview=nullptr;}PostQuitMessage(0);return 0;
  case WM_PAINT:{PAINTSTRUCT ps;HDC dc=BeginPaint(h,&ps);RECT r;GetClientRect(h,&r);SetBkMode(dc,TRANSPARENT);SetTextColor(dc,RGB(224,224,230));SelectObject(dc,GetStockObject(DEFAULT_GUI_FONT));DrawTextW(dc,loadingText,-1,&r,DT_CENTER|DT_VCENTER|DT_SINGLELINE);EndPaint(h,&ps);return 0;}
 }return DefWindowProcW(h,message,w,l);
}
static void runCommand(HWND h,WPARAM id){switch(id){
   case 102:if(webview&&confirmLeave()){activity(false);webview->Reload();}break;
   case 104:external(SITE);break;
   case 106:setFullscreen(h,!fullscreen);break;
   case 105:showAbout(h);break;
  }}

int WINAPI wWinMain(HINSTANCE instance,HINSTANCE,LPWSTR,int show){
 HANDLE mutex=CreateMutexW(nullptr,FALSE,L"Local\\TrueThrills.Desktop.02");if(GetLastError()==ERROR_ALREADY_EXISTS){HWND existing=FindWindowW(L"TrueThrills.Desktop",nullptr);if(existing){ShowWindow(existing,SW_RESTORE);SetForegroundWindow(existing);}if(mutex)CloseHandle(mutex);return 0;}
 SetProcessDPIAware();if(FAILED(CoInitializeEx(nullptr,COINIT_APARTMENTTHREADED)))return 1;
 background=CreateSolidBrush(RGB(16,17,19));WNDCLASSEXW cls={sizeof(cls)};cls.lpfnWndProc=WindowProc;cls.hInstance=instance;cls.hCursor=LoadCursorW(nullptr,IDC_ARROW);cls.hbrBackground=background;cls.lpszClassName=L"TrueThrills.Desktop";cls.hIcon=LoadIconW(instance,MAKEINTRESOURCEW(1));cls.hIconSm=cls.hIcon;RegisterClassExW(&cls);
 windowHandle=CreateWindowExW(0,cls.lpszClassName,L"True Thrills",WS_OVERLAPPEDWINDOW,CW_USEDEFAULT,CW_USEDEFAULT,1280,880,nullptr,nullptr,instance,nullptr);if(!windowHandle)return 1;darkTitleBar(windowHandle);appMenu(windowHandle);ShowWindow(windowHandle,show);UpdateWindow(windowHandle);initialize();
 MSG msg;while(GetMessageW(&msg,nullptr,0,0)>0){TranslateMessage(&msg);DispatchMessageW(&msg);}CoUninitialize();DeleteObject(background);if(mutex)CloseHandle(mutex);return 0;
}
