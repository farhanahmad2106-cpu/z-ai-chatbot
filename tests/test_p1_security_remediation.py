"""
Master Prompt 3 — Comprehensive Regression Test Suite:
1. Legacy Scan Decommissioning (ZS-003): HTTP 410 Gone, no OCR or quota execution.
2. Canonical Scan Authentication & Quota Path (ZS-003 / Section 5).
3. Fail-Closed Atomic Quota Reservation (FIX-001): Cases A, B, C, D.
4. Food Search Input Hardening & ReDoS Defense (ZS-005): Regex escaping, length boundaries, empty search.
5. Barcode Validation & Open Food Facts Outbound Safety (FIX-002): Allowlist regex, 422 rejection, safe URL encoding.
"""

import sys
import os
import asyncio
from unittest.mock import AsyncMock, patch, MagicMock
from urllib.parse import quote
import pytest
from fastapi.testclient import TestClient
from fastapi import HTTPException

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from backend.main import app, validate_barcode, sanitize_food_search, MAX_FOOD_SEARCH_LENGTH
from backend.middleware.quota_check import reserve_scan_quota, check_scan_quota, QuotaExceededException
from schemas.scan import OCRAnalysisResponse

client = TestClient(app)


# ==============================================================================
# 1. LEGACY SCAN DECOMMISSIONING TESTS (ZS-003 / Section 11.1)
# ==============================================================================

def test_legacy_scan_endpoint_returns_410_gone():
    """POST /api/scan must return HTTP 410 Gone with permanent retirement message."""
    resp = client.post("/api/scan", json={"image": "fake_base64_data"})
    assert resp.status_code == 410
    data = resp.json()
    assert "permanently retired" in data.get("detail", "").lower()
    assert "/api/scan/analyze" in data.get("detail", "")


def test_legacy_scan_ingredients_endpoint_returns_410_gone():
    """POST /api/scan/ingredients must return HTTP 410 Gone with permanent retirement message."""
    resp = client.post("/api/scan/ingredients", json={"image": "fake_base64_data"})
    assert resp.status_code == 410
    data = resp.json()
    assert "permanently retired" in data.get("detail", "").lower()
    assert "/api/scan/analyze" in data.get("detail", "")


def test_legacy_endpoints_perform_no_ocr_or_mutation():
    """Verify legacy routes return 410 immediately without invoking OCR engines or database."""
    with patch("backend.services.ocr_engine.extract_text_from_image") as mock_ocr, \
         patch("backend.services.ai_router.route_scan_by_tier") as mock_ai, \
         patch("backend.middleware.quota_check.check_scan_quota") as mock_quota:

        resp1 = client.post("/api/scan", json={"image": "data:image/jpeg;base64,abc"})
        resp2 = client.post("/api/scan/ingredients", json={"image": "data:image/jpeg;base64,abc"})

        assert resp1.status_code == 410
        assert resp2.status_code == 410
        mock_ocr.assert_not_called()
        mock_ai.assert_not_called()
        mock_quota.assert_not_called()


# ==============================================================================
# 2. CANONICAL SCAN AUTHENTICATION INVARIANTS (ZS-003 / Section 11.2)
# ==============================================================================

def test_canonical_scan_analyze_unauthenticated_rejected_401():
    """POST /api/scan/analyze without valid Bearer token must be rejected with HTTP 401."""
    # 1. No authorization header
    files = {"image": ("test.jpg", b"fake_image_bytes", "image/jpeg")}
    resp = client.post("/api/scan/analyze", files=files)
    assert resp.status_code == 401
    assert "Missing or invalid" in resp.json().get("detail", "")

    # 2. Malformed authorization header (not Bearer)
    files = {"image": ("test.jpg", b"fake_image_bytes", "image/jpeg")}
    resp = client.post("/api/scan/analyze", files=files, headers={"Authorization": "Basic 12345"})
    assert resp.status_code == 401

    # 3. Invalid Bearer token
    with patch("firebase_admin.auth.verify_id_token", side_effect=Exception("Invalid token signature")):
        files = {"image": ("test.jpg", b"fake_image_bytes", "image/jpeg")}
        resp = client.post("/api/scan/analyze", files=files, headers={"Authorization": "Bearer bad_token"})
        assert resp.status_code == 401


# ==============================================================================
# 3. FAIL-CLOSED ATOMIC QUOTA RESERVATION (FIX-001 / Section 11.3)
# ==============================================================================

class MockUpdateResult:
    def __init__(self, matched_count: int = 1, modified_count: int = 1, acknowledged: bool = True):
        self.matched_count = matched_count
        self.modified_count = modified_count
        self.acknowledged = acknowledged


@pytest.mark.asyncio
async def test_quota_reservation_case_a_successful_reservation():
    """Case A: Valid user below quota receives True and atomic update is called."""
    mock_users_col = AsyncMock()
    mock_users_col.find_one.return_value = {
        "uid": "user_a",
        "tier": "free",
        "usage": {"scans_used_this_month": 5, "scan_period": "2026-09"}
    }
    mock_users_col.update_one.return_value = MockUpdateResult(matched_count=1, modified_count=1)

    granted = await reserve_scan_quota("user_a", mock_users_col)
    assert granted is True
    # Verify atomic increment was performed
    mock_users_col.update_one.assert_called()


@pytest.mark.asyncio
async def test_quota_reservation_case_b_quota_exhausted_matched_zero():
    """Case B: Quota exhausted where atomic update matches zero documents. Must return False (NEVER True)."""
    mock_users_col = AsyncMock()
    mock_users_col.find_one.return_value = {
        "uid": "user_b",
        "tier": "free",
        "usage": {"scans_used_this_month": 20, "scan_period": "2026-09"}
    }
    # Atomic query matched 0 because scans_used_this_month < 20 failed
    mock_users_col.update_one.return_value = MockUpdateResult(matched_count=0, modified_count=0)

    granted = await reserve_scan_quota("user_b", mock_users_col)
    assert granted is False, "FIX-001 Violation: matched_count == 0 must return False!"


@pytest.mark.asyncio
async def test_quota_reservation_case_c_concurrency_bound():
    """Case C: Simulate concurrent reservations near limit; only remaining slots succeed."""
    current_count = 18
    limit = 20
    lock = asyncio.Lock()

    async def mock_find_one(query):
        return {
            "uid": "user_c",
            "tier": "free",
            "usage": {"scans_used_this_month": current_count, "scan_period": "2026-09"}
        }

    async def mock_update_one(query, update):
        nonlocal current_count
        async with lock:
            if current_count < limit:
                current_count += 1
                return MockUpdateResult(matched_count=1, modified_count=1)
            else:
                return MockUpdateResult(matched_count=0, modified_count=0)

    mock_users_col = AsyncMock()
    mock_users_col.find_one.side_effect = mock_find_one
    mock_users_col.update_one.side_effect = mock_update_one

    # Dispatch 10 concurrent requests when only 2 slots remain (18/20)
    tasks = [reserve_scan_quota("user_c", mock_users_col) for _ in range(10)]
    results = await asyncio.gather(*tasks)

    success_count = sum(1 for r in results if r is True)
    denied_count = sum(1 for r in results if r is False)

    assert success_count == 2, f"Expected exactly 2 remaining slots granted, got {success_count}"
    assert denied_count == 8, f"Expected 8 requests denied, got {denied_count}"
    assert current_count == 20


@pytest.mark.asyncio
async def test_quota_reservation_case_d_database_failure_fails_closed():
    """Case D: Unacknowledged write or database exception must fail closed (return False)."""
    # 1. Database exception
    mock_users_col_err = AsyncMock()
    mock_users_col_err.find_one.return_value = {"uid": "user_d", "tier": "free", "usage": {}}
    mock_users_col_err.update_one.side_effect = Exception("MongoDB socket timeout")

    granted_err = await reserve_scan_quota("user_d", mock_users_col_err)
    assert granted_err is False, "DB exception must fail closed and return False"

    # 2. Unacknowledged write
    mock_users_col_unack = AsyncMock()
    mock_users_col_unack.find_one.return_value = {"uid": "user_d", "tier": "free", "usage": {}}
    mock_users_col_unack.update_one.return_value = MockUpdateResult(matched_count=1, acknowledged=False)

    granted_unack = await reserve_scan_quota("user_d", mock_users_col_unack)
    assert granted_unack is False, "Unacknowledged write must fail closed and return False"


# ==============================================================================
# 4. FOOD SEARCH REsafe & ReDoS DEFENSE TESTS (ZS-005 / Section 12)
# ==============================================================================

@pytest.mark.parametrize("dangerous_regex", [
    "[a-z]+(",
    ".*",
    "^admin$",
    "(foo|bar)",
    "(?=admin)",
    "\\",
    "((a+)+)+$",
    "a{100,200}",
    "test(?#comment)",
])
def test_food_search_regex_injection_metacharacters_handled_safely(dangerous_regex):
    """Verify search input with regex operators is escaped and never crashes server."""
    # Test GET /api/foods
    resp1 = client.get("/api/foods", params={"search": dangerous_regex})
    assert resp1.status_code in (200, 404), f"GET /api/foods failed on {dangerous_regex}: {resp1.status_code}"

    # Test GET /api/search/food alias
    resp2 = client.get("/api/search/food", params={"q": dangerous_regex})
    assert resp2.status_code in (200, 404), f"GET /api/search/food failed on {dangerous_regex}: {resp2.status_code}"


def test_food_search_length_boundary():
    """Verify search length boundary: 199 ok, 200 ok, 201 rejected with 400 Bad Request."""
    # 199 characters -> 200 OK
    resp_199 = client.get("/api/foods", params={"search": "a" * 199})
    assert resp_199.status_code == 200

    # 200 characters -> 200 OK
    resp_200 = client.get("/api/foods", params={"search": "a" * 200})
    assert resp_200.status_code == 200

    # 201 characters -> 400 Bad Request
    resp_201 = client.get("/api/foods", params={"search": "a" * 201})
    assert resp_201.status_code == 400
    assert "exceeds maximum length of 200" in resp_201.json().get("detail", "")

    # Alias /api/search/food with 201 characters -> 400 Bad Request
    resp_alias_201 = client.get("/api/search/food", params={"q": "b" * 201})
    assert resp_alias_201.status_code == 400
    assert "exceeds maximum length of 200" in resp_alias_201.json().get("detail", "")


def test_food_search_empty_queries_do_not_generate_regex_filter():
    """Empty and whitespace-only searches must not crash or create meaningless regex queries."""
    resp_empty = client.get("/api/foods", params={"search": ""})
    assert resp_empty.status_code == 200

    resp_spaces = client.get("/api/foods", params={"search": "     "})
    assert resp_spaces.status_code == 200


# ==============================================================================
# 5. BARCODE VALIDATION & OPEN FOOD FACTS SAFETY (FIX-002 / Section 13 & 14)
# ==============================================================================

@pytest.mark.parametrize("valid_barcode", [
    "123456",
    "890123456789",
    "8901030383758",
    "ABC123_XY",
    "ABC-12345",
    "0012345678905",
    "A-B_C-12345678901234",
])
def test_valid_barcodes_pass_validation(valid_barcode):
    """Valid barcodes matching ^[0-9A-Za-z_-]{6,24}$ must be normalized and accepted."""
    normalized = validate_barcode(valid_barcode)
    assert normalized == valid_barcode.strip()


@pytest.mark.parametrize("invalid_barcode", [
    "123?test=1",
    "123&foo=bar",
    "123/456",
    "123#fragment",
    "123%2F456",
    "123 456",
    '123"',
    "123'",
    "abc",           # too short (< 6)
    "12345",         # too short (< 6)
    "1234567890123456789012345",  # too long (25 chars)
    "",
    "   ",
    "123:456",
    "123@456",
    "123;456",
])
def test_invalid_barcodes_rejected_with_422(invalid_barcode):
    """Malformed barcodes must be rejected with HTTP 422 and cause NO outbound HTTP request."""
    with pytest.raises(HTTPException) as exc:
        validate_barcode(invalid_barcode)
    assert exc.value.status_code == 422

    # HTTP endpoint test via TestClient
    with patch("httpx.AsyncClient.get") as mock_off_get:
        resp = client.get(f"/api/foods/barcode/{invalid_barcode}")
        assert resp.status_code in (404, 422)
        mock_off_get.assert_not_called()

        resp_alias = client.get(f"/api/barcode/{invalid_barcode}")
        assert resp_alias.status_code in (404, 422)
        mock_off_get.assert_not_called()


def test_open_food_facts_outbound_url_safety_and_encoding():
    """Verify that valid barcodes are safely URL encoded and target fixed HTTPS hostname."""
    test_barcode = "ABC-123_XY"
    encoded = quote(test_barcode, safe="")
    expected_url = f"https://world.openfoodfacts.org/api/v2/product/{encoded}.json"

    with patch("httpx.AsyncClient.get") as mock_http_get:
        mock_resp = MagicMock()
        mock_resp.status_code = 404
        mock_http_get.return_value = mock_resp

        client.get(f"/api/foods/barcode/{test_barcode}")

        # Assert outbound request was made to fixed safe URL
        mock_http_get.assert_called_once()
        called_url = mock_http_get.call_args[0][0]
        assert called_url == expected_url
        assert called_url.startswith("https://world.openfoodfacts.org/api/v2/product/")
        assert "?" not in called_url
        assert "#" not in called_url
