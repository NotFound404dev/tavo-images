#!/usr/bin/env python3
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent


def main():
    manifest = json.loads((ROOT / 'plugin_p2/manifest.json').read_text(encoding='utf-8'))
    package = ROOT / 'dist' / f'tavo-images-{manifest["version"]}.tpg'
    if not package.exists():
        subprocess.run([sys.executable, str(ROOT / 'build.py')], check=True, cwd=ROOT)
    with zipfile.ZipFile(package) as archive:
        assert archive.testzip() is None, 'Corrupted package'
        expected = {p.relative_to(ROOT / 'plugin_p2').as_posix(): p for p in (ROOT / 'plugin_p2').rglob('*') if p.is_file()}
        expected.update({name: ROOT / name for name in ['LICENSE', 'NOTICE', 'CREDITS.md']})
        assert set(archive.namelist()) == set(expected), 'Package file list differs from source'
        for name, source in expected.items():
            assert archive.read(name) == source.read_bytes(), f'Package differs: {name}'
    digest = hashlib.sha256(package.read_bytes()).hexdigest()
    assert (ROOT / 'dist/SHA256SUMS').read_text().split()[0] == digest, 'Checksum differs'
    for p in (ROOT / 'plugin_p2').rglob('*.json'):
        json.loads(p.read_text(encoding='utf-8'))
    for locale in ['ru', 'en']:
        notes = json.loads((ROOT / f'plugin_p2/locales/{locale}.json').read_text(encoding='utf-8'))['plugin.releaseNotes']
        assert notes.startswith(manifest['version'] + ':'), f'{locale}: release version differs'
        assert '\n' not in notes and len(notes) <= 5000, f'{locale}: invalid release notes'
    subprocess.run(['node', '--check', str(ROOT / 'plugin_p2/entry.js')], check=True)
    with tempfile.TemporaryDirectory(prefix='tavo-check-') as tmp:
        for p in (ROOT / 'plugin_p2/ui').glob('*.html'):
            scripts = re.findall(r'<script\b[^>]*>([\s\S]*?)</script\s*>', p.read_text(encoding='utf-8'), re.I)
            assert scripts, f'No scripts: {p.name}'
            for i, script in enumerate(scripts):
                test = Path(tmp) / f'{p.stem}-{i}.js'
                test.write_text(script, encoding='utf-8')
                subprocess.run(['node', '--check', str(test)], check=True)
    subprocess.run(['node', str(ROOT / 'tests/world-map.cjs')], check=True, cwd=ROOT)
    print('Package contents, checksum, localization and JavaScript checks passed.')


if __name__ == '__main__':
    main()
