from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any

class OCRAnalysisResponse(BaseModel):
    product_name: Optional[str] = Field(default="Packaged Food Item", description="Name of the product extracted from the image.")
    raw_ocr_text: str = Field(default="", description="Complete unformatted OCR string.")
    parsed_ingredients: List[str] = Field(default_factory=list, description="Array of parsed clean ingredients.")
    detected_ins_additives: List[Dict[str, str]] = Field(
        default_factory=list,
        description="Extracted International Numbering System (INS) codes. e.g., [{'code': 'INS 621', 'name': 'MSG', 'risk': 'moderate'}]"
    )
    flagged_allergens: List[str] = Field(default_factory=list, description="Detected common allergen triggers.")
    nutrition_per_100g: Dict[str, float] = Field(
        default_factory=dict,
        description="Estimated nutrition per 100g. e.g., {'calories': 0.0, 'protein': 0.0, 'carbs': 0.0, 'fat': 0.0, 'sodium': 0.0, 'sugar': 0.0}"
    )
    estimated_macros: Optional[Dict[str, float]] = Field(
        default=None,
        description="Macronutrient breakdown alias matching nutrition_per_100g."
    )
    brand: Optional[str] = Field(default="Local Brand", description="Extracted brand name.")
    food_id: Optional[str] = Field(default=None, description="MongoDB Document ID if stored in queue.")
    is_verified: bool = Field(default=False, description="Verification state of the food item.")
    requires_user_review: bool = Field(default=True, description="Flag indicating if the user should review the parsed data.")
    name: Optional[str] = Field(default=None, description="Name alias for frontend UI compatibility.")
    safety_score: int = Field(default=75, description="Calculated safety score (0-100).")
    warnings: List[str] = Field(default_factory=list, description="Allergen or additive warnings.")
    ingredients: Optional[List[Any]] = Field(default=None, description="Rich ingredient objects or string list for UI display.")
    additives: Optional[List[str]] = Field(default=None, description="Formatted additives list.")
    allergens: Optional[List[str]] = Field(default=None, description="Formatted allergens list.")
    barcode: Optional[str] = Field(default=None, description="Optional product barcode.")

