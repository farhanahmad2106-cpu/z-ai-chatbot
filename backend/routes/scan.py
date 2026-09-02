from fastapi import APIRouter, UploadFile, File, HTTPException, status
from schemas.scan import OCRAnalysisResponse
from services.ocr_service import extract_and_analyze

router = APIRouter(
    prefix="/api/scan",
    tags=["Scan & OCR"]
)

ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5 MB

@router.post("/analyze", response_model=OCRAnalysisResponse, status_code=status.HTTP_200_OK)
async def analyze_back_of_pack(image: UploadFile = File(...)):
    """
    Endpoint for uploading a back-of-pack image to extract and normalize
    ingredients, additives, allergens, and nutritional info via a multi-tier OCR pipeline.
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

    # Process via the multi-tier OCR service
    analysis_result = await extract_and_analyze(image_bytes, image.content_type)
    
    return analysis_result
