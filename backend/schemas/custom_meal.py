from pydantic import BaseModel, Field
from typing import List, Optional, Literal, Dict, Any

class IngredientItemInput(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    quantity_grams: float = Field(..., gt=0, le=10000)

class CustomMealCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    meal_type: Literal["breakfast", "lunch", "snack", "dinner"]
    servings: int = Field(default=1, ge=1, le=20)
    ingredients: List[IngredientItemInput] = Field(..., min_length=1, max_length=50)
    cooking_method: Optional[str] = Field(default=None, max_length=100)
    include_in_planner: bool = True
    log_to_today: bool = False

class MacroNutrients(BaseModel):
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float
    sodium_mg: float
    added_sugar_g: float

class AnalyzedIngredientDetail(BaseModel):
    name: str
    quantity_grams: float
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float
    sodium_mg: float
    added_sugar_g: float
    allergen_tags: List[str] = []
    provenance: str = "local_nutrition_db"

class CustomMealResponse(BaseModel):
    id: str
    user_id: str
    name: str
    meal_type: Literal["breakfast", "lunch", "snack", "dinner"]
    servings: int
    cooking_method: Optional[str] = None
    total_nutrition: MacroNutrients
    per_serving_nutrition: MacroNutrients
    ingredients: List[AnalyzedIngredientDetail]
    safety_score: int = Field(..., ge=0, le=100)
    safety_tier: Literal["SAFE", "MODERATE", "CRITICAL"]
    detected_allergens: List[str] = []
    clinical_conflicts: List[str] = []
    warnings: List[str] = []
    planner_eligible: bool = True
    nutrition_provenance: Dict[str, str] = {}
    created_at: str
