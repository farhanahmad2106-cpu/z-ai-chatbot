"""
Comprehensive Test Suite for Indic Meal Planner Localization
Tests coverage:
1. Test 1 — Hindi Translation (Besan Vegetable Chilla)
2. Test 2 — Bengali Translation (Bengali Unicode verification)
3. Test 3 — Numeric Preservation (Calories: 320, Protein: 18g, Carbs: 42g, Fat: 9g, Serving: 1.5)
4. Test 4 — INS Code Preservation (INS 330, INS 627)
5. Test 5 — Cache Hit (<50ms, AI provider not called)
6. Test 6 — Cache Miss (Triggers AI, stores to cache, subsequent call hits cache)
7. Test 7 — Sarvam Failure (Triggers Gemini fallback)
8. Test 8 — Provider Failure (Both fail, controlled fallback, no DB corruption)
9. Test 9 — Invalid AI Response (Rejected and not cached)
10. Test 10 — Unsupported Language (e.g. 'fr' rejected with 422)
11. Test 11 — Source Content Hash Invalidation
12. Test 12 — Authentication Guard (Missing token -> 401)
"""

import sys
import os
import time
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from backend.main import app
from backend.schemas.meal_plan import (
    MealPlanItem,
    MealConflict,
    MealTranslationRequest,
    MealTranslationResponse,
    SUPPORTED_MEAL_LANGUAGES
)
from backend.services.meal_planner.meal_translator import (
    translate_meals,
    compute_content_hash,
    validate_token_preservation,
    validate_translated_item
)
import routes.meals

client = TestClient(app)

def create_sample_meal(
    meal_id: str = "b1",
    name: str = "Besan Vegetable Chilla",
    serving_desc: str = "2 chillas (150g) with 1.5 tbsp mint chutney",
    servings: float = 1.5,
    calories: float = 320.0,
    protein_g: float = 18.0,
    carbs_g: float = 42.0,
    fat_g: float = 9.0,
    sodium_mg: float = 240.0,
    sugar_g: float = 3.0,
    ingredients: list = None,
    warning_reasons: list = None
) -> MealPlanItem:
    if ingredients is None:
        ingredients = ["Gram flour (besan)", "Onion", "Tomato", "Spinach", "Spices with INS 330"]
    if warning_reasons is None:
        warning_reasons = ["Contains INS 627 flavoring enhancer in seasoning"]

    return MealPlanItem(
        meal_id=meal_id,
        name=name,
        meal_type="breakfast",
        serving_description=serving_desc,
        servings=servings,
        calories=calories,
        protein_g=protein_g,
        carbs_g=carbs_g,
        fat_g=fat_g,
        sodium_mg=sodium_mg,
        sugar_g=sugar_g,
        ingredients=ingredients,
        conflict=MealConflict(
            is_safe=True,
            conflict_severity="none",
            warning_reasons=warning_reasons
        ),
        safety_score=90.0,
        safety_class="safe"
    )

class MockAsyncCursor:
    def __init__(self, items):
        self.items = items
    async def to_list(self, length=None):
        return self.items

class MockAsyncCollection:
    def __init__(self):
        self.storage = {}
        self.find_call_count = 0
        self.update_call_count = 0

    def find(self, query):
        self.find_call_count += 1
        meal_ids = query.get("meal_id", {}).get("$in", [])
        lang = query.get("language_code")
        matched = []
        for mid in meal_ids:
            key = f"{mid}_{lang}"
            if key in self.storage:
                matched.append(self.storage[key])
        return MockAsyncCursor(matched)

    async def update_one(self, filter_q, update_q, upsert=False):
        self.update_call_count += 1
        mid = filter_q.get("meal_id")
        lang = filter_q.get("language_code")
        key = f"{mid}_{lang}"
        set_data = update_q.get("$set", {})
        self.storage[key] = dict(set_data)

@pytest.fixture
def mock_auth_user():
    def override():
        return "test_translation_user_uid_123"
    app.dependency_overrides[routes.meals.get_current_user_id] = override
    yield "test_translation_user_uid_123"
    app.dependency_overrides.clear()


# ============================================================================
# TEST 1 — HINDI TRANSLATION (Besan Vegetable Chilla)
# ============================================================================
@pytest.mark.asyncio
async def test_1_hindi_translation():
    sample_meal = create_sample_meal()
    mock_col = MockAsyncCollection()

    mock_gemini_output = [{
        "original_id": "b1",
        "translated_name": "बेसन वेजिटेबल चीला",
        "translated_serving_description": "2 चीला (150g) 1.5 चम्मच पुदीना चटनी के साथ",
        "translated_ingredients": ["बेसन", "प्याज", "टमाटर", "पालक", "मसाले INS 330 के साथ"],
        "translated_warning_reasons": ["सीजनिंग में INS 627 फ्लेवरिंग एन्हांसर शामिल है"]
    }]

    with patch("backend.services.meal_planner.meal_translator.call_sarvam_batch", new_callable=AsyncMock, return_value=None), \
         patch("backend.services.meal_planner.meal_translator.call_gemini_fallback", new_callable=AsyncMock, return_value=mock_gemini_output):

        response = await translate_meals([sample_meal], "hi", translations_col=mock_col)

        assert response.language == "hi"
        assert len(response.translations) == 1
        trans = response.translations[0]

        # 1. Meal ID remains unchanged
        assert trans.original_id == "b1"
        # 2. Translation exists
        assert trans.translated_name == "बेसन वेजिटेबल चीला"
        assert "INS 330" in trans.translated_ingredients[4]
        # 3. Canonical nutrition remains unchanged on sample_meal
        assert sample_meal.calories == 320.0
        assert sample_meal.protein_g == 18.0
        assert sample_meal.carbs_g == 42.0
        assert sample_meal.fat_g == 9.0
        assert sample_meal.servings == 1.5


# ============================================================================
# TEST 2 — BENGALI TRANSLATION
# ============================================================================
@pytest.mark.asyncio
async def test_2_bengali_translation():
    sample_meal = create_sample_meal()
    mock_col = MockAsyncCollection()

    mock_gemini_output = [{
        "original_id": "b1",
        "translated_name": "বেসন সবজি চিল্লা",
        "translated_serving_description": "২টি চিল্লা (150g) ১.৫ চামচ পুদিনা চাটনি সহ",
        "translated_ingredients": ["বেসন", "পেঁয়াজ", "টমেটো", "পালং শাক", "মশলা INS 330 সহ"],
        "translated_warning_reasons": ["সিজনিংয়ে INS 627 রয়েছে"]
    }]

    with patch("backend.services.meal_planner.meal_translator.call_sarvam_batch", new_callable=AsyncMock, return_value=None), \
         patch("backend.services.meal_planner.meal_translator.call_gemini_fallback", new_callable=AsyncMock, return_value=mock_gemini_output):

        response = await translate_meals([sample_meal], "bn", translations_col=mock_col)

        assert response.language == "bn"
        trans = response.translations[0]
        assert trans.original_id == "b1"
        # Verify Bengali script Unicode characters (Bengali block: \u0980-\u09FF)
        has_bengali = any("\u0980" <= char <= "\u09FF" for char in trans.translated_name)
        assert has_bengali, f"Expected Bengali unicode script in {trans.translated_name}"
        # Canonical nutrition unchanged
        assert sample_meal.calories == 320.0


# ============================================================================
# TEST 3 — NUMERIC PRESERVATION
# ============================================================================
def test_3_numeric_preservation():
    sample_meal = create_sample_meal(
        calories=320.0,
        protein_g=18.0,
        carbs_g=42.0,
        fat_g=9.0,
        servings=1.5
    )

    # Verification: Canonical values are immutable
    assert sample_meal.calories == 320.0
    assert sample_meal.protein_g == 18.0
    assert sample_meal.carbs_g == 42.0
    assert sample_meal.fat_g == 9.0
    assert sample_meal.servings == 1.5

    # Translated response only holds display fields
    raw_item = {
        "original_id": "b1",
        "translated_name": "चीला",
        "translated_serving_description": "2 chillas (150g) with 1.5 tbsp chutney",
        "translated_ingredients": ["बेसन", "प्याज", "टमाटर", "पालक", "INS 330"],
        "translated_warning_reasons": ["INS 627"]
    }
    valid, err = validate_translated_item(sample_meal, raw_item)
    assert valid is True, f"Validation failed: {err}"


# ============================================================================
# TEST 4 — INS CODE PRESERVATION
# ============================================================================
def test_4_ins_code_preservation():
    # When INS 330 and INS 627 are preserved
    orig_text = "Spices with INS 330 and INS 627"
    trans_text_valid = "मसाले INS 330 और INS 627 के साथ"
    assert validate_token_preservation(orig_text, trans_text_valid) is True

    # When INS code is translated or lost
    trans_text_invalid = "मसाले आईएनएस ३३০ के साथ"
    assert validate_token_preservation(orig_text, trans_text_invalid) is False


# ============================================================================
# TEST 5 — CACHE HIT (< 50ms, NO AI CALL)
# ============================================================================
@pytest.mark.asyncio
async def test_5_cache_hit_performance():
    sample_meal = create_sample_meal()
    mock_col = MockAsyncCollection()

    content_hash = compute_content_hash(
        sample_meal.name,
        sample_meal.serving_description,
        sample_meal.ingredients,
        sample_meal.conflict.warning_reasons
    )

    # Pre-populate cache
    mock_col.storage["b1_hi"] = {
        "meal_id": "b1",
        "language_code": "hi",
        "translation_version": 1,
        "source_content_hash": content_hash,
        "translated_name": "कैश्ड बेसन चीला",
        "translated_serving_description": "2 चीला (150g)",
        "translated_ingredients": ["बेसन", "प्याज", "टमाटर", "पालक", "INS 330"],
        "translated_warning_reasons": ["INS 627"]
    }

    sarvam_mock = AsyncMock(return_value=None)
    gemini_mock = AsyncMock(return_value=None)

    start_time = time.perf_counter()
    with patch("backend.services.meal_planner.meal_translator.call_sarvam_batch", sarvam_mock), \
         patch("backend.services.meal_planner.meal_translator.call_gemini_fallback", gemini_mock):

        response = await translate_meals([sample_meal], "hi", translations_col=mock_col)

    duration_ms = (time.perf_counter() - start_time) * 1000

    # Verify cache hit properties:
    assert response.translations[0].translated_name == "कैश्ड बेसन चीला"
    assert sarvam_mock.call_count == 0
    assert gemini_mock.call_count == 0
    assert duration_ms < 50.0, f"Cache lookup took {duration_ms:.2f}ms, expected < 50ms"


# ============================================================================
# TEST 6 — CACHE MISS (CALLS AI, STORES IN CACHE, SUBSEQUENT HITS)
# ============================================================================
@pytest.mark.asyncio
async def test_6_cache_miss_populates_db():
    sample_meal = create_sample_meal()
    mock_col = MockAsyncCollection()

    mock_gemini_output = [{
        "original_id": "b1",
        "translated_name": "ताज़ा चीला",
        "translated_serving_description": "2 चीला",
        "translated_ingredients": ["बेसन", "प्याज", "टमाटर", "पालक", "INS 330"],
        "translated_warning_reasons": ["INS 627"]
    }]

    # First call: Cache miss
    with patch("backend.services.meal_planner.meal_translator.call_sarvam_batch", new_callable=AsyncMock, return_value=None), \
         patch("backend.services.meal_planner.meal_translator.call_gemini_fallback", new_callable=AsyncMock, return_value=mock_gemini_output) as gemini_spy:

        resp1 = await translate_meals([sample_meal], "hi", translations_col=mock_col)
        assert gemini_spy.call_count == 1
        assert resp1.translations[0].translated_name == "ताज़ा चीला"
        assert "b1_hi" in mock_col.storage

    # Second call: Cache hit!
    with patch("backend.services.meal_planner.meal_translator.call_sarvam_batch", new_callable=AsyncMock, return_value=None) as sarvam_spy, \
         patch("backend.services.meal_planner.meal_translator.call_gemini_fallback", new_callable=AsyncMock, return_value=None) as gemini_spy_2:

        resp2 = await translate_meals([sample_meal], "hi", translations_col=mock_col)
        assert sarvam_spy.call_count == 0
        assert gemini_spy_2.call_count == 0
        assert resp2.translations[0].translated_name == "ताज़ा चीला"


# ============================================================================
# TEST 7 — SARVAM FAILURE INVOKES GEMINI FALLBACK
# ============================================================================
@pytest.mark.asyncio
async def test_7_sarvam_failure_gemini_fallback():
    sample_meal = create_sample_meal()
    mock_col = MockAsyncCollection()

    mock_gemini_output = [{
        "original_id": "b1",
        "translated_name": "जेमिनी फॉलबैक चीला",
        "translated_serving_description": "2 चीला",
        "translated_ingredients": ["बेसन", "प्याज", "टमाटर", "पालक", "INS 330"],
        "translated_warning_reasons": ["INS 627"]
    }]

    # Sarvam returns None (simulating timeout or HTTP 500)
    sarvam_mock = AsyncMock(return_value=None)
    gemini_mock = AsyncMock(return_value=mock_gemini_output)

    with patch("backend.services.meal_planner.meal_translator.call_sarvam_batch", sarvam_mock), \
         patch("backend.services.meal_planner.meal_translator.call_gemini_fallback", gemini_mock):

        response = await translate_meals([sample_meal], "hi", translations_col=mock_col, user_tier="elite")

        assert sarvam_mock.call_count == 1
        assert gemini_mock.call_count == 1
        assert response.translations[0].translated_name == "जेमिनी फॉलबैक चीला"


# ============================================================================
# TEST 8 — PROVIDER FAILURE (CONTROLLED FALLBACK, NO DATA CORRUPTION)
# ============================================================================
@pytest.mark.asyncio
async def test_8_both_providers_fail_controlled_fallback():
    sample_meal = create_sample_meal()
    mock_col = MockAsyncCollection()

    with patch("backend.services.meal_planner.meal_translator.call_sarvam_batch", new_callable=AsyncMock, return_value=None), \
         patch("backend.services.meal_planner.meal_translator.call_gemini_fallback", new_callable=AsyncMock, return_value=None):

        response = await translate_meals([sample_meal], "hi", translations_col=mock_col)

        # Graceful fallback: returns canonical English presentation
        assert response.translations[0].translated_name == sample_meal.name
        # Database was NOT polluted with invalid records
        assert len(mock_col.storage) == 0


# ============================================================================
# TEST 9 — INVALID AI RESPONSE REJECTED AND NOT CACHED
# ============================================================================
def test_9_invalid_ai_response_validation():
    sample_meal = create_sample_meal()

    # 1. Missing original_id
    raw_invalid_id = {
        "original_id": "wrong_id",
        "translated_name": "चीला",
        "translated_serving_description": "2 chillas",
        "translated_ingredients": ["बेसन", "प्याज", "टमाटर", "पालक", "INS 330"],
        "translated_warning_reasons": ["INS 627"]
    }
    valid, err = validate_translated_item(sample_meal, raw_invalid_id)
    assert valid is False
    assert "Mismatched meal_id" in err

    # 2. Mismatched ingredients count
    raw_invalid_ing = {
        "original_id": "b1",
        "translated_name": "चीला",
        "translated_serving_description": "2 chillas",
        "translated_ingredients": ["बेसन"],  # Expected 5
        "translated_warning_reasons": ["INS 627"]
    }
    valid, err = validate_translated_item(sample_meal, raw_invalid_ing)
    assert valid is False
    assert "Translated ingredients count" in err


# ============================================================================
# TEST 10 — UNSUPPORTED LANGUAGE REJECTED (HTTP 422)
# ============================================================================
def test_10_unsupported_language_rejected(mock_auth_user):
    sample_meal = create_sample_meal().model_dump()
    payload = {
        "language": "fr",  # French not in supported Indic languages
        "meals": [sample_meal]
    }

    res = client.post(
        "/api/meals/translate-plan",
        headers={"Authorization": "Bearer fake_token"},
        json=payload
    )

    assert res.status_code == 422


# ============================================================================
# TEST 11 — CONTENT HASH CACHE INVALIDATION
# ============================================================================
@pytest.mark.asyncio
async def test_11_content_hash_invalidation():
    sample_meal = create_sample_meal(serving_desc="Original description")
    mock_col = MockAsyncCollection()

    # Pre-populate cache with old content hash
    mock_col.storage["b1_hi"] = {
        "meal_id": "b1",
        "language_code": "hi",
        "translation_version": 1,
        "source_content_hash": "stale_hash_12345",
        "translated_name": "पुराना चीला",
        "translated_serving_description": "पुरानी सर्विंग",
        "translated_ingredients": ["बेसन", "प्याज", "टमाटर", "पालक", "INS 330"],
        "translated_warning_reasons": ["INS 627"]
    }

    fresh_gemini_output = [{
        "original_id": "b1",
        "translated_name": "नया चीला",
        "translated_serving_description": "नई सर्विंग",
        "translated_ingredients": ["बेसन", "प्याज", "टमाटर", "पालक", "INS 330"],
        "translated_warning_reasons": ["INS 627"]
    }]

    with patch("backend.services.meal_planner.meal_translator.call_sarvam_batch", new_callable=AsyncMock, return_value=None), \
         patch("backend.services.meal_planner.meal_translator.call_gemini_fallback", new_callable=AsyncMock, return_value=fresh_gemini_output) as gemini_spy:

        response = await translate_meals([sample_meal], "hi", translations_col=mock_col)

        # Stale cache was bypassed, fresh translation called
        assert gemini_spy.call_count == 1
        assert response.translations[0].translated_name == "नया चीला"


# ============================================================================
# TEST 12 — AUTHENTICATION GUARD
# ============================================================================
def test_12_unauthenticated_request_rejected():
    sample_meal = create_sample_meal().model_dump()
    payload = {
        "language": "hi",
        "meals": [sample_meal]
    }

    # Request with missing/empty Authorization header
    res = client.post(
        "/api/meals/translate-plan",
        json=payload
    )

    assert res.status_code == 401
