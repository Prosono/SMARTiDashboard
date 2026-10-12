"""Initialize only the isolated Docker demo database, without resetting an existing owner."""
import json
import secrets
from pathlib import Path

from app.auth import Auth
from app.config import Settings
from app.mobile import MobileAuth
from app.storage import Store

settings = Settings(_env_file=None, mode='demo', data_dir='/data', bootstrap_secret=secrets.token_urlsafe(32))
store = Store(settings.database)
home_id = Path('/provision/home-id').read_text().strip()
with store.connect() as db:
    db.execute("INSERT OR IGNORE INTO settings(key,value) VALUES ('installation_id',?)", (home_id,))
assert MobileAuth(store).installation_id == home_id, 'Use the original pilot directory with this database'
auth = Auth(store, settings)
if not auth.ready():
    owner = json.loads(Path('/secrets/owner.json').read_text())
    auth.bootstrap(owner['name'], owner['password'], settings.bootstrap_secret)
print('Isolated demo installation initialized')
