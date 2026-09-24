import sys
import hashlib
import re
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, UploadFile, File, Header, HTTPException, status, Form
from schemas.scan import OCRAnalysisResponse
from services.ocr_service import extract_and_analyze
import firebase_admin.auth as fb_auth

router = APIRouter(
    prefix="/api/scan",
    tags=["Scan & OCR"]
)

ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5 MB


def _get_foods_collection():
    for mod_name in ("backend.main", "main", "__main__"):
        main_module = sys.modules.get(mod_name)
        if main_module:
            if hasattr(main_module, "foods_collection") and main_module.foods_collection is not None:
                return main_module.foods_collection
            if hasattr(main_module, "db") and main_module.db is not None:
                return main_module.db["foods"]
    return None


def _get_system_logs_collection():
    for mod_name in ("backend.main", "main", "__main__"):
        main_module = sys.modules.get(mod_name)
        if main_module:
            if hasattr(main_module, "system_logs_collection") and main_module.system_logs_collection is not None:
                return main_module.system_logs_collection
            if hasattr(main_module, "db") and main_module.db is not None:
                return main_module.db["system_logs"]
    return None


def _get_users_collection():
    for mod_name in ("backend.main", "main", "__main__"):
        main_module = sys.modules.get(mod_name)
        if main_module:
            if hasattr(main_module, "users_collection") and main_module.users_collection is not None:
                return main_module.users_collection
            if hasattr(main_module, "db") and main_module.db is not None:
                return main_module.db["users"]
    return None


from middleware.quota_check import (
    reserve_scan_quota,
    release_scan_quota,
    get_tier_quota,
    normalize_tier,
)


@router.post("/analyze", response_model=OCRAnalysisResponse, status_code=status.HTTP_200_OK)
async def analyze_back_of_pack(
    image: UploadFile = File(...),
    barcode: Optional[str] = Form(None),
    authorization: Optional[str] = Header(None)
):
    """
    Endpoint for uploading a back-of-pack image to extract and normalize
    ingredients, additives, allergens, and nutritional info via a multi-tier OCR pipeline.
    Uncataloged crowdsourced products are isolated with is_verified: False in the moderation queue.
    """
    if image.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported image format: {image.content_type}. Allowed: JPEG, PNG, WEBP."
        )
    
    # Read file content
    image_bytes = await image.read()
    
    if len(image_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded image file is empty."
        )

    if len(image_bytes) > MAX_IMAGE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="Image size exceeds the 5MB limit."
        )

    # Normalize barcode query if supplied
    normalized_barcode: Optional[str] = None
    if barcode and isinstance(barcode, str):
        cleaned = barcode.strip()
        if cleaned:
            normalized_barcode = cleaned

    # Resolve anonymized pseudonymous contributor token without leaking user email or raw UID
    submitted_by = "anon_contributor"
    auth_uid: Optional[str] = None
    if authorization and isinstance(authorization, str) and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1].strip()
        try:
            decoded = fb_auth.verify_id_token(token)
            raw_uid = str(decoded.get("uid") or decoded.get("sub") or "anon")
            if raw_uid and raw_uid != "anon":
                auth_uid = raw_uid
            submitted_by = f"anon_{hashlib.sha256(raw_uid.encode('utf-8')).hexdigest()[:12]}"
        except Exception:
            submitted_by = f"anon_{hashlib.sha256(token.encode('utf-8')).hexdigest()[:12]}"

    # Atomic quota check and reservation for authenticated users
    quota_reserved = False
    users_col = _get_users_collection()
    if auth_uid and users_col is not None:
        user_doc = await users_col.find_one({"uid": auth_uid})
        if user_doc:
            raw_tier = user_doc.get("tier")
            tier = normalize_tier(raw_tier)
            limit = get_tier_quota(tier, "monthly_scans")

            quota_granted = await reserve_scan_quota(auth_uid, users_col)
            if not quota_granted:
                curr_used = user_doc.get("usage", {}).get("scans_used_this_month", limit)
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Monthly scan quota exceeded ({curr_used}/{limit}). Upgrade your plan to continue scanning."
                )
            quota_reserved = True

    try:
        # Process via the multi-tier OCR service
        analysis_result = await extract_and_analyze(image_bytes, image.content_type)
    except Exception:
        if quota_reserved and auth_uid and users_col is not None:
            await release_scan_quota(auth_uid, users_col)
        raise

    if not analysis_result.estimated_macros:
        analysis_result.estimated_macros = analysis_result.nutrition_per_100g
    if not analysis_result.nutrition_per_100g:
        analysis_result.nutrition_per_100g = analysis_result.estimated_macros or {}

    product_title = analysis_result.product_name or "Packaged Food Item"
    brand_title = analysis_result.brand or "Local Brand"
    if brand_title and brand_title.lower() not in product_title.lower():
        full_product_name = f"{brand_title} {product_title}".strip()
    else:
        full_product_name = product_title

    analysis_result.product_name = full_product_name
    analysis_result.name = full_product_name
    analysis_result.brand = brand_title
    analysis_result.barcode = normalized_barcode

    formatted_additives = [
        f"{a.get('code', '')}: {a.get('name', '')}" if isinstance(a, dict) else str(a)
        for a in (analysis_result.detected_ins_additives or [])
    ]
    analysis_result.additives = formatted_additives
    analysis_result.allergens = analysis_result.flagged_allergens or []
    analysis_result.ingredients = [
        {"name": ing, "safety": "Safe", "description": f"Extracted ingredient: {ing}"}
        for ing in (analysis_result.parsed_ingredients or [])
    ]

    # Verify database availability
    foods_col = _get_foods_collection()
    if foods_col is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable"
        )

    # -------------------------------------------------------------
    # EXISTING FOOD LOOKUP & DUPLICATE PREVENTION
    # -------------------------------------------------------------
    existing_food = None
    if normalized_barcode:
        found = await foods_col.find_one({
            "barcode": normalized_barcode,
            "status": {"$ne": "rejected"}
        })
        if isinstance(found, dict):
            existing_food = found

    if not existing_food and full_product_name:
        found = await foods_col.find_one({
            "$or": [
                {"name": {"$regex": f"^{re.escape(full_product_name)}$", "$options": "i"}},
                {"product_name": {"$regex": f"^{re.escape(full_product_name)}$", "$options": "i"}}
            ],
            "status": {"$ne": "rejected"}
        })
        if isinstance(found, dict):
            existing_food = found

    if existing_food and isinstance(existing_food, dict):
        existing_id = str(existing_food.get("_id", existing_food.get("id", "")))
        is_verified_doc = bool(existing_food.get("is_verified", True))

        analysis_result.food_id = existing_id
        analysis_result.is_verified = is_verified_doc
        if is_verified_doc:
            analysis_result.requires_user_review = False

        if existing_food.get("name"):
            analysis_result.name = existing_food["name"]
            analysis_result.product_name = existing_food["name"]
        if existing_food.get("brand") and not analysis_result.brand:
            analysis_result.brand = existing_food["brand"]

        return analysis_result

    # -------------------------------------------------------------
    # OCR FAILURE / EMPTY PARSE CHECK
    # -------------------------------------------------------------
    has_ingredients = bool(analysis_result.parsed_ingredients and len(analysis_result.parsed_ingredients) > 0)
    if not has_ingredients and not (analysis_result.raw_ocr_text and analysis_result.raw_ocr_text.strip()):
        # Empty parse - do not insert a bogus uncatalogued record
        analysis_result.food_id = None
        analysis_result.is_verified = False
        analysis_result.requires_user_review = True
        return analysis_result

    # -------------------------------------------------------------
    # PERSIST UNCATALOGED PRODUCT (is_verified: False, pending_review)
    # -------------------------------------------------------------
    now_ts = datetime.now(timezone.utc).isoformat()
    food_doc = {
        "name": full_product_name,
        "product_name": full_product_name,
        "brand": brand_title,
        "barcode": normalized_barcode,
        "is_verified": False,
        "requires_moderation": True,
        "status": "pending_review",
        "submitted_by": submitted_by,
        "raw_ocr_text": analysis_result.raw_ocr_text,
        "detected_ins_additives": analysis_result.detected_ins_additives,
        "additives": formatted_additives,
        "flagged_allergens": analysis_result.flagged_allergens,
        "allergens": analysis_result.flagged_allergens,
        "parsed_ingredients": analysis_result.parsed_ingredients,
        "ingredients": analysis_result.ingredients,
        "nutrition_per_100g": analysis_result.nutrition_per_100g,
        "estimated_macros": analysis_result.estimated_macros,
        "safety_score": analysis_result.safety_score or 75,
        "source": "crowdsourced_ocr",
        "created_at": now_ts,
    }

    try:
        res = await foods_col.insert_one(food_doc)
        analysis_result.food_id = str(res.inserted_id)
        analysis_result.is_verified = False
        analysis_result.requires_user_review = True
    except Exception as exc:
        try:
            logs_col = _get_system_logs_collection()
            if logs_col is not None:
                await logs_col.insert_one({
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "level": "ERROR",
                    "service": "CrowdsourcedFoodPersistence",
                    "operation": "insert_crowdsourced_food",
                    "message": "Failed to persist crowdsourced food item to database",
                    "exception_type": type(exc).__name__,
                    "details": {
                        "product_name": full_product_name,
                        "brand": brand_title,
                        "barcode": normalized_barcode,
                        "submitted_by": submitted_by,
                    }
                })
        except Exception as log_err:
            print(f"[SystemLog Error] Failed to log food persistence failure: {log_err}")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to persist crowdsourced food item"
        )

    return analysis_result
