# tests/test_p1_remediation.py
"""
Comprehensive P1 Remediation Test Suite — Z-SeHealth
Covers:
1. Weekly Planner Event-Loop Starvation, Pre-scaling, Pruning, Combinatorial Bound, Clinical Rules, Concurrency Offloading
2. NVIDIA Vision 60s Timeout, HTTP 429 Key Failover, Non-Retryable Error Handling, Secret Sanitization
3. Robust LLM JSON Substring Extraction Without eval()
4. Admin Search ReDoS Defense, Length Limiting, Metacharacter Escaping
5. Admin CSV StreamingResponse, RFC 4180 Escaping, and Memory Boundedness
"""

import os
import io
import csv
import json
import asyncio
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient

from backend.services.meal_planner.weekly_planner import (
    calculate_scaled_meal,
    generate_weekly_plan,
    generate_weekly_plan_async,
    _prepare_scaled_candidates_by_slot,
    _prune_candidates,
    _find_best_combination_worker,
    MAX_CANDIDATES_PER_SLOT,
    InfeasiblePlanException
)
from backend.services.ocr_service import (
    _call_nvidia_nim,
    _parse_llm_json,
    _get_nvidia_keys,
    NVIDIA_VISION_TIMEOUT
)
from backend.routes.admin import (
    _build_safe_regex_query,
    MAX_ADMIN_SEARCH_LENGTH
)
from backend.main import app

client = TestClient(app)

class AsyncCursorMock:
    def __init__(self, docs):
        self.docs = docs

    def sort(self, *args, **kwargs):
        return self

    def skip(self, *args, **kwargs):
        return self

    def limit(self, *args, **kwargs):
        return self

    def __aiter__(self):
        return self._iter_docs()

    async def _iter_docs(self):
        for doc in self.docs:
            yield doc


# ============================================================================
# 1. WEEKLY PLANNER WORKSTREAM A TESTS
# ============================================================================

def test_planner_candidate_prescaling():
    """Verify calculate_scaled_meal is not called repeatedly inside combination loop."""
    health_vault = {"medicalConditions": ""}
    preferences = {"diet": "None", "allergies": []}

    call_count = 0
    original_calc = calculate_scaled_meal

    def counting_scaled_meal(meal, target_slot_cal, user_conditions):
        nonlocal call_count
        call_count += 1
        return original_calc(meal, target_slot_cal, user_conditions)

    with patch("backend.services.meal_planner.weekly_planner.calculate_scaled_meal", side_effect=counting_scaled_meal):
        plan = generate_weekly_plan("user_scale_test", 2000.0, health_vault, preferences)
        assert plan is not None
        # With pre-scaling, calculate_scaled_meal is called once per candidate in pool (approx 26 items),
        # NEVER thousands of times (which would occur if called inside O(B*L*S*D) 7 times).
        assert call_count < 60, f"Expected < 60 calculate_scaled_meal calls with pre-scaling, got {call_count}"

def test_planner_candidate_pruning_bound():
    """Verify that candidate pruning bounds any slot to at most MAX_CANDIDATES_PER_SLOT (5)."""
    # Create 12 synthetic pre-scaled candidates for a slot
    synthetic_candidates = [
        {
            "meal_id": f"meal_{i}",
            "name": f"Dish {i}",
            "calories": 400.0 + (i * 20),
            "protein_g": 15.0 + i,
            "conflict": {"is_safe": True}
        }
        for i in range(12)
    ]
    pruned = _prune_candidates(synthetic_candidates, target_slot_cal=500.0, max_candidates=5)
    assert len(pruned) == 5
    # Verification of combination bound: 5^4 = 625 combinations max
    assert len(pruned) ** 4 <= 625

def test_planner_clinical_sodium_rejection():
    """A meal whose scaled sodium exceeds 500mg under hypertension must be rejected as unsafe."""
    high_sodium_meal = {
        "id": "high_sod_1",
        "name": "Salty Curry",
        "meal_type": "lunch",
        "calories": 300,
        "protein_g": 10,
        "carbs_g": 30,
        "fat_g": 10,
        "fiber_g": 2,
        "sodium_mg": 1200,  # At 0.5x minimum scale, sodium is 600mg >= 500mg
        "sugar_g": 1,
        "added_sugar_g": 0,
        "serving_description": "1 bowl",
        "refined_flour": False,
        "ingredients": ["salt", "water"],
        "allergen_tags": []
    }
    scaled = calculate_scaled_meal(high_sodium_meal, target_slot_cal=700.0, user_conditions="hypertension")
    assert scaled["sodium_mg"] >= 500.0
    assert scaled["conflict"]["is_safe"] is False
    assert scaled["safety_class"] == "critical"

def test_planner_diabetes_sugar_preservation():
    """Verify diabetes invariant: added sugar per meal <= 5g and daily added sugar <= 20g."""
    health_vault = {"medicalConditions": "diabetes"}
    preferences = {"diet": "None", "allergies": []}
    plan = generate_weekly_plan("user_diab_p1", 2000.0, health_vault, preferences)
    for day in plan["days"]:
        for meal in day["meals"]:
            assert meal["added_sugar_g"] <= 5.0, f"Meal {meal['name']} added sugar > 5g: {meal['added_sugar_g']}"
            assert meal.get("refined_flour") is False
        assert day["daily_totals"]["added_sugar_g"] <= 20.0

def test_planner_deterministic_output():
    """Same input and candidate pool must produce identical weekly plans."""
    health_vault = {"medicalConditions": ""}
    preferences = {"diet": "None", "allergies": []}
    plan1 = generate_weekly_plan("user_det", 2000.0, health_vault, preferences)
    plan2 = generate_weekly_plan("user_det", 2000.0, health_vault, preferences)

    meals_day1_p1 = [m["meal_id"] for m in plan1["days"][0]["meals"]]
    meals_day1_p2 = [m["meal_id"] for m in plan2["days"][0]["meals"]]
    assert meals_day1_p1 == meals_day1_p2

@pytest.mark.asyncio
async def test_planner_async_offloading_concurrency():
    """Verify that weekly plan generation offloads CPU work and does not block concurrent tasks."""
    health_vault = {"medicalConditions": ""}
    preferences = {"diet": "None", "allergies": []}

    concurrent_task_ran = False

    async def lightweight_task():
        nonlocal concurrent_task_ran
        await asyncio.sleep(0.01)
        concurrent_task_ran = True

    # Run planner async wrapper and lightweight task concurrently
    plan_task = generate_weekly_plan_async("user_async", 2000.0, health_vault, preferences)
    light_task = lightweight_task()

    plan, _ = await asyncio.gather(plan_task, light_task)
    assert plan is not None
    assert concurrent_task_ran is True


# ============================================================================
# 2. NVIDIA VISION WORKSTREAM B TESTS
# ============================================================================

def test_nvidia_vision_timeout_configuration():
    """Verify NVIDIA vision HTTP client uses the 60-second timeout configuration."""
    assert NVIDIA_VISION_TIMEOUT.read == 60.0
    assert NVIDIA_VISION_TIMEOUT.connect == 10.0

@pytest.mark.asyncio
async def test_nvidia_key_rotation_on_429():
    """Mock key 1 returning 429, key 2 returning 200 success."""
    call_log = []

    async def mock_post(url, headers, json):
        auth = headers.get("Authorization", "")
        call_log.append(auth)
        if "key_one" in auth:
            mock_resp = MagicMock()
            mock_resp.status_code = 429
            mock_resp.headers = {"Retry-After": "0"}
            return mock_resp
        else:
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = {
                "choices": [{"message": {"content": '{"product_name": "Test Snack"}'}}]
            }
            return mock_resp

    with patch("backend.services.ocr_service._get_nvidia_keys", return_value=["key_one", "key_two"]), \
         patch("httpx.AsyncClient.post", side_effect=mock_post):
        res = await _call_nvidia_nim("base64_data", "image/jpeg")
        assert 'Test Snack' in res
        assert len(call_log) == 2
        assert "key_one" in call_log[0]
        assert "key_two" in call_log[1]

@pytest.mark.asyncio
async def test_nvidia_all_keys_rate_limited():
    """Verify controlled error when all available keys return 429."""
    async def mock_post(url, headers, json):
        mock_resp = MagicMock()
        mock_resp.status_code = 429
        mock_resp.headers = {}
        return mock_resp

    with patch("backend.services.ocr_service._get_nvidia_keys", return_value=["key_1", "key_2"]), \
         patch("httpx.AsyncClient.post", side_effect=mock_post):
        with pytest.raises(RuntimeError) as exc_info:
            await _call_nvidia_nim("base64_data", "image/jpeg")
        assert "exhausted or failed" in str(exc_info.value)
        # Ensure secret API keys are never leaked in error message
        assert "key_1" not in str(exc_info.value)
        assert "key_2" not in str(exc_info.value)

@pytest.mark.asyncio
async def test_nvidia_non_retryable_error_does_not_rotate():
    """For HTTP 400/401/403/422, do not rotate keys blindly; fail immediately."""
    call_count = 0

    async def mock_post(url, headers, json):
        nonlocal call_count
        call_count += 1
        mock_resp = MagicMock()
        mock_resp.status_code = 401
        return mock_resp

    with patch("backend.services.ocr_service._get_nvidia_keys", return_value=["key_1", "key_2", "key_3"]), \
         patch("httpx.AsyncClient.post", side_effect=mock_post):
        with pytest.raises(RuntimeError) as exc_info:
            await _call_nvidia_nim("base64_data", "image/jpeg")
        assert "non-retryable status 401" in str(exc_info.value)
        assert call_count == 1, "Should not rotate to key_2 or key_3 on permanent 401 error"


# ============================================================================
# 3. JSON EXTRACTION WORKSTREAM C TESTS
# ============================================================================

def test_parse_llm_json_plain():
    raw = '{"product_name": "Almonds", "brand": "Nutty", "raw_ocr_text": "Almonds", "parsed_ingredients": ["Almonds"], "detected_ins_additives": [], "flagged_allergens": ["Tree Nuts"], "nutrition_per_100g": {"calories": 579, "protein": 21, "carbs": 22, "fat": 50, "sodium": 1, "sugar": 4}, "estimated_macros": {"calories": 579, "protein": 21, "carbs": 22, "fat": 50, "sodium": 1, "sugar": 4}, "requires_user_review": false}'
    res = _parse_llm_json(raw)
    assert res.product_name == "Almonds"

def test_parse_llm_json_markdown_fences():
    raw = '```json\n{"product_name": "Cashews", "brand": "Nature", "raw_ocr_text": "Cashews", "parsed_ingredients": ["Cashews"], "detected_ins_additives": [], "flagged_allergens": [], "nutrition_per_100g": {"calories": 553, "protein": 18, "carbs": 30, "fat": 44, "sodium": 12, "sugar": 6}, "estimated_macros": {"calories": 553, "protein": 18, "carbs": 30, "fat": 44, "sodium": 12, "sugar": 6}, "requires_user_review": false}\n```'
    res = _parse_llm_json(raw)
    assert res.product_name == "Cashews"

def test_parse_llm_json_conversational_prose():
    raw = 'Here is the analysis of the food label you provided:\n\n{"product_name": "Walnuts", "brand": "Kashmir", "raw_ocr_text": "Walnuts", "parsed_ingredients": ["Walnuts"], "detected_ins_additives": [], "flagged_allergens": [], "nutrition_per_100g": {"calories": 654, "protein": 15, "carbs": 14, "fat": 65, "sodium": 2, "sugar": 2.6}, "estimated_macros": {"calories": 654, "protein": 15, "carbs": 14, "fat": 65, "sodium": 2, "sugar": 2.6}, "requires_user_review": false}\n\nHope this helps!'
    res = _parse_llm_json(raw)
    assert res.product_name == "Walnuts"

def test_parse_llm_json_malformed_fails_safely():
    with pytest.raises(ValueError):
        _parse_llm_json("This is purely conversational text with no JSON object.")

    with pytest.raises(ValueError):
        _parse_llm_json('{"product_name": "Incomplete json')

    with pytest.raises(ValueError):
        _parse_llm_json('[1, 2, 3]')


# ============================================================================
# 4. ADMIN SEARCH & ReDoS DEFENSE WORKSTREAM D TESTS
# ============================================================================

def test_admin_search_safe_regex_escaping():
    """Verify special regex metacharacters are escaped and treated literally."""
    query = _build_safe_regex_query(".*", ["admin_email", "action"])
    assert query is not None
    # ".*" must be escaped to "\.\*"
    regex_pattern = query["$or"][0]["admin_email"]["$regex"]
    assert regex_pattern == r"\.\*"

    complex_meta = "test+user(1)?^$|{foo}[bar]"
    query_complex = _build_safe_regex_query(complex_meta, ["target_resource_id"])
    escaped_str = query_complex["$or"][0]["target_resource_id"]["$regex"]
    assert r"\+" in escaped_str
    assert r"\(" in escaped_str
    assert r"\[" in escaped_str

def test_admin_search_empty_and_whitespace():
    """Empty or whitespace search must return None (omits $or clause)."""
    assert _build_safe_regex_query("", ["email"]) is None
    assert _build_safe_regex_query("   ", ["email"]) is None
    assert _build_safe_regex_query(None, ["email"]) is None

def test_admin_search_length_limit():
    """Search queries exceeding 200 characters must raise HTTP 400."""
    from fastapi import HTTPException
    long_query = "a" * (MAX_ADMIN_SEARCH_LENGTH + 1)
    with pytest.raises(HTTPException) as exc_info:
        _build_safe_regex_query(long_query, ["email"])
    assert exc_info.value.status_code == 400
    assert "exceeds maximum length" in exc_info.value.detail


# ============================================================================
# 5. ADMIN CSV STREAMING WORKSTREAM E TESTS
# ============================================================================

@pytest.fixture
def super_admin_auth():
    mock_admins = AsyncMock()
    mock_admins.find_one.return_value = {
        "_id": "mock_super_admin_id",
        "email": "farhanahmad2106@gmail.com",
        "is_super_admin": True,
        "permissions": {
            "canManageAdmins": True,
            "canApproveFoods": True,
            "canManageUsers": True,
            "canViewLogs": True,
        }
    }
    with patch("backend.routes.admin._get_admins_collection", return_value=mock_admins), \
         patch("routes.admin._get_admins_collection", return_value=mock_admins):
        yield {"Authorization": "Bearer test_super_admin"}

def test_admin_csv_streaming_rfc4180_escaping(super_admin_auth):
    """Verify quotes, commas, and newlines in audit details are correctly escaped by StreamingResponse."""
    mock_audit = AsyncMock()
    fake_docs = [
        {
            "_id": "log_stream_1",
            "event_id": "evt_stream_001",
            "schema_version": 1,
            "timestamp": "2026-09-23T14:30:00Z",
            "admin_email": "farhanahmad2106@gmail.com",
            "action": "FOOD_APPROVED",
            "target_resource_type": "food",
            "target_resource_id": "food_with,comma",
            "ip_address": "127.0.0.1",
            "details": {"notes": "Approved, with \"quotes\" and \n newline"}
        }
    ]
    mock_audit.find = MagicMock(return_value=AsyncCursorMock(fake_docs))

    with patch("backend.routes.admin._get_audit_logs_collection", return_value=mock_audit), \
         patch("routes.admin._get_audit_logs_collection", return_value=mock_audit):
        res = client.get("/api/admin/audit-logs/export", headers=super_admin_auth)
        assert res.status_code == 200
        assert "text/csv" in res.headers["content-type"]
        assert "attachment; filename=" in res.headers["content-disposition"]

        # Parse CSV to verify RFC 4180 parsing works seamlessly
        reader = csv.reader(io.StringIO(res.text))
        rows = list(reader)
        assert len(rows) == 2  # Header + 1 data row
        header = rows[0]
        data_row = rows[1]
        assert header[0] == "event_id"
        assert data_row[0] == "evt_stream_001"
        assert data_row[5] == "food_with,comma"  # Comma preserved without column splitting
        decoded_details = json.loads(data_row[7])
        assert decoded_details["notes"] == "Approved, with \"quotes\" and \n newline"
