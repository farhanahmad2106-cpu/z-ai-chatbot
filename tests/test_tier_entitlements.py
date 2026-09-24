"""
Automated Test Suite for Freemium Tier-Gating Enforcement, Quota Consistency & FastAPI Lifespan
Tests:
1. Subscription Feature Entitlements (Free, Starter, Pro, Elite, Unknown tier)
2. Standardized 403 Response Contract for <UpgradeModal />
3. Server-side Enforcement (Client body/query cannot bypass tier)
4. Metered Barcode Scanner Quota Matrix (0/20, 19/20, 20/20, 499/500, 500/500, Elite Unlimited)
5. Failed Request Quota Refund / Idempotency Safety
6. Atomic Concurrency / Race Condition Protection
7. Modern FastAPI Lifespan Startup & Teardown Verification
"""

import sys
import os
import asyncio
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from backend.main import app, lifespan
from backend.middleware.quota_check import (
    TIER_ENTITLEMENTS,
    has_feature,
    normalize_tier,
    get_tier_quota,
    get_tier_features,
    get_tiers_for_feature,
    reserve_scan_quota,
    release_scan_quota,
    check_scan_quota,
    get_user_quota_status,
    FeatureNotEntitledException,
)
import routes.meals


client = TestClient(app)


# ============================================================================
# 1. CANONICAL ENTITLEMENT MODEL TESTS
# ============================================================================
def test_1_canonical_entitlement_model_matrix():
    """Verify authoritative baseline plan matrix."""
    assert TIER_ENTITLEMENTS["free"]["monthly_scans"] == 20
    assert TIER_ENTITLEMENTS["free"]["features"]["smart_meal_planning"] is False
    assert TIER_ENTITLEMENTS["free"]["features"]["barcode_search"] is True

    assert TIER_ENTITLEMENTS["starter"]["monthly_scans"] == 100
    assert TIER_ENTITLEMENTS["starter"]["features"]["smart_meal_planning"] is True
    assert TIER_ENTITLEMENTS["starter"]["features"]["seven_day_revolving_planner"] is False

    assert TIER_ENTITLEMENTS["pro"]["monthly_scans"] == 500
    assert TIER_ENTITLEMENTS["pro"]["features"]["smart_meal_planning"] is True
    assert TIER_ENTITLEMENTS["pro"]["features"]["seven_day_revolving_planner"] is True

    # Elite must be explicitly unlimited (None, not 999999999)
    assert TIER_ENTITLEMENTS["elite"]["monthly_scans"] is None
    assert TIER_ENTITLEMENTS["elite"]["features"]["smart_meal_planning"] is True
    assert TIER_ENTITLEMENTS["elite"]["features"]["seven_day_revolving_planner"] is True


def test_2_normalize_tier_fail_closed():
    """Missing tiers default safely to 'free'; unknown tiers fail closed to 'unknown'."""
    assert normalize_tier(None) == "free"
    assert normalize_tier("") == "free"
    assert normalize_tier("   ") == "free"
    assert normalize_tier("free") == "free"
    assert normalize_tier("FREE") == "free"
    assert normalize_tier("Starter") == "starter"
    assert normalize_tier("PRO") == "pro"
    assert normalize_tier("elite") == "elite"
    assert normalize_tier("hacker_vip") == "unknown"
    assert normalize_tier("admin_injected") == "unknown"

    # Unknown tier must have 0 features and 0 quota
    assert has_feature("unknown", "smart_meal_planning") is False
    assert get_tier_quota("unknown") == 0


# ============================================================================
# 2. FEATURE GATING & STANDARDIZED 403 RESPONSE CONTRACT
# ============================================================================
def test_3_free_user_weekly_plan_denied_403_contract():
    """Free user calling POST /api/meals/weekly-plan receives structured 403."""
    mock_uid = "free_user_uid_101"
    
    def override_auth():
        return mock_uid
    
    app.dependency_overrides[routes.meals.get_current_user_id] = override_auth

    mock_users_col = AsyncMock()
    mock_users_col.find_one.return_value = {
        "uid": mock_uid,
        "tier": "free",
        "health_profile": {},
        "preferences": {},
        "daily_goals": {"calories": 2000}
    }

    try:
        with patch("routes.meals.get_users_collection", return_value=mock_users_col):
            response = client.post(
                "/api/meals/weekly-plan",
                json={"target_calories": 2000, "force_regenerate": True}
            )
            assert response.status_code == 403
            data = response.json()
            assert "error" in data
            err = data["error"]
            assert err["code"] == "FEATURE_NOT_ENTITLED"
            assert err["feature"] == "smart_meal_planning"
            assert err["current_tier"] == "free"
            assert err["upgrade_required"] is True
            assert isinstance(err["required_tiers"], list)
            assert "starter" in err["required_tiers"]
            assert "pro" in err["required_tiers"]
            assert "elite" in err["required_tiers"]
    finally:
        app.dependency_overrides.clear()


def test_4_starter_pro_elite_allowed_on_smart_meal_planning():
    """Starter, Pro, and Elite users are entitled to smart meal planning."""
    for allowed_tier in ["starter", "pro", "elite"]:
        mock_uid = f"{allowed_tier}_user_uid_202"

        def override_auth():
            return mock_uid

        app.dependency_overrides[routes.meals.get_current_user_id] = override_auth

        mock_users_col = AsyncMock()
        mock_users_col.find_one.return_value = {
            "uid": mock_uid,
            "tier": allowed_tier,
            "health_profile": {},
            "preferences": {},
            "daily_goals": {"calories": 2000}
        }
        mock_plans_col = AsyncMock()
        mock_plans_col.find_one.return_value = None

        try:
            with patch("routes.meals.get_users_collection", return_value=mock_users_col), \
                 patch("routes.meals.get_weekly_plans_collection", return_value=mock_plans_col):
                response = client.post(
                    "/api/meals/weekly-plan",
                    json={"target_calories": 2000, "force_regenerate": True}
                )
                assert response.status_code == 200, f"Tier {allowed_tier} failed: {response.text}"
                data = response.json()
                assert len(data.get("days", [])) == 7
        finally:
            app.dependency_overrides.clear()


def test_5_client_tier_spoofing_prevention():
    """Client sending malicious 'tier': 'elite' in payload cannot bypass free tier server state."""
    mock_uid = "spoofing_user_uid_303"

    def override_auth():
        return mock_uid

    app.dependency_overrides[routes.meals.get_current_user_id] = override_auth

    # Server database explicitly says 'free'
    mock_users_col = AsyncMock()
    mock_users_col.find_one.return_value = {
        "uid": mock_uid,
        "tier": "free",
        "health_profile": {},
        "preferences": {},
        "daily_goals": {"calories": 2000}
    }

    try:
        with patch("routes.meals.get_users_collection", return_value=mock_users_col):
            # Malicious client sends tier: elite in payload
            response = client.post(
                "/api/meals/weekly-plan",
                json={"target_calories": 2000, "tier": "elite", "features": {"smart_meal_planning": True}}
            )
            assert response.status_code == 403
            assert response.json()["error"]["code"] == "FEATURE_NOT_ENTITLED"
            assert response.json()["error"]["current_tier"] == "free"
    finally:
        app.dependency_overrides.clear()


# ============================================================================
# 3. METERED SCANNER QUOTA MATRIX TESTS
# ============================================================================
class MockUserCollectionForQuota:
    def __init__(self, initial_user):
        self.user = dict(initial_user)
        self.update_log = []

    async def find_one(self, query):
        if query.get("uid") == self.user.get("uid"):
            return dict(self.user)
        return None

    async def update_one(self, filter_query, update_query):
        self.update_log.append((filter_query, update_query))
        
        # Check match
        if filter_query.get("uid") != self.user.get("uid"):
            mock_res = MagicMock()
            mock_res.matched_count = 0
            return mock_res

        # Check atomic condition
        if "$or" in filter_query:
            conditions = filter_query["$or"]
            curr_used = self.user.get("usage", {}).get("scans_used_this_month", 0)
            matched = False
            for cond in conditions:
                if "usage.scans_used_this_month" in cond:
                    sub_cond = cond["usage.scans_used_this_month"]
                    if "$lt" in sub_cond and curr_used < sub_cond["$lt"]:
                        matched = True
                        break
            if not matched:
                mock_res = MagicMock()
                mock_res.matched_count = 0
                return mock_res

        # Apply $inc
        if "$inc" in update_query:
            inc_val = update_query["$inc"].get("usage.scans_used_this_month", 0)
            curr = self.user.setdefault("usage", {}).get("scans_used_this_month", 0)
            self.user["usage"]["scans_used_this_month"] = max(0, curr + inc_val)

        # Apply $set
        if "$set" in update_query:
            for k, v in update_query["$set"].items():
                if k.startswith("usage."):
                    sub_k = k.split(".")[1]
                    self.user.setdefault("usage", {})[sub_k] = v
                else:
                    self.user[k] = v

        mock_res = MagicMock()
        mock_res.matched_count = 1
        return mock_res


@pytest.mark.asyncio
async def test_6_scanner_quota_matrix_free_user():
    """Free user: 0/20 allowed, 19/20 allowed, 20/20 rejected (429)."""
    # 0/20 -> Allowed
    mock_db = MockUserCollectionForQuota({
        "uid": "free_u1",
        "tier": "free",
        "usage": {"scans_used_this_month": 0, "reset_date": "2099-01-01"}
    })
    ok = await reserve_scan_quota("free_u1", mock_db)
    assert ok is True
    assert mock_db.user["usage"]["scans_used_this_month"] == 1

    # 19/20 -> Allowed (consumes slot 20)
    mock_db.user["usage"]["scans_used_this_month"] = 19
    ok = await reserve_scan_quota("free_u1", mock_db)
    assert ok is True
    assert mock_db.user["usage"]["scans_used_this_month"] == 20

    # 20/20 -> Rejected (429)
    ok = await reserve_scan_quota("free_u1", mock_db)
    assert ok is False
    with pytest.raises(Exception) as exc_info:
        await check_scan_quota("free_u1", mock_db)
    assert "Monthly scan quota exceeded" in str(exc_info.value)


@pytest.mark.asyncio
async def test_7_scanner_quota_matrix_pro_user():
    """Pro user: 499/500 allowed, 500/500 rejected."""
    mock_db = MockUserCollectionForQuota({
        "uid": "pro_u1",
        "tier": "pro",
        "usage": {"scans_used_this_month": 499, "reset_date": "2099-01-01"}
    })
    ok = await reserve_scan_quota("pro_u1", mock_db)
    assert ok is True
    assert mock_db.user["usage"]["scans_used_this_month"] == 500

    # 500/500 -> Rejected
    ok = await reserve_scan_quota("pro_u1", mock_db)
    assert ok is False


@pytest.mark.asyncio
async def test_8_scanner_quota_elite_unlimited():
    """Elite tier: unlimited scans at arbitrary high usage (never capped)."""
    mock_db = MockUserCollectionForQuota({
        "uid": "elite_u1",
        "tier": "elite",
        "usage": {"scans_used_this_month": 84210, "reset_date": "2099-01-01"}
    })
    ok = await reserve_scan_quota("elite_u1", mock_db)
    assert ok is True
    assert mock_db.user["usage"]["scans_used_this_month"] == 84211

    # check_scan_quota must never raise for elite
    await check_scan_quota("elite_u1", mock_db)


@pytest.mark.asyncio
async def test_9_scanner_quota_release_on_failure():
    """Failed scan execution refunds/releases reserved scan slot atomically."""
    mock_db = MockUserCollectionForQuota({
        "uid": "free_u2",
        "tier": "free",
        "usage": {"scans_used_this_month": 10, "reset_date": "2099-01-01"}
    })
    
    # Reserve slot
    ok = await reserve_scan_quota("free_u2", mock_db)
    assert ok is True
    assert mock_db.user["usage"]["scans_used_this_month"] == 11

    # Simulate downstream OCR failure -> refund
    await release_scan_quota("free_u2", mock_db)
    assert mock_db.user["usage"]["scans_used_this_month"] == 10


# ============================================================================
# 4. CONCURRENCY & RACE CONDITION TEST
# ============================================================================
@pytest.mark.asyncio
async def test_10_atomic_concurrent_quota_race_condition():
    """
    Two concurrent requests at usage 19/20:
    Only ONE request can claim slot 20; the second is rejected.
    """
    mock_db = MockUserCollectionForQuota({
        "uid": "race_u1",
        "tier": "free",
        "usage": {"scans_used_this_month": 19, "reset_date": "2099-01-01"}
    })

    # Launch two simultaneous reservations
    results = await asyncio.gather(
        reserve_scan_quota("race_u1", mock_db),
        reserve_scan_quota("race_u1", mock_db)
    )

    # Exactly one succeeded and one failed
    assert sorted(results) == [False, True]
    assert mock_db.user["usage"]["scans_used_this_month"] == 20


# ============================================================================
# 5. SUBSCRIPTION STATUS CONTRACT TEST
# ============================================================================
def test_11_subscription_status_response_schema():
    """Verify /api/subscription/status exposes authoritative features, limits, and usage."""
    mock_uid = "status_test_user_uid"

    mock_users_col = AsyncMock()
    mock_users_col.find_one.return_value = {
        "uid": mock_uid,
        "tier": "pro",
        "usage": {"scans_used_this_month": 42, "reset_date": "2099-01-01"},
        "subscription": {"plan": "pro", "status": "active"}
    }

    import routes.subscriptions
    app.dependency_overrides[routes.subscriptions._get_current_user_id] = lambda: mock_uid

    try:
        with patch.object(routes.subscriptions, "_get_users_collection", return_value=mock_users_col):
            response = client.get("/api/subscription/status")
            assert response.status_code == 200
            data = response.json()
            assert data["tier"] == "pro"
            assert data["scans_used"] == 42
            assert data["scan_limit"] == 500
            assert "features" in data
            assert data["features"]["smart_meal_planning"] is True
            assert data["features"]["barcode_scanner"] is True
            assert data["limits"]["monthly_scans"] == 500
            assert data["usage"]["monthly_scans"] == 42
    finally:
        app.dependency_overrides.clear()


# ============================================================================
# 6. FASTAPI LIFESPAN LIFECYCLE TEST
# ============================================================================
@pytest.mark.asyncio
async def test_12_fastapi_lifespan_lifecycle():
    """Verify modern FastAPI lifespan initializes app.state and shuts down cleanly."""
    test_app = app

    # Enter lifespan context
    async with lifespan(test_app):
        # Startup checks
        assert hasattr(test_app.state, "mongo_client")
        assert hasattr(test_app.state, "db")
        assert hasattr(test_app.state, "db_init_task")
        assert test_app.state.mongo_client is not None
        assert test_app.state.db is not None

    # After exit (shutdown): verify task cancellation/completion
    init_task = getattr(test_app.state, "db_init_task", None)
    if init_task:
        assert init_task.done() or init_task.cancelled()
