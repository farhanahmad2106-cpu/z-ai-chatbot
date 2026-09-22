"""
Z-SeHealth Deterministic Nutrition Lookup & Normalization Engine
Priority 1: Local offline nutrition database for Indian regional staples (per 100g).
Priority 2: Gemini 2.5 Flash structured fallback for unlisted ingredients.
"""

import os
import re
import json
import asyncio
from typing import Dict, Any, Optional, Tuple, List
import httpx

# ---- LOCAL NUTRITION DATABASE (PER 100g BASE) ----
# Reference nutrients: calories, protein_g, carbs_g, fat_g, sodium_mg, added_sugar_g
# Deterministic salt conversion: 1g salt ≈ 393mg sodium (100g = 39,300mg sodium)

LOCAL_INGREDIENT_DATABASE: Dict[str, Dict[str, Any]] = {
    "rice": {
        "name": "Rice",
        "calories": 360.0,
        "protein_g": 7.0,
        "carbs_g": 80.0,
        "fat_g": 0.6,
        "sodium_mg": 5.0,
        "added_sugar_g": 0.0,
        "allergen_tags": [],
        "refined_flour": False
    },
    "cooked rice": {
        "name": "Cooked Rice",
        "calories": 130.0,
        "protein_g": 2.7,
        "carbs_g": 28.0,
        "fat_g": 0.3,
        "sodium_mg": 2.0,
        "added_sugar_g": 0.0,
        "allergen_tags": [],
        "refined_flour": False
    },
    "atta": {
        "name": "Whole Wheat Flour (Atta)",
        "calories": 340.0,
        "protein_g": 13.0,
        "carbs_g": 71.0,
        "fat_g": 2.5,
        "sodium_mg": 5.0,
        "added_sugar_g": 0.0,
        "allergen_tags": ["wheat", "gluten"],
        "refined_flour": False
    },
    "maida": {
        "name": "Refined Flour (Maida)",
        "calories": 364.0,
        "protein_g": 10.0,
        "carbs_g": 76.0,
        "fat_g": 1.0,
        "sodium_mg": 2.0,
        "added_sugar_g": 0.0,
        "allergen_tags": ["wheat", "gluten"],
        "refined_flour": True
    },
    "rava": {
        "name": "Semolina (Rava/Suji)",
        "calories": 360.0,
        "protein_g": 12.0,
        "carbs_g": 73.0,
        "fat_g": 1.0,
        "sodium_mg": 2.0,
        "added_sugar_g": 0.0,
        "allergen_tags": ["wheat", "gluten"],
        "refined_flour": False
    },
    "poha": {
        "name": "Flattened Rice (Poha)",
        "calories": 360.0,
        "protein_g": 6.6,
        "carbs_g": 77.0,
        "fat_g": 1.2,
        "sodium_mg": 5.0,
        "added_sugar_g": 0.0,
        "allergen_tags": [],
        "refined_flour": False
    },
    "oats": {
        "name": "Oats",
        "calories": 389.0,
        "protein_g": 16.9,
        "carbs_g": 66.3,
        "fat_g": 6.9,
        "sodium_mg": 2.0,
        "added_sugar_g": 0.0,
        "allergen_tags": [],
        "refined_flour": False
    },
    "besan": {
        "name": "Gram Flour (Besan)",
        "calories": 387.0,
        "protein_g": 22.0,
        "carbs_g": 58.0,
        "fat_g": 7.0,
        "sodium_mg": 64.0,
        "added_sugar_g": 0.0,
        "allergen_tags": [],
        "refined_flour": False
    },
    "moong dal": {
        "name": "Moong Dal",
        "calories": 347.0,
        "protein_g": 24.0,
        "carbs_g": 63.0,
        "fat_g": 1.2,
        "sodium_mg": 15.0,
        "added_sugar_g": 0.0,
        "allergen_tags": [],
        "refined_flour": False
    },
    "masoor dal": {
        "name": "Masoor Dal",
        "calories": 352.0,
        "protein_g": 25.0,
        "carbs_g": 60.0,
        "fat_g": 1.0,
        "sodium_mg": 15.0,
        "added_sugar_g": 0.0,
        "allergen_tags": [],
        "refined_flour": False
    },
    "toor dal": {
        "name": "Toor Dal (Arhar Dal)",
        "calories": 343.0,
        "protein_g": 22.0,
        "carbs_g": 62.0,
        "fat_g": 1.5,
        "sodium_mg": 17.0,
        "added_sugar_g": 0.0,
        "allergen_tags": [],
        "refined_flour": False
    },
    "chana dal": {
        "name": "Chana Dal",
        "calories": 360.0,
        "protein_g": 20.0,
        "carbs_g": 60.0,
        "fat_g": 5.0,
        "sodium_mg": 30.0,
        "added_sugar_g": 0.0,
        "allergen_tags": [],
        "refined_flour": False
    },
    "rajma": {
        "name": "Kidney Beans (Rajma)",
        "calories": 333.0,
        "protein_g": 24.0,
        "carbs_g": 60.0,
        "fat_g": 1.0,
        "sodium_mg": 24.0,
        "added_sugar_g": 0.0,
        "allergen_tags": [],
        "refined_flour": False
    },
    "chickpeas": {
        "name": "Chickpeas (Kabuli Chana)",
        "calories": 364.0,
        "protein_g": 19.0,
        "carbs_g": 61.0,
        "fat_g": 6.0,
        "sodium_mg": 24.0,
        "added_sugar_g": 0.0,
        "allergen_tags": [],
        "refined_flour": False
    },
    "paneer": {
        "name": "Paneer (Cottage Cheese)",
        "calories": 296.0,
        "protein_g": 18.0,
        "carbs_g": 4.0,
        "fat_g": 22.0,
        "sodium_mg": 20.0,
        "added_sugar_g": 0.0,
        "allergen_tags": ["dairy"],
        "refined_flour": False
    },
    "milk": {
        "name": "Cow's Milk",
        "calories": 60.0,
        "protein_g": 3.2,
        "carbs_g": 4.8,
        "fat_g": 3.3,
        "sodium_mg": 44.0,
        "added_sugar_g": 0.0,
        "allergen_tags": ["dairy"],
        "refined_flour": False
    },
    "curd": {
        "name": "Curd (Dahi / Yogurt)",
        "calories": 60.0,
        "protein_g": 3.5,
        "carbs_g": 4.5,
        "fat_g": 3.0,
        "sodium_mg": 40.0,
        "added_sugar_g": 0.0,
        "allergen_tags": ["dairy"],
        "refined_flour": False
    },
    "butter": {
        "name": "Butter",
        "calories": 717.0,
        "protein_g": 0.9,
        "carbs_g": 0.1,
        "fat_g": 81.0,
        "sodium_mg": 600.0,
        "added_sugar_g": 0.0,
        "allergen_tags": ["dairy"],
        "refined_flour": False
    },
    "ghee": {
        "name": "Desi Ghee (Clarified Butter)",
        "calories": 884.0,
        "protein_g": 0.0,
        "carbs_g": 0.0,
        "fat_g": 100.0,
        "sodium_mg": 0.0,
        "added_sugar_g": 0.0,
        "allergen_tags": ["dairy"],
        "refined_flour": False
    },
    "potato": {
        "name": "Potato (Aloo)",
        "calories": 77.0,
        "protein_g": 2.0,
        "carbs_g": 17.0,
        "fat_g": 0.1,
        "sodium_mg": 6.0,
        "added_sugar_g": 0.0,
        "allergen_tags": [],
        "refined_flour": False
    },
    "tomato": {
        "name": "Tomato",
        "calories": 18.0,
        "protein_g": 0.9,
        "carbs_g": 3.9,
        "fat_g": 0.2,
        "sodium_mg": 5.0,
        "added_sugar_g": 0.0,
        "allergen_tags": [],
        "refined_flour": False
    },
    "onion": {
        "name": "Onion",
        "calories": 40.0,
        "protein_g": 1.1,
        "carbs_g": 9.3,
        "fat_g": 0.1,
        "sodium_mg": 4.0,
        "added_sugar_g": 0.0,
        "allergen_tags": [],
        "refined_flour": False
    },
    "spinach": {
        "name": "Spinach (Palak)",
        "calories": 23.0,
        "protein_g": 2.9,
        "carbs_g": 3.6,
        "fat_g": 0.4,
        "sodium_mg": 79.0,
        "added_sugar_g": 0.0,
        "allergen_tags": [],
        "refined_flour": False
    },
    "carrot": {
        "name": "Carrot (Gajar)",
        "calories": 41.0,
        "protein_g": 0.9,
        "carbs_g": 9.6,
        "fat_g": 0.2,
        "sodium_mg": 69.0,
        "added_sugar_g": 0.0,
        "allergen_tags": [],
        "refined_flour": False
    },
    "peas": {
        "name": "Green Peas (Matar)",
        "calories": 81.0,
        "protein_g": 5.4,
        "carbs_g": 14.5,
        "fat_g": 0.4,
        "sodium_mg": 5.0,
        "added_sugar_g": 0.0,
        "allergen_tags": [],
        "refined_flour": False
    },
    "cauliflower": {
        "name": "Cauliflower (Gobi)",
        "calories": 25.0,
        "protein_g": 1.9,
        "carbs_g": 5.0,
        "fat_g": 0.3,
        "sodium_mg": 30.0,
        "added_sugar_g": 0.0,
        "allergen_tags": [],
        "refined_flour": False
    },
    "mustard oil": {
        "name": "Mustard Oil",
        "calories": 884.0,
        "protein_g": 0.0,
        "carbs_g": 0.0,
        "fat_g": 100.0,
        "sodium_mg": 0.0,
        "added_sugar_g": 0.0,
        "allergen_tags": [],
        "refined_flour": False
    },
    "groundnut oil": {
        "name": "Groundnut Oil (Peanut Oil)",
        "calories": 884.0,
        "protein_g": 0.0,
        "carbs_g": 0.0,
        "fat_g": 100.0,
        "sodium_mg": 0.0,
        "added_sugar_g": 0.0,
        "allergen_tags": ["peanuts"],
        "refined_flour": False
    },
    "sunflower oil": {
        "name": "Sunflower Oil",
        "calories": 884.0,
        "protein_g": 0.0,
        "carbs_g": 0.0,
        "fat_g": 100.0,
        "sodium_mg": 0.0,
        "added_sugar_g": 0.0,
        "allergen_tags": [],
        "refined_flour": False
    },
    "peanuts": {
        "name": "Peanuts (Moongphali)",
        "calories": 567.0,
        "protein_g": 25.8,
        "carbs_g": 16.1,
        "fat_g": 49.2,
        "sodium_mg": 18.0,
        "added_sugar_g": 0.0,
        "allergen_tags": ["peanuts"],
        "refined_flour": False
    },
    "almonds": {
        "name": "Almonds (Badam)",
        "calories": 579.0,
        "protein_g": 21.2,
        "carbs_g": 21.6,
        "fat_g": 49.9,
        "sodium_mg": 1.0,
        "added_sugar_g": 0.0,
        "allergen_tags": ["tree_nuts"],
        "refined_flour": False
    },
    "cashews": {
        "name": "Cashews (Kaju)",
        "calories": 553.0,
        "protein_g": 18.2,
        "carbs_g": 30.2,
        "fat_g": 43.8,
        "sodium_mg": 12.0,
        "added_sugar_g": 0.0,
        "allergen_tags": ["tree_nuts"],
        "refined_flour": False
    },
    "wheat": {
        "name": "Wheat Grain",
        "calories": 340.0,
        "protein_g": 13.0,
        "carbs_g": 71.0,
        "fat_g": 2.5,
        "sodium_mg": 5.0,
        "added_sugar_g": 0.0,
        "allergen_tags": ["wheat", "gluten"],
        "refined_flour": False
    },
    "corn": {
        "name": "Sweet Corn / Maize",
        "calories": 86.0,
        "protein_g": 3.2,
        "carbs_g": 19.0,
        "fat_g": 1.2,
        "sodium_mg": 15.0,
        "added_sugar_g": 0.0,
        "allergen_tags": [],
        "refined_flour": False
    },
    "salt": {
        "name": "Table Salt",
        "calories": 0.0,
        "protein_g": 0.0,
        "carbs_g": 0.0,
        "fat_g": 0.0,
        "sodium_mg": 39300.0,  # 1g salt ≈ 393mg sodium
        "added_sugar_g": 0.0,
        "allergen_tags": [],
        "refined_flour": False
    },
    "sugar": {
        "name": "White Sugar",
        "calories": 387.0,
        "protein_g": 0.0,
        "carbs_g": 100.0,
        "fat_g": 0.0,
        "sodium_mg": 1.0,
        "added_sugar_g": 100.0,
        "allergen_tags": [],
        "refined_flour": False
    },
    "jaggery": {
        "name": "Jaggery (Gur)",
        "calories": 383.0,
        "protein_g": 0.4,
        "carbs_g": 98.0,
        "fat_g": 0.1,
        "sodium_mg": 30.0,
        "added_sugar_g": 85.0,
        "allergen_tags": [],
        "refined_flour": False
    },
    "egg": {
        "name": "Whole Egg",
        "calories": 143.0,
        "protein_g": 12.6,
        "carbs_g": 0.7,
        "fat_g": 9.5,
        "sodium_mg": 142.0,
        "added_sugar_g": 0.0,
        "allergen_tags": ["egg"],
        "refined_flour": False
    },
    "soy chunks": {
        "name": "Soya Chunks / Soya Flour",
        "calories": 345.0,
        "protein_g": 52.0,
        "carbs_g": 33.0,
        "fat_g": 0.5,
        "sodium_mg": 20.0,
        "added_sugar_g": 0.0,
        "allergen_tags": ["soy"],
        "refined_flour": False
    },
    "sesame": {
        "name": "Sesame Seeds (Til)",
        "calories": 573.0,
        "protein_g": 17.7,
        "carbs_g": 23.4,
        "fat_g": 49.7,
        "sodium_mg": 11.0,
        "added_sugar_g": 0.0,
        "allergen_tags": ["sesame"],
        "refined_flour": False
    },
    "fish": {
        "name": "Fresh Fish (Rohu / Katla)",
        "calories": 105.0,
        "protein_g": 22.0,
        "carbs_g": 0.0,
        "fat_g": 1.5,
        "sodium_mg": 60.0,
        "added_sugar_g": 0.0,
        "allergen_tags": ["fish"],
        "refined_flour": False
    }
}

# Regional and linguistic aliases mapping to canonical lookup keys
INGREDIENT_CANONICAL_ALIASES: Dict[str, str] = {
    "moongphali": "peanuts",
    "groundnut": "peanuts",
    "groundnuts": "peanuts",
    "peanut": "peanuts",
    "singdana": "peanuts",
    "whole wheat flour": "atta",
    "gehun atta": "atta",
    "gehun ka atta": "atta",
    "wheat flour": "atta",
    "all purpose flour": "maida",
    "refined flour": "maida",
    "refined wheat flour": "maida",
    "sooji": "rava",
    "suji": "rava",
    "semolina": "rava",
    "flattened rice": "poha",
    "aval": "poha",
    "chivda": "poha",
    "gram flour": "besan",
    "chickpea flour": "besan",
    "chana flour": "besan",
    "cottage cheese": "paneer",
    "fresh paneer": "paneer",
    "dahi": "curd",
    "yogurt": "curd",
    "yoghurt": "curd",
    "desi ghee": "ghee",
    "clarified butter": "ghee",
    "makhan": "butter",
    "table salt": "salt",
    "iodized salt": "salt",
    "namak": "salt",
    "sea salt": "salt",
    "chini": "sugar",
    "shakkar": "sugar",
    "white sugar": "sugar",
    "gur": "jaggery",
    "gud": "jaggery",
    "badam": "almonds",
    "almond": "almonds",
    "kaju": "cashews",
    "cashew": "cashews",
    "aloo": "potato",
    "potatoes": "potato",
    "tamatar": "tomato",
    "tomatoes": "tomato",
    "pyaz": "onion",
    "onions": "onion",
    "palak": "spinach",
    "gajar": "carrot",
    "carrots": "carrot",
    "matar": "peas",
    "green peas": "peas",
    "gobi": "cauliflower",
    "phool gobi": "cauliflower",
    "sarson ka tel": "mustard oil",
    "sarson oil": "mustard oil",
    "peanut oil": "groundnut oil",
    "chana": "chickpeas",
    "kabuli chana": "chickpeas",
    "safed chana": "chickpeas",
    "arhar dal": "toor dal",
    "tuvar dal": "toor dal",
    "yellow moong dal": "moong dal",
    "red lentil": "masoor dal",
    "egg": "egg",
    "eggs": "egg",
    "anda": "egg",
    "soya": "soy chunks",
    "soy": "soy chunks",
    "til": "sesame",
    "sesame seeds": "sesame",
    "machhli": "fish",
    "raw rice": "rice",
    "basmati rice": "rice",
    "white rice": "rice",
    "brown rice": "rice"
}


def normalize_ingredient_name(raw_name: str) -> str:
    """Normalizes ingredient string for deterministic lookup."""
    clean = raw_name.lower().strip()
    clean = re.sub(r"\(.*?\)", "", clean)  # Remove parentheticals
    clean = re.sub(r"[^\w\s]", "", clean)   # Remove punctuation
    clean = re.sub(r"\s+", " ", clean).strip()

    # Check direct aliases
    if clean in INGREDIENT_CANONICAL_ALIASES:
        return INGREDIENT_CANONICAL_ALIASES[clean]

    # Check substring matches in alias map
    for alias, standard in INGREDIENT_CANONICAL_ALIASES.items():
        if alias in clean or clean in alias:
            return standard

    return clean


async def fallback_gemini_nutrition(ingredient_name: str) -> Optional[Dict[str, Any]]:
    """
    Fallback resolver using Gemini 2.5 Flash when an ingredient is absent from local DB.
    Enforces strict structured schema and numeric validation.
    """
    gemini_key = os.getenv("GEMINI_API_KEY", "")
    if not gemini_key:
        return None

    prompt = f"""You are a clinical nutrition database expert.
Provide the standard macro nutritional profile for 100 grams of the raw/pure ingredient: "{ingredient_name}".

STRICT INVARIANTS:
1. Return ONLY a valid JSON object matching this exact structure:
{{
  "name": "{ingredient_name}",
  "calories": float (0 to 900),
  "protein_g": float (0 to 100),
  "carbs_g": float (0 to 100),
  "fat_g": float (0 to 100),
  "sodium_mg": float (0 to 40000),
  "added_sugar_g": float (0 to 100),
  "allergen_tags": ["dairy" | "peanuts" | "tree_nuts" | "wheat" | "gluten" | "egg" | "soy" | "sesame" | "fish" | "shellfish"],
  "refined_flour": boolean
}}
2. If this ingredient is table salt or similar seasoning, sodium_mg must accurately reflect table salt (approx 39,000 mg per 100g).
3. Do NOT guess or hallucinate. Return valid numeric floats.
4. No markdown formatting, return ONLY the raw JSON object.
"""

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_key}"
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.1,
            "response_mime_type": "application/json"
        }
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code == 200:
                data = resp.json()
                candidates = data.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    if parts and "text" in parts[0]:
                        text = parts[0]["text"].strip()
                        if text.startswith("```"):
                            text = re.sub(r"^```[a-z]*\s*", "", text)
                            text = re.sub(r"\s*```$", "", text)
                        parsed = json.loads(text)

                        # Validate numeric bounds
                        cals = float(parsed.get("calories", -1))
                        protein = float(parsed.get("protein_g", -1))
                        carbs = float(parsed.get("carbs_g", -1))
                        fat = float(parsed.get("fat_g", -1))
                        sodium = float(parsed.get("sodium_mg", -1))
                        added_sugar = float(parsed.get("added_sugar_g", 0))

                        if (0 <= cals <= 1000 and 0 <= protein <= 100 and
                            0 <= carbs <= 100 and 0 <= fat <= 100 and
                            0 <= sodium <= 40000):
                            return {
                                "name": ingredient_name.title(),
                                "calories": cals,
                                "protein_g": protein,
                                "carbs_g": carbs,
                                "fat_g": fat,
                                "sodium_mg": sodium,
                                "added_sugar_g": max(0.0, min(added_sugar, 100.0)),
                                "allergen_tags": parsed.get("allergen_tags", []),
                                "refined_flour": bool(parsed.get("refined_flour", False))
                            }
    except Exception as e:
        print(f"[NutritionLookup] Gemini fallback error for '{ingredient_name}': {e}")

    return None


async def resolve_ingredient_nutrition(ingredient_name: str) -> Tuple[Optional[Dict[str, Any]], str]:
    """
    Resolves ingredient nutrition per 100g.
    Returns (nutrition_dict, provenance) or (None, "") if unresolvable.
    """
    canonical_key = normalize_ingredient_name(ingredient_name)

    # 1. Local Nutrition DB Lookup (Priority 1)
    if canonical_key in LOCAL_INGREDIENT_DATABASE:
        return dict(LOCAL_INGREDIENT_DATABASE[canonical_key]), "local_nutrition_db"

    # 2. Check direct lowercase match in local DB
    lower_raw = ingredient_name.lower().strip()
    if lower_raw in LOCAL_INGREDIENT_DATABASE:
        return dict(LOCAL_INGREDIENT_DATABASE[lower_raw]), "local_nutrition_db"

    # 3. Gemini Fallback (Priority 2)
    gemini_res = await fallback_gemini_nutrition(ingredient_name)
    if gemini_res:
        return gemini_res, "gemini_fallback"

    return None, ""
