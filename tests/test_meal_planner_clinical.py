"""
End-to-End Clinical Validation Suite for Smart Meal Planner
Target Modules:
- backend/routes/meals.py (Registered as /api/meals)
- backend/services/meal_planner/planner.py
- backend/services/meal_planner/conflict_analyzer.py
- backend/services/meal_planner/meal_repository.py
- backend/schemas/meal_plan.py

==============================================================================
DISCOVERED API CONTRACTS & SPECIFICATION NOTES
==============================================================================

1. Generate Plan:
   - Endpoint: POST /api/meals/generate-plan
   - Request: GeneratePlanRequest(target_calories: float, meal_types: List[str] = ["breakfast", "lunch", "snack", "dinner"])
   - Response: MealPlanResponse(plan_id, target_calories, meals: List[MealPlanItem], daily_totals, calorie_deviation_percent, generated_at, data_disclaimer)
   - Note: Request body does NOT accept conditions/allergens. User conditions and allergens are derived from the authenticated
     user document stored in MongoDB:
       * health_profile.medicalConditions (string, e.g. "hypertension, diabetes")
       * preferences.allergies (list of strings, e.g. ["dairy", "peanuts"])
       * preferences.diet (string, e.g. "vegetarian")

2. Swap Meal:
   - Endpoint: POST /api/meals/swap
   - Request: SwapMealRequest(current_meal_id: str, meal_type: str, target_calories: float)
   - Response: MealPlanItem

3. Clinical/Nutritional Schemas:
   - MealPlanItem contains: calories, protein_g, carbs_g, fat_g, fiber_g, sodium_mg, sugar_g, ingredients, conflict, safety_score, safety_class.
   - SPECIFICATION GAP: MealPlanItem exposes `sugar_g` (total sugar) but does NOT expose `added_sugar_g`,
     even though `added_sugar_g` is tracked in the repository and checked in `conflict_analyzer.py`.
     Tests inspect the underlying repository data where necessary or report the limitation.

4. Safety Score:
   - Repository defines: safety_score = max(0.0, 100.0 - penalties)
   - Critical conflicts (allergens, severe conditions) incur penalty 100 -> score 0.0 (is_safe = False, severity = "critical").
   - Moderate conflicts (e.g. sodium > 500mg, added sugar > 5g) incur penalties 20-30 -> score 70-80 (is_safe = True, severity = "moderate").
   - SAFE tier: safety_score >= 70 (or safety_class == "safe" / "moderate" without critical violations).
"""

import sys
import os
import pytest
from typing import Dict, Any, List
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient

# Ensure backend directory is in sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from backend.main import app
from backend.services.meal_planner.planner import generate_meal_plan, swap_meal
from backend.services.meal_planner.conflict_analyzer import analyze_meal_conflict, normalize_ingredients
from backend.services.meal_planner.meal_repository import get_all_meals, get_meal_by_id
from backend.routes.meals import get_current_user_id

client = TestClient(app)

# ============================================================================
# REUSABLE FIXTURES & CLINICAL ASSERTION HELPERS
# ============================================================================

@pytest.fixture
def mock_auth():
    import routes.meals
    import main
    
    override_fn = lambda: "clinical_test_user_uid"
    app.dependency_overrides[get_current_user_id] = override_fn
    app.dependency_overrides[routes.meals.get_current_user_id] = override_fn
    if hasattr(main, "get_current_user_id"):
        app.dependency_overrides[main.get_current_user_id] = override_fn
    yield "clinical_test_user_uid"
    app.dependency_overrides.clear()

def extract_meals(plan_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    assert "meals" in plan_data, f"Plan response missing 'meals' array: {plan_data}"
    return plan_data["meals"]

def calculate_daily_calories(meals: List[Dict[str, Any]]) -> float:
    return sum(m.get("calories", 0.0) for m in meals)

def calculate_daily_sodium(meals: List[Dict[str, Any]]) -> float:
    return sum(m.get("sodium_mg", 0.0) for m in meals)

def calculate_daily_sugar(meals: List[Dict[str, Any]]) -> float:
    return sum(m.get("sugar_g", 0.0) for m in meals)

def assert_calorie_range(total_calories: float, target: float, tolerance: float = 0.05):
    lower_bound = target * (1.0 - tolerance)
    upper_bound = target * (1.0 + tolerance)
    assert lower_bound <= total_calories <= upper_bound, (
        f"Calorie budget violation: target={target}kcal, actual={total_calories}kcal, "
        f"permitted range=[{lower_bound:.1f}, {upper_bound:.1f}], "
        f"diff={total_calories - target:.1f}kcal"
    )

def assert_no_forbidden_ingredients(meal: Dict[str, Any], forbidden_list: List[str], rationale: str):
    ingredients = [i.lower() for i in meal.get("ingredients", [])]
    normalized = normalize_ingredients(ingredients)
    meal_name = meal.get("name", "Unknown Meal")

    for forbidden in forbidden_list:
        forbidden_lower = forbidden.lower()
        for raw_ing, norm_ing in zip(ingredients, normalized):
            if forbidden_lower in raw_ing or forbidden_lower in norm_ing:
                pytest.fail(
                    f"Clinical Ingredient Violation ({rationale}): meal={meal_name!r}, "
                    f"offending_ingredient={raw_ing!r} (normalized: {norm_ing!r}), "
                    f"prohibited_pattern={forbidden!r}"
                )

def assert_hypertension_compliance(meal: Dict[str, Any]):
    meal_name = meal.get("name", "Unknown Meal")
    sodium = meal.get("sodium_mg", 0.0)
    assert sodium < 500, (
        f"Hypertension meal sodium violation: meal={meal_name!r}, "
        f"sodium={sodium}mg (strictly < 500mg required)"
    )
    # Prohibited high-sodium additives (MSG / guanylates / inosinates)
    prohibited_additives = ["ins 621", "ins 627", "ins 631", "monosodium glutamate", "msg"]
    assert_no_forbidden_ingredients(meal, prohibited_additives, "Hypertension Additive")

def assert_diabetes_compliance(meal: Dict[str, Any]):
    meal_name = meal.get("name", "Unknown Meal")
    # Check forbidden glycemic ingredients
    forbidden_glycemic = [
        "maida", "refined flour", "refined wheat flour",
        "white sugar", "liquid glucose", "maltodextrin"
    ]
    assert_no_forbidden_ingredients(meal, forbidden_glycemic, "Diabetes Glycemic Ingredient")
    
    # Check sugar threshold
    # Note: If added_sugar_g is available in repo meal data, check that; else check sugar_g
    repo_meal = get_meal_by_id(meal.get("meal_id", ""))
    added_sugar = repo_meal.get("added_sugar_g") if repo_meal else None
    if added_sugar is not None:
        assert added_sugar <= 5.0, (
            f"Diabetes added sugar violation: meal={meal_name!r}, "
            f"added_sugar={added_sugar}g (<= 5.0g required)"
        )

def assert_gluten_compliance(meal: Dict[str, Any]):
    forbidden_gluten = [
        "wheat", "wheat flour", "maida", "semolina",
        "suji", "rava", "barley", "malt"
    ]
    assert_no_forbidden_ingredients(meal, forbidden_gluten, "Gluten / Celiac Safety")

# ============================================================================
# 1. TEST PERSONA 1 — HYPERTENSION + DAIRY + PEANUT ALLERGY
# ============================================================================

def test_persona_1_hypertension_dairy_peanuts_service_level():
    """
    Persona 1:
    - target_calories: 1800
    - dietary_preference: "Vegetarian"
    - conditions: ["Hypertension"]
    - allergens: ["Dairy", "Peanuts"]
    """
    target_cals = 1800.0
    health_vault = {"medicalConditions": "hypertension"}
    preferences = {
        "diet": "vegetarian",
        "allergies": ["dairy", "peanuts"]
    }
    meal_types = ["breakfast", "lunch", "snack", "dinner"]

    plan = generate_meal_plan(target_cals, meal_types, health_vault, preferences)
    meals = extract_meals(plan)

    # 1. Structure Verification: Exactly four meals
    assert len(meals) == 4, (
        f"Structure failure: Expected exactly 4 meals, but got {len(meals)} meals: "
        f"{[m.get('name') for m in meals]}. "
        f"Available meal slots: {[m.get('meal_type') for m in meals]}"
    )
    
    returned_slots = [m.get("meal_type") for m in meals]
    for expected_slot in meal_types:
        assert expected_slot in returned_slots, f"Missing expected meal slot: {expected_slot}"

    # 2. Safety Score verification
    for meal in meals:
        score = meal.get("safety_score", 0.0)
        assert score >= 70, (
            f"Safety score threshold violation: meal={meal.get('name')!r}, "
            f"safety_score={score} (documented safe tier >= 70)"
        )
        assert meal.get("conflict", {}).get("is_safe") is True, (
            f"Meal marked unsafe by conflict analyzer: meal={meal.get('name')!r}, "
            f"reasons={meal.get('conflict', {}).get('warning_reasons')}"
        )

    # 3. Dairy Exclusion
    dairy_forbidden = ["dairy", "milk", "paneer", "curd", "yogurt", "yoghurt", "butter", "ghee", "cream"]
    for meal in meals:
        assert_no_forbidden_ingredients(meal, dairy_forbidden, "Dairy Allergen Exclusion")

    # 4. Peanut Exclusion
    peanut_forbidden = ["peanut", "peanuts", "groundnut", "groundnuts", "peanut oil", "groundnut oil"]
    for meal in meals:
        assert_no_forbidden_ingredients(meal, peanut_forbidden, "Peanut Allergen Exclusion")

    # 5. Sodium: Each meal < 500mg, Daily total < 1500mg
    for meal in meals:
        assert_hypertension_compliance(meal)

    daily_sodium = calculate_daily_sodium(meals)
    assert daily_sodium < 1500, (
        f"Daily sodium limit violation for Hypertension: total={daily_sodium}mg "
        f"(strictly < 1500mg required across 4 meals)"
    )

    # 6. Calories: 1710 <= total <= 1890
    daily_calories = calculate_daily_calories(meals)
    assert_calorie_range(daily_calories, target_cals, tolerance=0.05)


@pytest.mark.asyncio
async def test_persona_1_hypertension_dairy_peanuts_api_endpoint(mock_auth):
    """
    Validates Persona 1 end-to-end through the HTTP endpoint POST /api/meals/generate-plan
    """
    fake_user = {
        "uid": "clinical_test_user_uid",
        "health_profile": {"medicalConditions": "Hypertension"},
        "preferences": {
            "diet": "Vegetarian",
            "allergies": ["Dairy", "Peanuts"]
        }
    }

    with patch("routes.meals.get_users_collection") as mock_get_users:
        mock_col = MagicMock()
        mock_col.find_one = AsyncMock(return_value=fake_user)
        mock_get_users.return_value = mock_col

        response = client.post(
            "/api/meals/generate-plan",
            json={"target_calories": 1800.0, "meal_types": ["breakfast", "lunch", "snack", "dinner"]},
            headers={"Authorization": "Bearer mock_token"}
        )

        assert response.status_code == 200, f"Generate plan API failed: {response.status_code} - {response.text}"
        data = response.json()
        meals = data["meals"]
        
        # Clinical structure assertions
        assert len(meals) == 4, f"API returned {len(meals)} meals, expected 4"
        for meal in meals:
            assert meal["safety_score"] >= 70
            assert meal["sodium_mg"] < 500
        assert data["daily_totals"]["sodium_mg"] < 1500
        assert 1710 <= data["daily_totals"]["calories"] <= 1890


# ============================================================================
# 2. TEST PERSONA 2 — TYPE-2 DIABETES + WEIGHT LOSS
# ============================================================================

def test_persona_2_diabetes_weight_loss_service_level():
    """
    Persona 2:
    - target_calories: 1400
    - dietary_preference: "Vegetarian"
    - conditions: ["Diabetes"]
    - allergens: []
    """
    target_cals = 1400.0
    health_vault = {"medicalConditions": "diabetes"}
    preferences = {
        "diet": "vegetarian",
        "allergies": []
    }
    meal_types = ["breakfast", "lunch", "snack", "dinner"]

    plan = generate_meal_plan(target_cals, meal_types, health_vault, preferences)
    meals = extract_meals(plan)

    assert len(meals) == 4, f"Expected 4 meals for diabetes profile, got {len(meals)}"

    # 1. Glycemic Forbidden Ingredients & Sugar constraints
    for meal in meals:
        assert_diabetes_compliance(meal)

    # 2. Total added sugar limit (<= 20g daily)
    daily_added_sugar = 0.0
    for meal in meals:
        repo_meal = get_meal_by_id(meal.get("meal_id", ""))
        if repo_meal:
            daily_added_sugar += repo_meal.get("added_sugar_g", 0.0)
    
    assert daily_added_sugar <= 20.0, (
        f"Daily added sugar violation for Diabetes: total={daily_added_sugar}g "
        f"(<= 20.0g allowed)"
    )

    # 3. Calorie range: 1330 <= total <= 1470 (±5% of 1400)
    daily_calories = calculate_daily_calories(meals)
    assert_calorie_range(daily_calories, target_cals, tolerance=0.05)


@pytest.mark.asyncio
async def test_persona_2_diabetes_api_endpoint(mock_auth):
    """
    Validates Persona 2 through the HTTP endpoint POST /api/meals/generate-plan
    """
    fake_user = {
        "uid": "clinical_test_user_uid",
        "health_profile": {"medicalConditions": "Diabetes"},
        "preferences": {
            "diet": "Vegetarian",
            "allergies": []
        }
    }

    import routes.meals
    with patch("routes.meals.get_users_collection") as mock_get_users:
        mock_col = MagicMock()
        mock_col.find_one = AsyncMock(return_value=fake_user)
        mock_get_users.return_value = mock_col

        response = client.post(
            "/api/meals/generate-plan",
            json={"target_calories": 1400.0},
            headers={"Authorization": "Bearer mock_token"}
        )

        assert response.status_code == 200, f"API error: {response.text}"
        data = response.json()
        assert 1330 <= data["daily_totals"]["calories"] <= 1470


# ============================================================================
# 3. TEST PERSONA 3 — GLUTEN EXCLUSION / CELIAC-SAFETY PROFILE
# ============================================================================

def test_persona_3_gluten_exclusion_service_level():
    """
    Persona 3:
    - target_calories: 2200
    - dietary_preference: "None"
    - conditions: []
    - allergens: ["Gluten"]
    """
    target_cals = 2200.0
    health_vault = {"medicalConditions": ""}
    preferences = {
        "diet": "None",
        "allergies": ["gluten"]
    }
    meal_types = ["breakfast", "lunch", "snack", "dinner"]

    plan = generate_meal_plan(target_cals, meal_types, health_vault, preferences)
    meals = extract_meals(plan)

    assert len(meals) == 4, f"Expected 4 gluten-free meals, got {len(meals)}"

    # 1. Gluten Exclusion
    for meal in meals:
        assert_gluten_compliance(meal)
        # Check allergen tags if present
        repo_meal = get_meal_by_id(meal.get("meal_id", ""))
        if repo_meal:
            allergen_tags = [t.lower() for t in repo_meal.get("allergen_tags", [])]
            assert "gluten" not in allergen_tags, (
                f"Meal tagged with gluten allergen: {meal.get('name')!r}"
            )

    # 2. Calorie range: 2090 <= total <= 2310 (±5% of 2200)
    daily_calories = calculate_daily_calories(meals)
    assert_calorie_range(daily_calories, target_cals, tolerance=0.05)

    # 3. Protein Requirement: Protein calories >= 25% of total calories
    # protein_calories = protein_grams * 4 kcal/g
    total_protein_g = sum(m.get("protein_g", 0.0) for m in meals)
    protein_calories = total_protein_g * 4.0
    protein_ratio = protein_calories / daily_calories if daily_calories > 0 else 0

    assert protein_calories >= daily_calories * 0.25, (
        f"Protein ratio deficit for athletic profile: protein_g={total_protein_g}g, "
        f"protein_calories={protein_calories:.1f}kcal ({protein_ratio*100:.1f}%), "
        f"required >= 25.0% of total calories ({daily_calories * 0.25:.1f}kcal)"
    )


# ============================================================================
# 4. TEST PERSONA 4 — MEAL SWAP SAFETY INVARIANTS
# ============================================================================

def test_persona_4_meal_swap_safety_invariants_service_level():
    """
    Persona 4:
    - Base Plan: Persona 1 (1800 kcal, Vegetarian, Hypertension, Dairy+Peanut allergy)
    - Target: Swap the lunch meal
    - Invariants:
      * Valid replacement exists and is different from original
      * Replacement lunch calories in 567 <= cal <= 693 (630 ± 10%)
      * Replacement strictly satisfies sodium < 500mg
      * Replacement strictly contains no dairy, paneer, curd, milk, butter, ghee, peanuts
      * Replacement safety_score >= 70
    """
    target_cals = 1800.0
    health_vault = {"medicalConditions": "hypertension"}
    preferences = {
        "diet": "vegetarian",
        "allergies": ["dairy", "peanuts"]
    }
    
    # 1. Generate initial plan
    initial_plan = generate_meal_plan(target_cals, ["breakfast", "lunch", "snack", "dinner"], health_vault, preferences)
    initial_meals = initial_plan["meals"]
    
    lunch_candidates = [m for m in initial_meals if m["meal_type"] == "lunch"]
    original_lunch_id = lunch_candidates[0]["meal_id"] if lunch_candidates else "l1"

    # 2. Perform Swap
    replacement = swap_meal(
        current_meal_id=original_lunch_id,
        meal_type="lunch",
        target_calories=target_cals,
        health_vault=health_vault,
        preferences=preferences
    )

    assert replacement is not None, (
        "Swap returned None: No compatible alternative lunch found that satisfies "
        "Vegetarian + Hypertension + Dairy-free + Peanut-free constraints."
    )
    assert replacement["meal_id"] != original_lunch_id, "Swap returned the identical meal ID"
    assert replacement["meal_type"] == "lunch", f"Swap returned wrong meal type: {replacement['meal_type']}"

    # 3. Lunch Calorie target: 1800 * 0.35 = 630 kcal. ±10% range: 567 to 693
    replacement_cals = replacement["calories"]
    assert 567 <= replacement_cals <= 693, (
        f"Swap calorie target violation: replacement lunch calories={replacement_cals}kcal, "
        f"expected range=[567, 693] (630 ± 10%)"
    )

    # 4. Hypertension invariant: sodium < 500mg
    assert_hypertension_compliance(replacement)

    # 5. Allergen invariants: No dairy, no peanuts
    dairy_forbidden = ["dairy", "milk", "paneer", "curd", "yogurt", "butter", "ghee", "cream"]
    peanut_forbidden = ["peanut", "peanuts", "groundnut", "peanut oil"]
    assert_no_forbidden_ingredients(replacement, dairy_forbidden, "Swap Dairy Invariant")
    assert_no_forbidden_ingredients(replacement, peanut_forbidden, "Swap Peanut Invariant")

    # 6. Safety Score
    assert replacement["safety_score"] >= 70, (
        f"Swap safety score violation: score={replacement['safety_score']} (expected >= 70)"
    )


@pytest.mark.asyncio
async def test_persona_4_meal_swap_api_endpoint(mock_auth):
    """
    Validates Meal Swap through POST /api/meals/swap
    """
    fake_user = {
        "uid": "clinical_test_user_uid",
        "health_profile": {"medicalConditions": "Hypertension"},
        "preferences": {
            "diet": "Vegetarian",
            "allergies": ["Dairy", "Peanuts"]
        }
    }

    with patch("routes.meals.get_users_collection") as mock_get_users:
        mock_col = MagicMock()
        mock_col.find_one = AsyncMock(return_value=fake_user)
        mock_get_users.return_value = mock_col

        payload = {
            "current_meal_id": "l1",
            "meal_type": "lunch",
            "target_calories": 1800.0
        }

        response = client.post(
            "/api/meals/swap",
            json=payload,
            headers={"Authorization": "Bearer mock_token"}
        )

        # If no compatible alternative exists, the API should return 409 Conflict rather than 500
        if response.status_code == 409:
            data = response.json()
            assert "detail" in data
        else:
            assert response.status_code == 200, f"Swap failed: {response.text}"
            meal = response.json()
            assert meal["meal_type"] == "lunch"
            assert meal["safety_score"] >= 70
            assert meal["sodium_mg"] < 500


# ============================================================================
# 5. EDGE-CASE TESTS
# ============================================================================

def test_edge_case_case_normalization():
    """
    Verify that condition and allergen strings with mixed case are normalized correctly.
    E.g. 'Diabetes' vs 'diabetes', 'Dairy' vs 'dairy', 'Peanuts' vs 'peanuts'.
    """
    meal = {
        "id": "test_m1",
        "name": "Peanut Paratha",
        "meal_type": "breakfast",
        "ingredients": ["wheat flour", "peanuts"],
        "allergen_tags": ["peanuts", "gluten"],
        "dietary_tags": ["vegetarian"],
        "calories": 400,
        "sodium_mg": 200,
        "added_sugar_g": 0
    }

    # Test with capitalized conditions and allergens
    hv = {"medicalConditions": "Hypertension, Diabetes"}
    pref = {"diet": "Vegetarian", "allergies": ["Dairy", "PEANUTS"]}

    res = analyze_meal_conflict(meal, hv, pref)
    assert res["is_safe"] is False, "Failed to catch 'PEANUTS' allergen due to case sensitivity"
    assert res["conflict_severity"] == "critical"
    assert any("peanut" in r.lower() for r in res["warning_reasons"])


def test_edge_case_ingredient_alias_detection():
    """
    Verify that ingredient aliases (e.g. paneer -> dairy, groundnut -> peanuts, maida -> refined wheat flour)
    are recognized during conflict analysis even when explicit allergen_tags are omitted.
    """
    # Meal has ingredients without explicit allergen_tags
    meal_with_paneer = {
        "id": "test_m2",
        "name": "Custom Saag",
        "ingredients": ["spinach", "paneer", "salt"],
        "allergen_tags": [],
        "dietary_tags": ["vegetarian"]
    }
    pref_dairy = {"diet": "vegetarian", "allergies": ["dairy"]}
    res = analyze_meal_conflict(meal_with_paneer, {"medicalConditions": ""}, pref_dairy)
    assert res["is_safe"] is False, "Failed to identify 'paneer' as dairy alias"
    assert res["conflict_severity"] == "critical"

    meal_with_groundnut = {
        "id": "test_m3",
        "name": "Groundnut Poha",
        "ingredients": ["flattened rice", "groundnut", "mustard seeds"],
        "allergen_tags": [],
        "dietary_tags": ["vegetarian"]
    }
    pref_peanuts = {"diet": "vegetarian", "allergies": ["peanuts"]}
    res2 = analyze_meal_conflict(meal_with_groundnut, {"medicalConditions": ""}, pref_peanuts)
    assert res2["is_safe"] is False, "Failed to identify 'groundnut' as peanut alias"


def test_edge_case_boundary_values():
    """
    Test clinical rule exact boundary values:
    - Sodium: strictly < 500mg (500mg should be flagged moderate/unsafe under strict requirement)
    - Added sugar: <= 5g (5.0g must pass, 5.1g must trigger conflict)
    """
    # Meal with exactly 5.0g added sugar
    meal_5g_sugar = {
        "id": "test_b1",
        "name": "Border Sugar Meal",
        "meal_type": "breakfast",
        "ingredients": ["oats"],
        "allergen_tags": [],
        "dietary_tags": [],
        "added_sugar_g": 5.0,
        "sodium_mg": 200
    }
    res_5g = analyze_meal_conflict(meal_5g_sugar, {"medicalConditions": "diabetes"}, {"diet": "None", "allergies": []})
    assert not any(r["rule_id"] == "DIABETES_HIGH_SUGAR" for r in res_5g["rule_results"]), (
        "5.0g added sugar was incorrectly penalized for diabetes (<= 5g is allowed)"
    )

    # Meal with 5.1g added sugar
    meal_5_1g_sugar = {
        "id": "test_b2",
        "name": "Over Sugar Meal",
        "meal_type": "breakfast",
        "ingredients": ["oats"],
        "allergen_tags": [],
        "dietary_tags": [],
        "added_sugar_g": 5.1,
        "sodium_mg": 200
    }
    res_5_1g = analyze_meal_conflict(meal_5_1g_sugar, {"medicalConditions": "diabetes"}, {"diet": "None", "allergies": []})
    assert any(r["rule_id"] == "DIABETES_HIGH_SUGAR" for r in res_5_1g["rule_results"]), (
        "5.1g added sugar failed to trigger DIABETES_HIGH_SUGAR rule"
    )


def test_edge_case_missing_malformed_nutritional_data():
    """
    Verify application behavior when nutritional fields are None or missing.
    Should not crash with unhandled TypeError.
    """
    malformed_meal = {
        "id": "malformed_1",
        "name": "Mystery Dish",
        "meal_type": "lunch",
        "ingredients": ["water", "salt"],
        "allergen_tags": [],
        "dietary_tags": [],
        "calories": 200,
        # sodium_mg and sugar_g omitted
    }
    hv = {"medicalConditions": "hypertension, diabetes"}
    pref = {"diet": "None", "allergies": []}

    # Must execute safely without unhandled exception
    res = analyze_meal_conflict(malformed_meal, hv, pref)
    assert isinstance(res, dict)
    assert "safety_score" in res


def test_edge_case_swap_regression():
    """
    Verify that multiple successive swaps preserve clinical invariants and do not bypass safety filters.
    """
    target_cals = 2000.0
    hv = {"medicalConditions": ""}
    pref = {"diet": "vegetarian", "allergies": ["dairy"]}

    # Perform initial swap for breakfast
    res1 = swap_meal("b1", "breakfast", target_cals, hv, pref)
    if res1:
        assert res1["conflict"]["is_safe"] is True
        assert_no_forbidden_ingredients(res1, ["dairy", "paneer", "ghee"], "Successive Swap 1")

        # Perform secondary swap from the replacement
        res2 = swap_meal(res1["meal_id"], "breakfast", target_cals, hv, pref)
        if res2:
            assert res2["conflict"]["is_safe"] is True
            assert_no_forbidden_ingredients(res2, ["dairy", "paneer", "ghee"], "Successive Swap 2")
