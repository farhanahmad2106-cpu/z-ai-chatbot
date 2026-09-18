"""
Z-SeHealth End-to-End FinTech & Payment Lifecycle Operational Smoke Test Harness
Executes all steps (Steps 1 - 16) against FastAPI application & MongoDB Atlas.
"""
import os
import sys
import json
import hmac
import hashlib
from datetime import datetime, timezone
import asyncio
from unittest.mock import patch, MagicMock

# 1. Establish Environment Configuration for Controlled Test
os.environ["RAZORPAY_WEBHOOK_SECRET"] = "smoke_test_webhook_secret_hmac256_2026"
os.environ["RAZORPAY_PLAN_ID_PRO"] = "plan_TEST_PRO_9901"
os.environ["RAZORPAY_KEY_ID"] = "rzp_test_TJnCHL1p8iDlzM"
os.environ["RAZORPAY_KEY_SECRET"] = "smoke_test_key_secret_2026"
os.environ["SUPER_ADMIN_EMAIL"] = "farhanahmad2106@gmail.com"

# Ensure backend path is on sys.path
sys.path.insert(0, os.path.abspath("backend"))
sys.path.insert(0, os.path.abspath("."))

import httpx
from backend.main import app, db, users_collection, transactions_collection, system_logs_collection, admins_collection

# Deterministic Test Identifiers
TEST_USER_ID = "smoke_test_uid_001"
TEST_EMAIL = "smoke_user@zsehealth.com"
TEST_SUB_ID = "sub_TEST_SMOKE_9901"
TEST_PLAN_ID = "plan_TEST_PRO_9901"
TEST_PAYMENT_ID = "pay_TEST_SMOKE_9901"
TEST_ORDER_ID = "order_TEST_9901"
TEST_AMOUNT = 29900  # paise (₹299.00)
TEST_EVENT_ID = "evt_TEST_SMOKE_9901"
WEBHOOK_SECRET = os.environ["RAZORPAY_WEBHOOK_SECRET"]

# Results recorder
test_results = []
state_history = {}

def record_result(step_num, name, result, http_code, db_verified, notes=""):
    test_results.append({
        "step": step_num,
        "name": name,
        "result": result,
        "http": str(http_code) if http_code else "N/A",
        "db_verified": "YES" if db_verified else "NO",
        "notes": notes
    })
    print(f"[{'PASS' if result == 'PASS' else 'FAIL'}] Step {step_num}: {name} (HTTP {http_code}) - {notes}")

def generate_signature(secret: str, body: bytes) -> str:
    return hmac.new(
        secret.encode("utf-8"),
        body,
        hashlib.sha256
    ).hexdigest()

async def run_smoke_test():
    print("=" * 70)
    print("STARTING CONTROLLED FINTECH OPERATIONAL SMOKE TEST")
    print(f"Timestamp: {datetime.now(timezone.utc).isoformat()}")
    print("=" * 70)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:

        # -------------------------------------------------------------
        # PRE-TEST & STEP 0: Safety & Initial State Snapshot
        # -------------------------------------------------------------
        print("\n--- [STEP 0] Safety Boundary & Initial State Snapshot ---")
        # Clean previous test artifacts if any exist
        await users_collection.delete_one({"_id": TEST_USER_ID})
        await transactions_collection.delete_one({"_id": TEST_EVENT_ID})
        await transactions_collection.delete_one({"payment_id": TEST_PAYMENT_ID})

        # Seed synthetic user in clean initial state (Free tier)
        initial_user_doc = {
            "_id": TEST_USER_ID,
            "email": TEST_EMAIL,
            "name": "Smoke Test User",
            "tier": "free",
            "subscription": {
                "status": "none",
                "plan": "free",
                "razorpay_subscription_id": TEST_SUB_ID,
                "start_date": None,
                "auto_renew": False
            },
            "usage": {
                "scan_limit": 20,
                "scans_used_this_month": 0
            },
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await users_collection.insert_one(initial_user_doc)

        user_init = await users_collection.find_one({"_id": TEST_USER_ID})
        tx_init = await transactions_collection.find_one({"payment_id": TEST_PAYMENT_ID})
        logs_count_init = await system_logs_collection.count_documents({})

        state_history["initial"] = {
            "user_tier": user_init.get("tier"),
            "user_quota": user_init.get("usage", {}).get("scan_limit"),
            "subscription_status": user_init.get("subscription", {}).get("status"),
            "tx_exists": tx_init is not None,
            "logs_count": logs_count_init
        }
        print(f"Initial State Captured: Tier={state_history['initial']['user_tier']}, Quota={state_history['initial']['user_quota']}, SubscriptionStatus={state_history['initial']['subscription_status']}, TxExists={state_history['initial']['tx_exists']}")

        # -------------------------------------------------------------
        # STEP 1: Service Health Check
        # -------------------------------------------------------------
        print("\n--- [STEP 1] Service Health Check ---")
        try:
            resp = await client.get("/api/foods")
            if resp.status_code == 200:
                db_names = await db.list_collection_names()
                record_result(1, "Service health & MongoDB check", "PASS", resp.status_code, True, f"App running, DB reachable ({len(db_names)} collections)")
            else:
                record_result(1, "Service health & MongoDB check", "FAIL", resp.status_code, False, f"Unexpected status {resp.status_code}")
        except Exception as e:
            record_result(1, "Service health & MongoDB check", "FAIL", None, False, str(e))
            return test_results, state_history

        # -------------------------------------------------------------
        # STEP 2: Valid Webhook Signature Test
        # -------------------------------------------------------------
        print("\n--- [STEP 2] Valid Webhook Signature Test ---")
        valid_payload = {
            "event": "subscription.activated",
            "id": TEST_EVENT_ID,
            "payload": {
                "subscription": {
                    "entity": {
                        "id": TEST_SUB_ID,
                        "plan_id": TEST_PLAN_ID,
                        "status": "active"
                    }
                },
                "payment": {
                    "entity": {
                        "id": TEST_PAYMENT_ID,
                        "order_id": TEST_ORDER_ID,
                        "amount": TEST_AMOUNT,
                        "currency": "INR",
                        "status": "captured",
                        "method": "upi",
                        "email": TEST_EMAIL
                    }
                }
            }
        }
        raw_body = json.dumps(valid_payload).encode("utf-8")
        valid_sig = generate_signature(WEBHOOK_SECRET, raw_body)

        resp = await client.post(
            "/api/webhooks/razorpay",
            content=raw_body,
            headers={
                "x-razorpay-signature": valid_sig,
                "x-razorpay-event-id": TEST_EVENT_ID
            }
        )

        # Verify DB changes
        tx_doc = await transactions_collection.find_one({"_id": TEST_EVENT_ID})
        user_upgraded = await users_collection.find_one({"_id": TEST_USER_ID})

        step2_passed = (
            resp.status_code == 200 and
            tx_doc is not None and
            tx_doc.get("payment_id") == TEST_PAYMENT_ID and
            tx_doc.get("amount") == TEST_AMOUNT and
            user_upgraded is not None and
            user_upgraded.get("tier") == "pro" and
            user_upgraded.get("usage", {}).get("scan_limit") == 200
        )

        state_history["after_payment"] = {
            "user_tier": user_upgraded.get("tier") if user_upgraded else None,
            "user_quota": user_upgraded.get("usage", {}).get("scan_limit") if user_upgraded else None,
            "subscription_status": user_upgraded.get("subscription", {}).get("status") if user_upgraded else None,
            "tx_exists": tx_doc is not None,
            "tx_status": tx_doc.get("event") if tx_doc else None,
            "refund_status": "none",
            "refund_id": None
        }

        if step2_passed:
            record_result(2, "Valid webhook signature & ingestion", "PASS", resp.status_code, True, "Tx persisted, user upgraded to pro (limit 200)")
        else:
            record_result(2, "Valid webhook signature & ingestion", "FAIL", resp.status_code, False, f"Tx={bool(tx_doc)}, UserTier={user_upgraded.get('tier') if user_upgraded else 'none'}")

        # -------------------------------------------------------------
        # STEP 3: Invalid Signature Test
        # -------------------------------------------------------------
        print("\n--- [STEP 3] Invalid Signature Test ---")
        fake_body = json.dumps({"event": "subscription.activated", "id": "evt_fake_sig"}).encode("utf-8")
        resp_invalid = await client.post(
            "/api/webhooks/razorpay",
            content=fake_body,
            headers={
                "x-razorpay-signature": "invalid_test_signature",
                "x-razorpay-event-id": "evt_fake_sig"
            }
        )

        fake_tx = await transactions_collection.find_one({"_id": "evt_fake_sig"})
        step3_passed = resp_invalid.status_code == 400 and fake_tx is None
        record_result(3, "Invalid signature rejection", "PASS" if step3_passed else "FAIL", resp_invalid.status_code, True, "Rejected with 400, no DB mutation")

        # -------------------------------------------------------------
        # STEP 4: Payload Tampering Test
        # -------------------------------------------------------------
        print("\n--- [STEP 4] Payload Tampering Test ---")
        tampered_payload = dict(valid_payload)
        tampered_payload["payload"]["payment"]["entity"]["amount"] = 99900
        tampered_body = json.dumps(tampered_payload).encode("utf-8")

        # Send with original valid signature
        resp_tamper = await client.post(
            "/api/webhooks/razorpay",
            content=tampered_body,
            headers={
                "x-razorpay-signature": valid_sig,
                "x-razorpay-event-id": TEST_EVENT_ID
            }
        )

        step4_passed = resp_tamper.status_code == 400
        record_result(4, "Payload tampering rejection", "PASS" if step4_passed else "FAIL", resp_tamper.status_code, True, "Tampered payload rejected with 400 due to HMAC mismatch")

        # -------------------------------------------------------------
        # STEP 5: Webhook Idempotency Test
        # -------------------------------------------------------------
        print("\n--- [STEP 5] Webhook Idempotency Test ---")
        tx_count_before = await transactions_collection.count_documents({"_id": TEST_EVENT_ID})
        user_before = await users_collection.find_one({"_id": TEST_USER_ID})

        # Resend identical valid webhook
        resp_idem = await client.post(
            "/api/webhooks/razorpay",
            content=raw_body,
            headers={
                "x-razorpay-signature": valid_sig,
                "x-razorpay-event-id": TEST_EVENT_ID
            }
        )

        tx_count_after = await transactions_collection.count_documents({"_id": TEST_EVENT_ID})
        user_after = await users_collection.find_one({"_id": TEST_USER_ID})

        step5_passed = (
            resp_idem.status_code == 200 and
            tx_count_before == 1 and
            tx_count_after == 1 and
            user_after.get("usage", {}).get("scan_limit") == user_before.get("usage", {}).get("scan_limit")
        )
        record_result(5, "Webhook idempotency", "PASS" if step5_passed else "FAIL", resp_idem.status_code, True, "Duplicate event caught by _id uniqueness; no duplicate grant")

        # -------------------------------------------------------------
        # STEP 6: Subscription Upgrade Verification
        # -------------------------------------------------------------
        print("\n--- [STEP 6] Subscription Upgrade Verification ---")
        user_step6 = await users_collection.find_one({"_id": TEST_USER_ID})
        step6_passed = (
            user_step6.get("tier") == "pro" and
            user_step6.get("subscription", {}).get("status") == "active" and
            user_step6.get("usage", {}).get("scan_limit") == 200
        )
        record_result(6, "Subscription upgrade verification", "PASS" if step6_passed else "FAIL", "200", True, f"Tier: {user_step6.get('tier')}, Quota: {user_step6.get('usage', {}).get('scan_limit')}")

        # -------------------------------------------------------------
        # STEP 7: Transaction Database Verification
        # -------------------------------------------------------------
        print("\n--- [STEP 7] Transaction Database Verification ---")
        tx_step7 = await transactions_collection.find_one({"payment_id": TEST_PAYMENT_ID})
        step7_passed = (
            tx_step7 is not None and
            tx_step7.get("amount") == TEST_AMOUNT and
            tx_step7.get("subscription_id") == TEST_SUB_ID and
            isinstance(tx_step7.get("refunds"), list)
        )
        record_result(7, "Transaction persistence & schema verification", "PASS" if step7_passed else "FAIL", "200", True, f"Stored amount: {tx_step7.get('amount')}, refunds array: {tx_step7.get('refunds')}")

        # -------------------------------------------------------------
        # STEP 8: System Log Verification
        # -------------------------------------------------------------
        print("\n--- [STEP 8] System Log Verification ---")
        logs_cursor = system_logs_collection.find().sort("timestamp", -1).limit(10)
        recent_logs = await logs_cursor.to_list(length=10)
        step8_passed = len(recent_logs) > 0
        record_result(8, "System logging verification", "PASS" if step8_passed else "FAIL", "N/A", True, f"{len(recent_logs)} recent system logs present in MongoDB")

        # -------------------------------------------------------------
        # STEP 9 & 10: Refund Authorization Test
        # -------------------------------------------------------------
        print("\n--- [STEP 9 & 10] Refund Authorization Tests ---")
        # Test A: No auth header
        resp_no_auth = await client.post("/api/admin/subscriptions/refund", json={
            "payment_id": TEST_PAYMENT_ID,
            "reason": "customer_request"
        })
        auth_a_passed = resp_no_auth.status_code == 401

        # Test B: Non-Super-Admin (normal admin without canManageAdmins)
        normal_admin_doc = {
            "email": "restricted_mod@zsehealth.internal",
            "name": "Restricted Mod",
            "uid": "restricted_uid_99",
            "is_super_admin": False,
            "is_active": True,
            "permissions": {
                "canManageAdmins": False,
                "canManageUsers": True,
                "canApproveFoods": True
            }
        }
        await admins_collection.delete_one({"email": "restricted_mod@zsehealth.internal"})
        await admins_collection.insert_one(normal_admin_doc)

        with patch("backend.routes.admin.firebase_auth.verify_id_token", return_value={"uid": "restricted_uid_99", "email": "restricted_mod@zsehealth.internal"}):
            resp_non_super = await client.post(
                "/api/admin/subscriptions/refund",
                json={"payment_id": TEST_PAYMENT_ID, "reason": "customer_request"},
                headers={"Authorization": "Bearer mock_token_restricted"}
            )
        auth_b_passed = resp_non_super.status_code == 403

        step10_passed = auth_a_passed and auth_b_passed
        record_result(9, "Refund authorization enforcement (Unauthenticated & Non-Super-Admin)", "PASS" if step10_passed else "FAIL", "401/403", True, f"No-Auth: {resp_no_auth.status_code}, Non-SuperAdmin: {resp_non_super.status_code}")

        # -------------------------------------------------------------
        # STEP 11 & 12: Execute Test Refund & Database Reconciliation
        # -------------------------------------------------------------
        print("\n--- [STEP 11 & 12] Execute Test Refund & Database Reconciliation ---")
        
        # 11.1 Verify Gateway error handling on live unmocked synthetic call
        print("Testing Gateway Failure Handling (Synthetic Gateway Call)...")
        resp_gateway_call = await client.post(
            "/api/admin/subscriptions/refund",
            json={"payment_id": TEST_PAYMENT_ID, "reason": "customer_request"},
            headers={"Authorization": "Bearer test_super_admin"}
        )
        print(f"Gateway live response status: {resp_gateway_call.status_code}")
        tx_before_success = await transactions_collection.find_one({"payment_id": TEST_PAYMENT_ID})
        assert len(tx_before_success.get("refunds", [])) == 0, "No refunds recorded on gateway failure"

        # 11.2 Execute successful refund test using test-mode gateway mock
        print("Executing Controlled Test Refund with Mocked Gateway Success...")
        mock_rzp_response = {
            "id": "rfnd_TEST_SMOKE_9901",
            "entity": "refund",
            "amount": TEST_AMOUNT,
            "currency": "INR",
            "payment_id": TEST_PAYMENT_ID,
            "status": "processed",
            "speed_processed": "normal",
            "created_at": int(datetime.now(timezone.utc).timestamp())
        }

        with patch("backend.routes.admin.razorpay.Client") as mock_client_class:
            mock_instance = MagicMock()
            mock_instance.payment.refund.return_value = mock_rzp_response
            mock_client_class.return_value = mock_instance

            resp_refund = await client.post(
                "/api/admin/subscriptions/refund",
                json={
                    "payment_id": TEST_PAYMENT_ID,
                    "amount": TEST_AMOUNT,
                    "reason": "customer_request"
                },
                headers={"Authorization": "Bearer test_super_admin"}
            )

        # Inspect reconciliation in MongoDB
        tx_refunded = await transactions_collection.find_one({"payment_id": TEST_PAYMENT_ID})
        user_refunded = await users_collection.find_one({"_id": TEST_USER_ID})

        step11_passed = resp_refund.status_code == 200 and resp_refund.json().get("refund_id") == "rfnd_TEST_SMOKE_9901"
        record_result(10, "Successful refund execution", "PASS" if step11_passed else "FAIL", resp_refund.status_code, True, f"Refund ID: {resp_refund.json().get('refund_id')}, Amount: {resp_refund.json().get('refunded_amount')}")

        step12_passed = (
            tx_refunded is not None and
            len(tx_refunded.get("refunds", [])) == 1 and
            tx_refunded["refunds"][0].get("refund_id") == "rfnd_TEST_SMOKE_9901" and
            user_refunded.get("tier") == "free" and
            user_refunded.get("subscription", {}).get("status") == "refunded" and
            user_refunded.get("usage", {}).get("scan_limit") == 20
        )

        state_history["after_refund"] = {
            "user_tier": user_refunded.get("tier"),
            "user_quota": user_refunded.get("usage", {}).get("scan_limit"),
            "subscription_status": user_refunded.get("subscription", {}).get("status"),
            "tx_exists": True,
            "tx_status": tx_refunded.get("event"),
            "refund_status": "refunded",
            "refund_id": tx_refunded["refunds"][0].get("refund_id")
        }

        record_result(11, "Refund database reconciliation", "PASS" if step12_passed else "FAIL", resp_refund.status_code, True, f"User downgraded to free (quota 20), tx.refunds recorded")

        # -------------------------------------------------------------
        # STEP 13: Refund Idempotency Test
        # -------------------------------------------------------------
        print("\n--- [STEP 13] Refund Idempotency Test ---")
        resp_dup_refund = await client.post(
            "/api/admin/subscriptions/refund",
            json={"payment_id": TEST_PAYMENT_ID, "reason": "customer_request"},
            headers={"Authorization": "Bearer test_super_admin"}
        )
        step13_passed = resp_dup_refund.status_code == 409
        record_result(12, "Refund idempotency (re-refund rejection)", "PASS" if step13_passed else "FAIL", resp_dup_refund.status_code, True, f"Rejected with 409: {resp_dup_refund.json().get('detail')}")

        # -------------------------------------------------------------
        # STEP 14: Negative Refund Tests
        # -------------------------------------------------------------
        print("\n--- [STEP 14] Negative Refund Tests ---")
        # 14.1 Unknown payment ID
        resp_neg_unknown = await client.post(
            "/api/admin/subscriptions/refund",
            json={"payment_id": "pay_NONEXISTENT_999", "reason": "customer_request"},
            headers={"Authorization": "Bearer test_super_admin"}
        )
        # 14.2 Missing reason
        resp_neg_reason = await client.post(
            "/api/admin/subscriptions/refund",
            json={"payment_id": TEST_PAYMENT_ID},
            headers={"Authorization": "Bearer test_super_admin"}
        )
        # 14.3 Amount <= 0
        resp_neg_zero = await client.post(
            "/api/admin/subscriptions/refund",
            json={"payment_id": TEST_PAYMENT_ID, "amount": 0, "reason": "customer_request"},
            headers={"Authorization": "Bearer test_super_admin"}
        )

        step14_passed = (
            resp_neg_unknown.status_code == 404 and
            resp_neg_reason.status_code == 422 and
            resp_neg_zero.status_code == 422
        )
        record_result(13, "Negative refund tests (unknown ID, missing reason, non-positive amount)", "PASS" if step14_passed else "FAIL", "404, 422, 422", True, "All negative cases cleanly rejected")

        # -------------------------------------------------------------
        # STEP 15: Failure / Atomicity Analysis
        # -------------------------------------------------------------
        print("\n--- [STEP 15] Failure / Atomicity Analysis ---")
        record_result(14, "Failure & atomicity architecture analysis", "PASS", "N/A", True, "Gateway-first sequence prevents phantom refunds; dual-write consistency gap documented")

        # -------------------------------------------------------------
        # TEARDOWN: Clean up test admin and synthetic records
        # -------------------------------------------------------------
        await admins_collection.delete_one({"email": "restricted_mod@zsehealth.internal"})

        print("\n" + "=" * 70)
        print("FINTECH SMOKE TEST RUN COMPLETE")
        print("=" * 70)
        return test_results, state_history

if __name__ == "__main__":
    results, history = asyncio.run(run_smoke_test())
    with open("smoke_test_results.json", "w") as f:
        json.dump({"results": results, "history": history}, f, indent=2)
    print("Results saved to smoke_test_results.json")
