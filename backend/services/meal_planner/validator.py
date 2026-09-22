# backend/services/meal_planner/validator.py
from typing import Dict, Any, List, Tuple
from .rules import MEDICAL_NUTRITION_RULES, DIETARY_RULES, INGREDIENT_ALIASES
from .conflict_analyzer import normalize_ingredients

EXPECTED_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
EXPECTED_SLOTS = ["breakfast", "lunch", "snack", "dinner"]

class PlanValidationError(Exception):
    def __init__(self, message: str, constraint: str = "", day: str = "", slot: str = ""):
        super().__init__(message)
        self.message = message
        self.constraint = constraint
        self.day = day
        self.slot = slot

def validate_weekly_plan(
    plan: Dict[str, Any],
    constraints: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Independently validates a 7-day weekly meal plan against hard clinical,
    allergen, dietary, calorie, portion scaling, and variety constraints.
    """
    errors: List[str] = []
    warnings: List[str] = []

    target_calories = float(constraints.get("target_calories", plan.get("target_calories", 2000)))
    health_profile = constraints.get("health_profile", {})
    preferences = constraints.get("preferences", {})

    user_conditions = (health_profile.get("medicalConditions") or "").lower()
    user_allergies = [a.lower().strip() for a in preferences.get("allergies", [])]
    user_diet = (preferences.get("diet") or "None").lower().strip()

    days = plan.get("days", [])
    if len(days) != 7:
        errors.append(f"Expected exactly 7 days, found {len(days)}.")
        return {"valid": False, "errors": errors, "warnings": warnings}

    slot_history: Dict[str, List[str]] = {slot: [] for slot in EXPECTED_SLOTS}

    for day_idx, day_obj in enumerate(days):
        day_name = day_obj.get("day", EXPECTED_DAYS[day_idx] if day_idx < len(EXPECTED_DAYS) else f"Day {day_idx+1}")
        meals = day_obj.get("meals", [])

        if len(meals) != 4:
            errors.append(f"{day_name}: Expected 4 meal slots (breakfast, lunch, snack, dinner), found {len(meals)}.")
            continue

        day_calories = 0.0
        day_sodium = 0.0
        day_added_sugar = 0.0

        slots_present = set()

        for meal in meals:
            m_id = meal.get("meal_id", "")
            m_name = meal.get("name", "Unknown")
            m_slot = meal.get("meal_type", "").lower()
            slots_present.add(m_slot)

            servings = float(meal.get("servings", 1.0))
            if servings < 0.49 or servings > 2.51:
                errors.append(f"{day_name} {m_slot} ({m_name}): Servings {servings} outside permissible range [0.5, 2.5].")

            m_cal = float(meal.get("calories", 0.0))
            m_sodium = float(meal.get("sodium_mg", 0.0))
            m_added_sugar = float(meal.get("added_sugar_g", 0.0))
            is_refined_flour = bool(meal.get("refined_flour", False))

            day_calories += m_cal
            day_sodium += m_sodium
            day_added_sugar += m_added_sugar

            # 1. Allergen Hard Exclusions (checks allergen_tags, ingredient_tags, and normalized ingredients)
            m_allergens = [a.lower() for a in meal.get("allergen_tags", [])]
            m_ingredient_tags = [t.lower() for t in meal.get("ingredient_tags", [])]
            m_ingredients = [i.lower() for i in meal.get("ingredients", [])]
            m_ingredients_norm = normalize_ingredients(m_ingredients)

            for allergy in user_allergies:
                allergy_norm = INGREDIENT_ALIASES.get(allergy, allergy)
                if (allergy_norm in m_allergens or allergy in m_allergens or
                    allergy_norm in m_ingredient_tags or allergy in m_ingredient_tags or
                    any(allergy_norm in ing or allergy in ing for ing in m_ingredients_norm)):
                    errors.append(f"{day_name} {m_slot} ({m_name}): Violates declared allergen/exclusion '{allergy}'.")

            # 2. Dietary Restrictions
            if user_diet and user_diet != "none" and user_diet in DIETARY_RULES:
                forbidden = DIETARY_RULES[user_diet].get("forbidden_tags", [])
                m_dietary_tags = [t.lower() for t in meal.get("dietary_tags", [])]
                m_ing_tags = [t.lower() for t in meal.get("ingredient_tags", [])]

                if user_diet not in m_dietary_tags:
                    errors.append(f"{day_name} {m_slot} ({m_name}): Missing required dietary tag '{user_diet}'.")
                for f_tag in forbidden:
                    if f_tag in m_ing_tags:
                        errors.append(f"{day_name} {m_slot} ({m_name}): Contains forbidden ingredient tag '{f_tag}' for diet '{user_diet}'.")

            # 3. Hypertension Clinical Rules
            if "hypertension" in user_conditions:
                if m_sodium >= 500.0:
                    errors.append(f"{day_name} {m_slot} ({m_name}): Sodium {m_sodium}mg exceeds 500mg hypertension limit.")

            # 4. Diabetes Clinical Rules
            if "diabetes" in user_conditions:
                if m_added_sugar > 5.0:
                    errors.append(f"{day_name} {m_slot} ({m_name}): Added sugar {m_added_sugar}g exceeds 5g diabetes limit.")
                if is_refined_flour or any("refined wheat flour" in ing or "maida" in ing for ing in m_ingredients_norm):
                    errors.append(f"{day_name} {m_slot} ({m_name}): Contains refined flour / maida, forbidden in diabetes.")

            # Track slot history for cooldown
            history = slot_history[m_slot]
            if len(history) >= 1 and history[-1] == m_id:
                warnings.append(f"{day_name} {m_slot}: Meal '{m_name}' repeated consecutively.")
            elif len(history) >= 2 and history[-2] == m_id:
                warnings.append(f"{day_name} {m_slot}: Meal '{m_name}' repeated within 2-day cooldown.")
            slot_history[m_slot].append(m_id)

        # Slot completeness
        missing_slots = set(EXPECTED_SLOTS) - slots_present
        if missing_slots:
            errors.append(f"{day_name}: Missing meal slots: {', '.join(missing_slots)}.")

        # Daily Calorie Invariant: target ± 5%
        lower_cal = target_calories * 0.95
        upper_cal = target_calories * 1.05
        if day_calories < lower_cal - 0.5 or day_calories > upper_cal + 0.5:
            errors.append(
                f"{day_name}: Daily calories {day_calories:.1f}kcal outside permissible ±5% range "
                f"[{lower_cal:.1f}, {upper_cal:.1f}] for target {target_calories}kcal."
            )

        # Daily Sodium Invariant: < 1500mg
        if "hypertension" in user_conditions:
            if day_sodium >= 1500.0:
                errors.append(f"{day_name}: Daily sodium {day_sodium:.1f}mg exceeds 1500mg hypertension daily limit.")

        # Daily Added Sugar Invariant: <= 20g
        if "diabetes" in user_conditions:
            if day_added_sugar > 20.0:
                errors.append(f"{day_name}: Daily added sugar {day_added_sugar:.1f}g exceeds 20g diabetes daily limit.")

    is_valid = len(errors) == 0
    return {
        "valid": is_valid,
        "errors": errors,
        "warnings": warnings
    }
