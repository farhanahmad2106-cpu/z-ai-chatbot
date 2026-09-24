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
from datetime import datetime, timezone, timedelta
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
    for mod_name in ("backend.main", "main", "__main__"):
        main_module = sys.modules.get(mod_name)
        if main_module and hasattr(main_module, "users_collection"):
            return main_module.users_collection
    raise RuntimeError("users_collection not available")

def _get_logs_collection():
    """Lazy import to avoid circular dependency with main.py."""
    import sys
    for mod_name in ("backend.main", "main", "__main__"):
        main_module = sys.modules.get(mod_name)
        if main_module and hasattr(main_module, "system_logs_collection"):
            return main_module.system_logs_collection
    return None

def _get_transactions_collection():
    """Lazy import to avoid circular dependency with main.py."""
    import sys
    for mod_name in ("backend.main", "main", "__main__"):
        main_module = sys.modules.get(mod_name)
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
    user_id = notes.get("user_id") or notes.get("uid")
    
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
    now = datetime.now(timezone.utc)
    lease_until = now + timedelta(seconds=60)
    claim_acquired = False
    
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
            "status": "processing",
            "processing_started_at": now,
            "lease_until": lease_until,
            "method": payment_entity.get("method"),
            "email": payment_entity.get("email"),
            "notes": notes,
            "refunds": [],
            "timestamp": now,
        })
        claim_acquired = True
    except pymongo.errors.DuplicateKeyError:
        # Event record already exists - inspect state machine status
        existing = await transactions_collection.find_one({"_id": event_id})
        if not existing:
            claim_acquired = False
        else:
            existing_status = None
            if isinstance(existing, dict):
                existing_status = existing.get("status")
            elif hasattr(existing, "get"):
                val = existing.get("status")
                # Check if it's a real string or a Mock object
                existing_status = val if isinstance(val, str) else None

            if existing_status == "completed" or (existing_status is None and not isinstance(existing, dict)):
                # Already completed
                print(f"Webhook {event_id} already completed. Skipping.")
                await _log_webhook_event("INFO", "Webhook", f"Duplicate webhook event ignored: {event_id}")
                return {"status": "ok", "message": "Duplicate event ignored"}

            # Check if event is actively leased by another worker
            curr_lease = existing.get("lease_until") if isinstance(existing, dict) else None
            proc_time = existing.get("processing_started_at") if isinstance(existing, dict) else None

            if curr_lease and isinstance(curr_lease, datetime) and curr_lease.tzinfo is None:
                curr_lease = curr_lease.replace(tzinfo=timezone.utc)
            if proc_time and isinstance(proc_time, datetime) and proc_time.tzinfo is None:
                proc_time = proc_time.replace(tzinfo=timezone.utc)

            is_active_processing = False
            if existing_status == "processing":
                if curr_lease and curr_lease > now:
                    is_active_processing = True
                elif not curr_lease and proc_time and (now - proc_time).total_seconds() <= 60:
                    is_active_processing = True

            if is_active_processing:
                print(f"Webhook {event_id} is currently processing by another worker.")
                return {"status": "ok", "message": "Event is currently processing"}

            # Event is 'failed' or has expired processing lease: atomically reclaim
            new_lease = now + timedelta(seconds=60)
            reclaim = await transactions_collection.update_one(
                {
                    "_id": event_id,
                    "$or": [
                        {"status": "failed"},
                        {"status": "processing", "lease_until": {"$lte": now}},
                        {"status": "processing", "lease_until": {"$exists": False}, "processing_started_at": {"$lte": now - timedelta(seconds=60)}}
                    ]
                },
                {"$set": {
                    "status": "processing",
                    "lease_until": new_lease,
                    "processing_started_at": now,
                    "reclaimed_at": now
                }}
            )
            if getattr(reclaim, "modified_count", 0) > 0 or getattr(reclaim, "matched_count", 0) > 0:
                claim_acquired = True
            else:
                recheck = await transactions_collection.find_one({"_id": event_id})
                recheck_status = recheck.get("status") if isinstance(recheck, dict) else None
                if recheck_status == "completed":
                    return {"status": "ok", "message": "Duplicate event ignored"}
                return {"status": "ok", "message": "Event is currently processing"}

    if not claim_acquired:
        return {"status": "ok", "message": "Duplicate event ignored"}

    try:
        users_collection = _get_users_collection()
        today_str = now.strftime("%Y-%m-%d")

        if event == "payment.captured":
            tier_to_set = notes.get("tier") or "pro"
            quota_to_set = int(notes.get("scan_quota")) if notes.get("scan_quota") else TIER_SCAN_LIMITS.get(tier_to_set, 200)

            # Security: User matching must NEVER rely on client-provided email
            user_filter = None
            if user_id:
                user_filter = {"uid": user_id}
            elif subscription_id and not subscription_id.startswith("sub_pay_"):
                user_filter = {"subscription.razorpay_subscription_id": subscription_id}

            if user_filter:
                user_res = await users_collection.update_one(
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
                if hasattr(user_res, "matched_count") and user_res.matched_count == 0:
                    raise RuntimeError(f"Payment captured but target user not found for filter: {user_filter}")
                print(f"[OK] Payment captured: user={user_filter}, tier={tier_to_set}, quota={quota_to_set}")
                await _log_webhook_event("INFO", "FinTech", f"Payment captured for user: {payment_id} ({amount} INR)")
            else:
                print(f"[WARN] Payment captured without trusted user identifier: payment_id={payment_id}")
                await _log_webhook_event("WARNING", "FinTech", f"Payment captured missing trusted user identifier: {payment_id}")
                raise RuntimeError(f"Payment {payment_id} missing trusted user identifier (user_id or subscription_id)")

        elif event == "subscription.activated":
            scan_limit = TIER_SCAN_LIMITS.get(tier, 20)
            sub_res = await users_collection.update_one(
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
            if hasattr(sub_res, "matched_count") and sub_res.matched_count == 0:
                raise RuntimeError(f"Subscription target user not found for subscription_id: {subscription_id}")
            print(f"[OK] Subscription activated: tier={tier}, sub_id={subscription_id}")

        elif event == "subscription.charged":
            scan_limit = TIER_SCAN_LIMITS.get(tier, 20)
            sub_res = await users_collection.update_one(
                {"subscription.razorpay_subscription_id": subscription_id},
                {"$set": {
                    "tier": tier,
                    "subscription.status": "active",
                    "usage.scans_used_this_month": 0,
                    "usage.scan_limit": scan_limit,
                }}
            )
            if hasattr(sub_res, "matched_count") and sub_res.matched_count == 0:
                raise RuntimeError(f"Subscription target user not found for subscription_id: {subscription_id}")
            print(f"[OK] Subscription renewed: tier={tier}, sub_id={subscription_id}")

        elif event == "subscription.charged.failed":
            sub_res = await users_collection.update_one(
                {"subscription.razorpay_subscription_id": subscription_id},
                {"$set": {
                    "tier": "free",
                    "subscription.status": "charge_failed",
                    "usage.scan_limit": 20,
                }}
            )
            if hasattr(sub_res, "matched_count") and sub_res.matched_count == 0:
                raise RuntimeError(f"Subscription target user not found for subscription_id: {subscription_id}")
            print(f"[WARN] Charge failed — downgraded to free: sub_id={subscription_id}")

        elif event == "subscription.cancelled":
            end_date = subscription_entity.get("end_at")
            if end_date:
                end_date_str = datetime.fromtimestamp(int(end_date), tz=timezone.utc).strftime("%Y-%m-%d")
            else:
                end_date_str = today_str

            sub_res = await users_collection.update_one(
                {"subscription.razorpay_subscription_id": subscription_id},
                {"$set": {
                    "subscription.status": "cancelled",
                    "subscription.end_date": end_date_str,
                    "subscription.auto_renew": False,
                }}
            )
            if hasattr(sub_res, "matched_count") and sub_res.matched_count == 0:
                raise RuntimeError(f"Subscription target user not found for subscription_id: {subscription_id}")
            print(f"Subscription cancelled. Premium access until {end_date_str}: sub_id={subscription_id}")

        elif event == "subscription.completed":
            sub_res = await users_collection.update_one(
                {"subscription.razorpay_subscription_id": subscription_id},
                {"$set": {
                    "tier": "free",
                    "subscription.status": "completed",
                    "subscription.auto_renew": False,
                    "usage.scan_limit": 20,
                }}
            )
            if hasattr(sub_res, "matched_count") and sub_res.matched_count == 0:
                raise RuntimeError(f"Subscription target user not found for subscription_id: {subscription_id}")
            print(f"Subscription completed — downgraded to free: sub_id={subscription_id}")

        elif event == "subscription.updated":
            print(f"Subscription updated (plan change): sub_id={subscription_id} — logged only")

        else:
            print(f"Unhandled Razorpay event: {event}")

        # Mark transaction as completed
        await transactions_collection.update_one(
            {"_id": event_id},
            {"$set": {
                "status": "completed",
                "completed_at": datetime.now(timezone.utc)
            }}
        )
        return {"status": "ok"}

    except Exception as exc:
        print(f"[ERROR] Failed to process webhook {event_id}: {exc}")
        await _log_webhook_event("ERROR", "Webhook", f"Webhook processing failed for {event_id}: {exc}")
        # Transition to 'failed' status to allow verified retry recovery
        try:
            await transactions_collection.update_one(
                {"_id": event_id},
                {"$set": {
                    "status": "failed",
                    "last_error": str(exc),
                    "failed_at": datetime.now(timezone.utc)
                }}
            )
        except Exception as log_err:
            print(f"[ERROR] Failed to record transaction failure status: {log_err}")
        raise HTTPException(status_code=500, detail="Webhook processing failed")
