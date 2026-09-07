#define UNICODE
#define _UNICODE
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shellapi.h>
#include <shlobj.h>
#include <wchar.h>
#include "WebView2.h"
#include "webview2-uuids.h"

static const wchar_t* SITE=L"https://truethrills.com";
static const wchar_t* VIEWER=L"https://truethrills.com/?mode=listen&view=live";
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
  if(trusted(source)&&SUCCEEDED(args->TryGetWebMessageAsString(&text))&&text){if(wcscmp(text,L"true-thrills:active")==0)activity(true);else if(wcscmp(text,L"true-thrills:idle")==0)activity(false);}
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
static LRESULT CALLBACK WindowProc(HWND h,UINT message,WPARAM w,LPARAM l){
 switch(message){
  case WM_SIZE:if(controller){RECT rect;GetClientRect(h,&rect);controller->put_Bounds(rect);}return 0;
  case WM_MOVE:if(controller)controller->NotifyParentWindowPositionChanged();return 0;
  case WM_SETFOCUS:if(controller)controller->MoveFocus(COREWEBVIEW2_MOVE_FOCUS_REASON_PROGRAMMATIC);return 0;
  case WM_COMMAND:switch(LOWORD(w)){
   case 101:if(webview&&confirmLeave()){activity(false);webview->Navigate(SITE);}break;
   case 102:if(webview&&confirmLeave()){activity(false);webview->Reload();}break;
   case 103:external(VIEWER);break;
   case 104:external(SITE);break;
   case 105:MessageBoxW(h,L"True Thrills 0.4.1\nСтудия подкастов, историй и прямых эфиров.\n\nWindows-клиент использует Microsoft Edge WebView2 и подключается к твоему True Thrills через интернет.\n\nДля входа используй тот же аккаунт ChatGPT. Если способ входа не поддерживает встроенные окна, открой веб-версию через меню «В браузере».",L"О True Thrills",MB_OK|MB_ICONINFORMATION);break;
  }return 0;
  case WM_CLOSE:if(confirmLeave())DestroyWindow(h);return 0;
  case WM_DESTROY:activity(false);if(controller){controller->Close();controller->Release();controller=nullptr;}if(webview){webview->Release();webview=nullptr;}PostQuitMessage(0);return 0;
  case WM_PAINT:{PAINTSTRUCT ps;HDC dc=BeginPaint(h,&ps);RECT r;GetClientRect(h,&r);SetBkMode(dc,TRANSPARENT);SetTextColor(dc,RGB(224,224,230));SelectObject(dc,GetStockObject(DEFAULT_GUI_FONT));DrawTextW(dc,loadingText,-1,&r,DT_CENTER|DT_VCENTER|DT_SINGLELINE);EndPaint(h,&ps);return 0;}
 }return DefWindowProcW(h,message,w,l);
}
int WINAPI wWinMain(HINSTANCE instance,HINSTANCE,LPWSTR,int show){
 HANDLE mutex=CreateMutexW(nullptr,FALSE,L"Local\\TrueThrills.Desktop.02");if(GetLastError()==ERROR_ALREADY_EXISTS){HWND existing=FindWindowW(L"TrueThrills.Desktop",nullptr);if(existing){ShowWindow(existing,SW_RESTORE);SetForegroundWindow(existing);}if(mutex)CloseHandle(mutex);return 0;}
 SetProcessDPIAware();if(FAILED(CoInitializeEx(nullptr,COINIT_APARTMENTTHREADED)))return 1;
 background=CreateSolidBrush(RGB(16,17,19));WNDCLASSEXW cls={sizeof(cls)};cls.lpfnWndProc=WindowProc;cls.hInstance=instance;cls.hCursor=LoadCursorW(nullptr,IDC_ARROW);cls.hbrBackground=background;cls.lpszClassName=L"TrueThrills.Desktop";cls.hIcon=LoadIconW(instance,MAKEINTRESOURCEW(1));cls.hIconSm=cls.hIcon;RegisterClassExW(&cls);
 HMENU menu=CreateMenu();AppendMenuW(menu,MF_STRING,101,L"Студия");AppendMenuW(menu,MF_STRING,102,L"Обновить");AppendMenuW(menu,MF_STRING,103,L"Слушатель");AppendMenuW(menu,MF_STRING,104,L"В браузере");AppendMenuW(menu,MF_STRING,105,L"О приложении");
 windowHandle=CreateWindowExW(0,cls.lpszClassName,L"True Thrills",WS_OVERLAPPEDWINDOW,CW_USEDEFAULT,CW_USEDEFAULT,1280,880,nullptr,menu,instance,nullptr);if(!windowHandle)return 1;ShowWindow(windowHandle,show);UpdateWindow(windowHandle);initialize();
 MSG msg;while(GetMessageW(&msg,nullptr,0,0)>0){TranslateMessage(&msg);DispatchMessageW(&msg);}CoUninitialize();DeleteObject(background);if(mutex)CloseHandle(mutex);return 0;
}
