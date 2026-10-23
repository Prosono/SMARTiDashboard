import sqlite3

from test_cloud import code, provision
from test_cloud_admin import setup

BODY = {"confirmation": "DELETE", "understood": True}


def customer_id(path):
    with sqlite3.connect(path) as c:
        return c.execute("SELECT id FROM accounts WHERE username='customer'").fetchone()[0]


def test_self_delete_confirmation_sessions_and_audit(tmp_path):
    app, path, staff, customer = setup(tmp_path)
    account = customer_id(path)
    route = "/api/customer/account"
    assert customer.get(route + "/deletion").json()["can_delete"]
    assert customer.request("DELETE", route, json={**BODY, "confirmation": "delete"}).status_code == 422
    assert customer.request("DELETE", route, json={**BODY, "understood": False}).status_code == 422
    assert customer.request("DELETE", route, json=BODY, headers={"X-CSRF-Token": "bad"}).status_code == 403
    result = customer.request("DELETE", route, json=BODY)
    assert result.status_code == 200, result.text
    assert result.json()["self"]
    assert customer.get("/api/session").status_code == 401
    with sqlite3.connect(path) as c:
        assert not c.execute("SELECT 1 FROM accounts WHERE id=?", (account,)).fetchone()
        assert not c.execute("PRAGMA foreign_key_check").fetchall()
    assert any(r["action"] == "account_deleted" for r in staff.get("/api/admin/audit").json())


def test_admin_delete_cleanup_and_authorization(tmp_path):
    app, path, staff, customer = setup(tmp_path)
    account = customer_id(path)
    route = "/api/admin/accounts/" + account
    assert customer.get(route + "/deletion").status_code == 403
    assert customer.request("DELETE", route, json=BODY).status_code == 403
    with sqlite3.connect(path) as c:
        staff_id = c.execute("SELECT id FROM accounts WHERE username='support'").fetchone()[0]
        c.execute(
            "INSERT INTO support_notes(account,author,text,created) VALUES(?,?,?,1)",
            (account, staff_id, "note"),
        )
        c.execute(
            "INSERT INTO support_cases(id,owner,subject,category,created,updated,billing_accepted,pricing) VALUES('case',?,'Help','other',1,1,1,'{}')",
            (account,),
        )
        c.execute(
            "INSERT INTO case_messages(ticket,author,staff,text,created) VALUES('case',?,0,'Help',1)",
            (account,),
        )
    assert staff.get(route + "/deletion").json()["can_delete"]
    result = staff.request("DELETE", route, json=BODY)
    assert result.status_code == 200, result.text
    assert not result.json()["self"]
    assert customer.get("/api/session").status_code == 401
    assert staff.get("/api/session").status_code == 200
    with sqlite3.connect(path) as c:
        for table in ("support_cases", "case_messages", "support_notes"):
            assert c.execute(f"SELECT count(*) FROM {table}").fetchone()[0] == 0
        assert not c.execute("PRAGMA foreign_key_check").fetchall()
    assert staff.request("DELETE", route, json=BODY).status_code == 404


def test_hub_added_after_eligibility_blocks_both_even_offline(tmp_path):
    app, path, staff, customer = setup(tmp_path)
    account = customer_id(path)
    assert customer.get("/api/customer/account/deletion").json()["can_delete"]
    client, home = provision(app, "Home")
    assert customer.post("/api/homes/claim", json={"code": code(client, home)}).status_code == 200
    with sqlite3.connect(path) as c:
        c.execute("UPDATE homes SET remote_enabled=0")
    for actor, route in ((customer, "/api/customer/account"), (staff, "/api/admin/accounts/" + account)):
        assert actor.get(route + "/deletion").json()["reason"] == "account_has_hubs"
        response = actor.request("DELETE", route, json=BODY)
        assert response.status_code == 409
        assert response.json()["detail"] == "account_has_hubs"
    with sqlite3.connect(path) as c:
        c.execute("UPDATE homes SET owner=NULL")
        c.execute("INSERT INTO home_members SELECT id,? FROM homes", (account,))
    assert customer.request("DELETE", "/api/customer/account", json=BODY).status_code == 409


def test_last_admin_and_role_revocation(tmp_path):
    app, path, staff, customer = setup(tmp_path)
    with sqlite3.connect(path) as c:
        staff_id = c.execute("SELECT id FROM accounts WHERE username='support'").fetchone()[0]
    route = "/api/admin/accounts/" + staff_id
    assert staff.get(route + "/deletion").json()["reason"] == "last_admin"
    assert staff.request("DELETE", route, json=BODY).status_code == 409
    assert staff.request("DELETE", "/api/customer/account", json=BODY).status_code == 409
    with sqlite3.connect(path) as c:
        c.execute("DELETE FROM portal_admins")
    assert staff.request("DELETE", "/api/admin/accounts/" + customer_id(path), json=BODY).status_code == 403


def test_profile_tokens_mail_and_energy_removed(tmp_path):
    app, path, staff, customer = setup(tmp_path)
    account = customer_id(path)
    client, home = provision(app, "Unclaimed")
    with sqlite3.connect(path) as c:
        c.execute(
            "INSERT OR REPLACE INTO customer_profiles(account,email,full_name,phone,address,postal_code,city,country,photo) VALUES(?,'gone@example.no','Test','123','Road','1','Oslo','NO','')",
            (account,),
        )
        c.execute(
            "INSERT OR REPLACE INTO customer_consents(account,marketing_updated_at) VALUES(?,1)", (account,)
        )
        c.execute(
            "INSERT INTO customer_tokens(hash,account,purpose,email,expires) VALUES('token',?,'verify','gone@example.no',9999999999)",
            (account,),
        )
        c.execute(
            "INSERT INTO mail_outbox(recipient,subject,body,created) VALUES('gone@example.no','Verify','secret',1)"
        )
        c.execute(
            "INSERT INTO customer_connections VALUES('connection',?,?,'csrf',9999999999)",
            (account, home["installation_id"]),
        )
        c.execute(
            "INSERT INTO energy_agreements VALUES(?,?, '2026-01-01','{}')", (home["installation_id"], account)
        )
    response = staff.request("DELETE", "/api/admin/accounts/" + account, json=BODY)
    assert response.status_code == 200, response.text
    with sqlite3.connect(path) as c:
        for table in (
            "customer_profiles",
            "customer_tokens",
            "customer_connections",
            "customer_consents",
            "mail_outbox",
            "energy_agreements",
        ):
            column = (
                "recipient"
                if table == "mail_outbox"
                else "owner"
                if table == "energy_agreements"
                else "account"
            )
            value = "gone@example.no" if table == "mail_outbox" else account
            assert c.execute(f"SELECT count(*) FROM {table} WHERE {column}=?", (value,)).fetchone()[0] == 0
        assert c.execute("SELECT count(*) FROM homes").fetchone()[0] == 1
        assert not c.execute("PRAGMA foreign_key_check").fetchall()
