#!/usr/bin/env python3
"""Build the dependency-free Android client with official Android SDK tools and JDK 17.

Signing material must live outside the repository. Never regenerate an existing release key.
"""
import argparse
import re
import subprocess
import tempfile
import zipfile
from pathlib import Path
import xml.etree.ElementTree as ET

p=argparse.ArgumentParser()
p.add_argument('--sdk',type=Path,required=True)
p.add_argument('--output',type=Path,required=True)
p.add_argument('--keystore',type=Path,required=True)
p.add_argument('--password-file',type=Path,required=True)
a=p.parse_args()
root=Path(__file__).resolve().parent
sdk=a.sdk.resolve(); out=a.output.resolve(); out.mkdir(parents=True,exist_ok=True)
bt=sdk/'build-tools/35.0.0'; platform=sdk/'platforms/android-35/android.jar'
gradle=(root/'app/build.gradle').read_text()
version=re.search(r"versionName '([^']+)'",gradle)[1]
code=re.search(r'versionCode (\d+)',gradle)[1]
package=re.search(r"applicationId '([^']+)'",gradle)[1]
def run(*args): subprocess.run([str(x) for x in args],check=True)
with tempfile.TemporaryDirectory(prefix='true-thrills-android-') as temp:
 w=Path(temp); classes=w/'classes'; classes.mkdir(); dex=w/'dex'; dex.mkdir()
 tree=ET.parse(root/'app/src/main/AndroidManifest.xml'); manifest=tree.getroot()
 ns='{http://schemas.android.com/apk/res/android}'
 ET.register_namespace('android',ns[1:-1]); manifest.set('package',package)
 manifest.set(ns+'versionCode',code);manifest.set(ns+'versionName',version)
 ET.SubElement(manifest,'uses-sdk',{ns+'minSdkVersion':'26',ns+'targetSdkVersion':'35'})
 tree.write(w/'AndroidManifest.xml',encoding='utf-8',xml_declaration=True)
 run(bt/'aapt2','compile','--dir',root/'app/src/main/res','-o',w/'resources.zip')
 run(bt/'aapt2','link','-o',w/'unsigned.apk','-I',platform,'--manifest',w/'AndroidManifest.xml',w/'resources.zip')
 run('java','com.sun.tools.javac.Main','-source','8','-target','8','-bootclasspath',str(bt/'core-lambda-stubs.jar')+':'+str(platform),'-d',classes,*sorted((root/'app/src/main/java').rglob('*.java')))
 with zipfile.ZipFile(w/'classes.jar','w') as z:
  for f in sorted(classes.rglob('*.class')): z.write(f,f.relative_to(classes))
 run('java','-cp',bt/'lib/d8.jar','com.android.tools.r8.D8','--release','--min-api','26','--lib',platform,'--output',dex,w/'classes.jar')
 with zipfile.ZipFile(w/'unsigned.apk','a') as z:
  for f in sorted(dex.glob('*.dex')):z.write(f,f.name)
 run(bt/'zipalign','-f','4',w/'unsigned.apk',w/'aligned.apk')
 apk=out/f'TrueThrills-Android-{version}.apk'
 run('java','-jar',bt/'lib/apksigner.jar','sign','--ks',a.keystore.resolve(),'--ks-key-alias','truethrills','--ks-pass','file:'+str(a.password_file.resolve()),'--v4-signing-enabled','false','--out',apk,w/'aligned.apk')
 run('java','-jar',bt/'lib/apksigner.jar','verify','--verbose','--print-certs',apk)
 run(bt/'zipalign','-c','4',apk)
 run(bt/'aapt','dump','badging',apk)
 print('Built:',apk)
