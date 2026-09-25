"""
Entitlements and Quota Management Service — Z-SeHealth
Authoritative Single Source of Truth for Subscription Features, Tier Gating, and Metered Quotas.

Handles:
1. Feature Entitlements (smart_meal_planning, barcode_search, advanced_barcode_catalog, etc.)
2. Usage Quotas (monthly_scans, unlimited semantics via None)
3. Atomic MongoDB Quota Reservation and Refund
4. Standardized Machine-Readable 403 Forbidden Error Contract for <UpgradeModal />
5. Option-B Monthly Reset Strategy
"""
import sys
from fastapi import HTTPException, Header, Depends
from datetime import datetime, timezone, date as date_type
from typing import Optional, Dict, Any, List

# -----------------------------------------------------------------------------
# AUTHORITATIVE SUBSCRIPTION PLAN ENTITLEMENT MATRIX
# Baseline:
# - free:    20 scans,  smart_meal_planning=False, barcode_search=True
# - starter: 100 scans, smart_meal_planning=True (basic), barcode_search=True
# - pro:     500 scans, smart_meal_planning=True, seven_day_revolving_planner=True, priority_ocr=True
# - elite:   unlimited (None), all features enabled
# -----------------------------------------------------------------------------
TIER_ENTITLEMENTS: Dict[str, Dict[str, Any]] = {
    "free": {
        "name": "Z-Free",
        "monthly_scan_limit": 20,
        "monthly_scans": 20,
        "features": {
            "smart_meal_planning": False,
            "seven_day_revolving_planner": False,
            "barcode_search": True,
            "barcode_scanner": True,
            "advanced_barcode_catalog": False,
            "priority_ocr": False,
            "food_search": True,
            "meal_logging": True,
            "daily_stats": True,
            "multi_meal_batch": True,
            "dietary_filters": False,
            "advanced_analytics": False,
            "priority_ai": False,
            "voice_input": False,
            "premium_badge": False,
            "email_support": False,
            "priority_support": False,
        }
    },
    "starter": {
        "name": "Z-Starter",
        "monthly_scan_limit": 100,
        "monthly_scans": 100,
        "features": {
            "smart_meal_planning": True,
            "seven_day_revolving_planner": False,
            "barcode_search": True,
            "barcode_scanner": True,
            "advanced_barcode_catalog": False,
            "priority_ocr": False,
            "food_search": True,
            "meal_logging": True,
            "daily_stats": True,
            "multi_meal_batch": True,
            "dietary_filters": True,
            "advanced_analytics": False,
            "priority_ai": False,
            "voice_input": False,
            "premium_badge": True,
            "email_support": True,
            "priority_support": False,
        }
    },
    "pro": {
        "name": "Z-Pro",
        "monthly_scan_limit": 500,
        "monthly_scans": 500,
        "features": {
            "smart_meal_planning": True,
            "seven_day_revolving_planner": True,
            "barcode_search": True,
            "barcode_scanner": True,
            "advanced_barcode_catalog": True,
            "priority_ocr": True,
            "food_search": True,
            "meal_logging": True,
            "daily_stats": True,
            "multi_meal_batch": True,
            "dietary_filters": True,
            "advanced_analytics": True,
            "priority_ai": False,
            "voice_input": False,
            "premium_badge": True,
            "email_support": True,
            "priority_support": True,
        }
    },
    "elite": {
        "name": "Z-Elite",
        "monthly_scan_limit": None,  # Explicitly unlimited (never arbitrary integer like 999999999)
        "monthly_scans": None,
        "features": {
            "smart_meal_planning": True,
            "seven_day_revolving_planner": True,
            "barcode_search": True,
            "barcode_scanner": True,
            "advanced_barcode_catalog": True,
            "priority_ocr": True,
            "food_search": True,
            "meal_logging": True,
            "daily_stats": True,
            "multi_meal_batch": True,
            "dietary_filters": True,
            "advanced_analytics": True,
            "priority_ai": True,
            "voice_input": True,
            "premium_badge": True,
            "email_support": True,
            "priority_support": True,
        }
    }
}

# Backward compatible dictionary of scan limits
TIER_SCAN_LIMITS: Dict[str, Optional[int]] = {
    tier: data.get("monthly_scan_limit", data.get("monthly_scans")) for tier, data in TIER_ENTITLEMENTS.items()
}


def normalize_tier(tier: Optional[str]) -> str:
    """
    Normalizes tier string safely.
    - None / empty string / whitespace defaults to 'free' (safe baseline).
    - Unrecognized tier returns 'unknown' (fails closed, zero access).
    """
    if not tier or not isinstance(tier, str):
        return "free"
    cleaned = tier.strip().lower()
    if not cleaned:
        return "free"
    return cleaned if cleaned in TIER_ENTITLEMENTS else "unknown"


def has_feature(tier: Optional[str], feature_name: str) -> bool:
    """Returns True if normalized tier is explicitly entitled to feature_name."""
    norm_tier = normalize_tier(tier)
    if norm_tier == "unknown":
        return False
    return bool(TIER_ENTITLEMENTS.get(norm_tier, {}).get("features", {}).get(feature_name, False))


def get_tier_features(tier: Optional[str]) -> Dict[str, bool]:
    """Returns complete map of boolean features for tier."""
    norm_tier = normalize_tier(tier)
    if norm_tier == "unknown":
        return {k: False for k in TIER_ENTITLEMENTS["free"]["features"]}
    return dict(TIER_ENTITLEMENTS.get(norm_tier, {}).get("features", {}))


def get_tier_quota(tier: Optional[str], quota_name: str = "monthly_scans") -> Optional[int]:
    """Returns metered quota limit for tier (None represents explicitly unlimited)."""
    norm_tier = normalize_tier(tier)
    if norm_tier == "unknown":
        return 0
    t_info = TIER_ENTITLEMENTS.get(norm_tier, {})
    if quota_name in t_info:
        return t_info[quota_name]
    if quota_name in ("monthly_scans", "monthly_scan_limit"):
        return t_info.get("monthly_scan_limit", t_info.get("monthly_scans", 20))
    return t_info.get(quota_name, 20)


def get_current_period() -> str:
    """Returns the current calendar billing period as YYYY-MM."""
    return datetime.now(timezone.utc).strftime("%Y-%m")


def get_tiers_for_feature(feature_name: str) -> List[str]:
    """Returns list of tiers that have feature_name enabled."""
    return [
        t for t, data in TIER_ENTITLEMENTS.items()
        if data.get("features", {}).get(feature_name, False)
    ]


def get_next_reset_date() -> str:
    """Returns the 1st day of next month as YYYY-MM-DD string."""
    today = datetime.now(timezone.utc)
    if today.month == 12:
        next_month = date_type(today.year + 1, 1, 1)
    else:
        next_month = date_type(today.year, today.month + 1, 1)
    return next_month.strftime("%Y-%m-%d")


# -----------------------------------------------------------------------------
# STANDARDIZED 403 EXCEPTION FOR FEATURE ENTITLEMENT FAILURES
# -----------------------------------------------------------------------------
class FeatureNotEntitledException(HTTPException):
    """
    Standardized machine-readable HTTP 403 for tier gating.
    Matches frontend <UpgradeModal /> contract.
    """
    def __init__(
        self,
        feature: str,
        current_tier: str,
        required_tiers: Optional[List[str]] = None,
        message: Optional[str] = None
    ):
        req_tiers = required_tiers or get_tiers_for_feature(feature)
        feature_human = feature.replace("_", " ").capitalize()
        msg = message or f"{feature_human} is not available on your current subscription plan."
        
        self.error_dict = {
            "code": "FEATURE_NOT_ENTITLED",
            "message": msg,
            "feature": feature,
            "current_tier": current_tier,
            "required_tiers": req_tiers,
            "upgrade_required": True
        }
        
        super().__init__(
            status_code=403,
            detail=self.error_dict
        )


# -----------------------------------------------------------------------------
# STANDARDIZED 429 EXCEPTION FOR SCAN QUOTA EXHAUSTION
# -----------------------------------------------------------------------------
class QuotaExceededException(HTTPException):
    """
    Standardized machine-readable HTTP 429 for monthly scan quota exhaustion.
    """
    def __init__(
        self,
        current_tier: str,
        limit: int,
        current_used: int,
        feature: str = "scan",
        message: Optional[str] = None
    ):
        msg = message or f"Monthly scan quota exceeded ({current_used}/{limit}). Upgrade your plan to continue scanning."
        self.error_dict = {
            "code": "QUOTA_EXCEEDED",
            "message": msg,
            "feature": feature,
            "current_tier": current_tier,
            "monthly_limit": limit,
            "upgrade_required": True
        }
        super().__init__(
            status_code=429,
            detail=self.error_dict
        )


# -----------------------------------------------------------------------------
# REUSABLE FASTAPI DEPENDENCY FACTORY
# -----------------------------------------------------------------------------
def require_tier_feature(feature_name: str):
    """
    FastAPI dependency factory enforcing server-side feature entitlement.
    Resolves user document from database via authenticated UID.
    Never trusts client-supplied tier in request bodies or query parameters.
    Fails closed (HTTP 403) if tier does not have the feature or tier is unknown.
    """
    async def dependency(
        authorization: Optional[str] = Header(None)
    ) -> Dict[str, Any]:
        main_mod = sys.modules.get("main") or sys.modules.get("backend.main")
        uid: Optional[str] = None

        if main_mod and hasattr(main_mod, "get_current_user_id"):
            try:
                uid = await main_mod.get_current_user_id(authorization)
            except HTTPException:
                raise
            except Exception:
                uid = None

        if not uid and authorization and authorization.startswith("Bearer "):
            token = authorization.split(" ")[1].strip()
            try:
                import firebase_admin.auth as fb_auth
                decoded = fb_auth.verify_id_token(token)
                uid = decoded.get("uid")
            except Exception:
                raise HTTPException(status_code=401, detail="Invalid authentication token")

        if not uid:
            raise HTTPException(status_code=401, detail="Missing or invalid authentication token")

        # Resolve authoritative user document from database
        users_col = None
        if main_mod and hasattr(main_mod, "users_collection"):
            users_col = main_mod.users_collection
        elif main_mod and hasattr(main_mod, "db"):
            users_col = main_mod.db["users"]

        user = None
        if users_col is not None:
            user = await users_col.find_one({"uid": uid})

        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        # Server-side authoritative tier evaluation
        raw_tier = user.get("tier")
        effective_tier = normalize_tier(raw_tier)

        if not has_feature(effective_tier, feature_name):
            req_tiers = get_tiers_for_feature(feature_name)
            raise FeatureNotEntitledException(
                feature=feature_name,
                current_tier=raw_tier if raw_tier else "free",
                required_tiers=req_tiers,
                message=f"{feature_name.replace('_', ' ').capitalize()} is not available on the current subscription."
            )

        return user

    return dependency


# -----------------------------------------------------------------------------
# ATOMIC USAGE QUOTA RESERVATION, CONSUMPTION & REFUND
# -----------------------------------------------------------------------------
async def reserve_scan_quota(uid: str, users_collection) -> bool:
    """
    Atomically checks and reserves 1 scan slot if user has remaining quota.
    - Applies monthly reset if reset_date has passed or scan_period has rolled over.
    - For elite tier (limit is None), always succeeds (unlimited).
    - Uses atomic MongoDB update query: usage.scans_used_this_month < limit.
    - Prevents race conditions where two simultaneous requests could exceed quota.
    """
    user = await users_collection.find_one({"uid": uid})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    raw_tier = user.get("tier")
    tier = normalize_tier(raw_tier)
    if tier == "unknown":
        return False

    limit = get_tier_quota(tier, "monthly_scans")
    usage = user.get("usage", {})
    scans_used = usage.get("scans_used_this_month", 0)
    reset_date_str = usage.get("reset_date", "")
    today_dt = datetime.now(timezone.utc)
    today_str = today_dt.strftime("%Y-%m-%d")
    current_period = today_dt.strftime("%Y-%m")
    stored_period = usage.get("scan_period", "")
    new_reset_date = get_next_reset_date()

    # Monthly rollover: reset if scan_period rolled over or reset_date passed
    needs_reset = (stored_period and stored_period != current_period) or (reset_date_str and reset_date_str <= today_str)

    if needs_reset:
        scans_used = 0
        await users_collection.update_one(
            {
                "uid": uid,
                "$or": [
                    {"usage.scan_period": {"$ne": current_period}},
                    {"usage.reset_date": {"$lte": today_str}},
                    {"usage.scan_period": {"$exists": False}},
                ]
            },
            {"$set": {
                "usage.scans_used_this_month": 0,
                "usage.scan_period": current_period,
                "usage.reset_date": new_reset_date,
                "usage.scan_limit": limit,
            }}
        )

    # Elite tier: Explicitly unlimited (None) - no numeric comparison with None
    if limit is None:
        await users_collection.update_one(
            {"uid": uid},
            {
                "$inc": {"usage.scans_used_this_month": 1},
                "$set": {
                    "usage.scan_period": current_period,
                    "usage.reset_date": usage.get("reset_date") or new_reset_date,
                    "usage.scan_limit": None,
                }
            }
        )
        return True

    # Atomic reservation query: matched only if scans_used_this_month < limit
    update_res = await users_collection.update_one(
        {
            "uid": uid,
            "$or": [
                {"usage.scans_used_this_month": {"$lt": limit}},
                {"usage.scans_used_this_month": {"$exists": False}},
            ]
        },
        {
            "$inc": {"usage.scans_used_this_month": 1},
            "$set": {
                "usage.scan_period": current_period,
                "usage.reset_date": usage.get("reset_date") or new_reset_date,
                "usage.scan_limit": limit,
            }
        }
    )

    matched = getattr(update_res, "matched_count", 0)
    if matched == 0:
        # Check fresh state
        user_fresh = await users_collection.find_one({"uid": uid})
        curr_used = user_fresh.get("usage", {}).get("scans_used_this_month", scans_used) if user_fresh else scans_used
        if curr_used >= limit:
            return False
        if scans_used >= limit:
            return False

    return True


async def release_scan_quota(uid: str, users_collection) -> None:
    """
    Atomically releases a previously reserved scan slot upon operation failure.
    Guarded so usage.scans_used_this_month cannot decrement below zero.
    """
    await users_collection.update_one(
        {"uid": uid, "usage.scans_used_this_month": {"$gt": 0}},
        {"$inc": {"usage.scans_used_this_month": -1}}
    )


async def check_scan_quota(uid: str, users_collection) -> None:
    """
    Checks and atomically consumes 1 scan quota slot.
    Raises QuotaExceededException (HTTP 429) if quota exceeded.
    Preserves backward compatibility with legacy route callers.
    """
    user = await users_collection.find_one({"uid": uid})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    raw_tier = user.get("tier")
    tier = normalize_tier(raw_tier)
    limit = get_tier_quota(tier, "monthly_scans")

    reserved = await reserve_scan_quota(uid, users_collection)
    if not reserved:
        user_fresh = await users_collection.find_one({"uid": uid})
        curr = user_fresh.get("usage", {}).get("scans_used_this_month", limit) if user_fresh else limit
        raise QuotaExceededException(
            current_tier=tier,
            limit=limit,
            current_used=curr
        )


async def get_user_quota_status(uid: str, users_collection) -> Dict[str, Any]:
    """
    Returns current quota status for a user without consuming a scan slot.
    Used by /api/subscription/status and frontend user stats context.
    """
    user = await users_collection.find_one({"uid": uid})
    if not user:
        return {
            "scans_used": 0,
            "scan_limit": 20,
            "tier": "free",
            "reset_date": get_next_reset_date(),
            "scan_period": get_current_period()
        }

    raw_tier = user.get("tier")
    tier = normalize_tier(raw_tier)
    limit = get_tier_quota(tier, "monthly_scans")
    usage = user.get("usage", {})
    scans_used = usage.get("scans_used_this_month", 0)
    reset_date = usage.get("reset_date", get_next_reset_date())
    stored_period = usage.get("scan_period", "")

    today_dt = datetime.now(timezone.utc)
    today_str = today_dt.strftime("%Y-%m-%d")
    current_period = today_dt.strftime("%Y-%m")
    new_reset_date = get_next_reset_date()

    if (stored_period and stored_period != current_period) or (reset_date and reset_date <= today_str):
        scans_used = 0
        await users_collection.update_one(
            {"uid": uid},
            {"$set": {
                "usage.scans_used_this_month": 0,
                "usage.scan_period": current_period,
                "usage.reset_date": new_reset_date,
                "usage.scan_limit": limit,
            }}
        )
        reset_date = new_reset_date

    return {
        "scans_used": scans_used,
        "scan_limit": limit,
        "tier": tier,
        "reset_date": reset_date,
        "scan_period": current_period,
    }
