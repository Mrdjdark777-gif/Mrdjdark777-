#!/usr/bin/env python3
"""Validate PE architecture, GUI entrypoint, resources, and installer payload integrity."""
import pathlib,struct,sys,hashlib
folder=pathlib.Path(sys.argv[1]).resolve()
def u16(b,o):return struct.unpack_from('<H',b,o)[0]
def u32(b,o):return struct.unpack_from('<I',b,o)[0]
def inspect(p):
 b=p.read_bytes();assert b[:2]==b'MZ',p
 pe=u32(b,0x3c);assert b[pe:pe+4]==b'PE\0\0';assert u16(b,pe+4)==0x8664
 opt=pe+24;assert u16(b,opt)==0x20b;assert u16(b,opt+68)==2;assert u32(b,opt+16)>0
 section=opt+u16(b,pe+20);segments=[]
 for i in range(u16(b,pe+6)):
  s=section+i*40;segments.append((u32(b,s+12),max(u32(b,s+8),u32(b,s+16)),u32(b,s+20)))
 def offset(rva):
  for start,size,raw in segments:
   if start<=rva<start+size:return raw+rva-start
  raise ValueError('Unmapped RVA')
 base=offset(u32(b,opt+112+2*8));resources={}
 def visit(relative,trail=()):
  pos=base+relative;count=u16(b,pos+12)+u16(b,pos+14)
  for i in range(count):
   name,entry=struct.unpack_from('<II',b,pos+16+i*8);key=name if not name&0x80000000 else 'named'
   if entry&0x80000000:visit(entry&0x7fffffff,trail+(key,))
   else:
    rva,size=struct.unpack_from('<II',b,base+entry);start=offset(rva);resources[trail+(key,)]=b[start:start+size]
 visit(0);assert any(k[0]==14 for k in resources),'Missing app icon'
 manifest=next(v for k,v in resources.items() if k[:2]==(24,1));assert b'level="asInvoker"' in manifest
 return b,resources
app,ar=inspect(folder/'TrueThrills.exe');setup,sr=inspect(folder/'TrueThrills-Setup-0.4.1.exe')
for id,name in [(100,'TrueThrills.exe'),(101,'WebView2Loader.dll'),(102,'WebView2-LICENSE.txt')]:
 data=next(v for k,v in sr.items() if k[:2]==(10,id));assert data==(folder/name).read_bytes(),name
print('PASS: Windows x64 PE, GUI subsystem, executable entrypoint, icon, user-level manifest, and exact embedded installer payloads.')
print('Installer SHA256:',hashlib.sha256(setup).hexdigest())
print('Windows execution and WebView2 authentication still require testing on Windows.')
