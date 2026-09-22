"""
Razorpay Webhook Handler — Z-SeHealth
Handles payment lifecycle events: activation, charge, charge failure, cancellation.

⚠️ SECURITY: All webhook events MUST be verified via HMAC-SHA256 signature before processing.
   Never grant premium access without signature verification.
"""
import os
import json
import hashlib
import hmac
from fastapi import APIRouter, Request, HTTPException
from datetime import datetime, timezone
import pymongo.errors

def get_razorpay_webhook_secret() -> str:
    return os.getenv("RAZORPAY_WEBHOOK_SECRET", "")

def get_tier_plan_map() -> dict:
    return {
        os.getenv("RAZORPAY_PLAN_ID_STARTER", "__starter__"): "starter",
        os.getenv("RAZORPAY_PLAN_ID_PRO", "__pro__"): "pro",
        os.getenv("RAZORPAY_PLAN_ID_ELITE", "__elite__"): "elite",
    }


router = APIRouter(prefix="/api/webhooks", tags=["Webhooks"])


TIER_SCAN_LIMITS = {
    "free": 20,
    "starter": 80,
    "pro": 200,
    "elite": 500,
}


def _verify_razorpay_signature(body: bytes, signature: str) -> bool:
    """Verify Razorpay webhook HMAC-SHA256 signature."""
    secret = get_razorpay_webhook_secret()
    if not secret:
        print("[WARN] RAZORPAY_WEBHOOK_SECRET not set -- rejecting webhook (HTTP 500)")
        raise HTTPException(status_code=500, detail="Webhook configuration error")
    if not signature:
        return False
    expected = hmac.new(
        secret.encode("utf-8"),
        body,
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


def _get_users_collection():
    """Lazy import to avoid circular dependency with main.py."""
    import sys
    main_module = sys.modules.get("backend.main") or sys.modules.get("main") or sys.modules.get("__main__")
    if main_module and hasattr(main_module, "users_collection"):
        return main_module.users_collection
    raise RuntimeError("users_collection not available")

def _get_logs_collection():
    """Lazy import to avoid circular dependency with main.py."""
    import sys
    main_module = sys.modules.get("backend.main") or sys.modules.get("main") or sys.modules.get("__main__")
    if main_module and hasattr(main_module, "system_logs_collection"):
        return main_module.system_logs_collection
    return None

def _get_transactions_collection():
    """Lazy import to avoid circular dependency with main.py."""
    import sys
    main_module = sys.modules.get("backend.main") or sys.modules.get("main") or sys.modules.get("__main__")
    if main_module and hasattr(main_module, "transactions_collection"):
        return main_module.transactions_collection
    raise RuntimeError("transactions_collection not available")

async def _log_webhook_event(level: str, service: str, message: str, details: dict = None):
    try:
        logs_col = _get_logs_collection()
        if logs_col is not None:
            await logs_col.insert_one({
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "level": level.upper(),
                "service": service,
                "message": message,
                "details": details or {},
            })
    except Exception as e:
        print(f"[SystemLog Error] {e}")


@router.post("/razorpay")
async def razorpay_webhook(request: Request):
    """
    Handles all Razorpay subscription & payment webhook events:
    - payment.captured        → Direct/one-time payment capture & quota grant
    - subscription.activated  → Grant premium tier access
    - subscription.charged    → Confirm renewal, reset usage
    - subscription.charged.failed → Downgrade to free tier
    - subscription.cancelled  → Set end_date; tier stays until then
    - subscription.completed  → Downgrade to free tier after subscription term ends
    - subscription.updated    → Log plan change
    """
    body = await request.body()
    signature = request.headers.get("x-razorpay-signature")

    # ⚠️ CRITICAL: Verify HMAC signature
    if not signature or not _verify_razorpay_signature(body, signature):
        print("Razorpay webhook: invalid or missing signature — rejecting")
        await _log_webhook_event("WARNING", "Webhook", "Razorpay webhook signature verification failed")
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    event = payload.get("event", "")
    subscription_entity = payload.get("payload", {}).get("subscription", {}).get("entity", {})
    payment_entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
    notes = payment_entity.get("notes", {})
    
    subscription_id = subscription_entity.get("id", "") or payment_entity.get("subscription_id") or notes.get("subscription_id")
    plan_id = subscription_entity.get("plan_id", "")
    tier_map = get_tier_plan_map()
    tier = notes.get("tier") or tier_map.get(plan_id, "free")
    
    payment_id = payment_entity.get("id")
    amount = payment_entity.get("amount")
    user_id = notes.get("user_id")
    
    event_id = request.headers.get("x-razorpay-event-id") or payload.get("id")
    if not event_id and payment_id:
        event_id = f"evt_{payment_id}"

    if not subscription_id and payment_id:
        subscription_id = f"sub_{payment_id}"

    print(f"Razorpay Webhook received: event={event}, sub_id={subscription_id}, tier={tier}")

    if not event_id or (not subscription_id and not payment_id):
        print("Webhook: no subscription_id or event_id in payload — ignoring")
        return {"status": "ok"}
        
    transactions_collection = _get_transactions_collection()
    
    try:
        await transactions_collection.insert_one({
            "_id": event_id,
            "event": event,
            "subscription_id": subscription_id,
            "payment_id": payment_id,
            "order_id": payment_entity.get("order_id"),
            "user_id": user_id,
            "amount": amount,
            "currency": payment_entity.get("currency", "INR"),
            "status": "captured",
            "method": payment_entity.get("method"),
            "email": payment_entity.get("email"),
            "notes": notes,
            "refunds": [],
            "timestamp": datetime.now(timezone.utc)
        })
    except pymongo.errors.DuplicateKeyError:
        print(f"Webhook {event_id} already processed. Skipping.")
        await _log_webhook_event("INFO", "Webhook", f"Duplicate webhook event ignored: {event_id}")
        return {"status": "ok", "message": "Duplicate event ignored"}

    users_collection = _get_users_collection()
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    if event == "payment.captured":
        tier_to_set = notes.get("tier") or "pro"
        quota_to_set = int(notes.get("scan_quota")) if notes.get("scan_quota") else TIER_SCAN_LIMITS.get(tier_to_set, 200)

        user_filter = {}
        if user_id:
            user_filter = {"uid": user_id}
        elif subscription_id:
            user_filter = {"subscription.razorpay_subscription_id": subscription_id}
        elif payment_entity.get("email"):
            user_filter = {"email": payment_entity.get("email")}

        if user_filter:
            await users_collection.update_one(
                user_filter,
                {"$set": {
                    "tier": tier_to_set,
                    "subscription.status": "active",
                    "subscription.plan": tier_to_set,
                    "subscription.start_date": today_str,
                    "subscription.auto_renew": False,
                    "subscription.razorpay_subscription_id": subscription_id,
                    "usage.scan_limit": quota_to_set,
                    "usage.scans_used_this_month": 0,
                }}
            )
            print(f"[OK] Payment captured: user={user_filter}, tier={tier_to_set}, quota={quota_to_set}")
            await _log_webhook_event("INFO", "FinTech", f"Payment captured for user: {payment_id} ({amount} INR)")

    elif event == "subscription.activated":
        # [OK] Grant premium access immediately
        scan_limit = TIER_SCAN_LIMITS.get(tier, 20)
        await users_collection.update_one(
            {"subscription.razorpay_subscription_id": subscription_id},
            {"$set": {
                "tier": tier,
                "subscription.status": "active",
                "subscription.plan": tier,
                "subscription.start_date": today_str,
                "subscription.auto_renew": True,
                "usage.scan_limit": scan_limit,
                "usage.scans_used_this_month": 0,
            }}
        )
        print(f"[OK] Subscription activated: tier={tier}, sub_id={subscription_id}")

    elif event == "subscription.charged":
        # [OK] Monthly renewal successful — reset scan counter
        scan_limit = TIER_SCAN_LIMITS.get(tier, 20)
        await users_collection.update_one(
            {"subscription.razorpay_subscription_id": subscription_id},
            {"$set": {
                "tier": tier,
                "subscription.status": "active",
                "usage.scans_used_this_month": 0,
                "usage.scan_limit": scan_limit,
            }}
        )
        print(f"[OK] Subscription renewed: tier={tier}, sub_id={subscription_id}")

    elif event == "subscription.charged.failed":
        # [ERROR] Charge failed — downgrade to free tier
        await users_collection.update_one(
            {"subscription.razorpay_subscription_id": subscription_id},
            {"$set": {
                "tier": "free",
                "subscription.status": "charge_failed",
                "usage.scan_limit": 20,
            }}
        )
        print(f"[WARN] Charge failed — downgraded to free: sub_id={subscription_id}")

    elif event == "subscription.cancelled":
        # Set end_date — user keeps premium until end of billing period
        end_date = subscription_entity.get("end_at")
        if end_date:
            # Razorpay sends Unix timestamp
            end_date_str = datetime.fromtimestamp(int(end_date), tz=timezone.utc).strftime("%Y-%m-%d")
        else:
            end_date_str = today_str

        await users_collection.update_one(
            {"subscription.razorpay_subscription_id": subscription_id},
            {"$set": {
                "subscription.status": "cancelled",
                "subscription.end_date": end_date_str,
                "subscription.auto_renew": False,
            }}
        )
        print(f"Subscription cancelled. Premium access until {end_date_str}: sub_id={subscription_id}")

    elif event == "subscription.completed":
        # Subscription term ended — downgrade to free
        await users_collection.update_one(
            {"subscription.razorpay_subscription_id": subscription_id},
            {"$set": {
                "tier": "free",
                "subscription.status": "completed",
                "subscription.auto_renew": False,
                "usage.scan_limit": 20,
            }}
        )
        print(f"Subscription completed — downgraded to free: sub_id={subscription_id}")

    elif event == "subscription.updated":
        print(f"Subscription updated (plan change): sub_id={subscription_id} — logged only")

    else:
        print(f"Unhandled Razorpay event: {event}")

    return {"status": "ok"}
