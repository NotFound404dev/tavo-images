#!/usr/bin/env python3
import hashlib
import json
from pathlib import Path
import re
import zipfile

ROOT = Path(__file__).resolve().parent
PLUGIN = ROOT / 'src'


def main():
    manifest = json.loads((PLUGIN / 'manifest.json').read_text(encoding='utf-8'))
    version = manifest['version']
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise ValueError('Expected a numeric major.minor.patch version')
    paths = ['manifest.json', manifest['entry'], manifest['cover']]
    paths += list(manifest['localization']['resources'].values())
    paths += [item['src'] for item in manifest['contributes']['htmlFragments']]
    paths += [item['icon'] for item in manifest['contributes']['inputActions']]
    paths += ['previews/styles.jpg']
    files = {name: PLUGIN / name for name in paths}
    files.update({name: ROOT / name for name in ['LICENSE', 'CREDITS.md']})
    outdir = ROOT / 'dist'
    outdir.mkdir(exist_ok=True)
    package = outdir / f'tavo-images-{version}.tpg'
    with zipfile.ZipFile(package, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, source in sorted(files.items()):
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            archive.writestr(info, source.read_bytes(), compresslevel=9)
    digest = hashlib.sha256(package.read_bytes()).hexdigest()
    (outdir / 'SHA256SUMS').write_text(f'{digest}  {package.name}\n', encoding='utf-8')
    print(f'{package}\nSHA256 {digest}')


if __name__ == '__main__':
    main()
