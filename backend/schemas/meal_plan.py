from pydantic import BaseModel, Field
from typing import List, Optional, Literal, Dict, Any

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
    suggested_alternatives: List[str] = []
    rule_results: List[RuleResult] = []

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
    refined_flour: Optional[bool] = False
    ingredients: List[str]
    ingredient_details: Optional[List[Dict[str, Any]]] = None
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

# --- WEEKLY PLANNER & GROCERY SCHEMAS ---

class DayPlan(BaseModel):
    day: str
    date: str
    meals: List[MealPlanItem]
    daily_totals: DailyTotals
    calorie_deviation_percent: float
    is_compliant: bool = True

class WeeklyPlanResponse(BaseModel):
    plan_id: str
    user_id: str
    week_id: str
    week_start: str
    week_end: str
    target_calories: float
    days: List[DayPlan]
    weekly_totals: Dict[str, float]
    variety_warnings: List[str] = []
    status: str = "active"
    generated_at: str
    data_disclaimer: str

class WeeklyPlanRequest(BaseModel):
    target_calories: Optional[float] = Field(None, ge=500, le=10000)
    force_regenerate: bool = False

class SwapDaySlotRequest(BaseModel):
    plan_id: str
    day: str
    slot: Literal["breakfast", "lunch", "snack", "dinner"]
    replacement_meal_id: Optional[str] = None

class GroceryItem(BaseModel):
    name: str
    quantity: float
    unit: str

class GroceryCategory(BaseModel):
    name: str
    items: List[GroceryItem]

class GroceryListResponse(BaseModel):
    plan_id: str
    week_id: str
    week_start: str
    week_end: str
    categories: List[GroceryCategory]
    total_items: int

class InfeasiblePlanError(BaseModel):
    success: bool = False
    error_code: str = "WEEKLY_PLAN_INFEASIBLE"
    message: str
    constraint: Optional[str] = None
    day: Optional[str] = None
    slot: Optional[str] = None
