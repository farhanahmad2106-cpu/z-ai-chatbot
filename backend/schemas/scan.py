from pydantic import BaseModel, Field
from typing import List, Dict, Optional

class OCRAnalysisResponse(BaseModel):
    product_name: Optional[str] = Field(default="Packaged Food Item", description="Name of the product extracted from the image.")
    raw_ocr_text: str = Field(description="Complete unformatted OCR string.")
    parsed_ingredients: List[str] = Field(description="Array of parsed clean ingredients.")
    detected_ins_additives: List[Dict[str, str]] = Field(
        description="Extracted International Numbering System (INS) codes. e.g., [{'code': 'INS 621', 'name': 'MSG', 'risk': 'moderate'}]"
    )
    flagged_allergens: List[str] = Field(description="Detected common allergen triggers.")
    nutrition_per_100g: Dict[str, float] = Field(
        description="Estimated nutrition per 100g. e.g., {'calories': 0.0, 'protein': 0.0, 'carbs': 0.0, 'fat': 0.0, 'sodium': 0.0, 'sugar': 0.0}"
    )
    requires_user_review: bool = Field(default=True, description="Flag indicating if the user should review the parsed data.")
