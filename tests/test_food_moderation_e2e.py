import os
import sys
import time
import json
import httpx
import pymongo
from dotenv import load_dotenv

# Load backend environment
load_dotenv("backend/.env")

BASE_URL = "http://127.0.0.1:8000"
MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
SUPER_ADMIN_EMAIL = "farhanahmad2106@gmail.com"

report = {
    "scan_ingestion": {"status": "FAIL", "http_status": 0, "latency_ms": 0, "details": {}},
    "pre_approval_isolation": {"status": "FAIL", "public_search_count": -1},
    "db_layer_verification": {"status": "FAIL", "asserted_fields": {}},
    "admin_moderation_ui_queue": {"status": "FAIL", "pending_count": 0, "item_found": False},
    "approval_api_execution": {"status": "FAIL", "http_status": 0, "approval_message": ""},
    "post_approval_global_visibility": {"status": "FAIL", "search_results_count": 0, "verified_product": None},
    "anomalies": []
}

def clean_previous_test_records(db):
    res = db.foods.delete_many({
        "$or": [
            {"name": {"$regex": "Bhikharam", "$options": "i"}},
            {"product_name": {"$regex": "Bhikharam", "$options": "i"}},
            {"brand": {"$regex": "Bhikharam", "$options": "i"}},
        ]
    })
    print(f"Purged {res.deleted_count} previous test records from foods collection.")


def run_tests():
    print("=" * 70)
    print("STARTING E2E CROWDSOURCED FOOD MODERATION OPERATIONAL TEST")
    print("=" * 70)

    # Connect to MongoDB
    client = pymongo.MongoClient(MONGODB_URI)
    db = client["Z-sehealth"]
    clean_previous_test_records(db)

    # -----------------------------------------------------------------
    # STEP 1: TRIGGER TEST SCAN FOR UNCATALOGED ITEM
    # -----------------------------------------------------------------
    print("\n--- STEP 1: Dispatching POST /api/scan/analyze ---")
    image_path = "tests/fixtures/unlisted_local_snack.jpg"
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Fixture not found at {image_path}")

    headers = {"Authorization": "Bearer test_user_firebase_token_qa_arch"}
    files = {"image": ("unlisted_local_snack.jpg", open(image_path, "rb"), "image/jpeg")}

    start_time = time.time()
    try:
        r = httpx.post(f"{BASE_URL}/api/scan/analyze", headers=headers, files=files, timeout=60.0)
        latency_ms = round((time.time() - start_time) * 1000, 2)
    except Exception as e:
        print(f"Scan request failed: {e}")
        report["anomalies"].append(f"Scan request exception: {str(e)}")
        return

    print(f"HTTP Status: {r.status_code} | Latency: {latency_ms}ms")
    report["scan_ingestion"]["http_status"] = r.status_code
    report["scan_ingestion"]["latency_ms"] = latency_ms

    if r.status_code == 200:
        scan_data = r.json()
        report["scan_ingestion"]["status"] = "PASS"
        report["scan_ingestion"]["details"] = {
            "product_name": scan_data.get("product_name"),
            "brand": scan_data.get("brand"),
            "parsed_ingredients_count": len(scan_data.get("parsed_ingredients", [])),
            "detected_ins_additives": scan_data.get("detected_ins_additives", []),
            "estimated_macros": scan_data.get("estimated_macros") or scan_data.get("nutrition_per_100g"),
            "food_id": scan_data.get("food_id"),
            "is_verified": scan_data.get("is_verified")
        }
        print("Structured Parsing:")
        print(f"  - Product Name: {scan_data.get('product_name')}")
        print(f"  - Parsed Ingredients ({len(scan_data.get('parsed_ingredients', []))}): {scan_data.get('parsed_ingredients')}")
        print(f"  - Detected INS Additives: {json.dumps(scan_data.get('detected_ins_additives'))}")
        print(f"  - Estimated Macros: {json.dumps(scan_data.get('estimated_macros'))}")
    else:
        print(f"Scan analyze failed: {r.text}")
        report["anomalies"].append(f"HTTP {r.status_code}: {r.text}")
        return

    # STEP 1.4: Negative Assertion in Global Search
    print("\n--- STEP 1.4: Negative Assertion in Global Search ---")
    search_resp = httpx.get(f"{BASE_URL}/api/foods?search=Bhikharam", timeout=15.0)
    search_alias_resp = httpx.get(f"{BASE_URL}/api/search/food?q=Bhikharam", timeout=15.0)

    search_items = search_resp.json() if search_resp.status_code == 200 else []
    search_alias_items = search_alias_resp.json() if search_alias_resp.status_code == 200 else []

    # Verify snack is NOT in public search results
    is_in_public_foods = any("bhikharam" in str(item.get("name", "")).lower() for item in (search_items if isinstance(search_items, list) else []))
    is_in_public_alias = any("bhikharam" in str(item.get("name", "")).lower() for item in (search_alias_items if isinstance(search_alias_items, list) else []))

    if not is_in_public_foods and not is_in_public_alias:
        report["pre_approval_isolation"]["status"] = "PASS"
        report["pre_approval_isolation"]["public_search_count"] = 0
        print("PASS: Uncataloged snack is strictly isolated and HIDDEN from public global search.")
    else:
        report["pre_approval_isolation"]["status"] = "FAIL"
        report["pre_approval_isolation"]["public_search_count"] = len(search_items)
        print("FAIL: Uncataloged snack leaked into public search before approval!")

    # -----------------------------------------------------------------
    # STEP 2: DATABASE LAYER VERIFICATION (MONGODB ATLAS)
    # -----------------------------------------------------------------
    print("\n--- STEP 2: MongoDB Atlas foods Collection Verification ---")
    doc = db.foods.find_one({"product_name": {"$regex": "Bhikharam Chandmal Bhujia", "$options": "i"}})
    if not doc:
        print("FAIL: Document not found in MongoDB foods collection!")
        report["anomalies"].append("Document not found in MongoDB")
        return

    food_id = str(doc["_id"])
    print(f"Found document _id: {food_id}")

    is_verified_val = doc.get("is_verified")
    submitted_by_val = doc.get("submitted_by")
    raw_ocr_val = doc.get("raw_ocr_text")
    additives_val = doc.get("detected_ins_additives")
    requires_mod_val = doc.get("requires_moderation")

    assert_verified = (is_verified_val is False)
    assert_submitted = bool(submitted_by_val)
    assert_raw_ocr = bool(raw_ocr_val and len(raw_ocr_val) > 0)
    assert_additives = bool(isinstance(additives_val, list) and len(additives_val) > 0)
    assert_requires_mod = (requires_mod_val is True)

    report["db_layer_verification"]["asserted_fields"] = {
        "is_verified": is_verified_val,
        "submitted_by": submitted_by_val,
        "raw_ocr_text_length": len(raw_ocr_val) if raw_ocr_val else 0,
        "detected_ins_additives": additives_val,
        "requires_moderation": requires_mod_val
    }

    print(f"  - is_verified is False: {assert_verified} ({is_verified_val})")
    print(f"  - submitted_by populated: {assert_submitted} ('{submitted_by_val}')")
    print(f"  - raw_ocr_text populated: {assert_raw_ocr} ({len(raw_ocr_val or '')} chars)")
    print(f"  - detected_ins_additives count: {len(additives_val or [])}")
    print(f"  - requires_moderation is True: {assert_requires_mod} ({requires_mod_val})")

    if assert_verified and assert_submitted and assert_raw_ocr and assert_additives and assert_requires_mod:
        report["db_layer_verification"]["status"] = "PASS"
        print("PASS: All Step 2 MongoDB Atlas assertions passed.")
    else:
        report["db_layer_verification"]["status"] = "FAIL"
        print("FAIL: One or more MongoDB field assertions failed.")

    # -----------------------------------------------------------------
    # STEP 3: ADMIN OPERATIONS QUEUE INSPECTION (FoodModerationTab)
    # -----------------------------------------------------------------
    print("\n--- STEP 3: Admin Operations Queue Inspection ---")
    admin_doc = db.admins.find_one({"is_super_admin": True})
    admin_token_headers = {
        "Authorization": f"Bearer mock_admin_token_{SUPER_ADMIN_EMAIL}",
        "x-admin-email": SUPER_ADMIN_EMAIL
    }

    pending_resp = httpx.get(
        f"{BASE_URL}/api/admin/foods/pending",
        headers=admin_token_headers,
        timeout=15.0
    )
    print(f"GET /api/admin/foods/pending HTTP Status: {pending_resp.status_code}")

    if pending_resp.status_code == 200:
        pending_data = pending_resp.json()
        foods_list = pending_data.get("foods", [])
        report["admin_moderation_ui_queue"]["pending_count"] = len(foods_list)
        matched_item = next((f for f in foods_list if f.get("id") == food_id or "bhikharam" in str(f.get("name", "")).lower()), None)
        if matched_item:
            report["admin_moderation_ui_queue"]["item_found"] = True
            report["admin_moderation_ui_queue"]["status"] = "PASS"
            print(f"PASS: Scanned item identified in admin moderation feed!")
            print(f"  - Card Title: {matched_item.get('name')}")
            print(f"  - Left (Raw OCR): {matched_item.get('raw_ocr_text')[:60]}...")
            print(f"  - Right (INS Additives): {matched_item.get('additives')}")
            print(f"  - Right (Allergens): {matched_item.get('allergens')}")
            print(f"  - Right (Macros): {matched_item.get('estimated_macros')}")
        else:
            print("FAIL: Scanned item was not found in pending admin queue.")
    else:
        print(f"Admin pending queue request failed: {pending_resp.text}")

    # -----------------------------------------------------------------
    # STEP 4: APPROVAL & GLOBAL AVAILABILITY ASSERTION
    # -----------------------------------------------------------------
    print("\n--- STEP 4: Approving Product via POST /api/admin/foods/{id}/approve ---")
    approve_payload = {
        "action": "approve",
        "updated_data": {
            "name": "Bhikharam Chandmal Bhujia (Authentic Bikaneri)",
            "product_name": "Bhikharam Chandmal Bhujia (Authentic Bikaneri)",
            "brand": "Bhikharam Chandmal",
            "safety_score": 88,
            "nutrition_per_100g": {
                "calories": 568.0,
                "protein": 12.5,
                "carbs": 44.0,
                "fat": 38.0,
                "sodium": 790.0,
                "sugar": 1.8
            }
        }
    }

    appr_resp = httpx.post(
        f"{BASE_URL}/api/admin/foods/{food_id}/approve",
        headers=admin_token_headers,
        json=approve_payload,
        timeout=15.0
    )

    print(f"Approval HTTP Status: {appr_resp.status_code}")
    report["approval_api_execution"]["http_status"] = appr_resp.status_code

    if appr_resp.status_code == 200:
        report["approval_api_execution"]["status"] = "PASS"
        report["approval_api_execution"]["approval_message"] = appr_resp.json().get("message")
        print(f"PASS: Approved successfully: {appr_resp.json().get('message')}")
    else:
        print(f"Approval failed: {appr_resp.text}")
        report["anomalies"].append(f"Approval failed: {appr_resp.text}")
        return

    # Check MongoDB record post-approval
    print("\n--- Checking MongoDB Record Post-Approval ---")
    updated_doc = db.foods.find_one({"_id": pymongo.collection.ObjectId(food_id)})
    assert_is_verified_true = (updated_doc.get("is_verified") is True)
    assert_reviewed_by = bool(updated_doc.get("reviewed_by"))
    assert_approved_at = bool(updated_doc.get("approved_at"))

    print(f"  - is_verified is True: {assert_is_verified_true}")
    print(f"  - reviewed_by: '{updated_doc.get('reviewed_by')}'")
    print(f"  - approved_at: '{updated_doc.get('approved_at')}'")

    if not (assert_is_verified_true and assert_reviewed_by and assert_approved_at):
        print("FAIL: MongoDB record did not update is_verified: true, reviewed_by, or approved_at properly.")
        report["anomalies"].append("Post-approval MongoDB state assertion failed")

    # Step 4.4: Positive Assertion in Public Global Search
    print("\n--- STEP 4.4: Positive Assertion in Public Global Search ---")
    time.sleep(0.5)
    pub_search_resp = httpx.get(f"{BASE_URL}/api/foods?search=Bhikharam", timeout=15.0)
    pub_alias_resp = httpx.get(f"{BASE_URL}/api/search/food?q=Bhikharam", timeout=15.0)

    pub_items = pub_search_resp.json() if pub_search_resp.status_code == 200 else []
    pub_alias_items = pub_alias_resp.json() if pub_alias_resp.status_code == 200 else []

    found_in_foods = [item for item in pub_items if "bhikharam" in str(item.get("name", "")).lower() or "bhikharam" in str(item.get("product_name", "")).lower()]
    found_in_alias = [item for item in pub_alias_items if "bhikharam" in str(item.get("name", "")).lower() or "bhikharam" in str(item.get("product_name", "")).lower()]

    print(f"Search Results Count: /api/foods -> {len(found_in_foods)}, /api/search/food -> {len(found_in_alias)}")

    if len(found_in_foods) > 0 and len(found_in_alias) > 0:
        verified_item = found_in_foods[0]
        report["post_approval_global_visibility"]["status"] = "PASS"
        report["post_approval_global_visibility"]["search_results_count"] = len(found_in_foods)
        report["post_approval_global_visibility"]["verified_product"] = {
            "name": verified_item.get("name"),
            "safety_score": verified_item.get("safety_score"),
            "status": verified_item.get("status"),
            "is_verified": verified_item.get("is_verified"),
            "macros": verified_item.get("estimated_macros") or verified_item.get("nutrition_per_100g")
        }
        print("PASS: Approved product is now IMMEDIATELY available in global food catalog and Search.tsx!")
        print(f"  - Item Name: {verified_item.get('name')}")
        print(f"  - Safety Score: {verified_item.get('safety_score')}")
        print(f"  - Status: {verified_item.get('status')}")
    else:
        report["post_approval_global_visibility"]["status"] = "FAIL"
        print("FAIL: Product is NOT visible in public search after approval!")

    print("\n" + "=" * 70)
    print("FINAL TEST EXECUTION REPORT (JSON)")
    print("=" * 70)
    print(json.dumps(report, indent=2))

if __name__ == "__main__":
    run_tests()
