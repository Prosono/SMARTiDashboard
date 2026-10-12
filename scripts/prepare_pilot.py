"""Create isolated pilot secrets and certificates. Never overwrites an existing pilot."""
import argparse
import json
import os
from pathlib import Path
import secrets
import subprocess
import uuid

parser = argparse.ArgumentParser()
parser.add_argument('directory', type=Path)
args = parser.parse_args()
root = args.directory.resolve()
root.mkdir(mode=0o700, parents=True, exist_ok=False)
os.chmod(root, 0o700)
for name in ('home-tls', 'relay-tls', 'secrets', 'public'):
    (root / name).mkdir(mode=0o700)
for name, host in [('home', 'mobile'), ('relay', 'relay')]:
    directory = root / (name + '-tls')
    subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '7',
                    '-keyout', str(directory / 'server.key'), '-out', str(directory / 'server.crt'),
                    '-subj', '/CN=localhost', '-addext', f'subjectAltName=DNS:localhost,DNS:{host},IP:127.0.0.1'],
                   check=True, capture_output=True)
    # Each file is bind-mounted separately into non-root containers; parent dirs stay 0700 on host.
    os.chmod(directory / 'server.key', 0o644)
    (root / 'public' / (name + '.crt')).write_bytes((directory / 'server.crt').read_bytes())
(root / 'public' / 'home-id').write_text(str(uuid.uuid4()))
(root / 'secrets' / 'connector-token').write_text(secrets.token_urlsafe(48))
(root / 'secrets' / 'owner.json').write_text(json.dumps({'name': 'pilot-owner', 'password': secrets.token_urlsafe(24)}))
for path in (root / 'public').iterdir():
    os.chmod(path, 0o644)
for path in (root / 'secrets').iterdir():
    os.chmod(path, 0o644)
(root / 'compose.env').write_text('SMARTI_PILOT_DIR=' + str(root) + '\n')
print(f'Pilot prepared in {root}. Secrets are inside this private directory; do not commit or share them.')
