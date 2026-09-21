from pydantic import BaseModel, Field
from typing import List, Optional, Literal, Dict

class RuleResult(BaseModel):
    rule_id: str
    category: str
    severity: Literal["none", "moderate", "critical"]
    message: str
    observed_value: Optional[float] = None
    threshold: Optional[float] = None
    unit: Optional[str] = None

class MealConflict(BaseModel):
    is_safe: bool
    conflict_severity: Literal["none", "moderate", "critical"]
    warning_reasons: List[str]
    suggested_alternatives: List[str]
    rule_results: List[RuleResult]

class MealPlanItem(BaseModel):
    meal_id: str
    name: str
    meal_type: Literal["breakfast", "lunch", "snack", "dinner"]
    serving_description: str
    servings: Optional[float] = 1.0
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float
    fiber_g: Optional[float] = 0.0
    sodium_mg: Optional[float] = 0.0
    sugar_g: Optional[float] = 0.0
    added_sugar_g: Optional[float] = 0.0
    ingredients: List[str]
    conflict: MealConflict
    safety_score: float
    safety_class: Literal["safe", "moderate", "critical"]

class DailyTotals(BaseModel):
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float
    fiber_g: float
    sodium_mg: float
    sugar_g: float
    added_sugar_g: Optional[float] = 0.0

class MealPlanResponse(BaseModel):
    plan_id: str
    target_calories: float
    meals: List[MealPlanItem]
    daily_totals: DailyTotals
    calorie_deviation_percent: float
    generated_at: str
    data_disclaimer: str

class GeneratePlanRequest(BaseModel):
    target_calories: float
    meal_types: List[Literal["breakfast", "lunch", "snack", "dinner"]] = ["breakfast", "lunch", "snack", "dinner"]

class SwapMealRequest(BaseModel):
    current_meal_id: str
    meal_type: Literal["breakfast", "lunch", "snack", "dinner"]
    target_calories: float
