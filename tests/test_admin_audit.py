import os
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient
from backend.main import app

os.environ["RAZORPAY_KEY_ID"] = "rzp_test_dummy_123"
os.environ["RAZORPAY_KEY_SECRET"] = "dummy_secret_123"

client = TestClient(app)

class AsyncCursorMock:
    """Mock for Motor async cursor that supports async-iteration and chaining."""
    def __init__(self, docs):
        self.docs = docs

    def sort(self, *args, **kwargs):
        return self

    def skip(self, *args, **kwargs):
        return self

    def limit(self, *args, **kwargs):
        return self

    def __aiter__(self):
        return self._iter_docs()

    async def _iter_docs(self):
        for doc in self.docs:
            yield doc


@pytest.fixture
def mock_collections():
    mock_audit = AsyncMock()
    mock_admins = AsyncMock()
    mock_users = AsyncMock()
    mock_foods = AsyncMock()
    mock_transactions = AsyncMock()

    with patch("routes.admin._get_audit_logs_collection", return_value=mock_audit), \
         patch("backend.routes.admin._get_audit_logs_collection", return_value=mock_audit), \
         patch("routes.admin._get_admins_collection", return_value=mock_admins), \
         patch("backend.routes.admin._get_admins_collection", return_value=mock_admins), \
         patch("routes.admin._get_users_collection", return_value=mock_users), \
         patch("backend.routes.admin._get_users_collection", return_value=mock_users), \
         patch("routes.admin._get_foods_collection", return_value=mock_foods), \
         patch("backend.routes.admin._get_foods_collection", return_value=mock_foods), \
         patch("routes.admin._get_transactions_collection", return_value=mock_transactions), \
         patch("backend.routes.admin._get_transactions_collection", return_value=mock_transactions), \
         patch("routes.admin.log_system_event", new=AsyncMock()), \
         patch("backend.routes.admin.log_system_event", new=AsyncMock()):
        yield {
            "audit": mock_audit,
            "admins": mock_admins,
            "users": mock_users,
            "foods": mock_foods,
            "transactions": mock_transactions,
        }

@pytest.fixture
def super_admin_auth(mock_collections):
    mock_admins = mock_collections["admins"]
    mock_admins.find_one.return_value = {
        "_id": "mock_super_admin_id",
        "email": "farhanahmad2106@gmail.com",
        "is_super_admin": True,
        "permissions": {
            "canManageAdmins": True,
            "canApproveFoods": True,
            "canManageUsers": True,
            "canViewLogs": True,
        }
    }
    return {"Authorization": "Bearer test_super_admin"}

@pytest.fixture
def normal_admin_auth(mock_collections):
    mock_admins = mock_collections["admins"]
    mock_admins.find_one.return_value = {
        "_id": "mock_normal_admin_id",
        "email": "moderator@zsehealth.internal",
        "is_super_admin": False,
        "permissions": {
            "canManageAdmins": False,
            "canApproveFoods": True,
            "canManageUsers": False,
            "canViewLogs": False,
        }
    }
    with patch("routes.admin.firebase_auth.verify_id_token", return_value={"uid": "mod_uid", "email": "moderator@zsehealth.internal"}), \
         patch("backend.routes.admin.firebase_auth.verify_id_token", return_value={"uid": "mod_uid", "email": "moderator@zsehealth.internal"}):
        yield {"Authorization": "Bearer mock_normal_admin"}

# --- AUTH & CLEARANCE TESTS ---

def test_audit_logs_unauthenticated():
    res = client.get("/api/admin/audit-logs")
    assert res.status_code == 401

def test_audit_logs_forbidden_for_normal_admin(normal_admin_auth):
    res = client.get("/api/admin/audit-logs", headers=normal_admin_auth)
    assert res.status_code == 403

def test_audit_logs_export_forbidden_for_normal_admin(normal_admin_auth):
    res = client.get("/api/admin/audit-logs/export", headers=normal_admin_auth)
    assert res.status_code == 403

# --- AUDIT RETRIEVAL & FILTERING TESTS ---

def test_audit_logs_list_success(super_admin_auth, mock_collections):
    mock_audit = mock_collections["audit"]
    mock_audit.count_documents = AsyncMock(return_value=2)

    fake_docs = [
        {
            "_id": "log_1",
            "event_id": "evt_001",
            "schema_version": 1,
            "timestamp": "2026-09-23T12:00:00Z",
            "admin_email": "farhanahmad2106@gmail.com",
            "action": "FOOD_APPROVED",
            "target_resource_type": "food",
            "target_resource_id": "food_123",
            "details": {"food_name": "Paneer Tikka"}
        },
        {
            "_id": "log_2",
            "event_id": "evt_002",
            "schema_version": 1,
            "timestamp": "2026-09-23T12:05:00Z",
            "admin_email": "farhanahmad2106@gmail.com",
            "action": "USER_QUOTA_RESET",
            "target_resource_type": "user",
            "target_resource_id": "user_456",
            "details": {"reason": "Support override"}
        }
    ]
    mock_audit.find = MagicMock(return_value=AsyncCursorMock(fake_docs))

    res = client.get("/api/admin/audit-logs?skip=0&limit=25", headers=super_admin_auth)
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 2
    assert len(data["items"]) == 2
    assert data["items"][0]["action"] == "FOOD_APPROVED"
    assert data["items"][1]["action"] == "USER_QUOTA_RESET"

def test_audit_logs_export_csv(super_admin_auth, mock_collections):
    mock_audit = mock_collections["audit"]
    fake_docs = [
        {
            "_id": "log_export_1",
            "event_id": "evt_export_001",
            "schema_version": 1,
            "timestamp": "2026-09-23T14:30:00Z",
            "admin_email": "farhanahmad2106@gmail.com",
            "action": "SUBSCRIPTION_REFUNDED",
            "target_resource_type": "subscription",
            "target_resource_id": "pay_test123",
            "ip_address": "127.0.0.1",
            "details": {"amount_paise": 49900, "refund_id": "rfnd_abc"}
        }
    ]
    mock_audit.find = MagicMock(return_value=AsyncCursorMock(fake_docs))

    res = client.get("/api/admin/audit-logs/export", headers=super_admin_auth)
    assert res.status_code == 200
    assert "text/csv" in res.headers["content-type"]
    assert "attachment; filename=" in res.headers["content-disposition"]
    csv_text = res.text
    assert "event_id,timestamp,action,admin_email" in csv_text
    assert "SUBSCRIPTION_REFUNDED" in csv_text
    assert "pay_test123" in csv_text

# --- MUTATION INSTRUMENTATION TESTS ---

def test_food_approval_audit_logged(super_admin_auth, mock_collections):
    mock_foods = mock_collections["foods"]
    mock_audit = mock_collections["audit"]

    food_oid = "507f1f77bcf86cd799439011"
    mock_foods.find_one.return_value = {
        "_id": food_oid,
        "name": "Organic Shimla Apple",
        "verification_status": "pending"
    }
    mock_foods.update_one = AsyncMock(return_value=MagicMock(matched_count=1, modified_count=1))
    mock_audit.insert_one = AsyncMock()

    res = client.post(f"/api/admin/foods/{food_oid}/approve", json={
        "action": "approve"
    }, headers=super_admin_auth)

    assert res.status_code == 200
    assert mock_audit.insert_one.called
    audit_args = mock_audit.insert_one.call_args[0][0]
    assert audit_args["action"] == "FOOD_APPROVED"
    assert audit_args["target_resource_id"] == food_oid
    assert audit_args["admin_email"] == "farhanahmad2106@gmail.com"

def test_quota_reset_audit_logged(super_admin_auth, mock_collections):
    mock_users = mock_collections["users"]
    mock_audit = mock_collections["audit"]

    mock_users.find_one.return_value = {
        "_id": "user_ram_01",
        "email": "ram@example.com",
        "ai_scan_count": 15
    }
    mock_users.update_one = AsyncMock(return_value=MagicMock(matched_count=1, modified_count=1))
    mock_audit.insert_one = AsyncMock()

    res = client.post("/api/admin/users/user_ram_01/reset-quota?reason=Technical+support+courtesy+reset", headers=super_admin_auth)

    assert res.status_code == 200
    assert mock_audit.insert_one.called
    audit_args = mock_audit.insert_one.call_args[0][0]
    assert audit_args["action"] == "USER_QUOTA_RESET"
    assert audit_args["target_resource_id"] == "user_ram_01"
    assert audit_args["details"]["reason"] == "Technical support courtesy reset"

def test_user_ban_audit_logged(super_admin_auth, mock_collections):
    mock_users = mock_collections["users"]
    mock_audit = mock_collections["audit"]

    mock_users.find_one.return_value = {
        "_id": "user_bad_actor_99",
        "email": "spammer@example.com",
        "is_banned": False
    }
    mock_users.update_one = AsyncMock(return_value=MagicMock(matched_count=1, modified_count=1))
    mock_audit.insert_one = AsyncMock()

    res = client.post("/api/admin/users/user_bad_actor_99/toggle-ban?reason=Terms+of+service+violation", headers=super_admin_auth)

    assert res.status_code == 200
    assert mock_audit.insert_one.called
    audit_args = mock_audit.insert_one.call_args[0][0]
    assert audit_args["action"] == "USER_BANNED"
    assert audit_args["target_resource_id"] == "user_bad_actor_99"
    assert audit_args["details"]["reason"] == "Terms of service violation"

def test_admin_invite_audit_logged(super_admin_auth, mock_collections):
    mock_admins = mock_collections["admins"]
    mock_audit = mock_collections["audit"]

    mock_admins.find_one.side_effect = [
        # 1. get_current_admin check
        {
            "_id": "mock_super_admin_id",
            "email": "farhanahmad2106@gmail.com",
            "is_super_admin": True,
            "permissions": {"canManageAdmins": True}
        },
        # 2. check existing admin by email
        None
    ]
    mock_admins.insert_one = AsyncMock(return_value=MagicMock(inserted_id="new_adm_101"))
    mock_audit.insert_one = AsyncMock()

    res = client.post("/api/admin/team/invite", json={
        "email": "newadmin@zsehealth.internal",
        "name": "Junior Admin",
        "permissions": {
            "canApproveFoods": True,
            "canManageUsers": False,
            "canViewLogs": True,
            "canManageAdmins": False,
            "canTriggerOTA": False
        }
    }, headers=super_admin_auth)

    assert res.status_code == 200
    assert mock_audit.insert_one.called
    audit_args = mock_audit.insert_one.call_args[0][0]
    assert audit_args["action"] == "ADMIN_INVITED"
    assert audit_args["target_resource_id"] == "newadmin@zsehealth.internal"

def test_admin_sensitive_data_sanitization():
    from backend.routes.admin import _sanitize_audit_details
    raw_details = {
        "user_email": "test@example.com",
        "password": "supersecretpassword123",
        "admin_api_key": "key_abcdef123456",
        "access_token": "jwt.header.payload.signature",
        "razorpay_secret": "rzp_secret_999",
        "card_cvv": "123",
        "safe_field": 42
    }
    sanitized = _sanitize_audit_details(raw_details)
    assert "password" not in sanitized
    assert "admin_api_key" not in sanitized
    assert "access_token" not in sanitized
    assert "razorpay_secret" not in sanitized
    assert "card_cvv" not in sanitized
    assert sanitized["safe_field"] == 42
    assert sanitized["user_email"] == "test@example.com"


def test_food_rejection_audit_logged(super_admin_auth, mock_collections):
    mock_foods = mock_collections["foods"]
    mock_audit = mock_collections["audit"]

    food_oid = "507f1f77bcf86cd799439012"
    mock_foods.find_one.return_value = {
        "_id": food_oid,
        "name": "Unverified Street Chaat",
        "verification_status": "pending"
    }
    mock_foods.update_one = AsyncMock(return_value=MagicMock(matched_count=1, modified_count=1))
    mock_audit.insert_one = AsyncMock()

    res = client.post(
        f"/api/admin/foods/{food_oid}/reject",
        json={"action": "reject", "rejection_reason": "Contains undeclared artificial dye"},
        headers=super_admin_auth
    )

    assert res.status_code == 200
    assert mock_audit.insert_one.called
    audit_args = mock_audit.insert_one.call_args[0][0]
    assert audit_args["action"] == "FOOD_REJECTED"
    assert audit_args["target_resource_id"] == food_oid
    assert audit_args["details"]["reason"] == "Contains undeclared artificial dye"
    assert audit_args["admin_email"] == "farhanahmad2106@gmail.com"


def test_user_unban_audit_logged(super_admin_auth, mock_collections):
    mock_users = mock_collections["users"]
    mock_audit = mock_collections["audit"]

    mock_users.find_one.return_value = {
        "_id": "user_rehabilitated_42",
        "email": "rehab@example.com",
        "is_banned": True
    }
    mock_users.update_one = AsyncMock(return_value=MagicMock(matched_count=1, modified_count=1))
    mock_audit.insert_one = AsyncMock()

    res = client.post("/api/admin/users/user_rehabilitated_42/toggle-ban", headers=super_admin_auth)

    assert res.status_code == 200
    assert mock_audit.insert_one.called
    audit_args = mock_audit.insert_one.call_args[0][0]
    assert audit_args["action"] == "USER_UNBANNED"
    assert audit_args["target_resource_id"] == "user_rehabilitated_42"
    assert audit_args["details"]["new_banned"] is False


def test_admin_permissions_updated_audit_logged(super_admin_auth, mock_collections):
    from bson import ObjectId
    mock_admins = mock_collections["admins"]
    mock_audit = mock_collections["audit"]

    target_oid = ObjectId("507f1f77bcf86cd799439099")
    mock_admins.find_one.side_effect = [
        # Call 1: get_current_admin caller check
        {
            "_id": "mock_super_admin_id",
            "email": "farhanahmad2106@gmail.com",
            "is_super_admin": True,
            "permissions": {"canManageAdmins": True}
        },
        # Call 2: target admin to update
        {
            "_id": target_oid,
            "email": "mod1@zsehealth.internal",
            "is_super_admin": False,
            "permissions": {"canApproveFoods": False, "canManageUsers": False}
        },
        # Call 3: updated target admin read
        {
            "_id": target_oid,
            "email": "mod1@zsehealth.internal",
            "is_super_admin": False,
            "permissions": {"canApproveFoods": True, "canManageUsers": True}
        }
    ]
    mock_admins.update_one = AsyncMock(return_value=MagicMock(matched_count=1, modified_count=1))
    mock_audit.insert_one = AsyncMock()

    res = client.patch(
        f"/api/admin/team/{str(target_oid)}",
        json={"permissions": {"canApproveFoods": True, "canManageUsers": True}},
        headers=super_admin_auth
    )

    assert res.status_code == 200
    assert mock_audit.insert_one.called
    audit_args = mock_audit.insert_one.call_args[0][0]
    assert audit_args["action"] == "ADMIN_PERMISSIONS_UPDATED"
    assert audit_args["target_resource_id"] == "mod1@zsehealth.internal"
    assert audit_args["details"]["updated_permissions"]["canApproveFoods"] is True


def test_admin_revoked_audit_logged(super_admin_auth, mock_collections):
    from bson import ObjectId
    mock_admins = mock_collections["admins"]
    mock_audit = mock_collections["audit"]

    target_oid = ObjectId("507f1f77bcf86cd799439088")
    mock_admins.find_one.side_effect = [
        # Call 1: get_current_admin caller check
        {
            "_id": "mock_super_admin_id",
            "email": "farhanahmad2106@gmail.com",
            "is_super_admin": True,
            "permissions": {"canManageAdmins": True}
        },
        # Call 2: target admin to delete
        {
            "_id": target_oid,
            "email": "terminated@zsehealth.internal",
            "is_super_admin": False,
        }
    ]
    mock_admins.delete_one = AsyncMock(return_value=MagicMock(deleted_count=1))
    mock_audit.insert_one = AsyncMock()

    res = client.delete(f"/api/admin/team/{str(target_oid)}", headers=super_admin_auth)

    assert res.status_code == 200
    assert mock_audit.insert_one.called
    audit_args = mock_audit.insert_one.call_args[0][0]
    assert audit_args["action"] == "ADMIN_REVOKED"
    assert audit_args["target_resource_id"] == "terminated@zsehealth.internal"
    assert audit_args["details"]["permanent_deletion"] is True


def test_refund_audit_logged(super_admin_auth, mock_collections):
    mock_trans = mock_collections["transactions"]
    mock_users = mock_collections["users"]
    mock_audit = mock_collections["audit"]

    mock_trans.find_one.return_value = {
        "_id": "tx_mock_123",
        "payment_id": "pay_test_refund_999",
        "amount": 73200,
        "currency": "INR",
        "status": "captured",
        "user_email": "subscriber@example.com"
    }
    mock_trans.update_one = AsyncMock(return_value=MagicMock(matched_count=1, modified_count=1))
    mock_users.find_one.return_value = {
        "_id": "user_sub_1",
        "email": "subscriber@example.com",
        "subscription": {"status": "active"}
    }
    mock_users.update_one = AsyncMock()
    mock_audit.insert_one = AsyncMock()

    with patch("routes.admin.razorpay.Client") as mock_rzp_client_1, \
         patch("backend.routes.admin.razorpay.Client") as mock_rzp_client_2:
        mock_instance = MagicMock()
        mock_instance.payment.refund.return_value = {
            "id": "rfnd_test_id_555",
            "payment_id": "pay_test_refund_999",
            "amount": 73200,
            "status": "processed"
        }
        mock_rzp_client_1.return_value = mock_instance
        mock_rzp_client_2.return_value = mock_instance

        res = client.post(
            "/api/admin/subscriptions/refund",
            json={"payment_id": "pay_test_refund_999", "reason": "Customer accidental upgrade"},
            headers=super_admin_auth
        )

        assert res.status_code == 200
        assert mock_audit.insert_one.called
        audit_args = mock_audit.insert_one.call_args[0][0]
        assert audit_args["action"] == "SUBSCRIPTION_REFUNDED"
        assert audit_args["target_resource_id"] == "pay_test_refund_999"
        assert audit_args["details"]["amount_paise"] == 73200
        assert audit_args["details"]["refund_id"] == "rfnd_test_id_555"
        assert "razorpay_secret" not in audit_args["details"]


def test_actor_spoofing_defense(super_admin_auth, mock_collections):
    """
    Submitting a spoofed admin email in payload/query MUST be ignored;
    the backend must attribute the audit event strictly to the authenticated caller.
    """
    mock_foods = mock_collections["foods"]
    mock_audit = mock_collections["audit"]

    food_oid = "507f1f77bcf86cd799439013"
    mock_foods.find_one.return_value = {
        "_id": food_oid,
        "name": "Spoofed Actor Item",
        "verification_status": "pending"
    }
    mock_foods.update_one = AsyncMock(return_value=MagicMock(matched_count=1, modified_count=1))
    mock_audit.insert_one = AsyncMock()

    # Attempt to spoof actor as someone else
    res = client.post(
        f"/api/admin/foods/{food_oid}/approve",
        json={"action": "approve", "admin_email": "spoofed_hacker@evil.com", "actor_email": "fake@evil.com"},
        headers=super_admin_auth
    )

    assert res.status_code == 200
    assert mock_audit.insert_one.called
    audit_args = mock_audit.insert_one.call_args[0][0]
    # Verified server-side actor MUST be farhanahmad2106@gmail.com
    assert audit_args["admin_email"] == "farhanahmad2106@gmail.com"
    assert audit_args["actor_email"] == "farhanahmad2106@gmail.com"
    assert "evil.com" not in audit_args["admin_email"]


def test_search_security_and_redos_defense(super_admin_auth, mock_collections):
    """
    Search queries must be sanitized against ReDoS, metacharacters, and long strings.
    """
    mock_audit = mock_collections["audit"]
    mock_audit.count_documents = AsyncMock(return_value=0)
    mock_audit.find = MagicMock(return_value=AsyncCursorMock([]))

    # Pathological ReDoS patterns, metacharacters, and Unicode
    safe_redos_payloads = [
        ".*",
        "(a+)+$",
        "((.*)*)*",
        "[a-zA-Z]+)*",
        "हल्दी राम भुजिया",  # Unicode
        ""  # Empty
    ]

    for payload in safe_redos_payloads:
        res = client.get(f"/api/admin/audit-logs?search={payload}", headers=super_admin_auth)
        assert res.status_code == 200
        data = res.json()
        assert "items" in data

    # Exceeding MAX_ADMIN_SEARCH_LENGTH (200 chars) must return 400 Bad Request
    res_long = client.get(f"/api/admin/audit-logs?search={'A' * 250}", headers=super_admin_auth)
    assert res_long.status_code == 400


def test_pagination_bounds(super_admin_auth, mock_collections):
    """
    Validates pagination bounds: skip >= 0, 1 <= limit <= 100.
    Invalid bounds must return HTTP 422 Unprocessable Entity.
    """
    # Negative skip
    res1 = client.get("/api/admin/audit-logs?skip=-1", headers=super_admin_auth)
    assert res1.status_code == 422

    # Limit > 100
    res2 = client.get("/api/admin/audit-logs?limit=101", headers=super_admin_auth)
    assert res2.status_code == 422

    # Limit < 1
    res3 = client.get("/api/admin/audit-logs?limit=0", headers=super_admin_auth)
    assert res3.status_code == 422

    # Valid bounds
    mock_audit = mock_collections["audit"]
    mock_audit.count_documents = AsyncMock(return_value=0)
    mock_audit.find = MagicMock(return_value=AsyncCursorMock([]))
    res4 = client.get("/api/admin/audit-logs?skip=0&limit=50", headers=super_admin_auth)
    assert res4.status_code == 200


def test_csv_formula_injection_defense(super_admin_auth, mock_collections):
    """
    Values beginning with spreadsheet formula triggers (=, +, -, @)
    must be sanitized (prepended with ') in CSV export.
    """
    mock_audit = mock_collections["audit"]
    fake_docs = [
        {
            "_id": "log_malicious_1",
            "event_id": "=cmd|' /C calc'!A0",
            "schema_version": 1,
            "timestamp": "2026-09-24T12:00:00Z",
            "admin_email": "+malicious_admin@zsehealth.internal",
            "action": "-DANGEROUS_ACTION",
            "target_resource_type": "food",
            "target_resource_id": "@target_payload",
            "ip_address": "127.0.0.1",
            "details": {"test": "normal"}
        }
    ]
    mock_audit.find = MagicMock(return_value=AsyncCursorMock(fake_docs))

    res = client.get("/api/admin/audit-logs/export", headers=super_admin_auth)
    assert res.status_code == 200
    csv_text = res.text

    # Formulas must be neutralized with leading single quote
    assert "'=cmd" in csv_text
    assert "'+malicious" in csv_text
    assert "'-DANGEROUS" in csv_text
    assert "'@target" in csv_text


def test_audit_immutability(super_admin_auth):
    """
    Audit records are strictly append-only.
    PUT, PATCH, DELETE operations on audit endpoints must be rejected (404/405).
    """
    res_put = client.put("/api/admin/audit-logs/evt_001", json={"action": "MUTATED"}, headers=super_admin_auth)
    assert res_put.status_code in [404, 405]

    res_patch = client.patch("/api/admin/audit-logs/evt_001", json={"action": "MUTATED"}, headers=super_admin_auth)
    assert res_patch.status_code in [404, 405]

    res_delete = client.delete("/api/admin/audit-logs/evt_001", headers=super_admin_auth)
    assert res_delete.status_code in [404, 405]

