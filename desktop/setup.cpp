#define UNICODE
#define _UNICODE
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shellapi.h>
#include <shlobj.h>
#include <wchar.h>

static const wchar_t* REGKEY=L"Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\TrueThrills";
static wchar_t appDir[MAX_PATH],desktopLink[MAX_PATH],menuLink[MAX_PATH];
static void message(const wchar_t* text,bool error=false){MessageBoxW(nullptr,text,L"True Thrills — установка",MB_OK|(error?MB_ICONERROR:MB_ICONINFORMATION));}
static bool join(wchar_t* out,const wchar_t* base,const wchar_t* file){if(wcslen(base)+wcslen(file)+2>=MAX_PATH)return false;wcscpy(out,base);wcscat(out,L"\\");wcscat(out,file);return true;}
static bool paths(){wchar_t base[MAX_PATH];if(FAILED(SHGetFolderPathW(nullptr,CSIDL_LOCAL_APPDATA,nullptr,0,base)))return false;if(!join(appDir,base,L"Programs\\TrueThrills"))return false;if(FAILED(SHGetFolderPathW(nullptr,CSIDL_DESKTOPDIRECTORY,nullptr,0,base))||!join(desktopLink,base,L"True Thrills.lnk"))return false;if(FAILED(SHGetFolderPathW(nullptr,CSIDL_PROGRAMS,nullptr,0,base))||!join(menuLink,base,L"True Thrills.lnk"))return false;return true;}
static bool payload(HINSTANCE self,int id,const wchar_t* name){
 HRSRC r=FindResourceW(self,MAKEINTRESOURCEW(id),RT_RCDATA);if(!r)return false;HGLOBAL h=LoadResource(self,r);if(!h)return false;void* data=LockResource(h);DWORD size=SizeofResource(self,r),written=0;wchar_t path[MAX_PATH];if(!join(path,appDir,name))return false;
 HANDLE file=CreateFileW(path,GENERIC_WRITE,0,nullptr,CREATE_ALWAYS,FILE_ATTRIBUTE_NORMAL,nullptr);if(file==INVALID_HANDLE_VALUE)return false;bool ok=WriteFile(file,data,size,&written,nullptr)&&written==size;CloseHandle(file);return ok;
}
static bool shortcut(const wchar_t* path,const wchar_t* target){IShellLinkW* link=nullptr;HRESULT hr=CoCreateInstance(CLSID_ShellLink,nullptr,CLSCTX_INPROC_SERVER,IID_IShellLinkW,reinterpret_cast<void**>(&link));if(FAILED(hr))return false;link->SetPath(target);link->SetWorkingDirectory(appDir);link->SetDescription(L"True Thrills — студия подкастов");link->SetIconLocation(target,0);IPersistFile* file=nullptr;hr=link->QueryInterface(IID_IPersistFile,reinterpret_cast<void**>(&file));if(SUCCEEDED(hr)){hr=file->Save(path,TRUE);file->Release();}link->Release();return SUCCEEDED(hr);}
static bool setString(HKEY key,const wchar_t* name,const wchar_t* value){return RegSetValueExW(key,name,0,REG_SZ,reinterpret_cast<const BYTE*>(value),static_cast<DWORD>((wcslen(value)+1)*sizeof(wchar_t)))==ERROR_SUCCESS;}
static bool registerApp(const wchar_t* executable,const wchar_t* uninstaller){HKEY key;if(RegCreateKeyExW(HKEY_CURRENT_USER,REGKEY,0,nullptr,0,KEY_WRITE,nullptr,&key,nullptr)!=ERROR_SUCCESS)return false;wchar_t command[MAX_PATH+30];wcscpy(command,L"\"");wcscat(command,uninstaller);wcscat(command,L"\" --uninstall");bool ok=setString(key,L"DisplayName",L"True Thrills")&&setString(key,L"DisplayVersion",L"0.4.1")&&setString(key,L"Publisher",L"True Thrills")&&setString(key,L"InstallLocation",appDir)&&setString(key,L"DisplayIcon",executable)&&setString(key,L"UninstallString",command);DWORD yes=1;RegSetValueExW(key,L"NoModify",0,REG_DWORD,reinterpret_cast<BYTE*>(&yes),sizeof(yes));RegSetValueExW(key,L"NoRepair",0,REG_DWORD,reinterpret_cast<BYTE*>(&yes),sizeof(yes));RegCloseKey(key);return ok;}
static bool deleteKnown(const wchar_t* name){wchar_t p[MAX_PATH];if(!join(p,appDir,name))return false;for(int i=0;i<12;i++){if(DeleteFileW(p)||GetLastError()==ERROR_FILE_NOT_FOUND)return true;Sleep(250);}return false;}
static int removeApp(){
 if(FindWindowW(L"TrueThrills.Desktop",nullptr)){message(L"Сначала закрой окно True Thrills. Затем повтори удаление.",true);return 1;}
 Sleep(700);bool ok=true;ok=deleteKnown(L"TrueThrills.exe")&&ok;ok=deleteKnown(L"WebView2Loader.dll")&&ok;ok=deleteKnown(L"WebView2-LICENSE.txt")&&ok;ok=deleteKnown(L"Uninstall.exe")&&ok;
 if(ok){DeleteFileW(desktopLink);DeleteFileW(menuLink);RegDeleteKeyW(HKEY_CURRENT_USER,REGKEY);RemoveDirectoryW(appDir);message(L"True Thrills удалён.\n\nПодкасты на сервере и локальные черновики сохранены. Данные WebView2 остаются в папке %LOCALAPPDATA%\\TrueThrills.");}else message(L"Не все файлы удалось удалить. Закрой True Thrills и повтори удаление. Твои подкасты и черновики не затронуты.",true);return ok?0:1;
}
static int beginRemove(){
 if(MessageBoxW(nullptr,L"Удалить True Thrills с этого компьютера?\n\nПодкасты на сервере и локальные черновики будут сохранены.",L"Удаление True Thrills",MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2)!=IDYES)return 0;
 wchar_t self[MAX_PATH],tempDir[MAX_PATH],copy[MAX_PATH];GetModuleFileNameW(nullptr,self,MAX_PATH);if(!GetTempPathW(MAX_PATH,tempDir)||!GetTempFileNameW(tempDir,L"TTh",0,copy)||!CopyFileW(self,copy,FALSE)){message(L"Не удалось запустить удаление.",true);return 1;}
 // A temporary helper permits the installed uninstaller to be deleted without a shell.
 wchar_t command[MAX_PATH+40];wcscpy(command,L"\"");wcscat(command,copy);wcscat(command,L"\" --remove");STARTUPINFOW si={sizeof(si)};PROCESS_INFORMATION pi={};if(!CreateProcessW(copy,command,nullptr,nullptr,FALSE,0,nullptr,nullptr,&si,&pi)){DeleteFileW(copy);message(L"Не удалось запустить удаление.",true);return 1;}CloseHandle(pi.hThread);CloseHandle(pi.hProcess);return 0;
}
int WINAPI wWinMain(HINSTANCE self,HINSTANCE,LPWSTR args,int){
 if(!paths()){message(L"Не удалось определить папки пользователя.",true);return 1;}CoInitializeEx(nullptr,COINIT_APARTMENTTHREADED);
 if(wcscmp(args,L"--remove")==0){int r=removeApp();CoUninitialize();return r;}if(wcscmp(args,L"--uninstall")==0){int r=beginRemove();CoUninitialize();return r;}
 if(FindWindowW(L"TrueThrills.Desktop",nullptr)){message(L"Перед установкой закрой окно True Thrills. Если идёт запись или эфир, сначала заверши их.",true);CoUninitialize();return 1;}
 if(MessageBoxW(nullptr,L"Установить True Thrills 0.4.1 для Windows 10/11 (64-bit)?\n\nБудут созданы ярлыки на рабочем столе и в меню «Пуск». Права администратора не нужны.\n\nПриложению нужны интернет и Microsoft Edge WebView2 Runtime. Записанные подкасты остаются в твоём аккаунте.",L"Установка True Thrills",MB_YESNO|MB_ICONINFORMATION)!=IDYES){CoUninitialize();return 0;}
 int created=SHCreateDirectoryExW(nullptr,appDir,nullptr);if(created!=ERROR_SUCCESS&&created!=ERROR_ALREADY_EXISTS&&created!=ERROR_FILE_EXISTS){message(L"Не удалось создать папку установки.",true);CoUninitialize();return 1;}
 if(!payload(self,100,L"TrueThrills.exe")||!payload(self,101,L"WebView2Loader.dll")||!payload(self,102,L"WebView2-LICENSE.txt")){message(L"Не удалось записать файлы. Проверь свободное место и закрой приложение, если оно запущено.",true);CoUninitialize();return 1;}
 wchar_t source[MAX_PATH],uninstaller[MAX_PATH],exe[MAX_PATH];GetModuleFileNameW(nullptr,source,MAX_PATH);join(uninstaller,appDir,L"Uninstall.exe");join(exe,appDir,L"TrueThrills.exe");
 if(!CopyFileW(source,uninstaller,FALSE)||!shortcut(desktopLink,exe)||!shortcut(menuLink,exe)||!registerApp(exe,uninstaller)){message(L"Файлы приложения сохранены, но не удалось завершить настройку ярлыков или удаления. Повтори установку.",true);CoUninitialize();return 1;}
 if(MessageBoxW(nullptr,L"True Thrills установлен.\n\nОткрыть приложение? При первом запуске войди в свой аккаунт ChatGPT.",L"Установка завершена",MB_YESNO|MB_ICONINFORMATION)==IDYES)ShellExecuteW(nullptr,L"open",exe,nullptr,appDir,SW_SHOWNORMAL);
 CoUninitialize();return 0;
}
