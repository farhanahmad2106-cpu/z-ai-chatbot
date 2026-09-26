# backend/services/meal_planner/planner.py
import uuid
from typing import Dict, Any, List, Optional
from .meal_repository import get_all_meals, get_meal_by_id
from .conflict_analyzer import analyze_meal_conflict

DEFAULT_DISTRIBUTION = {
    "breakfast": 0.25,
    "lunch": 0.35,
    "snack": 0.10,
    "dinner": 0.30
}

def normalize_custom_meal_for_planner(cm: Dict[str, Any]) -> Dict[str, Any]:
    per_serv = cm.get("per_serving_nutrition", {})
    mid = str(cm.get("_id") or cm.get("id"))
    ingredients_list = []
    for ing in cm.get("ingredients", []):
        if isinstance(ing, dict):
            ingredients_list.append(ing.get("name", ""))
        else:
            ingredients_list.append(str(ing))
            
    return {
        "id": mid,
        "meal_id": mid,
        "name": cm.get("name"),
        "meal_type": cm.get("meal_type"),
        "calories": float(per_serv.get("calories", 0.0)),
        "protein_g": float(per_serv.get("protein_g", 0.0)),
        "carbs_g": float(per_serv.get("carbs_g", 0.0)),
        "fat_g": float(per_serv.get("fat_g", 0.0)),
        "fiber_g": float(per_serv.get("fiber_g", 3.0)),
        "sodium_mg": float(per_serv.get("sodium_mg", 0.0)),
        "sugar_g": float(per_serv.get("added_sugar_g", 0.0)),
        "added_sugar_g": float(per_serv.get("added_sugar_g", 0.0)),
        "allergen_tags": cm.get("detected_allergens", []),
        "dietary_tags": ["vegetarian"] if not any(k in cm.get("name", "").lower() for k in ["chicken", "mutton", "fish", "meat", "egg"]) else [],
        "ingredients": ingredients_list,
        "is_custom": True,
        "servings": cm.get("servings", 1)
    }

def calculate_scaled_meal(
    meal: Dict[str, Any],
    target_calories: float,
    user_conditions: Any
) -> Optional[Dict[str, Any]]:
    """
    Calculates portion scaling [0.5, 2.5] and scaled nutrition attributes for a meal.
    Enforces strict mathematical derivation from a single serving factor.
    Rejects candidates (returns None) if clinical constraints cannot be satisfied at >= 0.5x portion.
    """
    if isinstance(user_conditions, (list, tuple, set)):
        conditions_str = " ".join(str(c).lower() for c in user_conditions)
    elif isinstance(user_conditions, str):
        conditions_str = user_conditions.lower()
    else:
        conditions_str = ""

    # Step 5.1: Validate source calories and target calories
    try:
        meal_calories = float(meal.get("calories", 0.0))
    except (ValueError, TypeError):
        return None

    try:
        target_calories_val = float(target_calories)
    except (ValueError, TypeError):
        return None

    if meal_calories <= 0 or target_calories_val <= 0:
        return None

    # Step 9: Validate non-negative nutrient values
    for key in ["protein_g", "carbs_g", "fat_g", "fiber_g", "sodium_mg", "sugar_g", "added_sugar_g"]:
        val = meal.get(key)
        if val is not None:
            try:
                if float(val) < 0:
                    return None
            except (ValueError, TypeError):
                return None

    # Step 5.2: Calculate ideal calorie-based scale clamped to [0.5, 2.5]
    scale = target_calories_val / meal_calories
    scale = max(0.5, min(scale, 2.5))

    # Step 6: Hypertension constraint
    try:
        source_sodium = float(meal.get("sodium_mg", 0.0) or 0.0)
    except (ValueError, TypeError):
        source_sodium = 0.0

    if "hypertension" in conditions_str and source_sodium > 0:
        max_scale_for_sodium = 490.0 / source_sodium
        scale = min(scale, max_scale_for_sodium)

    # Step 7: Diabetes constraint
    try:
        source_added_sugar = float(meal.get("added_sugar_g", 0.0) or 0.0)
    except (ValueError, TypeError):
        source_added_sugar = 0.0

    if "diabetes" in conditions_str and source_added_sugar > 0:
        max_scale_for_sugar = 5.0 / source_added_sugar
        scale = min(scale, max_scale_for_sugar)

    # Hard clinical boundary: if portion cannot satisfy constraints at minimum 0.5x serving, reject
    if scale < 0.5:
        return None

    # Section 25: Serving factor precision and step-down boundary guard
    scale = round(scale, 2)
    if "hypertension" in conditions_str and source_sodium > 0:
        if round(source_sodium * scale, 1) > 490.0:
            scale = round(scale - 0.01, 2)
    if "diabetes" in conditions_str and source_added_sugar > 0:
        if round(source_added_sugar * scale, 1) > 5.0:
            scale = round(scale - 0.01, 2)

    if scale < 0.5:
        return None

    # Step 10: Calculate all nutrients proportionally from the final physical serving factor
    scaled_calories = round(meal_calories * scale, 1)
    scaled_protein = round(float(meal.get("protein_g", 0.0) or 0.0) * scale, 1)
    scaled_carbs = round(float(meal.get("carbs_g", 0.0) or 0.0) * scale, 1)
    scaled_fat = round(float(meal.get("fat_g", 0.0) or 0.0) * scale, 1)
    scaled_fiber = round(float(meal.get("fiber_g", 0.0) or 0.0) * scale, 1)
    scaled_sodium = round(source_sodium * scale, 1)
    scaled_sugar = round(float(meal.get("sugar_g", 0.0) or 0.0) * scale, 1)
    scaled_added_sugar = round(source_added_sugar * scale, 1)

    serving_desc = meal.get("serving_description", "1 serving")
    if abs(scale - 1.0) >= 0.1:
        serving_desc = f"{serving_desc} ({scale}x serving)"

    conflict = meal.get("conflict")
    if conflict is None:
        conflict = {
            "is_safe": True,
            "conflict_severity": "none",
            "warning_reasons": [],
            "suggested_alternatives": [],
            "rule_results": []
        }

    safety_score = float(meal.get("safety_score", 100.0))
    safety_class = meal.get("safety_class", "safe")

    return {
        "meal_id": meal.get("id") or meal.get("meal_id", ""),
        "name": meal.get("name", ""),
        "meal_type": meal.get("meal_type", ""),
        "serving_description": serving_desc,
        "servings": float(scale),
        "calories": float(scaled_calories),
        "protein_g": float(scaled_protein),
        "carbs_g": float(scaled_carbs),
        "fat_g": float(scaled_fat),
        "fiber_g": float(scaled_fiber),
        "sodium_mg": float(scaled_sodium),
        "sugar_g": float(scaled_sugar),
        "added_sugar_g": float(scaled_added_sugar),
        "refined_flour": bool(meal.get("refined_flour", False)),
        "ingredients": meal.get("ingredients", []),
        "conflict": conflict,
        "safety_score": safety_score,
        "safety_class": safety_class
    }

def generate_meal_plan(
    target_calories: float,
    meal_types: List[str],
    health_vault: Dict[str, Any],
    preferences: Dict[str, Any],
    custom_meals: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    all_meals = list(get_all_meals())
    if custom_meals:
        for cm in custom_meals:
            if cm.get("planner_eligible", True) and cm.get("include_in_planner", True) and cm.get("safety_tier") != "CRITICAL":
                all_meals.append(normalize_custom_meal_for_planner(cm))

    user_conditions = (health_vault.get("medicalConditions") or "").lower()
    
    # 1. Filter out critical conflicts and group by meal type
    safe_meals_by_type = {mt: [] for mt in meal_types}
    for meal in all_meals:
        mt = meal["meal_type"]
        if mt in safe_meals_by_type:
            conflict = analyze_meal_conflict(meal, health_vault, preferences)
            if conflict["is_safe"]:
                meal_item = dict(meal)
                meal_item["conflict"] = conflict
                meal_item["safety_score"] = conflict["safety_score"]
                meal_item["safety_class"] = conflict["safety_class"]
                safe_meals_by_type[mt].append(meal_item)

                
    # 2. Normalize calorie distribution over requested meal slots
    total_weight = sum(DEFAULT_DISTRIBUTION.get(mt, 0.25) for mt in meal_types) or 1.0
    cal_distribution = {mt: DEFAULT_DISTRIBUTION.get(mt, 0.25) / total_weight for mt in meal_types}
    
    selected_meals = []
    total_calories = 0.0
    total_protein = 0.0
    total_carbs = 0.0
    total_fat = 0.0
    total_fiber = 0.0
    total_sodium = 0.0
    total_sugar = 0.0
    total_added_sugar = 0.0
    
    for mt in meal_types:
        target_cal_for_meal = target_calories * cal_distribution.get(mt, 0.25)
        candidates = safe_meals_by_type.get(mt, [])
        if not candidates:
            # Slot cannot be safely fulfilled
            continue
            
        def rank_candidate(c: Dict[str, Any]) -> float:
            base_cal = float(c.get("calories", 300))
            scale = target_cal_for_meal / base_cal if base_cal > 0 else 1.0
            scale = max(0.5, min(scale, 2.5))
            
            scaled_sodium = float(c.get("sodium_mg", 0)) * scale
            scaled_added_sugar = float(c.get("added_sugar_g", 0)) * scale
            
            penalty = 0.0
            # Strict penalty if scaled sodium exceeds 500mg in hypertension
            if "hypertension" in user_conditions and scaled_sodium >= 490:
                penalty += 2000.0
            # Strict penalty if scaled added sugar exceeds 5g in diabetes
            if "diabetes" in user_conditions and scaled_added_sugar > 5.0:
                penalty += 2000.0
                
            # Protein priority bonus for high calorie / athletic plans
            protein_cal = float(c.get("protein_g", 0)) * 4.0
            protein_ratio = (protein_cal / base_cal) if base_cal > 0 else 0
            protein_bonus = -100.0 * protein_ratio if target_calories >= 2000 else -20.0 * protein_ratio
            
            cal_diff = abs(base_cal - target_cal_for_meal)
            return penalty + cal_diff + protein_bonus

        candidates.sort(key=rank_candidate)
        
        # Portion scaling and clinical candidate selection
        selected_meal = None
        for candidate in candidates:
            scaled = calculate_scaled_meal(candidate, target_cal_for_meal, user_conditions)
            if scaled is None:
                continue
            selected_meal = scaled
            break

        if selected_meal is None:
            # Slot cannot be safely fulfilled
            continue

        selected_meals.append(selected_meal)
        
        total_calories += selected_meal["calories"]
        total_protein += selected_meal["protein_g"]
        total_carbs += selected_meal["carbs_g"]
        total_fat += selected_meal["fat_g"]
        total_fiber += selected_meal["fiber_g"]
        total_sodium += selected_meal["sodium_mg"]
        total_sugar += selected_meal["sugar_g"]
        total_added_sugar += selected_meal["added_sugar_g"]

    calorie_deviation = 0.0
    if target_calories > 0:
        calorie_deviation = round(((total_calories - target_calories) / target_calories) * 100.0, 2)

    return {
        "plan_id": str(uuid.uuid4()),
        "target_calories": float(target_calories),
        "meals": selected_meals,
        "daily_totals": {
            "calories": round(float(total_calories), 1),
            "protein_g": round(float(total_protein), 1),
            "carbs_g": round(float(total_carbs), 1),
            "fat_g": round(float(total_fat), 1),
            "fiber_g": round(float(total_fiber), 1),
            "sodium_mg": round(float(total_sodium), 1),
            "sugar_g": round(float(total_sugar), 1),
            "added_sugar_g": round(float(total_added_sugar), 1)
        },
        "calorie_deviation_percent": float(calorie_deviation)
    }

def swap_meal(
    current_meal_id: str,
    meal_type: str,
    target_calories: float,
    health_vault: Dict[str, Any],
    preferences: Dict[str, Any],
    custom_meals: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    all_meals = list(get_all_meals())
    if custom_meals:
        for cm in custom_meals:
            if cm.get("planner_eligible", True) and cm.get("include_in_planner", True) and cm.get("safety_tier") != "CRITICAL":
                all_meals.append(normalize_custom_meal_for_planner(cm))

    user_conditions = (health_vault.get("medicalConditions") or "").lower()

    
    cal_distribution = {
        "breakfast": 0.25,
        "lunch": 0.35,
        "snack": 0.10,
        "dinner": 0.30
    }
    target_cal_for_meal = target_calories * cal_distribution.get(meal_type, 0.25)
    
    candidates = []
    for meal in all_meals:
        if meal["meal_type"] == meal_type and meal["id"] != current_meal_id:
            conflict = analyze_meal_conflict(meal, health_vault, preferences)
            if conflict["is_safe"]:
                meal_item = dict(meal)
                meal_item["conflict"] = conflict
                meal_item["safety_score"] = conflict["safety_score"]
                meal_item["safety_class"] = conflict["safety_class"]
                candidates.append(meal_item)
                
    if not candidates:
        return None
        
    def rank_swap_candidate(c: Dict[str, Any]) -> float:
        base_cal = float(c.get("calories", 300))
        scale = target_cal_for_meal / base_cal if base_cal > 0 else 1.0
        scaled_sodium = float(c.get("sodium_mg", 0)) * scale
        scaled_added_sugar = float(c.get("added_sugar_g", 0)) * scale
        
        penalty = 0.0
        if "hypertension" in user_conditions and scaled_sodium >= 490:
            penalty += 2000.0
        if "diabetes" in user_conditions and scaled_added_sugar > 5.0:
            penalty += 2000.0
            
        return penalty + abs(base_cal - target_cal_for_meal)
        
    candidates.sort(key=rank_swap_candidate)

    for candidate in candidates:
        scaled = calculate_scaled_meal(candidate, target_cal_for_meal, user_conditions)
        if scaled is None:
            continue
        return scaled

    return None
