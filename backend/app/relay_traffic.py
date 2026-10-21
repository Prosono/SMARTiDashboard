"""Daily opaque TLS byte counters. No payload, URL, IP or user information is stored."""

import sqlite3
import time
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from pathlib import Path


class TrafficMeter:
    def __init__(self, path):
        self.path = path
        self.pending = defaultdict(lambda: [0, 0, 0])
        with sqlite3.connect(path) as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS daily(home TEXT, day TEXT, to_hub INTEGER NOT NULL,
                    from_hub INTEGER NOT NULL, connections INTEGER NOT NULL, PRIMARY KEY(home,day));
                CREATE TABLE IF NOT EXISTS metadata(id INTEGER PRIMARY KEY, started REAL, updated REAL);
            """)
            db.execute("INSERT OR IGNORE INTO metadata VALUES(1,?,?)", (time.time(), time.time()))

    def record(self, home, direction, size):
        day = datetime.now(UTC).date().isoformat()
        self.pending[(home, day)][{"to_hub": 0, "from_hub": 1, "connections": 2}[direction]] += size

    def flush(self):
        # Called on the relay event loop; no awaits between snapshot and commit.
        with sqlite3.connect(self.path, timeout=1) as db:
            for (home, day), counts in self.pending.items():
                db.execute(
                    """INSERT INTO daily VALUES(?,?,?,?,?) ON CONFLICT(home,day) DO UPDATE SET
                    to_hub=to_hub+excluded.to_hub, from_hub=from_hub+excluded.from_hub,
                    connections=connections+excluded.connections""",
                    (home, day, *counts),
                )
            db.execute("UPDATE metadata SET updated=? WHERE id=1", (time.time(),))
            cutoff = (datetime.now(UTC).date() - timedelta(days=90)).isoformat()
            db.execute("DELETE FROM daily WHERE day<?", (cutoff,))
        self.pending.clear()


def traffic_report(path, days):
    today = datetime.now(UTC).date()
    dates = [(today - timedelta(days=i)).isoformat() for i in reversed(range(days))]
    empty = {"available": False, "days": days, "daily": [], "hubs": {}}
    if not path or not Path(path).is_file():
        return empty
    try:
        with sqlite3.connect(Path(path).resolve().as_uri() + "?mode=ro", uri=True, timeout=1) as db:
            db.row_factory = sqlite3.Row
            meta = db.execute("SELECT started,updated FROM metadata WHERE id=1").fetchone()
            rows = db.execute("SELECT * FROM daily WHERE day>=? AND day<=?", (dates[0], dates[-1])).fetchall()
    except sqlite3.Error:
        return empty
    if not meta:
        return empty

    def blank(day):
        return {"day": day, "to_hub": 0, "from_hub": 0, "connections": 0}

    daily = {d: blank(d) for d in dates}
    hubs = {}
    for row in rows:
        home = hubs.setdefault(
            row["home"], {"to_hub": 0, "from_hub": 0, "connections": 0, "daily": {d: blank(d) for d in dates}}
        )
        for key in ("to_hub", "from_hub", "connections"):
            daily[row["day"]][key] += row[key]
            home[key] += row[key]
            home["daily"][row["day"]][key] += row[key]
    for h in hubs.values():
        h["daily"] = list(h["daily"].values())
    return {
        "available": True,
        "stale": meta["updated"] < time.time() - 60,
        **dict(meta),
        "days": days,
        "daily": list(daily.values()),
        "hubs": hubs,
    }
