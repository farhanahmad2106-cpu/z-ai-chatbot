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
