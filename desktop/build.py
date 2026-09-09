#!/usr/bin/env python3
"""Cross-compile the Windows x64 app and single-file installer with Zig 0.13.0."""
import argparse, hashlib, pathlib, shutil, subprocess, tempfile, urllib.request, zipfile

ROOT=pathlib.Path(__file__).resolve().parent
SDK_URL='https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/1.0.2903.40/microsoft.web.webview2.1.0.2903.40.nupkg'
SDK_SHA256='ef128016dd1e51c59178c827ed5b8aa3322c57afa8675d930f8109505542ad74'
p=argparse.ArgumentParser();p.add_argument('--zig',default='zig');p.add_argument('--sdk-directory');p.add_argument('--output',default=str(ROOT/'out'));a=p.parse_args()
zig=shutil.which(a.zig) or a.zig
if subprocess.check_output([zig,'version'],text=True).strip()!='0.13.0':raise SystemExit('Use Zig 0.13.0 for this pinned build.')
out=pathlib.Path(a.output).resolve();out.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory(prefix='true-thrills-build-') as temp:
 work=pathlib.Path(temp)
 if a.sdk_directory:sdk=pathlib.Path(a.sdk_directory).resolve()
 else:
  sdk=work/'sdk';sdk.mkdir();data=urllib.request.urlopen(SDK_URL,timeout=60).read()
  if hashlib.sha256(data).hexdigest()!=SDK_SHA256:raise SystemExit('SDK checksum mismatch')
  pkg=work/'sdk.nupkg';pkg.write_bytes(data)
  with zipfile.ZipFile(pkg) as z:
   for name in ['build/native/include/WebView2.h','build/native/x64/WebView2Loader.dll','LICENSE.txt']:z.extract(name,sdk)
 if a.sdk_directory:
  pkg=sdk/'sdk.nupkg'
  if not pkg.exists() or hashlib.sha256(pkg.read_bytes()).hexdigest()!=SDK_SHA256:raise SystemExit('SDK archive is missing or checksum mismatch')
 def run(*args):subprocess.run([str(x) for x in args],cwd=ROOT,check=True)
 resource=work/'client.res';run(zig,'rc','/fo',resource,'--','client.rc')
 common=[zig,'c++','-target','x86_64-windows-gnu','-std=c++17','-fms-extensions','-municode','-Wl,--subsystem,windows','-O2','-static','-s']
 libs=['-luser32','-lole32','-lshell32','-ladvapi32','-luuid','-lgdi32']
 exe=out/'TrueThrills.exe'
 run(*common,'-I',ROOT/'include','-I',sdk/'build/native/include',ROOT/'client.cpp',resource,'-o',exe,*libs)
 shutil.copy2(sdk/'build/native/x64/WebView2Loader.dll',out/'WebView2Loader.dll');shutil.copy2(sdk/'LICENSE.txt',out/'WebView2-LICENSE.txt')
 setup_rc=work/'setup.rc';base=(ROOT/'client.rc').read_text().replace('"app.ico"','"'+str(ROOT/'app.ico')+'"').replace('"app.manifest"','"'+str(ROOT/'app.manifest')+'"').replace('True Thrills Desktop','True Thrills Setup').replace('TrueThrills.exe','TrueThrills-Setup-0.9.0.exe')
 setup_rc.write_text(base+'\n100 RCDATA "'+str(exe)+'"\n101 RCDATA "'+str(out/'WebView2Loader.dll')+'"\n102 RCDATA "'+str(out/'WebView2-LICENSE.txt')+'"\n')
 setup_res=work/'setup.res';run(zig,'rc','/fo',setup_res,'--',setup_rc)
 installer=out/'TrueThrills-Setup-0.9.0.exe';run(*common,ROOT/'setup.cpp',setup_res,'-o',installer,*libs)
 print(f'Installer: {installer} ({installer.stat().st_size} bytes)')
 print(f'SHA256: {hashlib.sha256(installer.read_bytes()).hexdigest()}')
