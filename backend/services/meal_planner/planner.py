# backend/services/meal_planner/planner.py
import uuid
from typing import Dict, Any, List
from .meal_repository import get_all_meals, get_meal_by_id
from .conflict_analyzer import analyze_meal_conflict

def generate_meal_plan(target_calories: float, meal_types: List[str], health_vault: Dict[str, Any], preferences: Dict[str, Any]) -> Dict[str, Any]:
    all_meals = get_all_meals()
    
    # 1. Filter out critical conflicts and group by type
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
                
    # 2. Select best combination (Greedy approach for simplicity)
    # Distribute target calories: Breakfast (25%), Lunch (35%), Snack (10%), Dinner (30%)
    cal_distribution = {
        "breakfast": 0.25,
        "lunch": 0.35,
        "snack": 0.10,
        "dinner": 0.30
    }
    
    selected_meals = []
    total_calories = 0
    total_protein = 0
    total_carbs = 0
    total_fat = 0
    total_fiber = 0
    total_sodium = 0
    total_sugar = 0
    
    for mt in meal_types:
        target_cal_for_meal = target_calories * cal_distribution.get(mt, 0.25)
        candidates = safe_meals_by_type.get(mt, [])
        if not candidates:
            # Cannot fulfill
            continue
            
        # Sort candidates by closest to target calories
        candidates.sort(key=lambda x: abs(x["calories"] - target_cal_for_meal))
        
        # Pick the best safe one
        best_meal = candidates[0]
        
        selected_meals.append({
            "meal_id": best_meal["id"],
            "name": best_meal["name"],
            "meal_type": best_meal["meal_type"],
            "serving_description": best_meal["serving_description"],
            "calories": float(best_meal["calories"]),
            "protein_g": float(best_meal.get("protein_g", 0)),
            "carbs_g": float(best_meal.get("carbs_g", 0)),
            "fat_g": float(best_meal.get("fat_g", 0)),
            "fiber_g": float(best_meal.get("fiber_g", 0)),
            "sodium_mg": float(best_meal.get("sodium_mg", 0)),
            "sugar_g": float(best_meal.get("sugar_g", 0)),
            "ingredients": best_meal.get("ingredients", []),
            "conflict": best_meal["conflict"],
            "safety_score": float(best_meal["safety_score"]),
            "safety_class": best_meal["safety_class"]
        })
        
        total_calories += best_meal["calories"]
        total_protein += best_meal.get("protein_g", 0)
        total_carbs += best_meal.get("carbs_g", 0)
        total_fat += best_meal.get("fat_g", 0)
        total_fiber += best_meal.get("fiber_g", 0)
        total_sodium += best_meal.get("sodium_mg", 0)
        total_sugar += best_meal.get("sugar_g", 0)

    calorie_deviation = 0.0
    if target_calories > 0:
        calorie_deviation = ((total_calories - target_calories) / target_calories) * 100.0

    return {
        "plan_id": str(uuid.uuid4()),
        "target_calories": float(target_calories),
        "meals": selected_meals,
        "daily_totals": {
            "calories": float(total_calories),
            "protein_g": float(total_protein),
            "carbs_g": float(total_carbs),
            "fat_g": float(total_fat),
            "fiber_g": float(total_fiber),
            "sodium_mg": float(total_sodium),
            "sugar_g": float(total_sugar)
        },
        "calorie_deviation_percent": float(calorie_deviation)
    }

def swap_meal(current_meal_id: str, meal_type: str, target_calories: float, health_vault: Dict[str, Any], preferences: Dict[str, Any]) -> Dict[str, Any]:
    all_meals = get_all_meals()
    candidates = []
    
    # 1. Filter out critical conflicts, match meal type, and exclude current meal
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
        
    # 2. Select closest by calorie match (assuming single meal replacement aims for same fraction)
    # Usually frontend supplies target_calories as daily target. We distribute.
    cal_distribution = {
        "breakfast": 0.25,
        "lunch": 0.35,
        "snack": 0.10,
        "dinner": 0.30
    }
    target_cal_for_meal = target_calories * cal_distribution.get(meal_type, 0.25)
    candidates.sort(key=lambda x: abs(x["calories"] - target_cal_for_meal))
    
    best_meal = candidates[0]
    
    return {
        "meal_id": best_meal["id"],
        "name": best_meal["name"],
        "meal_type": best_meal["meal_type"],
        "serving_description": best_meal["serving_description"],
        "calories": float(best_meal["calories"]),
        "protein_g": float(best_meal.get("protein_g", 0)),
        "carbs_g": float(best_meal.get("carbs_g", 0)),
        "fat_g": float(best_meal.get("fat_g", 0)),
        "fiber_g": float(best_meal.get("fiber_g", 0)),
        "sodium_mg": float(best_meal.get("sodium_mg", 0)),
        "sugar_g": float(best_meal.get("sugar_g", 0)),
        "ingredients": best_meal.get("ingredients", []),
        "conflict": best_meal["conflict"],
        "safety_score": float(best_meal["safety_score"]),
        "safety_class": best_meal["safety_class"]
    }
