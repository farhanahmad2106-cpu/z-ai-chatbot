import sys
import hashlib
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
    
    if len(image_bytes) > MAX_IMAGE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Image size exceeds the 5MB limit."
        )

    # Resolve anonymized pseudonymous contributor token without leaking user email or raw UID
    submitted_by = "anon_contributor"
    if authorization and isinstance(authorization, str) and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1].strip()
        try:
            decoded = fb_auth.verify_id_token(token)
            raw_uid = str(decoded.get("uid") or decoded.get("sub") or "anon")
            submitted_by = f"anon_{hashlib.sha256(raw_uid.encode('utf-8')).hexdigest()[:12]}"
        except Exception:
            submitted_by = f"anon_{hashlib.sha256(token.encode('utf-8')).hexdigest()[:12]}"

    # Process via the multi-tier OCR service
    analysis_result = await extract_and_analyze(image_bytes, image.content_type)

    if not analysis_result.estimated_macros:
        analysis_result.estimated_macros = analysis_result.nutrition_per_100g

    product_title = analysis_result.product_name or "Packaged Food Item"
    brand_title = analysis_result.brand or "Local Brand"
    if brand_title and brand_title.lower() not in product_title.lower():
        full_product_name = f"{brand_title} {product_title}".strip()
    else:
        full_product_name = product_title

    analysis_result.product_name = full_product_name

    # Store uncataloged food submission into MongoDB Atlas with is_verified: False
    foods_col = _get_foods_collection()
    if foods_col is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable"
        )

    now_ts = datetime.now(timezone.utc).isoformat()
    food_doc = {
        "name": full_product_name,
        "product_name": full_product_name,
        "brand": brand_title,
        "barcode": barcode,
        "is_verified": False,
        "requires_moderation": True,

        "status": "pending_review",
        "submitted_by": submitted_by,
        "raw_ocr_text": analysis_result.raw_ocr_text,
        "detected_ins_additives": analysis_result.detected_ins_additives,
        "additives": [
            f"{a.get('code', '')}: {a.get('name', '')}" if isinstance(a, dict) else str(a)
            for a in analysis_result.detected_ins_additives
        ],
        "flagged_allergens": analysis_result.flagged_allergens,
        "allergens": analysis_result.flagged_allergens,
        "parsed_ingredients": analysis_result.parsed_ingredients,
        "ingredients": [
            {"name": ing, "safety": "Safe", "description": f"Extracted ingredient: {ing}"}
            for ing in analysis_result.parsed_ingredients
        ],
        "nutrition_per_100g": analysis_result.nutrition_per_100g,
        "estimated_macros": analysis_result.estimated_macros,
        "safety_score": 75,
        "source": "crowdsourced_ocr",
        "created_at": now_ts,
    }

    try:
        res = await foods_col.insert_one(food_doc)
        analysis_result.food_id = str(res.inserted_id)
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
                        "barcode": barcode,
                        "submitted_by": submitted_by,
                    }
                })
        except Exception as log_err:
            print(f"[SystemLog Error] Failed to log food persistence failure: {log_err}")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to persist crowdsourced food item"
        )

    analysis_result.is_verified = False

    return analysis_result
