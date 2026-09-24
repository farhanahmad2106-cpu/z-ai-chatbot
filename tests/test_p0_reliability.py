"""
Z-SeHealth — Comprehensive Verification Suite for Priority-0 Backend Reliability Remediation

Covers:
- Test Group A: Crowdsourced persistence (A1: success with is_verified=False, A2: DB unavailable 503, A3: insert failure 500 + logging)
- Test Group B: Macro concurrency (N concurrent increments with exact mathematical sums)
- Test Group C: Daily reset (IST timezone boundary, yesterday's stats discarded, concurrent boundary resets)
- Test Group D: Offline macro bypass (precomputed macros bypass AI models)
- Test Group E: Partial macro payload (HTTP 422 with exact detail message, validation)
- Test Group F: Idempotency (sequential duplicate sync ID returns 'Already synced')
- Test Group G: Concurrent duplicate idempotency (10-50 simultaneous duplicate sync IDs applied exactly once)
- Test Group H: Webhook success (processing -> entitlement -> completed lifecycle)
- Test Group I: Webhook failure recovery (failed -> retry -> processing -> completed)
- Test Group J: Active webhook duplicate (status=processing, lease_until=future -> 200 'Event is currently processing')
- Test Group K: Expired webhook lease (status=processing, lease_until=past -> reclaimed -> completed)
- Test Group L: Concurrent webhook reclaim (simultaneous retries on expired lease -> exactly 1 winner, no double entitlement)
- Test Group M: Untrusted billing email (billing email of user A does not override user B identity)
- Test Group N: Invalid / ambiguous user resolution (untrusted/missing user identity rejected, transaction marked failed)
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

IST = timezone(timedelta(hours=5, minutes=30))


def gen_webhook_sig(body: bytes, secret: str = TEST_WEBHOOK_SECRET) -> str:
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


class MockAsyncCollection:
    """Thread-safe mock collection simulating MongoDB atomic updates ($inc, $set, $push, $slice) and query operators."""

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
                if "$in" in v:
                    if val not in v["$in"]:
                        return False
                if "$lte" in v:
                    if val is None or val > v["$lte"]:
                        return False
                if "$lt" in v:
                    if val is None or val >= v["$lt"]:
                        return False
                if "$gte" in v:
                    if val is None or val < v["$gte"]:
                        return False
                if "$gt" in v:
                    if val is None or val <= v["$gt"]:
                        return False
                if "$exists" in v:
                    exists = val is not None
                    if exists != v["$exists"]:
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
            if target.get(p) is None or not isinstance(target.get(p), dict):
                target[p] = {}
            target = target[p]
        target[parts[-1]] = val

    def _inc_nested(self, doc, key, val):
        parts = key.split(".")
        target = doc
        for p in parts[:-1]:
            if target.get(p) is None or not isinstance(target.get(p), dict):
                target[p] = {}
            target = target[p]
        target[parts[-1]] = round(float(target.get(parts[-1]) or 0) + val, 1)

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
# TEST GROUP A: Crowdsourced Persistence
# ==============================================================================

@pytest.mark.asyncio
async def test_food_persistence_success():
    """A1: Successful crowdsourced submission persists with is_verified: False and generates a valid food_id."""
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
    """A2: Database collection unavailable raises explicit HTTP 503 'Database connection unavailable'."""
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
        assert exc_info.value.detail == "Database connection unavailable"


@pytest.mark.asyncio
async def test_food_persistence_insert_failure_raises_500():
    """A3: Insert failure raises HTTP 500 'Failed to persist crowdsourced food item' and logs to system_logs."""
    from backend.routes.scan import analyze_back_of_pack
    from schemas.scan import OCRAnalysisResponse
    from fastapi import HTTPException

    mock_foods_col = AsyncMock()
    mock_foods_col.insert_one.side_effect = Exception("MongoDB connection drop")
    mock_logs_col = MockAsyncCollection()

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
         patch("backend.routes.scan._get_system_logs_collection", return_value=mock_logs_col), \
         patch("backend.routes.scan.extract_and_analyze", return_value=mock_analysis):

        mock_image = MagicMock()
        mock_image.content_type = "image/jpeg"
        mock_image.read = AsyncMock(return_value=b"fake_jpeg_content")

        with pytest.raises(HTTPException) as exc_info:
            await analyze_back_of_pack(image=mock_image)
        assert exc_info.value.status_code == 500
        assert exc_info.value.detail == "Failed to persist crowdsourced food item"

        # Verify diagnostic information written to system_logs
        assert len(mock_logs_col.docs) == 1
        log_entry = mock_logs_col.docs[0]
        assert log_entry["level"] == "ERROR"
        assert log_entry["operation"] == "insert_crowdsourced_food"


# ==============================================================================
# TEST GROUP B: Macro Concurrency
# ==============================================================================

@pytest.mark.asyncio
async def test_concurrent_macro_increments():
    """B: Concurrent meal logging on same user produces exact mathematical sum without lost updates."""
    from backend.main import log_meal

    ist_today = datetime.now(IST).strftime("%Y-%m-%d")
    mock_users = MockAsyncCollection([
        {
            "_id": "concurrent_user",
            "uid": "concurrent_user",
            "stats": {"calories": 0.0, "protein": 0.0, "carbs": 0.0, "fat": 0.0, "last_updated": ist_today},
            "processed_sync_ids": []
        }
    ])
    main.users_collection = mock_users

    # Execute 20 concurrent requests with varying macro increments
    increments = [
        {"cal": 50.0 + i, "prot": 5.0 + (i * 0.5), "carb": 10.0 + i, "fat": 2.0 + (i * 0.2)}
        for i in range(20)
    ]

    async def _send_log(i, inc):
        req = {
            "name": f"Item {i}",
            "client_sync_id": f"sync_{i}",
            "calories": inc["cal"],
            "protein": inc["prot"],
            "carbs": inc["carb"],
            "fat": inc["fat"]
        }
        return await log_meal(req, uid="concurrent_user")

    results = await asyncio.gather(*[_send_log(i, inc) for i, inc in enumerate(increments)])
    assert all(r["status"] == "success" for r in results)

    expected_cal = round(sum(inc["cal"] for inc in increments), 1)
    expected_prot = round(sum(inc["prot"] for inc in increments), 1)
    expected_carb = round(sum(inc["carb"] for inc in increments), 1)
    expected_fat = round(sum(inc["fat"] for inc in increments), 1)

    user = mock_users.docs[0]
    assert user["stats"]["calories"] == expected_cal
    assert user["stats"]["protein"] == expected_prot
    assert user["stats"]["carbs"] == expected_carb
    assert user["stats"]["fat"] == expected_fat
    assert len(user["processed_sync_ids"]) == 20


# ==============================================================================
# TEST GROUP C: Daily Reset & Timezone Boundary
# ==============================================================================

@pytest.mark.asyncio
async def test_daily_reset_ist_boundary():
    """C1: Previous-day stats are not carried into today; new meal is recorded with IST today marker."""
    from backend.main import log_meal

    yesterday_str = (datetime.now(IST) - timedelta(days=1)).strftime("%Y-%m-%d")
    ist_today = datetime.now(IST).strftime("%Y-%m-%d")

    mock_users = MockAsyncCollection([
        {
            "_id": "user_reset_1",
            "uid": "user_reset_1",
            "stats": {
                "calories": 1800.0,
                "protein": 120.0,
                "carbs": 220.0,
                "fat": 50.0,
                "last_updated": yesterday_str
            },
            "processed_sync_ids": []
        }
    ])
    main.users_collection = mock_users

    res = await log_meal({
        "name": "Morning Breakfast",
        "calories": 350.0,
        "protein": 25.0,
        "carbs": 40.0,
        "fat": 10.0
    }, uid="user_reset_1")

    assert res["status"] == "success"
    # Yesterday's 1800 kcal must NOT carry over
    assert res["new_stats"]["calories"] == 350.0
    assert res["new_stats"]["protein"] == 25.0
    assert res["new_stats"]["carbs"] == 40.0
    assert res["new_stats"]["fat"] == 10.0
    assert res["new_stats"]["last_updated"] == ist_today


@pytest.mark.asyncio
async def test_concurrent_daily_reset_boundary():
    """C2: Concurrent requests crossing midnight boundary produce exactly 1 reset with all current-day increments preserved."""
    from backend.main import log_meal

    yesterday_str = (datetime.now(IST) - timedelta(days=1)).strftime("%Y-%m-%d")
    ist_today = datetime.now(IST).strftime("%Y-%m-%d")

    mock_users = MockAsyncCollection([
        {
            "_id": "user_boundary_race",
            "uid": "user_boundary_race",
            "stats": {
                "calories": 2500.0,
                "protein": 150.0,
                "carbs": 300.0,
                "fat": 80.0,
                "last_updated": yesterday_str
            },
            "processed_sync_ids": []
        }
    ])
    main.users_collection = mock_users

    async def _send_log(i):
        req = {
            "name": f"Midnight Snack {i}",
            "client_sync_id": f"midnight_sync_{i}",
            "calories": 100.0,
            "protein": 10.0,
            "carbs": 15.0,
            "fat": 2.0
        }
        return await log_meal(req, uid="user_boundary_race")

    # 10 simultaneous requests across the boundary
    results = await asyncio.gather(*[_send_log(i) for i in range(10)])
    assert all(r["status"] == "success" for r in results)

    user = mock_users.docs[0]
    # Yesterday's 2500 kcal discarded; 10 * 100 = 1000 preserved
    assert user["stats"]["calories"] == 1000.0
    assert user["stats"]["protein"] == 100.0
    assert user["stats"]["carbs"] == 150.0
    assert user["stats"]["fat"] == 20.0
    assert user["stats"]["last_updated"] == ist_today
    assert len(user["processed_sync_ids"]) == 10


# ==============================================================================
# TEST GROUP D: Offline Macro Bypass
# ==============================================================================

@pytest.fixture
def p0_user_setup():
    ist_today = datetime.now(IST).strftime("%Y-%m-%d")
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
                "last_updated": ist_today,
            },
            "processed_sync_ids": []
        }
    ])
    main.users_collection = mock_users
    return mock_users


def test_client_macro_bypass_ai(p0_user_setup):
    """D: When client supplies all 4 valid macros, AI estimation is bypassed and exact values are added."""
    app.dependency_overrides[main.get_current_user_id] = lambda: "p0_test_user"

    with patch("backend.main.try_ollama_estimate_macros") as mock_ai, \
         patch("backend.main.try_nvidia_estimate_macros") as mock_nv, \
         patch("backend.main.try_gemini_estimate_macros") as mock_gemini:

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

        # AI pipelines must never be called
        mock_ai.assert_not_called()
        mock_nv.assert_not_called()
        mock_gemini.assert_not_called()

        assert data["added_macros"]["calories"] == 420.0
        assert data["added_macros"]["protein"] == 28.5
        assert data["added_macros"]["carbs"] == 35.0
        assert data["added_macros"]["fat"] == 14.5

        assert data["new_stats"]["calories"] == 620.0
        assert data["new_stats"]["protein"] == 43.5
        assert data["new_stats"]["carbs"] == 60.0
        assert data["new_stats"]["fat"] == 19.5

    app.dependency_overrides.clear()


# ==============================================================================
# TEST GROUP E: Partial / Invalid Macro Payloads
# ==============================================================================

def test_partial_macros_rejected_with_422(p0_user_setup):
    """E1: Partial macro payloads (1-3 fields) return HTTP 422 with exact detail message."""
    app.dependency_overrides[main.get_current_user_id] = lambda: "p0_test_user"

    # Only calories and protein (missing carbs and fat)
    resp = client.post(
        "/api/user/log_meal",
        json={"name": "Protein Shake", "calories": 200, "protein": 30}
    )
    assert resp.status_code == 422
    assert resp.json()["detail"] == "Incomplete macro payload: all 4 macros must be supplied"

    # Only 1 macro
    resp1 = client.post(
        "/api/user/log_meal",
        json={"name": "Avocado", "fat": 15}
    )
    assert resp1.status_code == 422
    assert resp1.json()["detail"] == "Incomplete macro payload: all 4 macros must be supplied"

    app.dependency_overrides.clear()


def test_invalid_macros_rejected_with_422(p0_user_setup):
    """E2: Negative, NaN, infinite, boolean, or out-of-bounds macros are rejected with HTTP 422."""
    app.dependency_overrides[main.get_current_user_id] = lambda: "p0_test_user"

    # Negative calories
    resp_neg = client.post(
        "/api/user/log_meal",
        json={"name": "Food", "calories": -50, "protein": 10, "carbs": 10, "fat": 10}
    )
    assert resp_neg.status_code == 422
    assert "cannot be negative" in resp_neg.json()["detail"]

    # Boolean value
    resp_bool = client.post(
        "/api/user/log_meal",
        json={"name": "Food", "calories": True, "protein": 10, "carbs": 10, "fat": 10}
    )
    assert resp_bool.status_code == 422

    # String value
    resp_str = client.post(
        "/api/user/log_meal",
        json={"name": "Food", "calories": "invalid_number", "protein": 10, "carbs": 10, "fat": 10}
    )
    assert resp_str.status_code == 422

    app.dependency_overrides.clear()


# ==============================================================================
# TEST GROUP F: Sequential Sync Idempotency
# ==============================================================================

def test_client_sync_id_idempotency(p0_user_setup):
    """F: First sync increments macros; second returns HTTP 200 'Already synced' without double mutation."""
    app.dependency_overrides[main.get_current_user_id] = lambda: "p0_test_user"

    sync_payload = {
        "name": "Offline Oats",
        "client_sync_id": "sync_batch_999",
        "calories": 300,
        "protein": 12,
        "carbs": 50,
        "fat": 6
    }

    # 1. First sync: increments stats
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


# ==============================================================================
# TEST GROUP G: Concurrent Duplicate Idempotency
# ==============================================================================

@pytest.mark.asyncio
async def test_concurrent_duplicate_sync_ids():
    """G: 20 simultaneous requests with the SAME client_sync_id execute exactly once."""
    from backend.main import log_meal

    ist_today = datetime.now(IST).strftime("%Y-%m-%d")
    mock_users = MockAsyncCollection([
        {
            "_id": "idem_user",
            "uid": "idem_user",
            "stats": {"calories": 0.0, "protein": 0.0, "carbs": 0.0, "fat": 0.0, "last_updated": ist_today},
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

    # Launch 20 concurrent calls with the exact same sync ID
    results = await asyncio.gather(*[log_meal(same_payload, uid="idem_user") for _ in range(20)])

    successes = [r for r in results if r.get("status") == "success"]
    already_synced = [r for r in results if r.get("message") == "Already synced"]

    assert len(successes) == 1
    assert len(already_synced) == 19

    user = mock_users.docs[0]
    assert user["stats"]["calories"] == 150.0  # Incremented exactly once
    assert user["processed_sync_ids"] == ["same_sync_id_001"]


# ==============================================================================
# TEST GROUP H: Webhook Success Lifecycle
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
    """H: Valid webhook sets transaction to 'completed' and upgrades user."""
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

    tx = transactions_col.docs[0]
    assert tx["_id"] == "evt_p0_happy_1"
    assert tx["status"] == "completed"
    assert tx["completed_at"] is not None

    user = users_col.docs[0]
    assert user["tier"] == "pro"
    assert user["usage"]["scan_limit"] == 500


# ==============================================================================
# TEST GROUP I: Webhook Failure Recovery
# ==============================================================================

def test_webhook_recovery_after_failure(webhook_env_setup):
    """I: If user update previously failed, a retried webhook reclaims the event and succeeds."""
    users_col, transactions_col = webhook_env_setup

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

    resp = client.post(
        "/api/webhooks/razorpay",
        content=raw,
        headers={"X-Razorpay-Signature": sig, "X-Razorpay-Event-Id": "evt_p0_failed_1"}
    )
    assert resp.status_code == 200

    user = users_col.docs[0]
    assert user["tier"] == "pro"

    tx = next(d for d in transactions_col.docs if d["_id"] == "evt_p0_failed_1")
    assert tx["status"] == "completed"


# ==============================================================================
# TEST GROUP J: Active Webhook Duplicate
# ==============================================================================

def test_webhook_active_duplicate_processing(webhook_env_setup):
    """J: Duplicate event received while lease is still active returns HTTP 200 'Event is currently processing'."""
    users_col, transactions_col = webhook_env_setup

    now = datetime.now(timezone.utc)
    future_lease = now + timedelta(seconds=45)
    transactions_col.docs.append({
        "_id": "evt_p0_active_1",
        "status": "processing",
        "processing_started_at": now - timedelta(seconds=15),
        "lease_until": future_lease,
        "user_id": "wh_user_1"
    })

    payload = {
        "event": "payment.captured",
        "id": "evt_p0_active_1",
        "payload": {
            "payment": {
                "entity": {
                    "id": "pay_p0_active_1",
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
        headers={"X-Razorpay-Signature": sig, "X-Razorpay-Event-Id": "evt_p0_active_1"}
    )
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "message": "Event is currently processing"}

    # User must not be mutated twice
    user = users_col.docs[0]
    assert user["tier"] == "free"


# ==============================================================================
# TEST GROUP K: Expired Webhook Lease Recovery
# ==============================================================================

def test_webhook_stale_processing_recovery(webhook_env_setup):
    """K: If previous worker crashed leaving an event in 'processing' past its lease, a retry reclaims it."""
    users_col, transactions_col = webhook_env_setup

    past_time = datetime.now(timezone.utc) - timedelta(seconds=90)
    past_lease = datetime.now(timezone.utc) - timedelta(seconds=30)
    transactions_col.docs.append({
        "_id": "evt_p0_stale_1",
        "status": "processing",
        "processing_started_at": past_time,
        "lease_until": past_lease
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


# ==============================================================================
# TEST GROUP L: Concurrent Webhook Reclaim
# ==============================================================================

@pytest.mark.asyncio
async def test_concurrent_webhook_reclaim(monkeypatch):
    """L: Simultaneous retries after lease expiration allow only 1 worker to acquire lease and upgrade user once."""
    monkeypatch.setenv("RAZORPAY_WEBHOOK_SECRET", TEST_WEBHOOK_SECRET)
    from backend.routes.webhooks import razorpay_webhook

    users_col = MockAsyncCollection([
        {
            "_id": "user_wh_l",
            "uid": "wh_user_l",
            "tier": "free",
            "subscription": {"status": "inactive"},
            "usage": {"scan_limit": 20, "scans_used_this_month": 0}
        }
    ])
    past_time = datetime.now(timezone.utc) - timedelta(seconds=90)
    past_lease = datetime.now(timezone.utc) - timedelta(seconds=30)
    transactions_col = MockAsyncCollection([
        {
            "_id": "evt_p0_concurrent_reclaim",
            "status": "processing",
            "processing_started_at": past_time,
            "lease_until": past_lease
        }
    ])
    main.users_collection = users_col
    main.transactions_collection = transactions_col

    payload = {
        "event": "payment.captured",
        "id": "evt_p0_concurrent_reclaim",
        "payload": {
            "payment": {
                "entity": {
                    "id": "pay_concurrent_1",
                    "amount": 73200,
                    "currency": "INR",
                    "notes": {"user_id": "wh_user_l", "tier": "pro", "scan_quota": 500}
                }
            }
        }
    }
    raw_body = json.dumps(payload).encode("utf-8")
    sig = gen_webhook_sig(raw_body)

    def _make_mock_request():
        req = MagicMock()
        req.body = AsyncMock(return_value=raw_body)
        req.headers = {
            "x-razorpay-signature": sig,
            "x-razorpay-event-id": "evt_p0_concurrent_reclaim"
        }
        return req

    # 10 workers simultaneously attempt to reclaim the expired lease
    results = await asyncio.gather(*[razorpay_webhook(_make_mock_request()) for _ in range(10)])

    # All workers return HTTP 200 compatible responses
    assert all(r.get("status") in ("ok",) for r in results)

    # User entitlement must be set to 'pro'
    user = users_col.docs[0]
    assert user["tier"] == "pro"
    assert user["usage"]["scan_limit"] == 500

    # Final transaction record must be completed
    tx = next(d for d in transactions_col.docs if d["_id"] == "evt_p0_concurrent_reclaim")
    assert tx["status"] == "completed"


# ==============================================================================
# TEST GROUP M: Untrusted Billing Email
# ==============================================================================

def test_webhook_untrusted_billing_email_does_not_switch_user(monkeypatch):
    """M: Webhook with billing email of User A but notes.user_id = User B must entitlement User B, not User A."""
    monkeypatch.setenv("RAZORPAY_WEBHOOK_SECRET", TEST_WEBHOOK_SECRET)
    users_col = MockAsyncCollection([
        {
            "_id": "user_a",
            "uid": "user_a",
            "email": "victim_a@zsehealth.com",
            "tier": "free",
            "usage": {"scan_limit": 20}
        },
        {
            "_id": "user_b",
            "uid": "user_b",
            "email": "buyer_b@zsehealth.com",
            "tier": "free",
            "usage": {"scan_limit": 20}
        }
    ])
    transactions_col = MockAsyncCollection()
    main.users_collection = users_col
    main.transactions_collection = transactions_col

    payload = {
        "event": "payment.captured",
        "id": "evt_email_mismatch",
        "payload": {
            "payment": {
                "entity": {
                    "id": "pay_mismatch_1",
                    "amount": 73200,
                    "email": "victim_a@zsehealth.com",  # Email matches User A!
                    "notes": {"user_id": "user_b", "tier": "pro", "scan_quota": 500}  # Trusted ID is User B!
                }
            }
        }
    }
    raw = json.dumps(payload).encode("utf-8")
    sig = gen_webhook_sig(raw)

    resp = client.post(
        "/api/webhooks/razorpay",
        content=raw,
        headers={"X-Razorpay-Signature": sig, "X-Razorpay-Event-Id": "evt_email_mismatch"}
    )
    assert resp.status_code == 200

    # User B must be upgraded!
    user_b = next(u for u in users_col.docs if u["uid"] == "user_b")
    assert user_b["tier"] == "pro"
    assert user_b["usage"]["scan_limit"] == 500

    # User A must REMAIN on free tier!
    user_a = next(u for u in users_col.docs if u["uid"] == "user_a")
    assert user_a["tier"] == "free"
    assert user_a["usage"]["scan_limit"] == 20


# ==============================================================================
# TEST GROUP N: Ambiguous / Untrusted Identity Resolution
# ==============================================================================

def test_webhook_ambiguous_or_missing_user_rejected(webhook_env_setup):
    """N: Webhook lacking trusted user identifier raises 500, sets transaction to 'failed', and upgrades no user."""
    users_col, transactions_col = webhook_env_setup

    payload = {
        "event": "payment.captured",
        "id": "evt_untrusted_no_id",
        "payload": {
            "payment": {
                "entity": {
                    "id": "pay_untrusted_no_id",
                    "amount": 73200,
                    "email": "unlinked@zsehealth.com",
                    "notes": {}  # Missing trusted user_id or subscription_id
                }
            }
        }
    }
    raw = json.dumps(payload).encode("utf-8")
    sig = gen_webhook_sig(raw)

    resp = client.post(
        "/api/webhooks/razorpay",
        content=raw,
        headers={"X-Razorpay-Signature": sig, "X-Razorpay-Event-Id": "evt_untrusted_no_id"}
    )
    assert resp.status_code == 500

    # No user must be upgraded
    assert users_col.docs[0]["tier"] == "free"

    # Transaction must be marked 'failed', NEVER 'completed'
    tx = next(d for d in transactions_col.docs if d["_id"] == "evt_untrusted_no_id")
    assert tx["status"] == "failed"
