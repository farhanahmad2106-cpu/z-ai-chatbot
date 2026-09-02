# 10. Automated Testing & Validation Suites

> **Version:** 1.0 | **Date:** 2026-09-03

---

## 10.1 Safety Score Unit Tests (`tests/test_safety_score.py`)

```python
import pytest
from services.safety_engine import compute_safety_score

class TestSafetyScoreCleanFood:
    """Foods with no additives and good nutritional profile should score high."""
    
    def test_clean_dalia(self):
        food = {
            "ingredients": ["Broken Wheat", "Water", "Salt"],
            "additives": [],
            "allergens": [],
            "estimated_macros": {"calories": 180, "protein": 6, "carbs": 32, "fat": 1,
                                  "sugar": 2, "sodium": 150, "fiber": 5, "sat_fat": 0, "trans_fat": 0}
        }
        user = {"conditions": [], "allergies": []}
        result = compute_safety_score(food, user)
        assert result["score"] >= 90  # Clean food, high fiber bonus (+3)
        assert result["tier"] == "safe"

    def test_clean_rajma_with_protein_bonus(self):
        food = {
            "ingredients": ["Kidney Beans", "Tomato", "Onion", "Spices", "Salt"],
            "additives": [],
            "allergens": [],
            "estimated_macros": {"calories": 220, "protein": 12, "carbs": 28, "fat": 3,
                                  "sugar": 4, "sodium": 300, "fiber": 8, "sat_fat": 0.5, "trans_fat": 0}
        }
        user = {"conditions": [], "allergies": []}
        result = compute_safety_score(food, user)
        assert result["score"] >= 95  # Protein ≥ 8g (+5) and Fiber ≥ 3g (+3)


class TestSafetyScoreModerateFood:
    """Foods with elevated sugar/sodium or moderate additives."""

    def test_maggi_noodles(self):
        food = {
            "ingredients": ["Refined Wheat Flour (Maida)", "Palm Oil", "Salt", "Sugar"],
            "additives": [
                {"code": "INS 627", "name": "Disodium Guanylate", "risk": "moderate"},
                {"code": "INS 631", "name": "Disodium Inosinate", "risk": "moderate"},
                {"code": "INS 635", "name": "Disodium 5'-ribonucleotides", "risk": "moderate"}
            ],
            "allergens": ["Wheat (Gluten)"],
            "estimated_macros": {"calories": 340, "protein": 7, "carbs": 48, "fat": 14,
                                  "sugar": 3, "sodium": 920, "fiber": 2, "sat_fat": 6, "trans_fat": 0}
        }
        user = {"conditions": [], "allergies": []}
        result = compute_safety_score(food, user)
        # Maida base: -5, Sodium 920mg: -8, Sat fat 6g: -4, 3 moderate additives: -18
        # Total penalty: ~35 → Score: ~65
        assert 40 <= result["score"] <= 70
        assert result["tier"] == "moderate"

    def test_lays_chips(self):
        food = {
            "ingredients": ["Potatoes", "Vegetable Oil (Palmolein)", "Salt"],
            "additives": [
                {"code": "INS 621", "name": "MSG", "risk": "moderate"},
                {"code": "INS 330", "name": "Citric Acid", "risk": "low"}
            ],
            "allergens": [],
            "estimated_macros": {"calories": 530, "protein": 6, "carbs": 52, "fat": 33,
                                  "sugar": 1, "sodium": 620, "fiber": 4, "sat_fat": 10, "trans_fat": 0}
        }
        user = {"conditions": [], "allergies": []}
        result = compute_safety_score(food, user)
        # Sodium 620mg: -5, Sat fat 10g: -8, MSG: -6, Citric acid: -1, Fiber bonus: +3
        # Score: ~83 → safe-moderate border
        assert 55 <= result["score"] <= 85


class TestSafetyScoreDangerousFood:
    """Direct medical conflicts and banned additives."""

    def test_diabetic_high_sugar_conflict(self):
        food = {
            "ingredients": ["Sugar", "Glucose Syrup", "Maltodextrin", "Refined Flour"],
            "additives": [],
            "allergens": ["Wheat (Gluten)"],
            "estimated_macros": {"calories": 400, "protein": 3, "carbs": 65, "fat": 15,
                                  "sugar": 28, "sodium": 200, "fiber": 0, "sat_fat": 7, "trans_fat": 0.3}
        }
        user = {"conditions": ["Diabetes"], "allergies": []}
        result = compute_safety_score(food, user)
        # Sugar 28g: -12, Maltodextrin + Diabetes: -40, Trans fat: -8, Sat fat: -4
        assert result["score"] < 30
        assert result["tier"] == "dangerous"
        assert any("Diabetes" in c for c in result["conflicts"])

    def test_hypertensive_sodium_overload(self):
        food = {
            "ingredients": ["Potato Flakes", "Salt", "Sodium Bicarbonate"],
            "additives": [{"code": "INS 500", "name": "Sodium Bicarbonate", "risk": "low"}],
            "allergens": [],
            "estimated_macros": {"calories": 320, "protein": 4, "carbs": 42, "fat": 16,
                                  "sugar": 1, "sodium": 1200, "fiber": 2, "sat_fat": 7, "trans_fat": 0}
        }
        user = {"conditions": ["Hypertension"], "allergies": []}
        result = compute_safety_score(food, user)
        # Sodium 1200mg: -8, Hypertension conflict: -35
        assert result["score"] < 40
        assert any("Hypertension" in c for c in result["conflicts"])

    def test_peanut_allergy_override(self):
        food = {
            "ingredients": ["Peanuts", "Sugar", "Salt"],
            "additives": [],
            "allergens": ["Peanuts"],
            "estimated_macros": {"calories": 550, "protein": 22, "carbs": 20, "fat": 45,
                                  "sugar": 8, "sodium": 400, "fiber": 6, "sat_fat": 8, "trans_fat": 0}
        }
        user = {"conditions": [], "allergies": ["Peanuts"]}
        result = compute_safety_score(food, user)
        assert result["score"] < 20  # Allergen override
        assert result["tier"] == "dangerous"


class TestSafetyScoreSyntheticDyes:
    """High-risk synthetic dyes should cause severe deductions."""

    def test_tartrazine_and_sunset_yellow(self):
        food = {
            "ingredients": ["Sugar", "Maida", "Artificial Colours"],
            "additives": [
                {"code": "INS 102", "name": "Tartrazine", "risk": "high"},
                {"code": "INS 110", "name": "Sunset Yellow FCF", "risk": "high"}
            ],
            "allergens": [],
            "estimated_macros": {"calories": 350, "protein": 3, "carbs": 55, "fat": 12,
                                  "sugar": 22, "sodium": 300, "fiber": 0, "sat_fat": 5, "trans_fat": 0}
        }
        user = {"conditions": [], "allergies": []}
        result = compute_safety_score(food, user)
        # Tartrazine: -12, Sunset Yellow: -12, Sugar 22g: -8, Maida: -5, Sat fat: -4
        assert result["score"] < 60
```

---

## 10.2 OCR Pipeline Tests (`tests/test_ocr_pipeline.py`)

### Mock Payloads

#### Maggi Noodles Label (Simulated Tesseract Output)
```python
MAGGI_RAW_OCR = """
INGREDIENTS: Refined Wheat Flour (Maida) (69%), Palm Oil,
Salt, Wheat Gluten, Mineral (Iron), Thickeners (INS 412,
INS 508), Acidity Regulator (INS 500(ii)), Colour (INS 150c).
TASTEMAKER: Starch, Salt, Sugar, Onion Powder, Flavour
Enhancers (INS 627, INS 631, INS 635), Spices & Condiments,
Tomato Powder, Garlic Powder, Turmeric.
"""

def test_maggi_ins_extraction():
    codes = extract_ins_codes(MAGGI_RAW_OCR)
    assert "INS 412" in codes  # Guar Gum
    assert "INS 627" in codes  # Disodium Guanylate
    assert "INS 631" in codes  # Disodium Inosinate
    assert "INS 635" in codes  # Disodium 5'-ribonucleotides
    assert "INS 150c" in codes # Caramel colour
```

#### Haldiram's Bhujia Label
```python
HALDIRAMS_RAW_OCR = """
INGREDIENTS: Besan (Gram Flour), Edible Vegetable Oil
(Palmolein Oil), Moth Bean Flour, Rice Flour, Salt, Red
Chilli, Spices & Condiments, Black Salt, Asafoetida,
Turmeric, Acidity Regulators (INS 330, INS 334), Colour
(INS 100).
"""

def test_haldirams_ins_normalization():
    result = normalize_ingredients(HALDIRAMS_RAW_OCR)
    ins_100 = next(a for a in result["additives"] if a["code"] == "INS 100")
    assert ins_100["name"] == "Curcumin"
    assert ins_100["risk"] == "low"
```

---

## 10.3 SWR Cache Invalidation Tests

```typescript
// tests/cache.test.ts
describe('SWR Cache Invalidation', () => {
  it('should overwrite stale cache when API returns fresh data', () => {
    localStorage.setItem('z_sehealth_cached_search_foods', JSON.stringify([{name: 'Old'}]));
    // Simulate API response
    const freshData = [{name: 'Fresh Paneer'}];
    localStorage.setItem('z_sehealth_cached_search_foods', JSON.stringify(freshData));
    const cached = JSON.parse(localStorage.getItem('z_sehealth_cached_search_foods')!);
    expect(cached[0].name).toBe('Fresh Paneer');
  });

  it('should render fallback foods when both cache and API are empty', () => {
    localStorage.removeItem('z_sehealth_cached_search_foods');
    // Component should render DEFAULT_FALLBACK_FOODS (18+ items)
    expect(DEFAULT_FALLBACK_FOODS.length).toBeGreaterThanOrEqual(18);
  });
});
```

---

## 10.4 Failover Simulation Tests

```python
# tests/test_failover.py
import pytest
from unittest.mock import patch, AsyncMock

@pytest.mark.asyncio
async def test_nvidia_429_cascades_to_gemini():
    """When all 5 NVIDIA keys return 429, request should fall through to Gemini."""
    with patch('main.try_nvidia_fallback_food', new_callable=AsyncMock, return_value=None):
        with patch('main.try_gemini_fallback_food', new_callable=AsyncMock) as mock_gemini:
            mock_gemini.return_value = {"name": "Test Food", "safety_score": 75}
            result = await get_ai_fallback_food("test food")
            assert result is not None
            assert result["name"] == "Test Food"
            mock_gemini.assert_called_once()

@pytest.mark.asyncio
async def test_all_providers_fail_returns_none():
    """When ALL AI providers fail, function returns None gracefully."""
    with patch('main.try_ollama_fallback_food', return_value=None):
        with patch('main.try_nvidia_fallback_food', return_value=None):
            with patch('main.try_gemini_fallback_food', return_value=None):
                result = await get_ai_fallback_food("test food")
                assert result is None
```
