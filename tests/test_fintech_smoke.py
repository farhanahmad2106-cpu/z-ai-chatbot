"""
MASTER QA SMOKE TEST SUITE — RAZORPAY WEBHOOK + SUBSCRIPTION + SUPER ADMIN REFUND E2E
Official automated test suite covering Test Suites A through K:
- Suite A: Authorized Razorpay Webhook (HMAC verification, transaction persistence, user upgrade, logs)
- Suite B: Webhook Signature Security (tampered signature, missing signature, malformed signature)
- Suite C: Webhook Replay / Idempotency (duplicate suppression, no double-crediting)
- Suite D: Super Admin Authorization (authenticated Super Admin vs unauthorized caller)
- Suite E: Full Super Admin Refund (Razorpay refund invocation, response verification)
- Suite F: Database Refund Reconciliation (status refunded, refunds array <= 29900)
- Suite G: User Downgrade (tier free, scan_limit 20, subscription refunded)
- Suite H: Refund Amount Validation (excess refund > original rejected with HTTP 400)
- Suite I: Zero / Negative Refund Validation (rejected by validation)
- Suite J: Duplicate Refund Protection (cannot refund already fully refunded transaction)
- Suite K: Refund Failure Atomicity (external gateway failure aborts DB mutations safely)
"""
import os
import json
import hmac
import hashlib
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

# Set up test secrets prior to importing app
os.environ["RAZORPAY_WEBHOOK_SECRET"] = "test_webhook_secret_9901"
os.environ["RAZORPAY_KEY_ID"] = "rzp_test_key_9901"
os.environ["RAZORPAY_KEY_SECRET"] = "rzp_test_secret_9901"
os.environ["SUPER_ADMIN_EMAIL"] = "farhanahmad2106@gmail.com"

import backend.main as main
from backend.main import app

client = TestClient(app)

class MockAsyncCollection:
    def __init__(self, initial_docs=None):
        self.docs = [dict(d) for d in (initial_docs or [])]

    def _matches(self, doc, query):
        if not query:
            return True
        for k, v in query.items():
            if k == "$or":
                if not any(self._matches(doc, q) for q in v):
                    return False
                continue
            parts = k.split(".")
            val = doc
            for p in parts:
                if isinstance(val, dict) and p in val:
                    val = val[p]
                else:
                    val = None
                    break
            if val != v:
                return False
        return True

    def _set_nested(self, doc, key, val):
        parts = key.split(".")
        target = doc
        for p in parts[:-1]:
            if p not in target or not isinstance(target[p], dict):
                target[p] = {}
            target = target[p]
        target[parts[-1]] = val

    async def find_one(self, query):
        for doc in self.docs:
            if self._matches(doc, query):
                return dict(doc)
        return None

    async def insert_one(self, doc):
        if "_id" in doc:
            for d in self.docs:
                if d.get("_id") == doc["_id"]:
                    import pymongo.errors
                    raise pymongo.errors.DuplicateKeyError(f"Duplicate key: {doc['_id']}")
        new_doc = dict(doc)
        self.docs.append(new_doc)
        return MagicMock(inserted_id=new_doc.get("_id", "mock_id"))

    async def update_one(self, query, update):
        for i, doc in enumerate(self.docs):
            if self._matches(doc, query):
                if "$set" in update:
                    for k, v in update["$set"].items():
                        self._set_nested(doc, k, v)
                if "$push" in update:
                    for k, v in update["$push"].items():
                        if k not in doc:
                            doc[k] = []
                        doc[k].append(v)
                self.docs[i] = doc
                return MagicMock(modified_count=1, matched_count=1)
        return MagicMock(modified_count=0, matched_count=0)

    async def count_documents(self, query):
        return sum(1 for d in self.docs if self._matches(d, query))


# Test Data Fixtures
TEST_SECRET = "test_webhook_secret_9901"
TEST_PAYMENT_ID = "pay_TEST_SMOKE_9901"
TEST_ORDER_ID = "order_TEST_9901"
TEST_USER_UID = "smoke_test_uid_001"
TEST_USER_EMAIL = "smoke_user@zsehealth.com"
TEST_SUPER_ADMIN_EMAIL = "farhanahmad2106@gmail.com"

def gen_sig(body: bytes) -> str:
    return hmac.new(TEST_SECRET.encode("utf-8"), body, hashlib.sha256).hexdigest()

def setup_test_collections():
    os.environ["RAZORPAY_WEBHOOK_SECRET"] = TEST_SECRET
    users_col = MockAsyncCollection([
        {
            "_id": "user_doc_1",
            "uid": TEST_USER_UID,
            "email": TEST_USER_EMAIL,
            "tier": "free",
            "usage": {"scan_limit": 20, "scans_used_this_month": 0},
            "subscription": {"status": "inactive", "plan": "free", "razorpay_subscription_id": None}
        }
    ])
    transactions_col = MockAsyncCollection()
    system_logs_col = MockAsyncCollection()
    admins_col = MockAsyncCollection([
        {
            "_id": "admin_doc_1",
            "email": TEST_SUPER_ADMIN_EMAIL,
            "name": "Farhan Ahmad",
            "uid": "i8lAm4wU0NbMKgaeq3CDWde5uf92",
            "is_super_admin": True,
            "is_active": True,
            "permissions": {"canManageAdmins": True, "canManageUsers": True}
        }
    ])

    main.users_collection = users_col
    main.transactions_collection = transactions_col
    main.system_logs_collection = system_logs_col
    main.admins_collection = admins_col
    main.admin_audit_logs_collection = MockAsyncCollection()
    return users_col, transactions_col, system_logs_col, admins_col


def test_suite_a_and_c_webhook_lifecycle_and_idempotency():
    """
    Suite A: Authorized Razorpay Webhook Ingestion & State Reconciliation
    Suite C: Webhook Replay / Idempotency Protection
    """
    users_col, transactions_col, system_logs_col, _ = setup_test_collections()

    payload_dict = {
        "event": "payment.captured",
        "payload": {
            "payment": {
                "entity": {
                    "id": TEST_PAYMENT_ID,
                    "order_id": TEST_ORDER_ID,
                    "amount": 29900,
                    "currency": "INR",
                    "status": "captured",
                    "method": "upi",
                    "email": TEST_USER_EMAIL,
                    "notes": {
                        "user_id": TEST_USER_UID,
                        "tier": "pro",
                        "scan_quota": 500
                    }
                }
            }
        }
    }
    raw_body = json.dumps(payload_dict, separators=(',', ':')).encode("utf-8")
    valid_sig = gen_sig(raw_body)

    # A2. Dispatch valid webhook
    resp = client.post(
        "/api/webhooks/razorpay",
        content=raw_body,
        headers={
            "Content-Type": "application/json",
            "X-Razorpay-Signature": valid_sig,
            "X-Razorpay-Event-Id": "evt_test_smoke_001"
        }
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"

    # A3. Verify transaction persistence
    tx = next((d for d in transactions_col.docs if d.get("payment_id") == TEST_PAYMENT_ID), None)
    assert tx is not None
    assert tx["payment_id"] == TEST_PAYMENT_ID
    assert tx["amount"] == 29900
    assert tx["currency"] == "INR"
    assert tx["status"] in ("captured", "completed")
    assert tx["order_id"] == TEST_ORDER_ID
    assert tx["user_id"] == TEST_USER_UID
    assert tx["refunds"] == []

    # A4. Verify user subscription upgrade
    user = next((u for u in users_col.docs if u.get("uid") == TEST_USER_UID), None)
    assert user is not None
    assert user["tier"] == "pro"
    assert user["usage"]["scan_limit"] == 500
    assert user["subscription"]["status"] == "active"

    # A5. Verify system logs
    log_entry = next((l for l in system_logs_col.docs if l.get("service") == "FinTech"), None)
    assert log_entry is not None
    assert TEST_PAYMENT_ID in log_entry["message"]

    # --- SUITE C: Webhook Replay / Idempotency ---
    resp_replay = client.post(
        "/api/webhooks/razorpay",
        content=raw_body,
        headers={
            "Content-Type": "application/json",
            "X-Razorpay-Signature": valid_sig,
            "X-Razorpay-Event-Id": "evt_test_smoke_001"
        }
    )
    assert resp_replay.status_code == 200

    # User quota must remain 500, NOT 1000
    user_after = next((u for u in users_col.docs if u.get("uid") == TEST_USER_UID), None)
    assert user_after["usage"]["scan_limit"] == 500
    assert user_after["tier"] == "pro"

    # Transactions collection must still contain only 1 record
    tx_count = sum(1 for d in transactions_col.docs if d.get("payment_id") == TEST_PAYMENT_ID)
    assert tx_count == 1


def test_suite_b_signature_security():
    """
    Suite B: Webhook Signature Security
    B1: Tampered signature
    B2: Missing signature
    B3: Malformed signature
    """
    _, transactions_col, _, _ = setup_test_collections()

    payload_dict = {
        "event": "payment.captured",
        "payload": {"payment": {"entity": {"id": "pay_FAKE_999", "amount": 10000}}}
    }
    raw_body = json.dumps(payload_dict).encode("utf-8")

    # B1. Tampered Signature
    resp_tampered = client.post(
        "/api/webhooks/razorpay",
        content=raw_body,
        headers={"Content-Type": "application/json", "X-Razorpay-Signature": "invalid_tampered_signature_hex"}
    )
    assert resp_tampered.status_code == 400
    assert "signature" in resp_tampered.json()["detail"].lower()

    # B2. Missing Signature
    resp_missing = client.post(
        "/api/webhooks/razorpay",
        content=raw_body,
        headers={"Content-Type": "application/json"}
    )
    assert resp_missing.status_code == 400

    # B3. Malformed Signature
    resp_malformed = client.post(
        "/api/webhooks/razorpay",
        content=raw_body,
        headers={"Content-Type": "application/json", "X-Razorpay-Signature": "!@#$%^&*()"}
    )
    assert resp_malformed.status_code == 400

    # Verify no transaction was created
    tx = next((d for d in transactions_col.docs if d.get("payment_id") == "pay_FAKE_999"), None)
    assert tx is None


def test_suite_d_e_f_g_full_super_admin_refund():
    """
    Suite D: Super Admin Authorization
    Suite E: Full Super Admin Refund Request
    Suite F: Database Refund Reconciliation
    Suite G: User Subscription Downgrade & Quota Reset
    """
    users_col, transactions_col, _, _ = setup_test_collections()

    # Pre-seed active transaction and user
    transactions_col.docs.append({
        "_id": "evt_test_smoke_001",
        "event": "payment.captured",
        "payment_id": TEST_PAYMENT_ID,
        "subscription_id": f"sub_{TEST_PAYMENT_ID}",
        "user_id": TEST_USER_UID,
        "amount": 29900,
        "currency": "INR",
        "status": "captured",
        "refunds": []
    })
    user = next(u for u in users_col.docs if u.get("uid") == TEST_USER_UID)
    user["tier"] = "pro"
    user["subscription"] = {"status": "active", "razorpay_subscription_id": f"sub_{TEST_PAYMENT_ID}"}
    user["usage"]["scan_limit"] = 500

    # D2: Unauthorized caller attempt (without bearer token)
    unauthorized_resp = client.post(
        "/api/admin/subscriptions/refund",
        json={"payment_id": TEST_PAYMENT_ID, "amount": None, "reason": "customer_request"}
    )
    assert unauthorized_resp.status_code == 401

    # D1 & E: Authorized Super Admin Refund execution
    fake_rzp_refund = {
        "id": "rfnd_TEST_SMOKE_9901",
        "entity": "refund",
        "amount": 29900,
        "currency": "INR",
        "payment_id": TEST_PAYMENT_ID,
        "status": "processed"
    }

    with patch("razorpay.Client") as mock_rzp_class:
        mock_client = MagicMock()
        mock_client.payment.refund.return_value = fake_rzp_refund
        mock_rzp_class.return_value = mock_client

        refund_resp = client.post(
            "/api/admin/subscriptions/refund",
            headers={"Authorization": "Bearer test_super_admin"},
            json={
                "payment_id": TEST_PAYMENT_ID,
                "amount": None,
                "reason": "Customer smoke test cancellation request"
            }
        )

        assert refund_resp.status_code == 200
        res_data = refund_resp.json()
        assert res_data["success"] is True
        assert res_data["refund_id"] == "rfnd_TEST_SMOKE_9901"
        assert res_data["refunded_amount"] == 29900
        assert res_data["user_downgraded"] is True

        mock_client.payment.refund.assert_called_once()
        args, _ = mock_client.payment.refund.call_args
        assert args[0] == TEST_PAYMENT_ID

    # F. Database Refund Reconciliation
    tx = next(d for d in transactions_col.docs if d.get("payment_id") == TEST_PAYMENT_ID)
    assert tx["status"] == "refunded"
    assert len(tx["refunds"]) == 1
    assert tx["refunds"][0]["refund_id"] == "rfnd_TEST_SMOKE_9901"
    assert tx["refunds"][0]["amount"] == 29900
    assert tx["refunds"][0]["admin_email"] == TEST_SUPER_ADMIN_EMAIL

    # G. User Downgrade & Quota Reset
    user_after = next(u for u in users_col.docs if u.get("uid") == TEST_USER_UID)
    assert user_after["tier"] == "free"
    assert user_after["usage"]["scan_limit"] == 20
    assert user_after["subscription"]["status"] == "refunded"


def test_suite_h_excess_refund_validation():
    """
    Suite H: Refund Amount Validation
    Excess refund exceeding remaining amount must be rejected with HTTP 400.
    """
    _, transactions_col, _, _ = setup_test_collections()

    transactions_col.docs.append({
        "_id": "evt_test_excess",
        "payment_id": "pay_TEST_EXCESS",
        "amount": 29900,
        "status": "captured",
        "refunds": []
    })

    with patch("razorpay.Client") as mock_rzp_class:
        mock_client = MagicMock()
        mock_rzp_class.return_value = mock_client

        resp = client.post(
            "/api/admin/subscriptions/refund",
            headers={"Authorization": "Bearer test_super_admin"},
            json={
                "payment_id": "pay_TEST_EXCESS",
                "amount": 29901,  # 1 paise more than original amount
                "reason": "customer_request"
            }
        )

        assert resp.status_code == 400
        assert "exceeds remaining refundable amount" in resp.json()["detail"].lower()
        mock_client.payment.refund.assert_not_called()


def test_suite_i_zero_and_negative_refund_validation():
    """
    Suite I: Zero and Negative Refund Amount Validation
    Pydantic gt=0 must reject amounts <= 0 with HTTP 422.
    """
    setup_test_collections()

    resp_zero = client.post(
        "/api/admin/subscriptions/refund",
        headers={"Authorization": "Bearer test_super_admin"},
        json={"payment_id": "pay_TEST_ZERO", "amount": 0, "reason": "customer_request"}
    )
    assert resp_zero.status_code == 422

    resp_neg = client.post(
        "/api/admin/subscriptions/refund",
        headers={"Authorization": "Bearer test_super_admin"},
        json={"payment_id": "pay_TEST_NEG", "amount": -500, "reason": "customer_request"}
    )
    assert resp_neg.status_code == 422


def test_suite_j_duplicate_refund_protection():
    """
    Suite J: Duplicate Refund Protection
    Re-attempting refund on an already fully refunded transaction must raise HTTP 409 Conflict.
    """
    _, transactions_col, _, _ = setup_test_collections()

    transactions_col.docs.append({
        "_id": "evt_test_already_refunded",
        "payment_id": "pay_TEST_ALREADY_REFUNDED",
        "amount": 29900,
        "status": "refunded",
        "refunds": [{"refund_id": "rfnd_existing_01", "amount": 29900, "status": "processed"}]
    })

    with patch("razorpay.Client") as mock_rzp_class:
        mock_client = MagicMock()
        mock_rzp_class.return_value = mock_client

        resp = client.post(
            "/api/admin/subscriptions/refund",
            headers={"Authorization": "Bearer test_super_admin"},
            json={
                "payment_id": "pay_TEST_ALREADY_REFUNDED",
                "amount": None,
                "reason": "customer_request"
            }
        )

        assert resp.status_code == 409
        assert "already been fully refunded" in resp.json()["detail"].lower()
        mock_client.payment.refund.assert_not_called()


def test_suite_k_refund_failure_atomicity():
    """
    Suite K: Refund Failure / Atomicity
    Simulated external gateway failure must return HTTP 502, log the error, and NOT mutate database.
    """
    users_col, transactions_col, system_logs_col, _ = setup_test_collections()

    transactions_col.docs.append({
        "_id": "evt_test_atomicity",
        "payment_id": "pay_TEST_ATOMICITY",
        "subscription_id": "sub_atomicity_001",
        "user_id": "uid_atomicity_001",
        "amount": 29900,
        "status": "captured",
        "refunds": []
    })
    users_col.docs.append({
        "_id": "user_atomicity_doc",
        "uid": "uid_atomicity_001",
        "tier": "pro",
        "usage": {"scan_limit": 500},
        "subscription": {"status": "active", "razorpay_subscription_id": "sub_atomicity_001"}
    })

    with patch("razorpay.Client") as mock_rzp_class:
        mock_client = MagicMock()
        mock_client.payment.refund.side_effect = Exception("Razorpay API Timeout or Gateway Exception")
        mock_rzp_class.return_value = mock_client

        resp = client.post(
            "/api/admin/subscriptions/refund",
            headers={"Authorization": "Bearer test_super_admin"},
            json={
                "payment_id": "pay_TEST_ATOMICITY",
                "amount": None,
                "reason": "customer_request"
            }
        )

        assert resp.status_code == 502
        assert "failed at gateway" in resp.json()["detail"].lower()

    # Verify atomicity: transaction is NOT refunded
    tx = next(d for d in transactions_col.docs if d.get("payment_id") == "pay_TEST_ATOMICITY")
    assert tx["status"] == "captured"
    assert len(tx["refunds"]) == 0

    # User must NOT be downgraded
    user = next(u for u in users_col.docs if u.get("uid") == "uid_atomicity_001")
    assert user["tier"] == "pro"
    assert user["usage"]["scan_limit"] == 500

    # Error must be logged in system_logs
    err_log = next((l for l in system_logs_col.docs if l.get("level") == "ERROR" and l.get("service") == "FinTech"), None)
    assert err_log is not None
    assert "pay_TEST_ATOMICITY" in err_log["message"]
