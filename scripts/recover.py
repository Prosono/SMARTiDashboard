"""Offline console recovery. Requires filesystem ownership; revokes every session."""
import getpass
from app.auth import hasher
from app.config import Settings
from app.storage import Store

store = Store(Settings().database)
name = input('Existing administrator username: ').strip()
password = getpass.getpass('New password (at least 12 characters): ')
if not 12 <= len(password) <= 128 or password != getpass.getpass('Repeat password: '):
    raise SystemExit('Passwords must match and contain 12–128 characters')
with store.connect() as db:
    db.execute('BEGIN IMMEDIATE')
    user = db.execute("SELECT id FROM users WHERE name=? AND role='admin'", (name,)).fetchone()
    if not user:
        raise SystemExit('Administrator not found')
    db.execute('UPDATE users SET password=? WHERE id=?', (hasher.hash(password), user['id']))
    db.execute('DELETE FROM sessions')
print('Password updated. All sessions revoked.')
