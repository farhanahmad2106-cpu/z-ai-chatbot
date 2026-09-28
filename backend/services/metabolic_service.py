import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)

def calculate_mifflin_st_jeor(weight_kg: float, height_cm: float, age: int, gender: str) -> float:
    if gender.lower() in ["male", "m"]:
        return 10 * weight_kg + 6.25 * height_cm - 5 * age + 5
    else:
        return 10 * weight_kg + 6.25 * height_cm - 5 * age - 161

def recalculate_daily_targets(user_doc: Dict[str, Any], biometric: Dict[str, Any]) -> Dict[str, Any]:
    default_goals = user_doc.get("daily_goals", {
        "calories": 2000,
        "protein": 140,
        "carbs": 250,
        "fat": 70,
        "source": "default"
    })

    health_profile = user_doc.get("health_profile", {})
    weight = health_profile.get("weight")
    height = health_profile.get("height")
    age = health_profile.get("age")
    gender = health_profile.get("gender")
    goal = health_profile.get("healthGoal", "Healthy Lifestyle")
    conditions = str(health_profile.get("medicalConditions", "")).lower()

    if weight is None or height is None or age is None or gender is None:
        logger.warning(f"Missing required metabolic profile for UID {user_doc.get('uid')}. Returning existing targets.")
        return default_goals

    try:
        weight_kg = float(weight)
        height_cm = float(height)
        age_int = int(age)
    except (ValueError, TypeError):
        logger.warning(f"Invalid metabolic profile types for UID {user_doc.get('uid')}. Returning existing targets.")
        return default_goals

    # Mifflin-St Jeor BMR
    bmr = calculate_mifflin_st_jeor(weight_kg, height_cm, age_int, gender)
    
    # Baseline TDEE: Sedentary factor (1.2) to prevent double-counting activity
    baseline_tdee = bmr * 1.2

    # Activity adjustment
    active_energy = float(biometric.get("active_energy_burned_kcal", 0))
    activity_adjustment = active_energy * 0.85
    
    # Goal adjustment
    goal_adjustment = 0
    if "weight loss" in goal.lower() or "cut" in goal.lower():
        goal_adjustment = -500
    elif "weight gain" in goal.lower() or "bulk" in goal.lower():
        goal_adjustment = 500

    adjusted_calories = baseline_tdee + activity_adjustment + goal_adjustment
    adjusted_calories = max(1200.0, adjusted_calories)

    # Protein logic: 1.2 - 1.6 g/kg
    protein_factor = 1.2
    if active_energy > 600:
        protein_factor = 1.6
    elif active_energy > 300:
        protein_factor = 1.4

    protein_g = weight_kg * protein_factor
    
    fat_calories = adjusted_calories * 0.25
    fat_g = fat_calories / 9.0
    
    carb_calories = adjusted_calories - (protein_g * 4) - fat_calories
    carbs_g = max(0.0, carb_calories / 4.0)

    goals = {
        "calories": round(adjusted_calories),
        "protein": round(protein_g),
        "carbs": round(carbs_g),
        "fat": round(fat_g),
        "source": "biometrics_recalculated"
    }

    # Clinical safety caps
    if "diabet" in conditions:
        goals["added_sugar_per_meal_cap_g"] = 5
    if "hypertens" in conditions:
        goals["sodium_per_meal_cap_mg"] = 499

    return goals
