#!/usr/bin/env python3
"""Convert the owner's transparent PNG into app icon sizes without flattening alpha.

Usage: python3 scripts/build-icons.py /path/to/original.png
Requires Pillow. This script never removes backgrounds or redraws artwork.
"""
import argparse
import shutil
from pathlib import Path

from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('png', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
source = args.png.resolve()
with Image.open(source) as image:
    if image.format != 'PNG' or image.width != image.height:
        raise SystemExit('Expected a square PNG.')
    logo = image.convert('RGBA')
if logo.getchannel('A').getextrema() != (0, 255):
    raise SystemExit('Expected real transparent and opaque pixels; source was not changed.')

master = root / 'public/brand/true-thrills-original.png'
if source != master.resolve():
    shutil.copyfile(source, master)

res = 'android/app/src/main/res/'
targets = {
    'public/brand/logo.png': 256,
    'public/icon-192.png': 192,
    'public/icon-512.png': 512,
    res + 'drawable-nodpi/app_logo.png': 512,
    res + 'drawable/app_icon.png': 192,
}
for density, size in [('mdpi',48), ('hdpi',72), ('xhdpi',96), ('xxhdpi',144), ('xxxhdpi',192)]:
    targets[res + f'mipmap-{density}/ic_launcher.png'] = size
for name, size in targets.items():
    path = root / name
    path.parent.mkdir(parents=True, exist_ok=True)
    # RGBA resizing preserves alpha; no solid canvas or background is introduced.
    logo.resize((size, size), Image.Resampling.LANCZOS).save(path, optimize=True)
    with Image.open(path) as result:
        assert result.getchannel('A').getextrema() == (0, 255), name

for name in ['desktop/app.ico', 'public/favicon.ico']:
    path = root / name
    logo.save(path, format='ICO', sizes=[(s,s) for s in [16,24,32,48,64,128,256]])
    with Image.open(path) as result:
        for size in result.ico.sizes():
            assert result.ico.getimage(size).convert('RGBA').getchannel('A').getextrema() == (0,255), (name,size)
print(f'Converted {len(targets)} PNG icons and 2 ICO files; alpha verified at every size.')
