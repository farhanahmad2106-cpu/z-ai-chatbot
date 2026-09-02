# 15. Implementation Plan — Current Sprint

> **Version:** 1.0 | **Date:** 2026-09-03
> **Focus:** Back-of-Pack OCR Ingredient Extraction & Normalization Engine + Safety Score Computation

---

## Sprint Overview

The OCR-to-Safety-Score pipeline is the critical path for Z-SeHealth's value proposition. The pipeline transforms a camera-captured food label image into a personalized safety score in < 3.5 seconds.

### Completed Foundation (This Sprint)
- ✅ OpenCV preprocessing pipeline (`ocr_engine.py`): Grayscale → Gaussian Blur → Adaptive Threshold
- ✅ Tesseract integration for raw text extraction
- ✅ `POST /api/scan/ingredients` endpoint wired to Gemini Flash structuring
- ✅ Frontend scan mode toggle (Food vs. Ingredients Label)
- ✅ Dashed viewfinder overlay for label alignment guidance
- ✅ OCR results dashboard rendering (macros, allergens, additives, ingredients pills)

---

## Step 1: INS Code Normalization Engine

### File: `backend/services/ingredient_parser.py`

**Objective:** Build a comprehensive database of 300+ FSSAI-registered INS codes mapped to human-readable names, risk tiers, and health descriptions.

**Implementation:**
```python
# INS_DATABASE: Dict[str, INSCodeEntry]
# Populated from FSSAI Codex Alimentarius reference

INS_DATABASE = {
    # === HIGH RISK (Synthetic Dyes, Carcinogens, Banned in some countries) ===
    "102": {"name": "Tartrazine", "risk": "high", "desc": "Synthetic yellow dye, linked to hyperactivity, banned in Norway/Austria"},
    "110": {"name": "Sunset Yellow FCF", "risk": "high", "desc": "Synthetic orange dye, linked to allergic reactions"},
    "124": {"name": "Ponceau 4R", "risk": "high", "desc": "Synthetic red dye, restricted in US/Norway"},
    "129": {"name": "Allura Red AC", "risk": "high", "desc": "Synthetic red dye, linked to ADHD in children"},
    "132": {"name": "Indigotine", "risk": "high", "desc": "Synthetic blue dye"},
    "133": {"name": "Brilliant Blue FCF", "risk": "high", "desc": "Synthetic blue dye"},
    "142": {"name": "Green S", "risk": "high", "desc": "Synthetic green dye, banned in US/Canada/Japan"},
    "143": {"name": "Fast Green FCF", "risk": "high", "desc": "Synthetic green dye"},
    "151": {"name": "Brilliant Black BN", "risk": "high", "desc": "Synthetic black dye"},
    "155": {"name": "Brown HT", "risk": "high", "desc": "Synthetic brown dye"},
    "951": {"name": "Aspartame", "risk": "high", "desc": "Artificial sweetener, IARC Group 2B possible carcinogen"},

    # === MODERATE RISK (Flavor Enhancers, Preservatives) ===
    "320": {"name": "BHA (Butylated Hydroxyanisole)", "risk": "moderate", "desc": "Antioxidant preservative, IARC Group 2B"},
    "321": {"name": "BHT (Butylated Hydroxytoluene)", "risk": "moderate", "desc": "Antioxidant preservative, potential endocrine disruptor"},
    "319": {"name": "TBHQ", "risk": "moderate", "desc": "Preservative, nausea at high doses"},
    "407": {"name": "Carrageenan", "risk": "moderate", "desc": "Thickener, linked to gut inflammation"},
    "621": {"name": "Monosodium Glutamate (MSG)", "risk": "moderate", "desc": "Flavor enhancer, sensitivity in some individuals"},
    "627": {"name": "Disodium Guanylate", "risk": "moderate", "desc": "Flavor enhancer, often paired with MSG"},
    "631": {"name": "Disodium Inosinate", "risk": "moderate", "desc": "Flavor enhancer, often paired with MSG"},
    "635": {"name": "Disodium 5'-ribonucleotides", "risk": "moderate", "desc": "Combined flavor enhancer (627+631)"},

    # === LOW RISK (Generally Recognized as Safe) ===
    "100": {"name": "Curcumin", "risk": "low", "desc": "Natural yellow color from turmeric"},
    "150c": {"name": "Caramel Colour (Ammonia process)", "risk": "low", "desc": "Common brown coloring"},
    "160b": {"name": "Annatto", "risk": "low", "desc": "Natural orange-yellow color from seeds"},
    "270": {"name": "Lactic Acid", "risk": "low", "desc": "Natural acid, pH regulator"},
    "300": {"name": "Ascorbic Acid (Vitamin C)", "risk": "low", "desc": "Antioxidant, essential nutrient"},
    "322": {"name": "Lecithin", "risk": "low", "desc": "Natural emulsifier from soy/sunflower"},
    "330": {"name": "Citric Acid", "risk": "low", "desc": "Natural acid, flavor enhancer"},
    "334": {"name": "Tartaric Acid", "risk": "low", "desc": "Natural acid from grapes"},
    "412": {"name": "Guar Gum", "risk": "low", "desc": "Natural thickener from guar beans"},
    "440": {"name": "Pectin", "risk": "low", "desc": "Natural gelling agent from fruit"},
    "500": {"name": "Sodium Bicarbonate", "risk": "low", "desc": "Baking soda, leavening agent"},
    "508": {"name": "Potassium Chloride", "risk": "low", "desc": "Salt substitute, electrolyte"},
}

def extract_ins_codes(raw_text: str) -> List[str]:
    """Extract all INS codes from raw OCR text using regex."""
    import re
    pattern = r'INS\s*(\d+(?:\([a-z]+\))?)'
    matches = re.findall(pattern, raw_text, re.IGNORECASE)
    return [f"INS {m}" for m in matches]

def normalize_ingredients(raw_text: str) -> ParsedIngredients:
    """Full pipeline: extract INS codes → look up → classify risk."""
    ...
```

---

## Step 2: Safety Score Computation Engine

### File: `backend/services/safety_engine.py`

**Objective:** Implement the exact mathematical formula from the PRD (§1.6).

```python
def compute_safety_score(food_data: dict, user_profile: dict) -> SafetyScoreResult:
    score = 100
    penalties_nutrition = []
    penalties_additive = []
    conflicts = []
    bonuses = []
    
    macros = food_data.get("estimated_macros", {})
    
    # --- Nutritional Penalties ---
    sugar = macros.get("sugar", 0)
    if sugar > 22.5:
        score -= 12; penalties_nutrition.append(f"Sugar {sugar}g: -12 pts")
    elif sugar > 15:
        score -= 8; penalties_nutrition.append(f"Sugar {sugar}g: -8 pts")
    elif sugar > 10:
        score -= 5; penalties_nutrition.append(f"Sugar {sugar}g: -5 pts")
    
    sodium = macros.get("sodium", 0)
    if sodium > 1500:
        score -= 10; penalties_nutrition.append(f"Sodium {sodium}mg: -10 pts")
    elif sodium > 900:
        score -= 8; penalties_nutrition.append(f"Sodium {sodium}mg: -8 pts")
    elif sodium > 500:
        score -= 5; penalties_nutrition.append(f"Sodium {sodium}mg: -5 pts")
    
    # ... (saturated fat, trans fat, maida detection)
    
    # --- Nutritional Bonuses ---
    fiber = macros.get("fiber", 0)
    protein = macros.get("protein", 0)
    if fiber >= 3:
        score += 3; bonuses.append(f"Fiber {fiber}g: +3 pts")
    if protein >= 8:
        score += 5; bonuses.append(f"Protein {protein}g: +5 pts")
    
    # --- Additive Penalties ---
    for additive in food_data.get("additives", []):
        risk = additive.get("risk", "low")
        name = additive.get("name", additive.get("code", "Unknown"))
        if risk == "high":
            score -= 12; penalties_additive.append(f"{name} (high risk): -12 pts")
        elif risk == "moderate":
            score -= 6; penalties_additive.append(f"{name} (moderate risk): -6 pts")
        elif risk == "low":
            score -= 2; penalties_additive.append(f"{name} (low risk): -2 pts")
    
    # --- Medical Profile Penalties ---
    conditions = user_profile.get("conditions", [])
    allergies = user_profile.get("allergies", [])
    
    if "Diabetes" in conditions and (sugar > 15 or "Maltodextrin" in str(food_data.get("ingredients", []))):
        score -= 35; conflicts.append(f"Diabetes conflict: Sugar {sugar}g / Maltodextrin detected: -35 pts")
    
    if "Hypertension" in conditions and sodium > 600:
        score -= 35; conflicts.append(f"Hypertension conflict: Sodium {sodium}mg: -35 pts")
    
    # Allergen override
    for allergen in food_data.get("allergens", []):
        for user_allergy in allergies:
            if user_allergy.lower() in allergen.lower():
                score = min(score, 15)
                conflicts.append(f"SEVERE: {allergen} matches allergy '{user_allergy}' → Score capped at 15")
    
    score = max(0, min(100, score))
    tier = "safe" if score >= 70 else "moderate" if score >= 40 else "dangerous"
    
    return SafetyScoreResult(
        score=score, tier=tier,
        nutritional_penalties=penalties_nutrition,
        additive_penalties=penalties_additive,
        medical_conflicts=conflicts,
        bonuses=bonuses
    )
```

---

## Step 3: Wire Safety Score into OCR Pipeline

### File: `backend/main.py` (modify `/api/scan/ingredients`)

Update the OCR endpoint to:
1. Extract raw text via Tesseract.
2. Structure via LLM (existing).
3. Run INS normalization on the structured additives.
4. Fetch user's health vault (if authenticated).
5. Compute safety score.
6. Return enriched response with score + conflicts.

---

## Step 4: Frontend Safety Score Display

### File: `frontend/src/components/Scan.tsx`

Add to the OCR results dashboard:
- Safety Score ring (0-100) with color-coded tier.
- Medical conflict warning banner (if any).
- Detailed penalty breakdown accordion.

---

## Step 5: Verification

| Test | Command | Expected |
|---|---|---|
| INS parser unit tests | `pytest tests/test_ins_parser.py` | All 300+ codes resolve |
| Safety score edge cases | `pytest tests/test_safety_score.py` | 20 test cases pass |
| OCR integration test | `curl -X POST ... /api/scan/ingredients` | Returns score + conflicts |
| Frontend typecheck | `npx tsc --noEmit` | Exit code 0 |
| Production build | `npm run build` | Exit code 0 |
