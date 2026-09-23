"""
Comprehensive Test Suite for Priority-0 Backend Reliability Defects:
1. Defect A: Food persistence guarantees (unverified is_verified: False persisted, explicit errors on DB failures)
2. Defect B: Atomic daily macro updates (concurrency safe $inc, race-free day boundary reset)
3. Defect C: Offline client macro ingestion, strict validation, AI bypass, and client_sync_id idempotency
4. Defect D: Razorpay webhook 3-state machine (processing -> completed / failed), retry recovery, stale lease reclaim, trusted user matching
"""

import sys
import os
import math
import json
import hmac
import hashlib
import asyncio
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, patch, MagicMock
import pytest
from fastapi.testclient import TestClient

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Set test environment
TEST_WEBHOOK_SECRET = "p0_test_secret_xyz123"
os.environ["RAZORPAY_WEBHOOK_SECRET"] = TEST_WEBHOOK_SECRET

import backend.main as main
from backend.main import app

client = TestClient(app)


def gen_webhook_sig(body: bytes, secret: str = TEST_WEBHOOK_SECRET) -> str:
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


class MockAsyncCollection:
    """Thread-safe mock collection simulating MongoDB atomic updates ($inc, $set, $push, $slice)."""

    def __init__(self, initial_docs=None):
        self.docs = [dict(d) for d in (initial_docs or [])]
        self._lock = asyncio.Lock()

    def _matches(self, doc, query):
        if not query:
            return True
        for k, v in query.items():
            if k == "$or":
                if not any(self._matches(doc, q) for q in v):
                    return False
                continue
            if "." in k:
                parts = k.split(".")
                val = doc
                for p in parts:
                    if isinstance(val, dict) and p in val:
                        val = val[p]
                    else:
                        val = None
                        break
            else:
                val = doc.get(k)

            if isinstance(v, dict):
                if "$ne" in v:
                    if val == v["$ne"] or (isinstance(val, list) and v["$ne"] in val):
                        return False
                elif "$in" in v:
                    if val not in v["$in"]:
                        return False
            elif isinstance(val, list):
                if v not in val:
                    return False
            else:
                if val != v:
                    return False
        return True

    def _set_nested(self, doc, key, val):
        parts = key.split(".")
        target = doc
        for p in parts[:-1]:
            target = target.setdefault(p, {})
        target[parts[-1]] = val

    def _inc_nested(self, doc, key, val):
        parts = key.split(".")
        target = doc
        for p in parts[:-1]:
            target = target.setdefault(p, {})
        target[parts[-1]] = round(target.get(parts[-1], 0) + val, 1)

    async def find_one(self, query):
        async with self._lock:
            for doc in self.docs:
                if self._matches(doc, query):
                    return dict(doc)
            return None

    async def insert_one(self, doc):
        async with self._lock:
            if "_id" in doc:
                for d in self.docs:
                    if d.get("_id") == doc["_id"]:
                        import pymongo.errors
                        raise pymongo.errors.DuplicateKeyError(f"Duplicate key: {doc['_id']}")
            new_doc = dict(doc)
            self.docs.append(new_doc)
            res = MagicMock()
            res.inserted_id = new_doc.get("_id", "mock_gen_id")
            return res

    async def update_one(self, query, update):
        async with self._lock:
            for i, doc in enumerate(self.docs):
                if self._matches(doc, query):
                    if "$set" in update:
                        for k, v in update["$set"].items():
                            self._set_nested(doc, k, v)
                    if "$inc" in update:
                        for k, v in update["$inc"].items():
                            self._inc_nested(doc, k, v)
                    if "$push" in update:
                        for k, v in update["$push"].items():
                            if k not in doc or not isinstance(doc[k], list):
                                doc[k] = []
                            if isinstance(v, dict) and "$each" in v:
                                doc[k].extend(v["$each"])
                                if "$slice" in v:
                                    s = v["$slice"]
                                    if s < 0:
                                        doc[k] = doc[k][s:]
                            else:
                                doc[k].append(v)
                    self.docs[i] = doc
                    return MagicMock(modified_count=1, matched_count=1)
            return MagicMock(modified_count=0, matched_count=0)

    async def create_index(self, *args, **kwargs):
        return "idx_created"

    async def count_documents(self, query=None):
        async with self._lock:
            if not query:
                return len(self.docs)
            return sum(1 for d in self.docs if self._matches(d, query))


# ==============================================================================
# 1. DEFECT A: Food Persistence Tests
# ==============================================================================

@pytest.mark.asyncio
async def test_food_persistence_success():
    """Verify that unverified back-of-pack scan persists with is_verified: False."""
    from backend.routes.scan import analyze_back_of_pack
    from schemas.scan import OCRAnalysisResponse

    mock_foods_col = MockAsyncCollection()

    mock_analysis = OCRAnalysisResponse(
        product_name="Test Granola Bar",
        brand="HealthyBite",
        is_verified=False,
        safety_score=85,
        parsed_ingredients=["Rolled oats", "Almonds", "Honey"],
        detected_ins_additives=[],
        flagged_allergens=["nuts"],
        nutrition_per_100g={"calories": 400, "protein": 10, "carbs": 60, "fat": 15},
        estimated_macros={"calories": 400, "protein": 10, "carbs": 60, "fat": 15},
        raw_ocr_text="Granola Bar Ingredients: Rolled oats, Almonds, Honey."
    )

    with patch("backend.routes.scan._get_foods_collection", return_value=mock_foods_col), \
         patch("backend.routes.scan.extract_and_analyze", return_value=mock_analysis):

        mock_image = MagicMock()
        mock_image.content_type = "image/jpeg"
        mock_image.read = AsyncMock(return_value=b"fake_jpeg_content")

        res = await analyze_back_of_pack(
            image=mock_image,
            barcode="8901234567890",
            authorization="Bearer test_token"
        )

        assert res.is_verified is False
        assert res.food_id is not None
        assert len(mock_foods_col.docs) == 1
        persisted = mock_foods_col.docs[0]
        assert persisted["name"] == "HealthyBite Test Granola Bar"
        assert persisted["barcode"] == "8901234567890"
        assert persisted["is_verified"] is False
        assert persisted["status"] == "pending_review"


@pytest.mark.asyncio
async def test_food_persistence_database_unavailable_raises_503():
    """Verify explicit 503 is raised when database collection cannot be acquired."""
    from backend.routes.scan import analyze_back_of_pack
    from schemas.scan import OCRAnalysisResponse
    from fastapi import HTTPException

    mock_analysis = OCRAnalysisResponse(
        product_name="Test Food",
        brand="Test Brand",
        is_verified=False,
        safety_score=75,
        parsed_ingredients=["Water"],
        detected_ins_additives=[],
        flagged_allergens=[],
        nutrition_per_100g={},
        estimated_macros={},
        raw_ocr_text="Ingredients: Water"
    )

    with patch("backend.routes.scan._get_foods_collection", return_value=None), \
         patch("backend.routes.scan.extract_and_analyze", return_value=mock_analysis):
        mock_image = MagicMock()
        mock_image.content_type = "image/jpeg"
        mock_image.read = AsyncMock(return_value=b"fake_jpeg_content")

        with pytest.raises(HTTPException) as exc_info:
            await analyze_back_of_pack(image=mock_image)
        assert exc_info.value.status_code == 503
        assert "Database service unavailable" in exc_info.value.detail


@pytest.mark.asyncio
async def test_food_persistence_insert_failure_raises_500():
    """Verify explicit 500 is raised if insert_one encounters a database error."""
    from backend.routes.scan import analyze_back_of_pack
    from schemas.scan import OCRAnalysisResponse
    from fastapi import HTTPException

    mock_foods_col = AsyncMock()
    mock_foods_col.insert_one.side_effect = Exception("MongoDB connection drop")

    mock_analysis = OCRAnalysisResponse(
        product_name="Test Food",
        brand="Test Brand",
        is_verified=False,
        safety_score=75,
        parsed_ingredients=["Water"],
        detected_ins_additives=[],
        flagged_allergens=[],
        nutrition_per_100g={},
        estimated_macros={},
        raw_ocr_text="Ingredients: Water"
    )

    with patch("backend.routes.scan._get_foods_collection", return_value=mock_foods_col), \
         patch("backend.routes.scan.extract_and_analyze", return_value=mock_analysis):

        mock_image = MagicMock()
        mock_image.content_type = "image/jpeg"
        mock_image.read = AsyncMock(return_value=b"fake_jpeg_content")

        with pytest.raises(HTTPException) as exc_info:
            await analyze_back_of_pack(image=mock_image)
        assert exc_info.value.status_code == 500
        assert "Failed to persist food document" in exc_info.value.detail


# ==============================================================================
# 2. DEFECT B & C: Offline Sync, Client Macro Bypass, Idempotency & $inc
# ==============================================================================

@pytest.fixture
def p0_user_setup():
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    mock_users = MockAsyncCollection([
        {
            "_id": "user_p0_1",
            "uid": "p0_test_user",
            "email": "p0@zsehealth.com",
            "tier": "free",
            "stats": {
                "calories": 200.0,
                "protein": 15.0,
                "carbs": 25.0,
                "fat": 5.0,
                "last_updated": today,
            },
            "processed_sync_ids": []
        }
    ])
    main.users_collection = mock_users
    return mock_users


def test_client_macro_bypass_ai(p0_user_setup):
    """When client supplies all 4 valid macros, AI estimation is bypassed and exact values are added."""
    app.dependency_overrides[main.get_current_user_id] = lambda: "p0_test_user"

    with patch("backend.main.try_ollama_estimate_macros") as mock_ai:
        resp = client.post(
            "/api/user/log_meal",
            json={
                "name": "Paneer Tikka Roll",
                "calories": 420.0,
                "protein": 28.5,
                "carbs": 35.0,
                "fat": 14.5
            }
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"
        # AI should never be called
        mock_ai.assert_not_called()

        # Macros must match client input
        assert data["added_macros"]["calories"] == 420.0
        assert data["added_macros"]["protein"] == 28.5
        assert data["added_macros"]["carbs"] == 35.0
        assert data["added_macros"]["fat"] == 14.5

        # Stats must be exactly 200 + 420 = 620
        assert data["new_stats"]["calories"] == 620.0
        assert data["new_stats"]["protein"] == 43.5
        assert data["new_stats"]["carbs"] == 60.0
        assert data["new_stats"]["fat"] == 19.5

    app.dependency_overrides.clear()


def test_partial_macros_rejected_with_422(p0_user_setup):
    """When client supplies partial macros (1-3 fields), reject with HTTP 422."""
    app.dependency_overrides[main.get_current_user_id] = lambda: "p0_test_user"

    # Only calories and protein (missing carbs and fat)
    resp = client.post(
        "/api/user/log_meal",
        json={"name": "Protein Shake", "calories": 200, "protein": 30}
    )
    assert resp.status_code == 422
    assert "Partial macros are not supported" in resp.json()["detail"]

    # Only 1 macro
    resp1 = client.post(
        "/api/user/log_meal",
        json={"name": "Avocado", "fat": 15}
    )
    assert resp1.status_code == 422

    app.dependency_overrides.clear()


def test_invalid_macros_rejected_with_422(p0_user_setup):
    """Negative, NaN, or non-numeric macros are rejected with HTTP 422."""
    app.dependency_overrides[main.get_current_user_id] = lambda: "p0_test_user"

    # Negative calories
    resp_neg = client.post(
        "/api/user/log_meal",
        json={"name": "Food", "calories": -50, "protein": 10, "carbs": 10, "fat": 10}
    )
    assert resp_neg.status_code == 422
    assert "cannot be negative" in resp_neg.json()["detail"]

    # Boolean value (should not be treated as int)
    resp_bool = client.post(
        "/api/user/log_meal",
        json={"name": "Food", "calories": True, "protein": 10, "carbs": 10, "fat": 10}
    )
    assert resp_bool.status_code == 422

    app.dependency_overrides.clear()


def test_client_sync_id_idempotency(p0_user_setup):
    """First request succeeds and increments; duplicate client_sync_id returns 'Already synced' without side effects."""
    app.dependency_overrides[main.get_current_user_id] = lambda: "p0_test_user"

    sync_payload = {
        "name": "Offline Oats",
        "client_sync_id": "sync_batch_999",
        "calories": 300,
        "protein": 12,
        "carbs": 50,
        "fat": 6
    }

    # 1. First sync: processes meal and increments stats
    r1 = client.post("/api/user/log_meal", json=sync_payload)
    assert r1.status_code == 200
    assert r1.json()["status"] == "success"
    assert r1.json()["new_stats"]["calories"] == 500.0  # 200 initial + 300

    # 2. Duplicate sync: must return HTTP 200 'Already synced'
    r2 = client.post("/api/user/log_meal", json=sync_payload)
    assert r2.status_code == 200
    assert r2.json() == {"status": "ok", "message": "Already synced"}

    # 3. Verify database was NOT mutated a second time
    user = p0_user_setup.docs[0]
    assert user["stats"]["calories"] == 500.0
    assert "sync_batch_999" in user["processed_sync_ids"]

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_concurrent_macro_increments():
    """Concurrent meal logging operations on the same user increment stats without lost updates."""
    from backend.main import log_meal

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    mock_users = MockAsyncCollection([
        {
            "_id": "concurrent_user",
            "uid": "concurrent_user",
            "stats": {"calories": 0.0, "protein": 0.0, "carbs": 0.0, "fat": 0.0, "last_updated": today},
            "processed_sync_ids": []
        }
    ])
    main.users_collection = mock_users

    # Execute 20 concurrent requests, each adding 50 calories, 5 protein, 10 carbs, 2 fat
    async def _send_log(i):
        req = {
            "name": f"Item {i}",
            "client_sync_id": f"sync_{i}",
            "calories": 50.0,
            "protein": 5.0,
            "carbs": 10.0,
            "fat": 2.0
        }
        return await log_meal(req, uid="concurrent_user")

    results = await asyncio.gather(*[_send_log(i) for i in range(20)])
    assert all(r["status"] == "success" for r in results)

    user = mock_users.docs[0]
    assert user["stats"]["calories"] == 1000.0  # 20 * 50
    assert user["stats"]["protein"] == 100.0   # 20 * 5
    assert user["stats"]["carbs"] == 200.0     # 20 * 10
    assert user["stats"]["fat"] == 40.0        # 20 * 2
    assert len(user["processed_sync_ids"]) == 20


@pytest.mark.asyncio
async def test_concurrent_duplicate_sync_ids():
    """Sending the exact same client_sync_id concurrently only executes once."""
    from backend.main import log_meal

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    mock_users = MockAsyncCollection([
        {
            "_id": "idem_user",
            "uid": "idem_user",
            "stats": {"calories": 0.0, "protein": 0.0, "carbs": 0.0, "fat": 0.0, "last_updated": today},
            "processed_sync_ids": []
        }
    ])
    main.users_collection = mock_users

    same_payload = {
        "name": "Duplicate Item",
        "client_sync_id": "same_sync_id_001",
        "calories": 150.0,
        "protein": 10.0,
        "carbs": 20.0,
        "fat": 5.0
    }

    # Launch 5 concurrent calls with the exact same sync ID
    results = await asyncio.gather(*[log_meal(same_payload, uid="idem_user") for _ in range(5)])

    # Exactly 1 should be "success", and 4 should be "Already synced"
    successes = [r for r in results if r.get("status") == "success"]
    already_synced = [r for r in results if r.get("message") == "Already synced"]

    assert len(successes) == 1
    assert len(already_synced) == 4

    user = mock_users.docs[0]
    assert user["stats"]["calories"] == 150.0  # Incremented exactly once
    assert user["processed_sync_ids"] == ["same_sync_id_001"]


# ==============================================================================
# 3. DEFECT D: Razorpay Webhook State Machine & Recovery Tests
# ==============================================================================

@pytest.fixture
def webhook_env_setup(monkeypatch):
    monkeypatch.setenv("RAZORPAY_WEBHOOK_SECRET", TEST_WEBHOOK_SECRET)
    users_col = MockAsyncCollection([
        {
            "_id": "user_wh_1",
            "uid": "wh_user_1",
            "tier": "free",
            "subscription": {"status": "inactive", "razorpay_subscription_id": None},
            "usage": {"scan_limit": 20, "scans_used_this_month": 0}
        }
    ])
    transactions_col = MockAsyncCollection()
    system_logs_col = MockAsyncCollection()

    main.users_collection = users_col
    main.transactions_collection = transactions_col
    main.system_logs_collection = system_logs_col

    return users_col, transactions_col


def test_webhook_happy_path(webhook_env_setup):
    """Valid webhook sets transaction to 'completed' and upgrades user."""
    users_col, transactions_col = webhook_env_setup

    payload = {
        "event": "payment.captured",
        "id": "evt_p0_happy_1",
        "payload": {
            "payment": {
                "entity": {
                    "id": "pay_p0_happy_1",
                    "order_id": "order_p0_1",
                    "amount": 73200,
                    "currency": "INR",
                    "status": "captured",
                    "method": "card",
                    "notes": {"user_id": "wh_user_1", "tier": "pro", "scan_quota": 500}
                }
            }
        }
    }
    raw = json.dumps(payload).encode("utf-8")
    sig = gen_webhook_sig(raw)

    resp = client.post(
        "/api/webhooks/razorpay",
        content=raw,
        headers={"X-Razorpay-Signature": sig, "X-Razorpay-Event-Id": "evt_p0_happy_1"}
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"

    # Verify transaction completed
    tx = transactions_col.docs[0]
    assert tx["_id"] == "evt_p0_happy_1"
    assert tx["status"] == "completed"
    assert tx["completed_at"] is not None

    # Verify user upgraded
    user = users_col.docs[0]
    assert user["tier"] == "pro"
    assert user["usage"]["scan_limit"] == 500


def test_webhook_duplicate_completed_ignored(webhook_env_setup):
    """Duplicate delivery of an already completed event returns 200 without duplicate updates."""
    users_col, transactions_col = webhook_env_setup

    # Pre-seed completed transaction
    transactions_col.docs.append({
        "_id": "evt_p0_dup_1",
        "status": "completed",
        "payment_id": "pay_p0_dup_1",
        "user_id": "wh_user_1",
        "completed_at": datetime.now(timezone.utc)
    })
    users_col.docs[0]["tier"] = "pro"

    payload = {
        "event": "payment.captured",
        "id": "evt_p0_dup_1",
        "payload": {
            "payment": {
                "entity": {
                    "id": "pay_p0_dup_1",
                    "amount": 73200,
                    "notes": {"user_id": "wh_user_1", "tier": "pro"}
                }
            }
        }
    }
    raw = json.dumps(payload).encode("utf-8")
    sig = gen_webhook_sig(raw)

    resp = client.post(
        "/api/webhooks/razorpay",
        content=raw,
        headers={"X-Razorpay-Signature": sig, "X-Razorpay-Event-Id": "evt_p0_dup_1"}
    )
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "message": "Duplicate event ignored"}


def test_webhook_recovery_after_failure(webhook_env_setup):
    """If user update previously failed, a retried webhook reclaims the event and succeeds."""
    users_col, transactions_col = webhook_env_setup

    # Pre-seed a previously failed transaction attempt
    transactions_col.docs.append({
        "_id": "evt_p0_failed_1",
        "status": "failed",
        "last_error": "Connection timeout",
        "failed_at": datetime.now(timezone.utc) - timedelta(seconds=10)
    })

    payload = {
        "event": "payment.captured",
        "id": "evt_p0_failed_1",
        "payload": {
            "payment": {
                "entity": {
                    "id": "pay_p0_failed_1",
                    "order_id": "order_failed_1",
                    "amount": 73200,
                    "currency": "INR",
                    "notes": {"user_id": "wh_user_1", "tier": "pro", "scan_quota": 500}
                }
            }
        }
    }
    raw = json.dumps(payload).encode("utf-8")
    sig = gen_webhook_sig(raw)

    # Retried webhook should reclaim the 'failed' state and upgrade user
    resp = client.post(
        "/api/webhooks/razorpay",
        content=raw,
        headers={"X-Razorpay-Signature": sig, "X-Razorpay-Event-Id": "evt_p0_failed_1"}
    )
    assert resp.status_code == 200

    # User must now be upgraded!
    user = users_col.docs[0]
    assert user["tier"] == "pro"

    # Transaction status must now be completed
    tx = next(d for d in transactions_col.docs if d["_id"] == "evt_p0_failed_1")
    assert tx["status"] == "completed"


def test_webhook_stale_processing_recovery(webhook_env_setup):
    """If a previous worker crashed leaving an event in 'processing' for >60s, a retry reclaims it."""
    users_col, transactions_col = webhook_env_setup

    stale_time = datetime.now(timezone.utc) - timedelta(seconds=90)
    transactions_col.docs.append({
        "_id": "evt_p0_stale_1",
        "status": "processing",
        "processing_started_at": stale_time
    })

    payload = {
        "event": "payment.captured",
        "id": "evt_p0_stale_1",
        "payload": {
            "payment": {
                "entity": {
                    "id": "pay_p0_stale_1",
                    "order_id": "order_stale_1",
                    "amount": 73200,
                    "currency": "INR",
                    "notes": {"user_id": "wh_user_1", "tier": "elite", "scan_quota": 500}
                }
            }
        }
    }
    raw = json.dumps(payload).encode("utf-8")
    sig = gen_webhook_sig(raw)

    resp = client.post(
        "/api/webhooks/razorpay",
        content=raw,
        headers={"X-Razorpay-Signature": sig, "X-Razorpay-Event-Id": "evt_p0_stale_1"}
    )
    assert resp.status_code == 200

    user = users_col.docs[0]
    assert user["tier"] == "elite"
    tx = next(d for d in transactions_col.docs if d["_id"] == "evt_p0_stale_1")
    assert tx["status"] == "completed"


def test_webhook_insecure_email_fallback_rejected(webhook_env_setup):
    """A payment lacking trusted user_id or subscription_id (e.g. only arbitrary email) is rejected."""
    users_col, transactions_col = webhook_env_setup

    payload = {
        "event": "payment.captured",
        "id": "evt_insecure_email",
        "payload": {
            "payment": {
                "entity": {
                    "id": "pay_insecure_1",
                    "amount": 73200,
                    "email": "victim@zsehealth.com",  # Arbitrary email without trusted user_id
                    "notes": {}
                }
            }
        }
    }
    raw = json.dumps(payload).encode("utf-8")
    sig = gen_webhook_sig(raw)

    resp = client.post(
        "/api/webhooks/razorpay",
        content=raw,
        headers={"X-Razorpay-Signature": sig, "X-Razorpay-Event-Id": "evt_insecure_email"}
    )
    assert resp.status_code == 500

    # User must NOT be upgraded
    assert users_col.docs[0]["tier"] == "free"
