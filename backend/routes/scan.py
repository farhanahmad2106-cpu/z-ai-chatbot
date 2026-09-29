import hashlib
import re
from datetime import datetime, timezone
from typing import Optional, Any
from fastapi import APIRouter, UploadFile, File, Header, HTTPException, status, Form, Depends
from fastapi.params import Depends as DependsParam
from schemas.scan import OCRAnalysisResponse
from services.ocr_service import extract_and_analyze
import firebase_admin.auth as fb_auth
from db import get_foods_collection, get_users_collection, get_system_logs_collection

router = APIRouter(
    prefix="/api/scan",
    tags=["Scan & OCR"]
)

ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5 MB



from middleware.quota_check import (
    reserve_scan_quota,
    release_scan_quota,
    get_tier_quota,
    normalize_tier,
    QuotaExceededException,
)


def _get_foods_collection():
    import sys
    main_mod = sys.modules.get("main") or sys.modules.get("backend.main")
    if main_mod:
        if hasattr(main_mod, "foods_collection"):
            return main_mod.foods_collection
        if hasattr(main_mod, "db") and main_mod.db is not None:
            return main_mod.db["foods"]
        if hasattr(main_mod, "app") and hasattr(main_mod.app.state, "db") and main_mod.app.state.db is not None:
            return main_mod.app.state.db["foods"]
    return None


def _get_system_logs_collection():
    import sys
    main_mod = sys.modules.get("main") or sys.modules.get("backend.main")
    if main_mod:
        if hasattr(main_mod, "system_logs_collection"):
            return main_mod.system_logs_collection
        if hasattr(main_mod, "db") and main_mod.db is not None:
            return main_mod.db["system_logs"]
        if hasattr(main_mod, "app") and hasattr(main_mod.app.state, "db") and main_mod.app.state.db is not None:
            return main_mod.app.state.db["system_logs"]
    return None


def _get_users_collection():
    import sys
    main_mod = sys.modules.get("main") or sys.modules.get("backend.main")
    if main_mod:
        if hasattr(main_mod, "users_collection"):
            return main_mod.users_collection
        if hasattr(main_mod, "db") and main_mod.db is not None:
            return main_mod.db["users"]
        if hasattr(main_mod, "app") and hasattr(main_mod.app.state, "db") and main_mod.app.state.db is not None:
            return main_mod.app.state.db["users"]
    return None


async def get_current_user_id(authorization: Optional[str] = Header(None)) -> str:
    """
    Validates Firebase Bearer token and extracts authenticated user ID (ZS-003).
    Fails closed with HTTP 401 if token is missing, expired, or invalid.
    """
    import sys
    main_mod = sys.modules.get("main") or sys.modules.get("backend.main")
    if main_mod and hasattr(main_mod, "get_current_user_id"):
        return await main_mod.get_current_user_id(authorization)

    if not authorization or not isinstance(authorization, str) or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authentication token"
        )
    token = authorization.split(" ")[1].strip()
    try:
        decoded = fb_auth.verify_id_token(token)
        uid = decoded.get("uid") or decoded.get("sub")
        if not uid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token: missing uid"
            )
        return str(uid)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token"
        )


@router.post("/analyze", response_model=OCRAnalysisResponse, status_code=status.HTTP_200_OK)
async def analyze_back_of_pack(
    image: UploadFile = File(...),
    barcode: Optional[str] = Form(None),
    authorization: Optional[str] = Header(None),
    auth_uid: Optional[str] = Depends(get_current_user_id),
    foods_col: Any = Depends(get_foods_collection),
    users_col: Any = Depends(get_users_collection),
    logs_col: Any = Depends(get_system_logs_collection)
):
    """
    Endpoint for uploading a back-of-pack image to extract and normalize
    ingredients, additives, allergens, and nutritional info via a multi-tier OCR pipeline.
    Uncataloged crowdsourced products are isolated with is_verified: False in the moderation queue.
    """
    if isinstance(foods_col, DependsParam):
        foods_col = _get_foods_collection()
    if isinstance(users_col, DependsParam):
        users_col = _get_users_collection()
    if isinstance(logs_col, DependsParam):
        logs_col = _get_system_logs_collection()

    # Enforce mandatory Firebase authentication (ZS-003 / Section 5)
    resolved_uid: str
    if isinstance(auth_uid, DependsParam) or not auth_uid:
        resolved_uid = await get_current_user_id(authorization)
    else:
        resolved_uid = auth_uid

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

    submitted_by = f"anon_{hashlib.sha256(resolved_uid.encode('utf-8')).hexdigest()[:12]}"

    # Atomic quota check and reservation for authenticated users
    quota_reserved = False
    if users_col is not None:
        user_doc = await users_col.find_one({"uid": resolved_uid})
        if user_doc:
            raw_tier = user_doc.get("tier")
            tier = normalize_tier(raw_tier)
            limit = get_tier_quota(tier, "monthly_scans")

            quota_granted = await reserve_scan_quota(resolved_uid, users_col)
            if not quota_granted:
                curr_used = user_doc.get("usage", {}).get("scans_used_this_month", limit)
                raise QuotaExceededException(
                    current_tier=tier,
                    limit=limit,
                    current_used=curr_used
                )
            quota_reserved = True
        else:
            quota_granted = await reserve_scan_quota(resolved_uid, users_col)
            if not quota_granted:
                raise QuotaExceededException(
                    current_tier="free",
                    limit=20,
                    current_used=20
                )
            quota_reserved = True

    try:
        # Process via the multi-tier OCR service
        analysis_result = await extract_and_analyze(image_bytes, image.content_type)

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

        from services.fssai_service import fssai_resolver

        # Deterministic FSSAI resolution — no LLM participates
        resolved_additives, additive_warnings = fssai_resolver.resolve_and_deduplicate(
            detected_additives=analysis_result.detected_ins_additives or [],
            parsed_ingredients=analysis_result.parsed_ingredients or [],
        )

        warnings = list(set((analysis_result.flagged_allergens or []) + additive_warnings))
        analysis_result.safety_score = fssai_resolver.calculate_food_safety_score(resolved_additives, [])
        analysis_result.warnings = warnings

        formatted_additives = []
        for r_add in resolved_additives:
            name_str = r_add.canonical_name or r_add.input_name or "Unknown Additive"
            code_str = r_add.normalized_ins_code or ""
            # zsehealth_risk_tier is Z-SeHealth's application classification (NOT FSSAI statutory)
            status_str = r_add.zsehealth_risk_tier

            formatted = f"{code_str}: {name_str} ({status_str})" if code_str else f"{name_str} ({status_str})"
            if formatted not in formatted_additives:
                formatted_additives.append(formatted)

        # Format resolved additive objects for MongoDB storage.
        # Field naming:
        #   risk / zsehealth_risk_tier  = Z-SeHealth application tier (NOT FSSAI statutory)
        #   fssai_regulatory_status     = FSSAI regulatory determination
        #   is_fssai_approved           = True only for verified_permitted (context-independent)
        #   penalty_points              = Z-SeHealth deterministic scoring contribution
        analysis_result.detected_ins_additives = [
            {
                "code": r_add.normalized_ins_code,
                "name": r_add.canonical_name,
                # Backward-compat key consumed by frontend IngredientReviewModal
                "risk": r_add.zsehealth_risk_tier,
                # New canonical keys
                "zsehealth_risk_tier": r_add.zsehealth_risk_tier,
                "fssai_regulatory_status": r_add.fssai_regulatory_status,
                "is_fssai_approved": r_add.is_fssai_approved,
                "penalty_points": r_add.penalty_points,
                "regulatory_conditions": r_add.regulatory_conditions,
                "provenance": r_add.provenance,
            }
            for r_add in resolved_additives
        ]

        analysis_result.additives = formatted_additives
        analysis_result.allergens = analysis_result.flagged_allergens or []
        analysis_result.ingredients = [
            {"name": ing, "safety": "Safe", "description": f"Extracted ingredient: {ing}"}
            for ing in (analysis_result.parsed_ingredients or [])
        ]

        # Verify database availability
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

    except Exception:
        if quota_reserved and users_col is not None:
            try:
                await release_scan_quota(resolved_uid, users_col)
            except Exception as refund_err:
                print(f"[Quota Refund Error] Failed to refund quota: {refund_err}")
            quota_reserved = False
        raise
