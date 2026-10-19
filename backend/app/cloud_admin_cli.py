"""Server-only portal administrator provisioning; never exposed over HTTP."""

import argparse
import getpass
import sqlite3
import sys
import uuid

from app.cloud import PASSWORDS


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--database", default="/data/cloud.sqlite")
    parser.add_argument("--username", required=True)
    parser.add_argument("--create", action="store_true")
    parser.add_argument("--revoke", action="store_true")
    args = parser.parse_args()
    if args.create and args.revoke:
        parser.error("Choose create or revoke")
    with sqlite3.connect(args.database) as c:
        c.execute("PRAGMA foreign_keys=ON")
        row = c.execute("SELECT id FROM accounts WHERE username=?", (args.username.lower(),)).fetchone()
        if args.create:
            if row:
                parser.error("Account already exists; no changes made")
            password = (
                getpass.getpass("New password: ") if sys.stdin.isatty() else sys.stdin.readline().rstrip("\n")
            )
            if len(password) < 20:
                parser.error("Use a generated password of at least 20 characters")
            account = uuid.uuid4().hex
            c.execute(
                "INSERT INTO accounts(id,username,password) VALUES(?,?,?)",
                (account, args.username.lower(), PASSWORDS.hash(password)),
            )
        else:
            if not row:
                parser.error("Account not found")
            account = row[0]
        if args.revoke:
            c.execute("DELETE FROM portal_admins WHERE account=?", (account,))
            c.execute("DELETE FROM sessions WHERE account=?", (account,))
        else:
            c.execute("INSERT OR IGNORE INTO portal_admins(account) VALUES(?)", (account,))
    print("Administrator access revoked." if args.revoke else "Administrator account ready.")


if __name__ == "__main__":
    main()
