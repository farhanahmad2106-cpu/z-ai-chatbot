"""
Test Suite for Z-SeHealth Custom Home-Cooked Meal & Regional Recipe Ingestion Pipeline
Verifies:
1. Deterministic custom recipe creation & nutrition calculation
2. Multi-serving scaling (total vs per-serving)
3. Hypertension sodium rules (moderate >500mg, critical >800mg, 1g salt ≈ 393mg sodium)
4. Allergen screening & critical conflict isolation (peanut/groundnut declared allergy)
5. Diabetes clinical screening (sugar >5g & maida / refined flour warnings)
6. Authorization & tenant isolation (User B cannot delete User A's recipe)
7. Auth guard (401 without auth)
8. Unknown / unverifiable ingredient error (422)
9. Soft deletion lifecycle
10. Today's meal logging (log_to_today updates stats)
11. Smart Meal Planner candidate pool integration and allergen exclusion
"""

import sys
import os
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime, timezone
from fastapi.testclient import TestClient

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from backend.main import app
import routes.custom_meals
import routes.meals
from backend.services.meal_planner.planner import generate_meal_plan

client = TestClient(app)

def set_auth_user(uid: str):
    def override():
        return uid
    if "routes.custom_meals" in sys.modules:
        app.dependency_overrides[sys.modules["routes.custom_meals"].get_current_user_id] = override
    if "backend.routes.custom_meals" in sys.modules:
        app.dependency_overrides[sys.modules["backend.routes.custom_meals"].get_current_user_id] = override
    if "routes.meals" in sys.modules:
        app.dependency_overrides[sys.modules["routes.meals"].get_current_user_id] = override
    if "backend.routes.meals" in sys.modules:
        app.dependency_overrides[sys.modules["backend.routes.meals"].get_current_user_id] = override

def clear_auth():
    app.dependency_overrides.clear()


class MockAsyncCursor:
    def __init__(self, items):
        self.items = items
        self.index = 0

    def sort(self, *args, **kwargs):
        return self

    def __aiter__(self):
        self.index = 0
        return self

    async def __anext__(self):
        if self.index < len(self.items):
            item = self.items[self.index]
            self.index += 1
            return item
        raise StopAsyncIteration

    async def to_list(self, length=100):
        return self.items[:length]


class MockCollection:
    def __init__(self):
        self.docs = {}

    async def find_one(self, query):
        for doc in self.docs.values():
            match = True
            if "$or" in query:
                or_match = False
                for sub in query["$or"]:
                    if all(doc.get(k) == v for k, v in sub.items()):
                        or_match = True
                        break
                if not or_match:
                    match = False
            else:
                for k, v in query.items():
                    if doc.get(k) != v:
                        match = False
                        break
            if match:
                return dict(doc)
        return None

    def find(self, query=None):
        query = query or {}
        matched = []
        for doc in self.docs.values():
            m = True
            for k, v in query.items():
                if doc.get(k) != v:
                    m = False
                    break
            if m:
                matched.append(dict(doc))
        return MockAsyncCursor(matched)

    async def insert_one(self, doc):
        doc_copy = dict(doc)
        doc_id = doc_copy.get("_id") or doc_copy.get("id")
        self.docs[doc_id] = doc_copy
        res = MagicMock()
        res.inserted_id = doc_id
        return res

    async def update_one(self, query, update):
        target_id = query.get("_id") or query.get("uid")
        matched = False
        if target_id and target_id in self.docs:
            doc = self.docs[target_id]
            if "stats.last_updated" in query:
                req_val = query["stats.last_updated"]
                curr_val = doc.get("stats", {}).get("last_updated")
                if isinstance(req_val, dict) and "$ne" in req_val:
                    if curr_val == req_val["$ne"]:
                        return MagicMock(matched_count=0, modified_count=0)
                elif curr_val != req_val:
                    return MagicMock(matched_count=0, modified_count=0)

            matched = True
            if "$set" in update:
                for k, v in update["$set"].items():
                    if "." in k:
                        parts = k.split(".")
                        d = doc
                        for p in parts[:-1]:
                            d = d.setdefault(p, {})
                        d[parts[-1]] = v
                    else:
                        doc[k] = v
            if "$inc" in update:
                for k, v in update["$inc"].items():
                    if "." in k:
                        parts = k.split(".")
                        d = doc
                        for p in parts[:-1]:
                            d = d.setdefault(p, {})
                        d[parts[-1]] = round(d.get(parts[-1], 0) + v, 1)
                    else:
                        doc[k] = doc.get(k, 0) + v
        return MagicMock(matched_count=1 if matched else 0, modified_count=1 if matched else 0)

    async def count_documents(self, query=None):
        return len(self.docs)


# Shared in-memory mock collections
mock_custom_meals_col = MockCollection()
mock_users_col = MockCollection()

today_iso_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

# Pre-populate test users
mock_users_col.docs["user_a"] = {
    "_id": "user_a",
    "uid": "user_a",
    "healthProfile": {"medicalConditions": ""},
    "preferences": {"diet": "None", "allergies": []},
    "stats": {"calories": 500, "protein": 20, "carbs": 60, "fat": 15, "last_updated": today_iso_date}
}
mock_users_col.docs["user_b"] = {
    "_id": "user_b",
    "uid": "user_b",
    "healthProfile": {"medicalConditions": ""},
    "preferences": {"diet": "None", "allergies": []},
    "stats": {"calories": 0, "protein": 0, "carbs": 0, "fat": 0, "last_updated": today_iso_date}
}
mock_users_col.docs["user_hyp"] = {
    "_id": "user_hyp",
    "uid": "user_hyp",
    "healthProfile": {"medicalConditions": "hypertension"},
    "preferences": {"diet": "None", "allergies": []}
}
mock_users_col.docs["user_diab"] = {
    "_id": "user_diab",
    "uid": "user_diab",
    "healthProfile": {"medicalConditions": "diabetes"},
    "preferences": {"diet": "None", "allergies": []}
}
mock_users_col.docs["user_allergic"] = {
    "_id": "user_allergic",
    "uid": "user_allergic",
    "healthProfile": {"medicalConditions": ""},
    "preferences": {"diet": "None", "allergies": ["peanut"]}
}

@pytest.fixture(autouse=True)
def patch_backend_collections(monkeypatch):
    import backend.main
    monkeypatch.setattr(backend.main, "custom_meals_collection", mock_custom_meals_col)
    monkeypatch.setattr(backend.main, "users_collection", mock_users_col)
    monkeypatch.setattr(routes.custom_meals, "get_custom_meals_collection", lambda: mock_custom_meals_col)
    monkeypatch.setattr(routes.custom_meals, "get_users_collection", lambda: mock_users_col)
    monkeypatch.setattr(routes.meals, "get_custom_meals_collection", lambda: mock_custom_meals_col)
    monkeypatch.setattr(routes.meals, "get_users_collection", lambda: mock_users_col)


# ============================================================================
# 1. Custom Recipe Creation & Nutrition Calculation
# ============================================================================
def test_custom_recipe_creation():
    set_auth_user("user_a")
    payload = {
        "name": "Mom's Dal Khichdi",
        "meal_type": "lunch",
        "servings": 1,
        "ingredients": [
            {"name": "Rice", "quantity_grams": 100},
            {"name": "Moong Dal", "quantity_grams": 50},
            {"name": "Ghee", "quantity_grams": 10}
        ],
        "cooking_method": "Pressure cooked",
        "include_in_planner": True,
        "log_to_today": False
    }
    response = client.post("/api/meals/custom", json=payload)
    clear_auth()

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["name"] == "Mom's Dal Khichdi"
    assert data["meal_type"] == "lunch"
    assert data["servings"] == 1
    # Check calories: 100g Rice (360) + 50g Moong Dal (173.5) + 10g Ghee (90) = ~623.5
    assert 600 <= data["total_nutrition"]["calories"] <= 645
    assert data["total_nutrition"]["calories"] == data["per_serving_nutrition"]["calories"]
    assert data["safety_score"] >= 90
    assert data["safety_tier"] == "SAFE"
    assert data["planner_eligible"] is True
    assert len(data["ingredients"]) == 3
    assert data["ingredients"][0]["provenance"] == "local_nutrition_db"


# ============================================================================
# 2. Multi-Serving Scaling
# ============================================================================
def test_multi_serving_scaling():
    set_auth_user("user_a")
    payload = {
        "name": "Family Pot Poha",
        "meal_type": "breakfast",
        "servings": 4,
        "ingredients": [
            {"name": "Poha", "quantity_grams": 200},
            {"name": "Onion", "quantity_grams": 100},
            {"name": "Mustard Oil", "quantity_grams": 20}
        ]
    }
    response = client.post("/api/meals/custom", json=payload)
    clear_auth()

    assert response.status_code == 200
    data = response.json()
    total_cals = data["total_nutrition"]["calories"]
    per_serv_cals = data["per_serving_nutrition"]["calories"]
    assert abs(per_serv_cals - (total_cals / 4.0)) < 0.2


# ============================================================================
# 3. Hypertension Sodium Rules & Salt-to-Sodium Conversion
# ============================================================================
def test_hypertension_sodium_rules():
    set_auth_user("user_hyp")

    # Moderate sodium: 1.5g salt = ~589.5mg sodium per serving (threshold > 500mg)
    moderate_payload = {
        "name": "Salty Upma",
        "meal_type": "breakfast",
        "servings": 1,
        "ingredients": [
            {"name": "Rava", "quantity_grams": 60},
            {"name": "Salt", "quantity_grams": 1.5}
        ]
    }
    res_mod = client.post("/api/meals/custom", json=moderate_payload)
    assert res_mod.status_code == 200
    data_mod = res_mod.json()
    assert 550 <= data_mod["per_serving_nutrition"]["sodium_mg"] <= 620
    assert data_mod["safety_tier"] == "MODERATE"
    assert any("500mg" in w for w in data_mod["warnings"])

    # Critical sodium: 2.5g salt = ~982.5mg sodium per serving (threshold > 800mg)
    critical_payload = {
        "name": "Ultra Salty Chaat",
        "meal_type": "snack",
        "servings": 1,
        "ingredients": [
            {"name": "Potato", "quantity_grams": 100},
            {"name": "Salt", "quantity_grams": 2.5}
        ]
    }
    res_crit = client.post("/api/meals/custom", json=critical_payload)
    assert res_crit.status_code == 200
    data_crit = res_crit.json()
    assert data_crit["per_serving_nutrition"]["sodium_mg"] > 800
    assert data_crit["safety_tier"] == "CRITICAL"
    assert data_crit["planner_eligible"] is False
    assert any("800mg" in c for c in data_crit["clinical_conflicts"])

    clear_auth()


# ============================================================================
# 4. Allergen Conflict & Hard Exclusion
# ============================================================================
def test_allergen_conflict_critical():
    set_auth_user("user_allergic")
    payload = {
        "name": "Peanut Chikki",
        "meal_type": "snack",
        "servings": 1,
        "ingredients": [
            {"name": "Peanut", "quantity_grams": 50},
            {"name": "Jaggery", "quantity_grams": 30}
        ]
    }
    response = client.post("/api/meals/custom", json=payload)
    clear_auth()

    assert response.status_code == 200
    data = response.json()
    assert data["safety_tier"] == "CRITICAL"
    assert "peanut" in data["detected_allergens"]
    assert data["planner_eligible"] is False
    assert len(data["clinical_conflicts"]) > 0


# ============================================================================
# 5. Diabetes Screening (Added Sugar & Refined Flour)
# ============================================================================
def test_diabetes_screening():
    set_auth_user("user_diab")
    payload = {
        "name": "Sweet Halwa with Maida",
        "meal_type": "snack",
        "servings": 1,
        "ingredients": [
            {"name": "Maida", "quantity_grams": 50},
            {"name": "Sugar", "quantity_grams": 15},
            {"name": "Ghee", "quantity_grams": 10}
        ]
    }
    response = client.post("/api/meals/custom", json=payload)
    clear_auth()

    assert response.status_code == 200
    data = response.json()
    assert data["safety_tier"] == "MODERATE"
    warnings_text = " ".join(data["warnings"])
    assert "5g" in warnings_text or "sugar" in warnings_text.lower()
    assert "maida" in warnings_text.lower() or "refined" in warnings_text.lower()


# ============================================================================
# 6. Authorization & Tenant Isolation
# ============================================================================
def test_authorization_isolation():
    # User A creates a recipe
    set_auth_user("user_a")
    create_res = client.post("/api/meals/custom", json={
        "name": "User A Private Secret Curry",
        "meal_type": "dinner",
        "servings": 1,
        "ingredients": [{"name": "Paneer", "quantity_grams": 100}]
    })
    assert create_res.status_code == 200
    recipe_id = create_res.json()["id"]

    # User B lists recipes -> should NOT see User A's recipe
    set_auth_user("user_b")
    get_res = client.get("/api/meals/custom")
    assert get_res.status_code == 200
    b_meals = get_res.json()
    assert not any(m["id"] == recipe_id for m in b_meals)

    # User B attempts to DELETE User A's recipe -> 403 Forbidden
    del_res = client.delete(f"/api/meals/custom/{recipe_id}")
    assert del_res.status_code == 403

    clear_auth()


# ============================================================================
# 7. Auth Guard (401 without Token)
# ============================================================================
def test_auth_guard():
    clear_auth()
    res = client.post("/api/meals/custom", json={
        "name": "Unauthorized Curry",
        "meal_type": "lunch",
        "servings": 1,
        "ingredients": [{"name": "Rice", "quantity_grams": 100}]
    })
    assert res.status_code == 401


# ============================================================================
# 8. Unknown / Unverifiable Ingredient (422)
# ============================================================================
def test_unknown_ingredient():
    set_auth_user("user_a")
    with patch("services.recipe_analyzer.resolve_ingredient_nutrition", new=AsyncMock(return_value=(None, ""))), \
         patch("backend.services.recipe_analyzer.resolve_ingredient_nutrition", new=AsyncMock(return_value=(None, "")), create=True):
        res = client.post("/api/meals/custom", json={
            "name": "Alien Soup",
            "meal_type": "dinner",
            "servings": 1,
            "ingredients": [{"name": "Unobtainium999Plant", "quantity_grams": 50}]
        })
        assert res.status_code == 422
        assert "Unable to verify nutritional safety" in res.json()["detail"]
    clear_auth()




# ============================================================================
# 9. Soft Deletion Lifecycle
# ============================================================================
def test_soft_delete():
    set_auth_user("user_a")
    create_res = client.post("/api/meals/custom", json={
        "name": "Temporary Snack",
        "meal_type": "snack",
        "servings": 1,
        "ingredients": [{"name": "Almonds", "quantity_grams": 20}]
    })
    assert create_res.status_code == 200
    recipe_id = create_res.json()["id"]

    # Delete successfully
    del_res = client.delete(f"/api/meals/custom/{recipe_id}")
    assert del_res.status_code == 200

    # Recipe no longer returned in active list
    get_res = client.get("/api/meals/custom")
    assert not any(m["id"] == recipe_id for m in get_res.json())

    # Second delete returns 404
    del_again = client.delete(f"/api/meals/custom/{recipe_id}")
    assert del_again.status_code == 404

    clear_auth()


# ============================================================================
# 10. Today's Meal Logging
# ============================================================================
def test_log_to_today():
    set_auth_user("user_a")
    initial_stats = dict(mock_users_col.docs["user_a"].get("stats", {}))
    initial_cals = initial_stats.get("calories", 0)

    res = client.post("/api/meals/custom", json={
        "name": "Evening Oats",
        "meal_type": "snack",
        "servings": 1,
        "ingredients": [{"name": "Oats", "quantity_grams": 50}],
        "log_to_today": True
    })
    assert res.status_code == 200
    per_serv_cals = res.json()["per_serving_nutrition"]["calories"]

    updated_user = mock_users_col.docs["user_a"]
    new_cals = updated_user["stats"]["calories"]
    assert round(new_cals - initial_cals, 1) == round(per_serv_cals, 1)

    clear_auth()


# ============================================================================
# 11. Smart Meal Planner Candidate Pool Integration
# ============================================================================
def test_smart_planner_candidate_pool():
    # Eligible safe custom meal
    safe_custom = {
        "id": "cm_safe_1",
        "_id": "cm_safe_1",
        "user_id": "user_a",
        "name": "Custom Protein Paneer Bhurji",
        "meal_type": "lunch",
        "servings": 1,
        "per_serving_nutrition": {
            "calories": 400.0,
            "protein_g": 25.0,
            "carbs_g": 10.0,
            "fat_g": 20.0,
            "sodium_mg": 200.0,
            "added_sugar_g": 0.0
        },
        "ingredients": [{"name": "Paneer", "quantity_grams": 150}],
        "safety_tier": "SAFE",
        "planner_eligible": True,
        "include_in_planner": True,
        "detected_allergens": []
    }

    # Ineligible critical allergen meal
    critical_custom = {
        "id": "cm_crit_2",
        "_id": "cm_crit_2",
        "user_id": "user_a",
        "name": "Lethal Peanut Gravy",
        "meal_type": "lunch",
        "servings": 1,
        "per_serving_nutrition": {
            "calories": 450.0,
            "protein_g": 15.0,
            "carbs_g": 20.0,
            "fat_g": 25.0,
            "sodium_mg": 200.0,
            "added_sugar_g": 0.0
        },
        "ingredients": [{"name": "Peanut", "quantity_grams": 100}],
        "safety_tier": "CRITICAL",
        "planner_eligible": False,
        "include_in_planner": True,
        "detected_allergens": ["peanut"]
    }

    health_vault = {"medicalConditions": ""}
    preferences = {"diet": "None", "allergies": []}

    plan = generate_meal_plan(
        target_calories=2000,
        meal_types=["lunch"],
        health_vault=health_vault,
        preferences=preferences,
        custom_meals=[safe_custom, critical_custom]
    )

    # In single-day plan, critical custom meal should never be selected
    selected_meal_ids = [m["meal_id"] for m in plan["meals"]]
    assert "cm_crit_2" not in selected_meal_ids
