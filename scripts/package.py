"""Create the deterministic, tracked payload used by Home Assistant's app store.

Only explicit runtime paths are bundled. No credentials, SQLite files, tests,
node_modules or virtual environments enter the app build context.
"""
import argparse
import gzip
import hashlib
import io
import json
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def files_under(path):
    return sorted(p for p in path.rglob('*') if p.is_file() and '__pycache__' not in p.parts)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def build():
    dist = ROOT / 'frontend/dist'
    if not (dist / 'index.html').is_file():
        raise SystemExit('Build the frontend first: make build')
    files = files_under(ROOT / 'backend/app') + files_under(dist) + [ROOT / 'backend/requirements.lock']
    payload = {str(p.relative_to(ROOT)): p.read_bytes() for p in files}
    sources = files_under(ROOT / 'backend/app') + files_under(ROOT / 'frontend/src') + files_under(ROOT / 'frontend/public')
    sources += [ROOT / p for p in ['backend/requirements.lock', 'frontend/package.json',
                'frontend/package-lock.json', 'frontend/index.html', 'frontend/vite.config.ts', 'frontend/tsconfig.json']]
    manifest = {
        'sources': {str(p.relative_to(ROOT)): sha(p.read_bytes()) for p in sorted(sources)},
        'payload': {name: sha(data) for name, data in sorted(payload.items())},
    }
    buffer = io.BytesIO()
    with gzip.GzipFile(filename='', mode='wb', fileobj=buffer, mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode='w', format=tarfile.USTAR_FORMAT) as archive:
            for name, data in sorted(payload.items()):
                info = tarfile.TarInfo(name)
                info.size = len(data)
                info.mode = 0o644
                info.mtime = info.uid = info.gid = 0
                archive.addfile(info, io.BytesIO(data))
    bundle = buffer.getvalue()
    manifest['bundle_sha256'] = sha(bundle)
    return bundle, (json.dumps(manifest, indent=2, sort_keys=True) + '\n').encode()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    bundle, manifest = build()
    outputs = {'payload.tar.gz': bundle, 'payload-manifest.json': manifest}
    for name, data in outputs.items():
        path = ROOT / 'ha-app' / name
        if args.check:
            if not path.exists() or path.read_bytes() != data:
                raise SystemExit(f'{name} is stale. Run make package and include the updated payload in Git.')
        else:
            path.write_bytes(data)
    print('HA app payload verified' if args.check else 'HA app payload prepared for Git and the HA app store')


if __name__ == '__main__':
    main()
