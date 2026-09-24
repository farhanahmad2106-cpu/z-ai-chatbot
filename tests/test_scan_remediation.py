"""
Z-SeHealth - Automated Regression Suite for Scan Pipeline & Crowdsourced Food Moderation
Tests:
- Test 1: Unknown food creates pending record (is_verified: False, status: "pending_review")
- Test 2: Existing food does not create duplicate and returns existing food_id + is_verified
- Test 3: Barcode matching preserves leading zeroes and treats barcode as a string
- Test 4: Authentication: valid token derives anon_<sha256[:12]>, missing token uses anon_contributor
- Test 5: Invalid image (empty image returns 400, unsupported mime returns 415, too large returns 413)
- Test 6: OCR failure (empty parse does not create a false pending-food record)
- Test 7: MongoDB failure (persistence failure raises HTTP 500 and does not report success)
- Test 8: ObjectId serialization (food_id is JSON serializable string)
"""

import sys
import os
import hashlib
import asyncio
from unittest.mock import AsyncMock, patch, MagicMock
from bson import ObjectId
import pytest
from fastapi import HTTPException

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from backend.routes.scan import analyze_back_of_pack
from schemas.scan import OCRAnalysisResponse


class MockAsyncCollection:
    """Thread-safe mock collection simulating MongoDB atomic updates and queries."""
    def __init__(self, initial_docs=None):
        self.docs = [dict(d) for d in (initial_docs or [])]
        self._lock = asyncio.Lock()

    def _matches(self, doc, query):
        if not query:
            return True
        for k, v in query.items():
            if k == "$or":
                if not any(self._matches(doc, q) for q in v):
                    return False
                continue
            val = doc.get(k)
            if isinstance(v, dict):
                if "$ne" in v and val == v["$ne"]:
                    return False
                if "$regex" in v:
                    import re
                    pattern = v["$regex"]
                    options = re.IGNORECASE if v.get("$options") == "i" else 0
                    if not re.search(pattern, str(val or ""), options):
                        return False
            else:
                if val != v:
                    return False
        return True

    async def find_one(self, query):
        async with self._lock:
            for doc in self.docs:
                if self._matches(doc, query):
                    return dict(doc)
            return None

    async def insert_one(self, doc):
        async with self._lock:
            to_insert = dict(doc)
            if "_id" not in to_insert:
                to_insert["_id"] = ObjectId()
            self.docs.append(to_insert)
            res = MagicMock()
            res.inserted_id = to_insert["_id"]
            return res


def create_mock_upload_file(content: bytes = b"valid_image_bytes", content_type: str = "image/jpeg"):
    mock_file = MagicMock()
    mock_file.content_type = content_type
    mock_file.read = AsyncMock(return_value=content)
    return mock_file


@pytest.mark.asyncio
async def test_unknown_food_creates_pending_record():
    """Test 1: Given valid image and unknown food, creates pending record with is_verified: False."""
    mock_foods_col = MockAsyncCollection()

    mock_analysis = OCRAnalysisResponse(
        product_name="Brand New Organic Snack",
        brand="NatureFarm",
        is_verified=False,
        safety_score=88,
        parsed_ingredients=["Organic Oats", "Honey", "Chia Seeds"],
        detected_ins_additives=[],
        flagged_allergens=[],
        nutrition_per_100g={"calories": 350, "protein": 8, "carbs": 55, "fat": 10},
        raw_ocr_text="Ingredients: Organic Oats, Honey, Chia Seeds"
    )

    with patch("backend.routes.scan.extract_and_analyze", return_value=mock_analysis):

        mock_image = create_mock_upload_file()
        res = await analyze_back_of_pack(
            image=mock_image,
            barcode="0123456789012",
            authorization=None,
            foods_col=mock_foods_col,
            users_col=None,
            logs_col=None
        )

        assert res.is_verified is False
        assert res.food_id is not None
        assert isinstance(res.food_id, str)
        assert len(mock_foods_col.docs) == 1

        persisted = mock_foods_col.docs[0]
        assert persisted["name"] == "NatureFarm Brand New Organic Snack"
        assert persisted["is_verified"] is False
        assert persisted["status"] == "pending_review"
        assert persisted["submitted_by"] == "anon_contributor"
        assert persisted["barcode"] == "0123456789012"


@pytest.mark.asyncio
async def test_existing_food_does_not_create_duplicate():
    """Test 2: Given an existing food, returns existing food_id and does not insert duplicate."""
    existing_id = ObjectId()
    mock_foods_col = MockAsyncCollection(initial_docs=[{
        "_id": existing_id,
        "name": "Existing Verified Biscuit",
        "product_name": "Existing Verified Biscuit",
        "brand": "Parle",
        "barcode": "8901234567890",
        "is_verified": True,
        "status": "approved"
    }])

    mock_analysis = OCRAnalysisResponse(
        product_name="Existing Verified Biscuit",
        brand="Parle",
        is_verified=False,
        safety_score=80,
        parsed_ingredients=["Wheat flour", "Sugar"],
        detected_ins_additives=[],
        flagged_allergens=[],
        nutrition_per_100g={"calories": 450, "protein": 6, "carbs": 70, "fat": 15},
        raw_ocr_text="Ingredients: Wheat flour, Sugar"
    )

    with patch("backend.routes.scan.extract_and_analyze", return_value=mock_analysis):

        mock_image = create_mock_upload_file()
        res = await analyze_back_of_pack(
            image=mock_image,
            barcode="8901234567890",
            authorization="Bearer test_token",
            foods_col=mock_foods_col,
            users_col=None,
            logs_col=None
        )

        # Verified existing item returned without new insertion
        assert res.food_id == str(existing_id)
        assert res.is_verified is True
        assert res.requires_user_review is False
        assert len(mock_foods_col.docs) == 1  # No duplicate inserted


@pytest.mark.asyncio
async def test_barcode_matching_preserves_leading_zeroes():
    """Test 3: Barcode matching treats barcodes as string and preserves leading zeroes."""
    leading_zero_barcode = "0001234567890"
    existing_id = ObjectId()
    mock_foods_col = MockAsyncCollection(initial_docs=[{
        "_id": existing_id,
        "name": "Zero-Prefixed Product",
        "barcode": leading_zero_barcode,
        "is_verified": False,
        "status": "pending_review"
    }])

    mock_analysis = OCRAnalysisResponse(
        product_name="Zero-Prefixed Product",
        brand="Local Brand",
        is_verified=False,
        safety_score=75,
        parsed_ingredients=["Salt"],
        raw_ocr_text="Ingredients: Salt"
    )

    with patch("backend.routes.scan.extract_and_analyze", return_value=mock_analysis):

        mock_image = create_mock_upload_file()
        res = await analyze_back_of_pack(
            image=mock_image,
            barcode="  0001234567890  ",  # with whitespace
            authorization=None,
            foods_col=mock_foods_col,
            users_col=None,
            logs_col=None
        )

        # Barcode trimmed and matched as string preserving leading zeroes
        assert res.food_id == str(existing_id)
        assert res.is_verified is False
        assert len(mock_foods_col.docs) == 1  # Reused existing record


@pytest.mark.asyncio
async def test_authentication_identity_resolution():
    """Test 4: Valid Firebase token derives anon_<sha256[:12]>; missing token uses anon_contributor."""
    mock_foods_col = MockAsyncCollection()

    mock_analysis = OCRAnalysisResponse(
        product_name="Snack A",
        parsed_ingredients=["Ingredient 1"],
        raw_ocr_text="Ingredient 1"
    )

    fake_uid = "firebase_user_qa_99"
    expected_anon_id = f"anon_{hashlib.sha256(fake_uid.encode('utf-8')).hexdigest()[:12]}"

    with patch("backend.routes.scan.extract_and_analyze", return_value=mock_analysis), \
         patch("firebase_admin.auth.verify_id_token", return_value={"uid": fake_uid}):

        # Valid Bearer token
        mock_image = create_mock_upload_file()
        res = await analyze_back_of_pack(
            image=mock_image,
            authorization="Bearer valid_jwt_token",
            foods_col=mock_foods_col,
            users_col=None,
            logs_col=None
        )
        assert len(mock_foods_col.docs) == 1
        assert mock_foods_col.docs[0]["submitted_by"] == expected_anon_id

        # Missing token
        mock_image2 = create_mock_upload_file()
        mock_analysis2 = OCRAnalysisResponse(
            product_name="Snack B",
            parsed_ingredients=["Ingredient 2"],
            raw_ocr_text="Ingredient 2"
        )
        with patch("backend.routes.scan.extract_and_analyze", return_value=mock_analysis2):
            res2 = await analyze_back_of_pack(
                image=mock_image2,
                authorization=None,
                foods_col=mock_foods_col,
                users_col=None,
                logs_col=None
            )
            assert len(mock_foods_col.docs) == 2
            assert mock_foods_col.docs[1]["submitted_by"] == "anon_contributor"


@pytest.mark.asyncio
async def test_invalid_image_inputs():
    """Test 5: Validates empty image (400), unsupported format (415), and oversized image (413)."""
    # 1. Empty image
    mock_empty = create_mock_upload_file(content=b"")
    with pytest.raises(HTTPException) as exc1:
        await analyze_back_of_pack(
            image=mock_empty,
            foods_col=None,
            users_col=None,
            logs_col=None
        )
    assert exc1.value.status_code == 400

    # 2. Unsupported MIME type
    mock_unsupported = create_mock_upload_file(content_type="application/pdf")
    with pytest.raises(HTTPException) as exc2:
        await analyze_back_of_pack(
            image=mock_unsupported,
            foods_col=None,
            users_col=None,
            logs_col=None
        )
    assert exc2.value.status_code == 415

    # 3. Oversized file (> 5MB)
    mock_oversized = create_mock_upload_file(content=b"0" * (5 * 1024 * 1024 + 10))
    with pytest.raises(HTTPException) as exc3:
        await analyze_back_of_pack(
            image=mock_oversized,
            foods_col=None,
            users_col=None,
            logs_col=None
        )
    assert exc3.value.status_code == 413


@pytest.mark.asyncio
async def test_ocr_failure_does_not_create_pending_food():
    """Test 6: Empty OCR result does not create a false pending-food record in MongoDB."""
    mock_foods_col = MockAsyncCollection()

    mock_analysis = OCRAnalysisResponse(
        product_name="Packaged Food Item",
        parsed_ingredients=[],
        raw_ocr_text=""  # empty OCR extraction
    )

    with patch("backend.routes.scan.extract_and_analyze", return_value=mock_analysis):

        mock_image = create_mock_upload_file()
        res = await analyze_back_of_pack(
            image=mock_image,
            foods_col=mock_foods_col,
            users_col=None,
            logs_col=None
        )

        assert res.food_id is None
        assert res.is_verified is False
        assert len(mock_foods_col.docs) == 0  # Zero bogus records created


@pytest.mark.asyncio
async def test_mongodb_failure_raises_500():
    """Test 7: Write failure raises HTTP 500 and does not report false success."""
    mock_foods_col = AsyncMock()
    mock_foods_col.find_one.return_value = None
    mock_foods_col.insert_one.side_effect = Exception("Write timeout")
    mock_logs_col = MockAsyncCollection()

    mock_analysis = OCRAnalysisResponse(
        product_name="Failing Item",
        parsed_ingredients=["Sugar"],
        raw_ocr_text="Ingredients: Sugar"
    )

    with patch("backend.routes.scan.extract_and_analyze", return_value=mock_analysis):

        mock_image = create_mock_upload_file()
        with pytest.raises(HTTPException) as exc:
            await analyze_back_of_pack(
                image=mock_image,
                foods_col=mock_foods_col,
                users_col=None,
                logs_col=mock_logs_col
            )
        assert exc.value.status_code == 500
        assert exc.value.detail == "Failed to persist crowdsourced food item"


@pytest.mark.asyncio
async def test_objectid_serialization():
    """Test 8: Returned food_id is a JSON-serializable string, not a raw ObjectId."""
    mock_foods_col = MockAsyncCollection()

    mock_analysis = OCRAnalysisResponse(
        product_name="Serializing Snack",
        parsed_ingredients=["Oats"],
        raw_ocr_text="Ingredients: Oats"
    )

    with patch("backend.routes.scan.extract_and_analyze", return_value=mock_analysis):

        mock_image = create_mock_upload_file()
        res = await analyze_back_of_pack(
            image=mock_image,
            foods_col=mock_foods_col,
            users_col=None,
            logs_col=None
        )

        assert isinstance(res.food_id, str)
        # Ensure json.dumps works on the model
        res_json = res.model_dump_json()
        assert res.food_id in res_json
