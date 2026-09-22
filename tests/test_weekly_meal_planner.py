"""
Unit and Integration Test Suite for 7-Day Revolving Meal Planner & Smart Grocery List
Target:
- backend/services/meal_planner/weekly_planner.py
- backend/services/meal_planner/grocery_generator.py
- backend/services/meal_planner/validator.py
- backend/routes/meals.py
- backend/schemas/meal_plan.py
"""

import sys
import os
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from backend.main import app
from backend.services.meal_planner.weekly_planner import (
    generate_weekly_plan,
    swap_day_slot_in_plan,
    InfeasiblePlanException
)
from backend.services.meal_planner.validator import validate_weekly_plan
from backend.services.meal_planner.grocery_generator import (
    generate_grocery_list_from_plan,
    normalize_ingredient_name
)
from backend.services.meal_planner.meal_repository import get_all_meals, get_meal_by_id
import routes.meals

client = TestClient(app)

@pytest.fixture
def mock_auth_user():
    def override():
        return "test_weekly_user_uid_123"
    app.dependency_overrides[routes.meals.get_current_user_id] = override
    yield "test_weekly_user_uid_123"
    app.dependency_overrides.clear()

# ============================================================================
# TEST 1 — 7-DAY GENERATION (Exactly 7 days, 4 slots/day = 28 meal items)
# ============================================================================
def test_1_seven_day_generation():
    health_vault = {"medicalConditions": ""}
    preferences = {"diet": "None", "allergies": []}
    plan = generate_weekly_plan("user_1", 2000.0, health_vault, preferences)

    days = plan["days"]
    assert len(days) == 7, f"Expected 7 days, got {len(days)}"

    expected_slots = ["breakfast", "lunch", "snack", "dinner"]
    total_meals = 0
    for d in days:
        meals = d["meals"]
        assert len(meals) == 4, f"Day {d['day']} has {len(meals)} meals, expected 4"
        slots = [m["meal_type"] for m in meals]
        assert slots == expected_slots
        total_meals += len(meals)

    assert total_meals == 28, f"Expected 28 total meal slots, got {total_meals}"

# ============================================================================
# TEST 2 — CALORIE INVARIANT (Every day is within ±5% of target)
# ============================================================================
@pytest.mark.parametrize("target_cal", [1600.0, 2000.0, 2400.0])
def test_2_calorie_invariant(target_cal):
    health_vault = {"medicalConditions": ""}
    preferences = {"diet": "None", "allergies": []}
    plan = generate_weekly_plan("user_cal", target_cal, health_vault, preferences)

    lower = target_cal * 0.95
    upper = target_cal * 1.05

    for d in plan["days"]:
        day_cals = d["daily_totals"]["calories"]
        assert lower - 1.0 <= day_cals <= upper + 1.0, (
            f"{d['day']}: Daily calories {day_cals} outside ±5% range [{lower}, {upper}]"
        )

# ============================================================================
# TEST 3 — HYPERTENSION CONSTRAINTS
# ============================================================================
def test_3_hypertension_constraints():
    health_vault = {"medicalConditions": "hypertension"}
    preferences = {"diet": "None", "allergies": []}
    plan = generate_weekly_plan("user_hyp", 2000.0, health_vault, preferences)

    for d in plan["days"]:
        # Each meal sodium < 500mg
        for m in d["meals"]:
            assert m["sodium_mg"] < 500.0, (
                f"{d['day']} {m['meal_type']} ({m['name']}): Sodium {m['sodium_mg']}mg >= 500mg"
            )
        # Daily sodium < 1500mg
        assert d["daily_totals"]["sodium_mg"] < 1500.0, (
            f"{d['day']}: Daily sodium {d['daily_totals']['sodium_mg']}mg >= 1500mg"
        )

# ============================================================================
# TEST 4 — DIABETES CONSTRAINTS
# ============================================================================
def test_4_diabetes_constraints():
    health_vault = {"medicalConditions": "type 2 diabetes"}
    preferences = {"diet": "None", "allergies": []}
    plan = generate_weekly_plan("user_diab", 2000.0, health_vault, preferences)

    for d in plan["days"]:
        # Each meal added sugar <= 5g
        for m in d["meals"]:
            assert m["added_sugar_g"] <= 5.0, (
                f"{d['day']} {m['meal_type']} ({m['name']}): Added sugar {m['added_sugar_g']}g > 5g"
            )
            # Refined flour / maida strictly excluded
            assert not m.get("refined_flour", False), (
                f"{d['day']} {m['meal_type']} ({m['name']}): Contains refined flour!"
            )
            for ing in m["ingredients"]:
                assert "maida" not in ing.lower(), f"Maida found in {m['name']}"
                assert "refined wheat flour" not in ing.lower(), f"Refined wheat flour in {m['name']}"

        # Daily added sugar <= 20g
        assert d["daily_totals"]["added_sugar_g"] <= 20.0, (
            f"{d['day']}: Daily added sugar {d['daily_totals']['added_sugar_g']}g > 20g"
        )

# ============================================================================
# TEST 5 — COMBINED CONDITION (Hypertension + Diabetes)
# ============================================================================
def test_5_combined_hypertension_and_diabetes():
    health_vault = {"medicalConditions": "hypertension, diabetes"}
    preferences = {"diet": "None", "allergies": []}
    plan = generate_weekly_plan("user_combo", 2000.0, health_vault, preferences)

    for d in plan["days"]:
        for m in d["meals"]:
            assert m["sodium_mg"] < 500.0
            assert m["added_sugar_g"] <= 5.0
            assert not m.get("refined_flour", False)
        assert d["daily_totals"]["sodium_mg"] < 1500.0
        assert d["daily_totals"]["added_sugar_g"] <= 20.0

# ============================================================================
# TEST 6 — ALLERGEN EXCLUSION
# ============================================================================
def test_6_allergen_exclusion():
    health_vault = {"medicalConditions": ""}
    preferences = {"diet": "None", "allergies": ["peanuts", "dairy"]}
    plan = generate_weekly_plan("user_allergy", 1800.0, health_vault, preferences)

    for d in plan["days"]:
        for m in d["meals"]:
            # Neither peanuts nor dairy can be present
            allergen_tags = [t.lower() for t in m.get("allergen_tags", [])]
            assert "peanuts" not in allergen_tags
            assert "dairy" not in allergen_tags
            for ing in m["ingredients"]:
                ing_lower = ing.lower()
                assert "peanut" not in ing_lower
                assert "paneer" not in ing_lower
                assert "ghee" not in ing_lower
                assert "butter" not in ing_lower
                assert "cream" not in ing_lower

# ============================================================================
# TEST 7 — VARIETY & COOLDOWN
# ============================================================================
def test_7_variety_cooldown():
    health_vault = {"medicalConditions": ""}
    preferences = {"diet": "None", "allergies": []}
    plan = generate_weekly_plan("user_variety", 2000.0, health_vault, preferences)

    for slot in ["breakfast", "lunch", "snack", "dinner"]:
        slot_meals = [
            next(m["meal_id"] for m in d["meals"] if m["meal_type"] == slot)
            for d in plan["days"]
        ]
        # Assert no meal appears on consecutive days in the same slot
        for i in range(len(slot_meals) - 1):
            assert slot_meals[i] != slot_meals[i + 1], (
                f"Consecutive repeat in slot '{slot}': day {i} and day {i+1} both use {slot_meals[i]}"
            )
        # Assert 2-day cooldown where unconstrained
        for i in range(len(slot_meals) - 2):
            assert slot_meals[i] != slot_meals[i + 2], (
                f"2-day cooldown violation in slot '{slot}': day {i} and day {i+2} both use {slot_meals[i]}"
            )

# ============================================================================
# TEST 8 — SERVING SCALING IN GROCERY COMPILER (30g * 1.2 = 36g)
# ============================================================================
def test_8_serving_scaling_in_grocery():
    mock_plan = {
        "plan_id": "test_plan_scale",
        "week_id": "2026-W39",
        "week_start": "2026-09-21",
        "week_end": "2026-09-27",
        "days": [
            {
                "day": "Monday",
                "meals": [
                    {
                        "meal_id": "custom_m1",
                        "name": "Custom Meal",
                        "meal_type": "breakfast",
                        "servings": 1.2,
                        "ingredient_details": [
                            {"name": "Jowar Flour", "quantity": 30.0, "unit": "g", "category": "Grains & Flours"}
                        ]
                    }
                ]
            }
        ]
    }
    grocery = generate_grocery_list_from_plan(mock_plan)
    grains = next(c for c in grocery["categories"] if c["name"] == "Grains & Flours")
    jowar_item = next(i for i in grains["items"] if "Jowar" in i["name"])
    # 30.0 * 1.2 = 36.0
    assert jowar_item["quantity"] == 36.0
    assert jowar_item["unit"] == "g"

# ============================================================================
# TEST 9 — GROCERY AGGREGATION ACROSS MULTIPLE MEALS
# ============================================================================
def test_9_grocery_aggregation():
    mock_plan = {
        "plan_id": "test_plan_agg",
        "days": [
            {
                "day": "Monday",
                "meals": [
                    {
                        "meal_id": "m1",
                        "servings": 1.0,
                        "ingredient_details": [
                            {"name": "Tomato", "quantity": 50.0, "unit": "g", "category": "Produce"}
                        ]
                    }
                ]
            },
            {
                "day": "Tuesday",
                "meals": [
                    {
                        "meal_id": "m2",
                        "servings": 2.0,
                        "ingredient_details": [
                            {"name": "tomato", "quantity": 40.0, "unit": "g", "category": "Produce"}
                        ]
                    }
                ]
            }
        ]
    }
    grocery = generate_grocery_list_from_plan(mock_plan)
    produce = next(c for c in grocery["categories"] if c["name"] == "Produce")
    tomato_item = next(i for i in produce["items"] if i["name"] == "Tomato")
    # 50.0*1.0 + 40.0*2.0 = 130.0
    assert tomato_item["quantity"] == 130.0

# ============================================================================
# TEST 10 — UNIT SAFETY (Incompatible units kept separate)
# ============================================================================
def test_10_unit_safety():
    mock_plan = {
        "plan_id": "test_plan_units",
        "days": [
            {
                "day": "Monday",
                "meals": [
                    {
                        "meal_id": "m1",
                        "servings": 1.0,
                        "ingredient_details": [
                            {"name": "Oil", "quantity": 10.0, "unit": "ml", "category": "Spices & Pantry"},
                            {"name": "Oil", "quantity": 10.0, "unit": "g", "category": "Spices & Pantry"}
                        ]
                    }
                ]
            }
        ]
    }
    grocery = generate_grocery_list_from_plan(mock_plan)
    pantry = next(c for c in grocery["categories"] if c["name"] == "Spices & Pantry")
    oil_items = [i for i in pantry["items"] if "Oil" in i["name"]]
    # Should NOT be combined into one since units differ (ml vs g)
    assert len(oil_items) == 2
    units = {i["unit"] for i in oil_items}
    assert "ml" in units and "g" in units

# ============================================================================
# TEST 11 — INFEASIBLE PLAN ERROR CONTRACT
# ============================================================================
def test_11_infeasible_plan_explicit_failure():
    # Impossible constraints: all allergens blocked so breakfast has 0 candidates
    health_vault = {"medicalConditions": ""}
    # Blocking lentils, grains, eggs, dairy, millet
    preferences = {
        "diet": "None",
        "allergies": ["lentil", "millet", "wheat", "eggs", "rice", "grain", "soy"]
    }
    with pytest.raises(InfeasiblePlanException) as exc_info:
        generate_weekly_plan("user_infeasible", 2000.0, health_vault, preferences)

    err = exc_info.value
    assert "No safe meal options available" in err.message or "Validation failed" in err.message

# ============================================================================
# TEST 12 — SWAP VALID MEAL
# ============================================================================
def test_12_swap_valid_meal():
    health_vault = {"medicalConditions": ""}
    preferences = {"diet": "None", "allergies": []}
    plan = generate_weekly_plan("user_swap", 2000.0, health_vault, preferences)

    # Initial Monday breakfast
    mon_b_initial = plan["days"][0]["meals"][0]["meal_id"]
    # Pick alternative breakfast from repository
    all_breakfasts = [m["id"] for m in get_all_meals() if m["meal_type"] == "breakfast"]
    replacement_id = next(m_id for m_id in all_breakfasts if m_id != mon_b_initial)

    success, updated_plan, error_msg = swap_day_slot_in_plan(
        plan=plan,
        day="Monday",
        slot="breakfast",
        replacement_meal_id=replacement_id,
        health_vault=health_vault,
        preferences=preferences
    )

    assert success is True, f"Swap failed: {error_msg}"
    new_mon_b = updated_plan["days"][0]["meals"][0]["meal_id"]
    assert new_mon_b == replacement_id
    assert new_mon_b != mon_b_initial

    # Grocery compiler reflects replacement
    grocery = generate_grocery_list_from_plan(updated_plan)
    assert grocery["total_items"] > 0

# ============================================================================
# TEST 13 — INVALID SWAP REJECTED WITHOUT MUTATING PLAN
# ============================================================================
def test_13_invalid_swap_rejected():
    # Diabetic profile
    health_vault = {"medicalConditions": "diabetes"}
    preferences = {"diet": "None", "allergies": []}
    plan = generate_weekly_plan("user_swap_inv", 2000.0, health_vault, preferences)

    # Attempt to swap Monday lunch with 'l3' (Dal Makhani & Naan, contains maida)
    success, result_plan, error_msg = swap_day_slot_in_plan(
        plan=plan,
        day="Monday",
        slot="lunch",
        replacement_meal_id="l3",
        health_vault=health_vault,
        preferences=preferences
    )

    assert success is False
    assert error_msg is not None
    # Original plan untouched
    mon_l = result_plan["days"][0]["meals"][1]["meal_id"]
    assert mon_l != "l3"

# ============================================================================
# TEST 14 — API AUTHENTICATION REQUIRED
# ============================================================================
def test_14_api_authentication_required():
    app.dependency_overrides.clear()
    # Unauthenticated calls should return 401
    res_plan = client.post("/api/meals/weekly-plan", json={"target_calories": 2000})
    assert res_plan.status_code == 401

    res_grocery = client.post("/api/meals/grocery-list")
    assert res_grocery.status_code == 401

    res_swap = client.post("/api/meals/weekly-plan/swap-day-slot", json={
        "plan_id": "any_id", "day": "Monday", "slot": "breakfast"
    })
    assert res_swap.status_code == 401

# ============================================================================
# TEST 15 — USER OWNERSHIP ISOLATION
# ============================================================================
def test_15_user_ownership_isolation(mock_auth_user):
    # Mock collections to simulate User A trying to access User B's plan
    mock_users_col = AsyncMock()
    mock_users_col.find_one.return_value = {
        "uid": mock_auth_user,
        "health_profile": {},
        "preferences": {},
        "daily_goals": {"calories": 2000}
    }

    # Weekly plans collection has a plan owned by "different_user_uid"
    mock_plans_col = AsyncMock()
    mock_plans_col.find_one.return_value = None  # User A has no active plan

    with patch("routes.meals.get_users_collection", return_value=mock_users_col), \
         patch("routes.meals.get_weekly_plans_collection", return_value=mock_plans_col):
        
        # User A requests grocery list but only User B has a plan
        resp = client.post("/api/meals/grocery-list")
        assert resp.status_code == 404
