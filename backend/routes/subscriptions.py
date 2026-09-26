"""
Subscription Routes — Z-SeHealth
Handles all subscription management: plan listing, create, cancel, and status.
"""
import os
import hashlib
import hmac
from fastapi import APIRouter, Depends, HTTPException, Header
from typing import Optional
from datetime import datetime, timezone
import httpx

def get_razorpay_key_id() -> str:
    return os.getenv("RAZORPAY_KEY_ID", "").strip().strip('"').strip("'")

def get_razorpay_key_secret() -> str:
    return os.getenv("RAZORPAY_KEY_SECRET", "").strip().strip('"').strip("'")

def get_razorpay_plan_ids() -> dict:
    return {
        "starter": os.getenv("RAZORPAY_PLAN_ID_STARTER", "").strip().strip('"').strip("'"),
        "pro":     os.getenv("RAZORPAY_PLAN_ID_PRO", "").strip().strip('"').strip("'"),
        "elite":   os.getenv("RAZORPAY_PLAN_ID_ELITE", "").strip().strip('"').strip("'"),
    }



from middleware.quota_check import (
    TIER_ENTITLEMENTS,
    normalize_tier,
    get_tier_features,
    get_tier_quota,
    get_user_quota_status,
)

# Authoritative Plan Definitions derived directly from TIER_ENTITLEMENTS
PLANS = [
    {
        "id": "free",
        "name": TIER_ENTITLEMENTS["free"]["name"],
        "price": 0,
        "currency": "INR",
        "scan_limit": TIER_ENTITLEMENTS["free"]["monthly_scans"],
        "ai_model": "NVIDIA + Gemini Flash",
        "accuracy": "Basic",
        "translation_languages": 5,
        "features": TIER_ENTITLEMENTS["free"]["features"],
        "razorpay_plan_id": None,
    },
    {
        "id": "starter",
        "name": TIER_ENTITLEMENTS["starter"]["name"],
        "price": 36600,  # in paise (₹366)
        "currency": "INR",
        "scan_limit": TIER_ENTITLEMENTS["starter"]["monthly_scans"],
        "ai_model": "NVIDIA LLaMA + Gemini",
        "accuracy": "Better",
        "translation_languages": 15,
        "features": TIER_ENTITLEMENTS["starter"]["features"],
        "razorpay_plan_id": None,
    },
    {
        "id": "pro",
        "name": TIER_ENTITLEMENTS["pro"]["name"],
        "price": 73200,  # in paise (₹732)
        "currency": "INR",
        "scan_limit": TIER_ENTITLEMENTS["pro"]["monthly_scans"],
        "ai_model": "NVIDIA Advanced + Gemini Pro",
        "accuracy": "High",
        "translation_languages": 30,
        "features": TIER_ENTITLEMENTS["pro"]["features"],
        "razorpay_plan_id": None,
    },
    {
        "id": "elite",
        "name": TIER_ENTITLEMENTS["elite"]["name"],
        "price": 99800,  # in paise (₹998)
        "currency": "INR",
        "scan_limit": TIER_ENTITLEMENTS["elite"]["monthly_scans"],  # None (unlimited)
        "ai_model": "Sarvam AI + NVIDIA",
        "accuracy": "Highest (Indian DB)",
        "translation_languages": 50,
        "features": TIER_ENTITLEMENTS["elite"]["features"],
        "razorpay_plan_id": None,
    },
]

TIER_LIMITS = {p["id"]: p["scan_limit"] for p in PLANS}

router = APIRouter(prefix="/api/subscription", tags=["Subscription"])


def _get_users_collection():
    """Lazy import to avoid circular dependency with main.py."""
    import sys
    for mod_name in ("main", "backend.main", "__main__"):
        main_module = sys.modules.get(mod_name)
        if main_module and hasattr(main_module, "users_collection") and main_module.users_collection is not None:
            return main_module.users_collection
    raise RuntimeError("users_collection not available")


async def _get_current_user_id(authorization: str = Header(None)) -> str:
    from firebase_admin import auth as firebase_auth
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    token = authorization.split(" ")[1]
    try:
        decoded_token = firebase_auth.verify_id_token(token)
        return decoded_token.get("uid")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


@router.get("/plans")
async def list_plans():
    """Returns all subscription plans with features and pricing."""
    plan_ids = get_razorpay_plan_ids()
    plans_with_dynamic_ids = []
    for plan in PLANS:
        p = dict(plan)
        if p["id"] in plan_ids:
            p["razorpay_plan_id"] = plan_ids[p["id"]]
        plans_with_dynamic_ids.append(p)
    return {"plans": plans_with_dynamic_ids}



@router.get("/status")
async def get_subscription_status(uid: str = Depends(_get_current_user_id)):
    """Returns the user's current tier, scans used, scan limit, and subscription details."""
    users_collection = _get_users_collection()
    user = await users_collection.find_one({"uid": uid})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    tier = normalize_tier(user.get("tier", "free"))
    usage = user.get("usage", {})
    subscription = user.get("subscription", {})

    quota = await get_user_quota_status(uid, users_collection)
    features = get_tier_features(tier)
    
    from middleware.quota_check import IST
    from datetime import datetime
    today_dt = datetime.now(IST)
    reset_date_str = quota.get("reset_date")
    
    days_until_reset = 0
    if reset_date_str:
        try:
            # Parse reset_date (YYYY-MM-DD)
            # Create timezone-aware datetime for the reset date at midnight IST
            reset_dt_naive = datetime.strptime(reset_date_str, "%Y-%m-%d")
            reset_dt_ist = IST.localize(reset_dt_naive) if hasattr(IST, "localize") else reset_dt_naive.replace(tzinfo=IST)
            
            # Simple calendar day difference or ceiling of 24-hr difference
            delta = reset_dt_ist - today_dt
            days_until_reset = delta.days
            if days_until_reset < 0:
                days_until_reset = 0
        except Exception:
            days_until_reset = 30

    return {
        "tier": tier,
        "scans_used": quota["scans_used"],
        "scan_limit": quota["scan_limit"],
        "reset_date": quota["reset_date"],
        "scans_used_this_month": quota["scans_used"],
        "monthly_scan_limit": quota["scan_limit"],
        "scan_period": quota["scan_period"],
        "days_until_reset": days_until_reset,
        "features": features,
        "limits": {
            "monthly_scans": quota["scan_limit"]
        },
        "usage": {
            "monthly_scans": quota["scans_used"]
        },
        "subscription": {
            "plan": subscription.get("plan", "free"),
            "status": subscription.get("status", "active"),
            "start_date": subscription.get("start_date"),
            "end_date": subscription.get("end_date"),
            "auto_renew": subscription.get("auto_renew", False),
            "razorpay_subscription_id": subscription.get("razorpay_subscription_id"),
        }
    }


@router.post("/create")
async def create_subscription(request: dict, uid: str = Depends(_get_current_user_id)):
    """
    Creates a Razorpay subscription for the requested plan.
    Returns the subscription_id for the frontend to open Razorpay Checkout.
    """
    plan_id = request.get("plan_id")  # e.g., "starter", "pro", "elite"

    if plan_id not in ["starter", "pro", "elite"]:
        raise HTTPException(status_code=400, detail="Invalid plan. Must be: starter, pro, or elite")

    key_id = get_razorpay_key_id()
    key_secret = get_razorpay_key_secret()
    plan_ids = get_razorpay_plan_ids()
    razorpay_plan_id = plan_ids.get(plan_id)

    if not razorpay_plan_id:
        raise HTTPException(
            status_code=503,
            detail=f"Razorpay plan '{plan_id}' not configured. Please set RAZORPAY_PLAN_ID_{plan_id.upper()} in environment."
        )

    if not key_id or not key_secret:
        raise HTTPException(
            status_code=503,
            detail="Payment gateway not configured. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in environment."
        )

    try:
        async with httpx.AsyncClient(timeout=30.0) as http_client:
            resp = await http_client.post(
                "https://api.razorpay.com/v1/subscriptions",
                auth=(key_id, key_secret),
                json={
                    "plan_id": razorpay_plan_id,
                    "total_count": 12,  # 12-month subscription
                    "quantity": 1,
                    "customer_notify": 1,
                },
            )
            if resp.status_code not in (200, 201):
                print(f"Razorpay API error ({resp.status_code}): {resp.text}")
                raise HTTPException(status_code=502, detail=f"Razorpay API error ({resp.status_code}): {resp.text}")

            subscription_data = resp.json()
            subscription_id = subscription_data.get("id")

            # Store pending subscription in MongoDB
            users_collection = _get_users_collection()
            await users_collection.update_one(
                {"uid": uid},
                {"$set": {
                    "subscription.razorpay_subscription_id": subscription_id,
                    "subscription.plan": plan_id,
                    "subscription.status": "pending",
                }}
            )

            return {
                "subscription_id": subscription_id,
                "plan": plan_id,
                "razorpay_key_id": key_id,
            }


    except HTTPException:
        raise
    except Exception as e:
        print(f"Subscription creation error: {e}")
        raise HTTPException(status_code=500, detail="Failed to create subscription. Please try again.")


@router.post("/cancel")
async def cancel_subscription(uid: str = Depends(_get_current_user_id)):
    """
    Cancels the user's active Razorpay subscription.
    Sets status to 'cancelled' but keeps premium access until end_date (grace period).
    """
    users_collection = _get_users_collection()
    user = await users_collection.find_one({"uid": uid})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    subscription = user.get("subscription", {})
    sub_id = subscription.get("razorpay_subscription_id")

    if not sub_id:
        raise HTTPException(status_code=400, detail="No active subscription to cancel")

    key_id = get_razorpay_key_id()
    key_secret = get_razorpay_key_secret()
    if not key_id or not key_secret:
        raise HTTPException(status_code=503, detail="Payment gateway not configured")

    try:
        async with httpx.AsyncClient(timeout=30.0) as http_client:
            resp = await http_client.post(
                f"https://api.razorpay.com/v1/subscriptions/{sub_id}/cancel",
                auth=(key_id, key_secret),
                json={"cancel_at_cycle_end": 1},  # Cancel at end of billing period
            )


            if resp.status_code not in (200, 201):
                raise HTTPException(status_code=502, detail=f"Razorpay cancel error: {resp.text}")

        # Mark as cancellation requested — tier stays until Webhook fires
        await users_collection.update_one(
            {"uid": uid},
            {"$set": {"subscription.status": "cancellation_requested"}}
        )

        return {"status": "success", "message": "Subscription will be cancelled at the end of the billing period. You retain premium access until then."}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Subscription cancel error: {e}")
        raise HTTPException(status_code=500, detail="Failed to cancel subscription. Please try again.")
