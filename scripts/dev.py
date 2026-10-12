"""Explicit localhost development only; a separate SQLite database per mode."""
import os
import secrets
import signal
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[1]
os.chdir(root)
data = root / '.data'
data.mkdir(mode=0o700, exist_ok=True)
secret_path = data / 'setup-secret.txt'
if not secret_path.exists():
    secret_path.write_text(secrets.token_urlsafe(32))
    secret_path.chmod(0o600)
env = os.environ | {'SMARTI_DEVELOPMENT': 'true', 'SMARTI_ORIGIN': 'http://localhost:5173',
                    'SMARTI_BOOTSTRAP_SECRET': secret_path.read_text().strip()}
env.setdefault('SMARTI_MODE', 'demo')
print(f'SMARTi {env["SMARTI_MODE"]}: http://localhost:5173\nSetup secret: {secret_path}', flush=True)
processes = [subprocess.Popen([str(root / '.venv/bin/python'), '-m', 'app.run'], env=env),
             subprocess.Popen(['npm', '--prefix', 'frontend', 'run', 'dev'], env=env)]
def stop(*_):
    for process in processes:
        process.terminate()
signal.signal(signal.SIGINT, stop)
signal.signal(signal.SIGTERM, stop)
try:
    processes[0].wait()
finally:
    stop()
    for process in processes:
        process.wait()
