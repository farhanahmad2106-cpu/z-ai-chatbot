# backend/services/meal_planner/weekly_planner.py
import uuid
import datetime
from typing import Dict, Any, List, Optional, Tuple
from .meal_repository import get_all_meals, get_meal_by_id
from .conflict_analyzer import analyze_meal_conflict, normalize_ingredients
from .rules import INGREDIENT_ALIASES
from .validator import validate_weekly_plan, PlanValidationError, EXPECTED_DAYS, EXPECTED_SLOTS

SLOT_PERCENTAGES = {
    "breakfast": 0.25,
    "lunch": 0.35,
    "snack": 0.10,
    "dinner": 0.30
}

class InfeasiblePlanException(Exception):
    def __init__(self, message: str, constraint: str = "", day: str = "", slot: str = ""):
        super().__init__(message)
        self.message = message
        self.constraint = constraint
        self.day = day
        self.slot = slot

def is_meal_safe_for_constraints(meal: Dict[str, Any], health_vault: Dict[str, Any], preferences: Dict[str, Any]) -> Tuple[bool, str]:
    """
    Evaluates whether a meal candidate satisfies hard clinical, allergen, and dietary constraints.
    """
    user_conditions = (health_vault.get("medicalConditions") or "").lower()
    user_allergies = [a.lower().strip() for a in preferences.get("allergies", [])]
    user_diet = (preferences.get("diet") or "None").lower().strip()

    # 1. Base conflict analyzer check
    conflict = analyze_meal_conflict(meal, health_vault, preferences)
    if not conflict["is_safe"]:
        return False, f"Conflict: {', '.join(conflict['warning_reasons'])}"

    # 2. Strict Diabetes Invariant: No maida/refined flour, added sugar base <= 5g
    if "diabetes" in user_conditions:
        if meal.get("refined_flour", False):
            return False, "Contains refined flour (maida), strictly excluded for diabetes."
        ingredients_norm = normalize_ingredients([i.lower() for i in meal.get("ingredients", [])])
        if any("refined wheat flour" in ing or "maida" in ing for ing in ingredients_norm):
            return False, "Contains refined wheat flour, strictly excluded for diabetes."
        if float(meal.get("added_sugar_g", 0)) > 5.0:
            return False, f"Added sugar {meal.get('added_sugar_g')}g exceeds 5g diabetes meal limit."

    # 3. Strict Hypertension Invariant: Base sodium must be < 500mg
    if "hypertension" in user_conditions:
        if float(meal.get("sodium_mg", 0)) >= 500.0:
            return False, f"Sodium {meal.get('sodium_mg')}mg >= 500mg limit for hypertension."

    # 4. Strict Allergen & Exclusion Invariant (checks allergen_tags, ingredient_tags, and normalized ingredients)
    meal_allergens = [a.lower() for a in meal.get("allergen_tags", [])]
    meal_ingredient_tags = [t.lower() for t in meal.get("ingredient_tags", [])]
    meal_ingredients_norm = normalize_ingredients([i.lower() for i in meal.get("ingredients", [])])

    for allergy in user_allergies:
        allergy_norm = INGREDIENT_ALIASES.get(allergy, allergy)
        if (allergy_norm in meal_allergens or allergy in meal_allergens or
            allergy_norm in meal_ingredient_tags or allergy in meal_ingredient_tags or
            any(allergy_norm in ing or allergy in ing for ing in meal_ingredients_norm)):
            return False, f"Contains declared allergen/exclusion '{allergy}'."

    return True, ""

def calculate_scaled_meal(meal: Dict[str, Any], target_slot_cal: float, user_conditions: str) -> Dict[str, Any]:
    """
    Calculates portion scaling [0.5, 2.5] and scaled nutrition attributes for a meal.
    """
    base_cal = float(meal.get("calories", 300))
    scale = target_slot_cal / base_cal if base_cal > 0 else 1.0
    scale = max(0.5, min(scale, 2.5))

    # Check clinical upper clamps on scale so scaled nutrients never violate hard boundaries
    if "hypertension" in user_conditions and meal.get("sodium_mg", 0) > 0:
        max_scale_for_sodium = 490.0 / float(meal["sodium_mg"])
        if max_scale_for_sodium >= 0.5:
            scale = min(scale, max_scale_for_sodium)

    if "diabetes" in user_conditions and meal.get("added_sugar_g", 0) > 0:
        max_scale_for_sugar = 5.0 / float(meal["added_sugar_g"])
        if max_scale_for_sugar >= 0.5:
            scale = min(scale, max_scale_for_sugar)

    scale = round(scale, 2)
    scale = max(0.5, min(scale, 2.5))

    scaled_calories = round(base_cal * scale, 1)
    scaled_protein = round(float(meal.get("protein_g", 0)) * scale, 1)
    scaled_carbs = round(float(meal.get("carbs_g", 0)) * scale, 1)
    scaled_fat = round(float(meal.get("fat_g", 0)) * scale, 1)
    scaled_fiber = round(float(meal.get("fiber_g", 0)) * scale, 1)
    scaled_sodium = round(float(meal.get("sodium_mg", 0)) * scale, 1)
    scaled_sugar = round(float(meal.get("sugar_g", 0)) * scale, 1)
    scaled_added_sugar = round(float(meal.get("added_sugar_g", 0)) * scale, 1)

    serving_desc = meal["serving_description"]
    if abs(scale - 1.0) >= 0.05:
        serving_desc = f"{meal['serving_description']} ({scale}x serving)"

    # Base conflict info
    conflict_info = {
        "is_safe": True,
        "conflict_severity": "none",
        "warning_reasons": [],
        "suggested_alternatives": [],
        "rule_results": []
    }

    return {
        "meal_id": meal["id"],
        "name": meal["name"],
        "meal_type": meal["meal_type"],
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
        "ingredient_details": meal.get("ingredient_details", []),
        "dietary_tags": meal.get("dietary_tags", []),
        "ingredient_tags": meal.get("ingredient_tags", []),
        "allergen_tags": meal.get("allergen_tags", []),
        "conflict": conflict_info,
        "safety_score": 100.0,
        "safety_class": "safe"
    }

def generate_weekly_plan(
    user_id: str,
    target_calories: float,
    health_vault: Dict[str, Any],
    preferences: Dict[str, Any],
    start_date: Optional[datetime.date] = None
) -> Dict[str, Any]:
    """
    Generates a deterministic 7-day revolving meal plan with:
    - Exactly 7 days and 4 slots per day (28 meal items).
    - 2-day cooldown tracking per slot where dataset permits.
    - Hard clinical, allergen, and dietary boundary enforcement.
    - Daily calorie target ±5% window.
    - Deterministic fallback when dataset size limits variety.
    """
    all_meals = get_all_meals()
    user_conditions = (health_vault.get("medicalConditions") or "").lower()

    # 1. Filter candidates for each slot
    candidates_by_slot: Dict[str, List[Dict[str, Any]]] = {s: [] for s in EXPECTED_SLOTS}
    for meal in all_meals:
        m_slot = meal.get("meal_type")
        if m_slot in candidates_by_slot:
            safe, reason = is_meal_safe_for_constraints(meal, health_vault, preferences)
            if safe:
                candidates_by_slot[m_slot].append(meal)

    # 2. Check Feasibility: Every slot MUST have at least 1 valid candidate
    for slot in EXPECTED_SLOTS:
        if len(candidates_by_slot[slot]) == 0:
            raise InfeasiblePlanException(
                message=f"No safe meal options available for slot '{slot}' matching user clinical/allergen profile.",
                constraint="candidates_exhausted",
                slot=slot
            )

    # 3. Determine active week dates
    if not start_date:
        today = datetime.date.today()
        # Monday of current week
        start_date = today - datetime.timedelta(days=today.weekday())
    end_date = start_date + datetime.timedelta(days=6)
    week_id = f"{start_date.isocalendar()[0]}-W{start_date.isocalendar()[1]:02d}"

    # 4. Weekly schedule generation with variety / cooldown tracking
    slot_history: Dict[str, List[str]] = {s: [] for s in EXPECTED_SLOTS}
    variety_warnings: List[str] = []
    days_result = []

    weekly_totals = {
        "calories": 0.0,
        "protein_g": 0.0,
        "carbs_g": 0.0,
        "fat_g": 0.0,
        "fiber_g": 0.0,
        "sodium_mg": 0.0,
        "sugar_g": 0.0,
        "added_sugar_g": 0.0
    }

    lower_cal_bound = target_calories * 0.95
    upper_cal_bound = target_calories * 1.05

    for day_idx, day_name in enumerate(EXPECTED_DAYS):
        current_date = start_date + datetime.timedelta(days=day_idx)
        day_date_str = current_date.strftime("%Y-%m-%d")

        # 4a. Build candidate pool for each slot honoring cooldown
        eligible_by_slot: Dict[str, List[Dict[str, Any]]] = {}
        for slot in EXPECTED_SLOTS:
            history = slot_history[slot]
            forbidden_ids = set()
            if len(history) >= 1:
                forbidden_ids.add(history[-1])  # 1-day cooldown (consecutive)
            if len(history) >= 2:
                forbidden_ids.add(history[-2])  # 2-day cooldown

            el = [m for m in candidates_by_slot[slot] if m["id"] not in forbidden_ids]
            if not el:
                # Relax to 1-day cooldown (never consecutive if >=2 candidates available)
                consecutive_forbidden = {history[-1]} if len(history) >= 1 else set()
                el = [m for m in candidates_by_slot[slot] if m["id"] not in consecutive_forbidden]
                if not el:
                    el = candidates_by_slot[slot]
                warning_msg = f"Dataset limitation for {day_name} {slot}: Repeating meal after 1 day cooldown."
                if warning_msg not in variety_warnings:
                    variety_warnings.append(warning_msg)
            eligible_by_slot[slot] = el

        # 4b. Find the optimal combination for the day
        def evaluate_combinations(candidates_pool: Dict[str, List[Dict[str, Any]]]) -> Optional[Tuple[Any, Any, Any, Any]]:
            best_c = None
            best_s = float("inf")

            for b in candidates_pool["breakfast"]:
                sc_b = calculate_scaled_meal(b, target_calories * SLOT_PERCENTAGES["breakfast"], user_conditions)
                for l in candidates_pool["lunch"]:
                    sc_l = calculate_scaled_meal(l, target_calories * SLOT_PERCENTAGES["lunch"], user_conditions)
                    for s in candidates_pool["snack"]:
                        sc_s = calculate_scaled_meal(s, target_calories * SLOT_PERCENTAGES["snack"], user_conditions)
                        for d in candidates_pool["dinner"]:
                            sc_d = calculate_scaled_meal(d, target_calories * SLOT_PERCENTAGES["dinner"], user_conditions)

                            tot_cal = sc_b["calories"] + sc_l["calories"] + sc_s["calories"] + sc_d["calories"]
                            tot_sod = sc_b["sodium_mg"] + sc_l["sodium_mg"] + sc_s["sodium_mg"] + sc_d["sodium_mg"]
                            tot_sugar = sc_b["added_sugar_g"] + sc_l["added_sugar_g"] + sc_s["added_sugar_g"] + sc_d["added_sugar_g"]

                            # Clinical Hard Constraints
                            if "hypertension" in user_conditions and tot_sod >= 1480.0:
                                continue
                            if "diabetes" in user_conditions and tot_sugar > 20.0:
                                continue
                            if tot_cal < lower_cal_bound - 1.0 or tot_cal > upper_cal_bound + 1.0:
                                continue

                            # Score: calorie closeness + sodium minimization
                            cal_diff = abs(tot_cal - target_calories)
                            sod_penalty = (tot_sod * 0.5) if "hypertension" in user_conditions else 0.0
                            protein_tot = sc_b["protein_g"] + sc_l["protein_g"] + sc_s["protein_g"] + sc_d["protein_g"]

                            score = cal_diff + sod_penalty - (protein_tot * 1.5)
                            if score < best_s:
                                best_s = score
                                best_c = (sc_b, sc_l, sc_s, sc_d)
            return best_c

        best_combo = evaluate_combinations(eligible_by_slot)

        # If strict 2-day cooldown prevents meeting daily sodium < 1500mg,
        # relax to 1-day cooldown (never consecutive) per Section 11 of the specification
        if not best_combo:
            relaxed_pool = {}
            for slot in EXPECTED_SLOTS:
                history = slot_history[slot]
                relaxed_pool[slot] = [
                    m for m in candidates_by_slot[slot]
                    if len(history) == 0 or m["id"] != history[-1]
                ] or candidates_by_slot[slot]

            best_combo = evaluate_combinations(relaxed_pool)
            warning_msg = f"Dataset limitation: Relaxed 2-day cooldown on {day_name} to preserve daily clinical constraints."
            if warning_msg not in variety_warnings:
                variety_warnings.append(warning_msg)

        if not best_combo:
            raise InfeasiblePlanException(
                message=f"No valid meal combination can satisfy all hard clinical constraints on {day_name}.",
                constraint="daily_constraints_unfulfillable",
                day=day_name
            )

        day_meals = list(best_combo)
        for idx, slot in enumerate(EXPECTED_SLOTS):
            slot_history[slot].append(day_meals[idx]["meal_id"])

        day_totals = {
            "calories": sum(m["calories"] for m in day_meals),
            "protein_g": sum(m["protein_g"] for m in day_meals),
            "carbs_g": sum(m["carbs_g"] for m in day_meals),
            "fat_g": sum(m["fat_g"] for m in day_meals),
            "fiber_g": sum(m["fiber_g"] for m in day_meals),
            "sodium_mg": sum(m["sodium_mg"] for m in day_meals),
            "sugar_g": sum(m["sugar_g"] for m in day_meals),
            "added_sugar_g": sum(m["added_sugar_g"] for m in day_meals)
        }

        cal_deviation = round(((day_totals["calories"] - target_calories) / target_calories) * 100.0, 2)

        day_obj = {
            "day": day_name,
            "date": day_date_str,
            "meals": day_meals,
            "daily_totals": {k: round(v, 1) for k, v in day_totals.items()},
            "calorie_deviation_percent": cal_deviation,
            "is_compliant": True
        }
        days_result.append(day_obj)

        for k in weekly_totals:
            weekly_totals[k] += day_totals[k]

    plan_response = {
        "plan_id": str(uuid.uuid4()),
        "user_id": user_id,
        "week_id": week_id,
        "week_start": start_date.strftime("%Y-%m-%d"),
        "week_end": end_date.strftime("%Y-%m-%d"),
        "target_calories": float(target_calories),
        "days": days_result,
        "weekly_totals": {k: round(v, 1) for k, v in weekly_totals.items()},
        "variety_warnings": variety_warnings,
        "status": "active",
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "data_disclaimer": "7-day meal suggestions are informational and are not a substitute for individualized medical advice. Validate all dietary changes with a qualified clinical dietitian."
    }

    # 5. Independent Validator Verification
    validation_constraints = {
        "target_calories": target_calories,
        "health_profile": health_vault,
        "preferences": preferences
    }
    val_res = validate_weekly_plan(plan_response, validation_constraints)
    if not val_res["valid"]:
        raise InfeasiblePlanException(
            message=f"Validation failed: {'; '.join(val_res['errors'][:3])}",
            constraint="plan_validation_failed"
        )

    return plan_response

def swap_day_slot_in_plan(
    plan: Dict[str, Any],
    day: str,
    slot: str,
    replacement_meal_id: Optional[str],
    health_vault: Dict[str, Any],
    preferences: Dict[str, Any]
) -> Tuple[bool, Dict[str, Any], Optional[str]]:
    """
    Executes a validated, constrained mutation of a single slot in an existing 7-day plan.
    Returns (success, updated_plan_or_original, error_message).
    """
    import copy
    candidate_plan = copy.deepcopy(plan)
    user_conditions = (health_vault.get("medicalConditions") or "").lower()
    target_calories = float(candidate_plan.get("target_calories", 2000))
    target_slot_cal = target_calories * SLOT_PERCENTAGES.get(slot.lower(), 0.25)

    # Find the target day
    target_day_obj = None
    for d in candidate_plan.get("days", []):
        if d.get("day", "").lower() == day.lower():
            target_day_obj = d
            break

    if not target_day_obj:
        return False, plan, f"Day '{day}' not found in active plan."

    # Find the target meal slot
    current_meal_idx = -1
    current_meal_id = ""
    for idx, m in enumerate(target_day_obj.get("meals", [])):
        if m.get("meal_type", "").lower() == slot.lower():
            current_meal_idx = idx
            current_meal_id = m.get("meal_id", "")
            break

    if current_meal_idx == -1:
        return False, plan, f"Slot '{slot}' not found on {day}."

    all_meals = get_all_meals()
    candidate_meals = []
    for m in all_meals:
        if m.get("meal_type", "").lower() == slot.lower():
            safe, _ = is_meal_safe_for_constraints(m, health_vault, preferences)
            if safe:
                candidate_meals.append(m)

    if not candidate_meals:
        return False, plan, f"No safe alternatives available for slot '{slot}'."

    replacement_meal = None
    if replacement_meal_id:
        for m in candidate_meals:
            if m["id"] == replacement_meal_id:
                replacement_meal = m
                break
        if not replacement_meal:
            return False, plan, f"Replacement meal '{replacement_meal_id}' is not safe or compatible with user profile."
    else:
        alternatives = [m for m in candidate_meals if m["id"] != current_meal_id]
        if not alternatives:
            return False, plan, "No different compatible alternative was found for this slot."
        replacement_meal = alternatives[0]

    # Calculate scaled meal
    new_scaled = calculate_scaled_meal(replacement_meal, target_slot_cal, user_conditions)
    target_day_obj["meals"][current_meal_idx] = new_scaled

    # Recalculate day's totals
    new_totals = {
        "calories": 0.0,
        "protein_g": 0.0,
        "carbs_g": 0.0,
        "fat_g": 0.0,
        "fiber_g": 0.0,
        "sodium_mg": 0.0,
        "sugar_g": 0.0,
        "added_sugar_g": 0.0
    }
    for m in target_day_obj["meals"]:
        for k in new_totals:
            new_totals[k] += m.get(k, 0.0)

    target_day_obj["daily_totals"] = {k: round(v, 1) for k, v in new_totals.items()}
    if target_calories > 0:
        target_day_obj["calorie_deviation_percent"] = round(
            ((new_totals["calories"] - target_calories) / target_calories) * 100.0, 2
        )

    # Recalculate weekly totals
    weekly_totals = {
        "calories": 0.0,
        "protein_g": 0.0,
        "carbs_g": 0.0,
        "fat_g": 0.0,
        "fiber_g": 0.0,
        "sodium_mg": 0.0,
        "sugar_g": 0.0,
        "added_sugar_g": 0.0
    }
    for d in candidate_plan.get("days", []):
        for k in weekly_totals:
            weekly_totals[k] += d.get("daily_totals", {}).get(k, 0.0)
    candidate_plan["weekly_totals"] = {k: round(v, 1) for k, v in weekly_totals.items()}

    # Validate the mutated candidate plan
    validation_constraints = {
        "target_calories": target_calories,
        "health_profile": health_vault,
        "preferences": preferences
    }
    val_res = validate_weekly_plan(candidate_plan, validation_constraints)
    if not val_res["valid"]:
        return False, plan, f"Swap invalidates plan: {'; '.join(val_res['errors'][:2])}"

    return True, candidate_plan, None
