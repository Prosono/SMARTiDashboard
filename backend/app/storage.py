"""SQLite metadata only. HA registries remain authoritative."""

import os
import sqlite3
from contextlib import contextmanager

MIGRATIONS = [
    """
CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL,
 password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','user')));
CREATE TABLE sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL,
 csrf TEXT NOT NULL, expires REAL NOT NULL);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE favorites (user_id INTEGER NOT NULL, entity_id TEXT NOT NULL,
 position INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(user_id, entity_id));
CREATE TABLE attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset REAL NOT NULL);
""",
    "ALTER TABLE favorites ADD COLUMN control_id TEXT;",
]


class Store:
    def __init__(self, path):
        self.path = path
        fd = os.open(path, os.O_CREAT | os.O_APPEND | os.O_WRONLY, 0o600)
        os.close(fd)
        os.chmod(path, 0o600)
        with self.connect() as db:
            version = db.execute("PRAGMA user_version").fetchone()[0]
            for i, migration in enumerate(MIGRATIONS[version:], version + 1):
                db.executescript("BEGIN IMMEDIATE;" + migration + f"PRAGMA user_version={i}; COMMIT;")

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            yield db
            db.commit()
        finally:
            db.close()

    def get(self, key, default=""):
        with self.connect() as db:
            row = db.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
            return row[0] if row else default

    def set(self, key, value):
        with self.connect() as db:
            db.execute("INSERT OR REPLACE INTO settings VALUES (?,?)", (key, value))
