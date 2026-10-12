"""Stage a self-contained HA app context; never copy .env, DBs or dependencies."""
import shutil
from pathlib import Path
root = Path(__file__).resolve().parents[1]
for folder in ['backend', 'frontend']:
    source = root / folder
    destination = root / 'ha-app' / folder
    destination.mkdir(exist_ok=True)
    if folder == 'backend':
        shutil.copytree(source / 'app', destination / 'app', dirs_exist_ok=True,
                        ignore=shutil.ignore_patterns('__pycache__'))
        for file in ['pyproject.toml', 'requirements.lock']:
            shutil.copy2(source / file, destination / file)
    else:
        shutil.copytree(source / 'dist', destination / 'dist', dirs_exist_ok=True)
print('HA build context prepared: ha-app/')
