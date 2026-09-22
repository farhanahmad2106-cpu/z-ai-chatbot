"""
Z-SeHealth Indic Meal Planner Translator Service
Handles presentation-only translation for meal planner items across:
English (en), Hindi (hi), Marathi (mr), Tamil (ta), Bengali (bn), and Telugu (te).

Key Invariants:
1. Presentation-only transformation: Only name, serving_description, ingredients, and warning_reasons.
2. Canonical nutrition, medical, and machine-readable data are NEVER touched or modified.
3. Strict token preservation: INS codes (e.g., INS 330, INS 627) and numeric values (e.g. 1.5, 320 kcal, 25 g)
   must remain intact in translated strings.
4. Tier-aware provider routing with graceful fallback:
   - Primary: Sarvam AI (for Pro/Elite/Premium or when configured)
   - Secondary Fallback: Gemini 2.5 Flash
   - Tertiary: Controlled fallback (preserves canonical text without crashing)
5. MongoDB caching in `meal_translations` with content-hash invalidation.
"""

import os
import re
import json
import hashlib
import datetime
import asyncio
from typing import List, Dict, Any, Optional, Tuple
import httpx

from schemas.meal_plan import (
    SUPPORTED_MEAL_LANGUAGES,
    MealLanguage,
    MealPlanItem,
    TranslatedMealItem,
    MealTranslationResponse
)

SARVAM_API_KEY = os.getenv("SARVAM_API_KEY", "")
SARVAM_BASE = "https://api.sarvam.ai"
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

SARVAM_LANG_CODE_MAP = {
    "hi": "hi-IN",
    "mr": "mr-IN",
    "ta": "ta-IN",
    "bn": "bn-IN",
    "te": "te-IN",
}

LANGUAGE_NAMES = {
    "en": "English",
    "hi": "Hindi",
    "mr": "Marathi",
    "ta": "Tamil",
    "bn": "Bengali",
    "te": "Telugu",
}

def compute_content_hash(
    name: str,
    serving_description: str,
    ingredients: List[str],
    warning_reasons: List[str]
) -> str:
    """Computes a deterministic 16-character SHA-256 hash of translatable content."""
    raw = f"{name.strip()}|{serving_description.strip()}|{'#'.join(i.strip() for i in ingredients)}|{'#'.join(w.strip() for w in warning_reasons)}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def validate_token_preservation(original_text: str, translated_text: str) -> bool:
    """
    Ensures critical machine codes like 'INS 330' and exact digits are preserved.
    """
    # 1. INS codes (e.g., INS 330, INS 627, INS-330)
    ins_codes = re.findall(r"\bINS[\s-]?\d{3,4}[a-z]?\b", original_text, re.IGNORECASE)
    for code in ins_codes:
        normalized_code = re.sub(r"[\s-]", " ", code).upper()
        # Check if the code exists in translated text
        if normalized_code not in translated_text.upper() and code.upper() not in translated_text.upper():
            return False

    return True


def validate_translated_item(
    meal: MealPlanItem,
    raw_item: Dict[str, Any]
) -> Tuple[bool, Optional[str]]:
    """
    Validates structural integrity and constraints of raw AI translation output.
    """
    if not isinstance(raw_item, dict):
        return False, "Translation item is not a dictionary"

    orig_id = raw_item.get("original_id")
    if orig_id != meal.meal_id:
        return False, f"Mismatched meal_id: expected {meal.meal_id}, got {orig_id}"

    translated_name = raw_item.get("translated_name")
    if not translated_name or not isinstance(translated_name, str) or not translated_name.strip():
        return False, f"Missing or invalid translated_name for meal {meal.meal_id}"

    translated_desc = raw_item.get("translated_serving_description", "")
    if not isinstance(translated_desc, str):
        return False, f"Invalid translated_serving_description for meal {meal.meal_id}"

    translated_ing = raw_item.get("translated_ingredients")
    if not isinstance(translated_ing, list) or len(translated_ing) != len(meal.ingredients):
        return False, f"Translated ingredients count ({len(translated_ing) if isinstance(translated_ing, list) else 0}) != original count ({len(meal.ingredients)})"

    translated_warn = raw_item.get("translated_warning_reasons", [])
    expected_warn_count = len(meal.conflict.warning_reasons)
    if not isinstance(translated_warn, list) or len(translated_warn) != expected_warn_count:
        return False, f"Translated warnings count ({len(translated_warn) if isinstance(translated_warn, list) else 0}) != original count ({expected_warn_count})"

    # Token preservation checks
    if not validate_token_preservation(meal.name, translated_name):
        return False, f"Token preservation check failed in name for meal {meal.meal_id}"
    if not validate_token_preservation(meal.serving_description, translated_desc):
        return False, f"Token preservation check failed in serving_description for meal {meal.meal_id}"
    for orig_ing, trans_ing in zip(meal.ingredients, translated_ing):
        if not validate_token_preservation(orig_ing, trans_ing):
            return False, f"Token preservation check failed in ingredient '{orig_ing}'"
    for orig_warn, trans_warn in zip(meal.conflict.warning_reasons, translated_warn):
        if not validate_token_preservation(orig_warn, trans_warn):
            return False, f"Token preservation check failed in warning '{orig_warn}'"

    return True, None


async def call_sarvam_batch(
    uncached_meals: List[MealPlanItem],
    target_lang: str
) -> Optional[List[Dict[str, Any]]]:
    """
    Calls Sarvam AI translation API for uncached meals.
    Translates flattened display fields and reconstructs structured items.
    """
    api_key = os.getenv("SARVAM_API_KEY", "")
    if not api_key:
        print("[MealTranslator] Sarvam AI API key not configured. Skipping Sarvam.")
        return None

    sarvam_code = SARVAM_LANG_CODE_MAP.get(target_lang)
    if not sarvam_code:
        print(f"[MealTranslator] Target lang {target_lang} not supported by Sarvam code map.")
        return None

    headers = {
        "api-subscription-key": api_key,
        "Content-Type": "application/json",
    }

    try:
        # Build list of texts to translate
        # For each meal: [name, serving_description, *ingredients, *warning_reasons]
        all_texts = []
        meal_slices = []
        for meal in uncached_meals:
            start_idx = len(all_texts)
            all_texts.append(meal.name)
            all_texts.append(meal.serving_description)
            all_texts.extend(meal.ingredients)
            all_texts.extend(meal.conflict.warning_reasons)
            end_idx = len(all_texts)
            meal_slices.append((meal, start_idx, end_idx))

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{SARVAM_BASE}/v1/translate",
                headers=headers,
                json={
                    "input": all_texts,
                    "source_language_code": "en-IN",
                    "target_language_code": sarvam_code,
                    "mode": "formal"
                }
            )

            if resp.status_code != 200:
                resp = await client.post(
                    f"{SARVAM_BASE}/v1/translate",
                    headers=headers,
                    json={
                        "texts": all_texts,
                        "target_language_code": sarvam_code
                    }
                )

            if resp.status_code != 200:
                print(f"[MealTranslator] Sarvam HTTP {resp.status_code}: {resp.text[:150]}")
                return None

            data = resp.json()
            translations = data.get("translations") or data.get("translated_texts")
            if not isinstance(translations, list) or len(translations) != len(all_texts):
                print(f"[MealTranslator] Sarvam returned invalid translations count")
                return None

        # Reconstruct structured items
        results = []
        for meal, s_idx, e_idx in meal_slices:
            slice_texts = translations[s_idx:e_idx]
            trans_name = slice_texts[0]
            trans_desc = slice_texts[1]
            ing_len = len(meal.ingredients)
            trans_ing = slice_texts[2 : 2 + ing_len]
            trans_warn = slice_texts[2 + ing_len :]

            raw_item = {
                "original_id": meal.meal_id,
                "translated_name": trans_name,
                "translated_serving_description": trans_desc,
                "translated_ingredients": trans_ing,
                "translated_warning_reasons": trans_warn
            }

            valid, err = validate_translated_item(meal, raw_item)
            if not valid:
                print(f"[MealTranslator] Sarvam output validation failed for {meal.meal_id}: {err}")
                return None

            results.append(raw_item)

        print(f"[MealTranslator] provider=sarvam status=success uncached_count={len(uncached_meals)}")
        return results

    except Exception as e:
        print(f"[MealTranslator] Sarvam translate error: {e}")
        return None


async def call_gemini_fallback(
    uncached_meals: List[MealPlanItem],
    target_lang: str
) -> Optional[List[Dict[str, Any]]]:
    """
    Calls Gemini 2.5 Flash to translate uncached meals with strict JSON schema.
    """
    gemini_key = os.getenv("GEMINI_API_KEY", "")
    if not gemini_key:
        print("[MealTranslator] GEMINI_API_KEY not configured. Skipping Gemini.")
        return None

    lang_name = LANGUAGE_NAMES.get(target_lang, target_lang)

    items_to_translate = []
    for m in uncached_meals:
        items_to_translate.append({
            "original_id": m.meal_id,
            "name": m.name,
            "serving_description": m.serving_description,
            "ingredients": m.ingredients,
            "warning_reasons": m.conflict.warning_reasons
        })

    prompt = f"""You are a certified professional localization translator specializing in Indian languages and nutrition science.
Translate the following meal items to {lang_name} ({target_lang}).

STRICT INVARIANTS:
1. Translate ONLY presentation strings (name, serving_description, ingredients, warning_reasons) naturally for native speakers.
2. DO NOT modify, translate, or remove INS additive codes (e.g. INS 330, INS 627, INS-330). They MUST remain exact uppercase ASCII tokens like "INS 330".
3. DO NOT translate, change, or remove numeric quantities, units, serving multipliers, or caloric values (e.g. "1.5", "320 kcal", "25 g", "1.2x").
4. Maintain the EXACT order and count of ingredients and warning reasons.
5. Return a strict JSON array of objects with the exact schema:
[
  {{
    "original_id": "string (matching input original_id exactly)",
    "translated_name": "string in {lang_name}",
    "translated_serving_description": "string in {lang_name}",
    "translated_ingredients": ["list of strings in {lang_name}"],
    "translated_warning_reasons": ["list of strings in {lang_name}"]
  }}
]
DO NOT return markdown code fences. Return ONLY the raw JSON array.

Input items:
{json.dumps(items_to_translate, ensure_ascii=False, indent=2)}
"""

    # Attempt 1: Gemini REST API (gemini-2.5-flash)
    for model_name in ["gemini-2.5-flash", "gemini-2.0-flash"]:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={gemini_key}"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.1,
                "response_mime_type": "application/json"
            }
        }
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
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
                            if isinstance(parsed, list) and len(parsed) == len(uncached_meals):
                                valid_all = True
                                validated_results = []
                                for orig_meal, trans_item in zip(uncached_meals, parsed):
                                    is_valid, err = validate_translated_item(orig_meal, trans_item)
                                    if not is_valid:
                                        print(f"[MealTranslator] Gemini item validation error: {err}")
                                        valid_all = False
                                        break
                                    validated_results.append(trans_item)

                                if valid_all:
                                    print(f"[MealTranslator] provider=gemini ({model_name}) status=success uncached_count={len(uncached_meals)}")
                                    return validated_results
                else:
                    print(f"[MealTranslator] Gemini REST HTTP {resp.status_code}: {resp.text[:150]}")
        except Exception as e:
            print(f"[MealTranslator] Gemini REST error ({model_name}): {e}")

    # Attempt 2: google.genai SDK Fallback
    try:
        from google import genai
        gemini_client = genai.Client(
            api_key=gemini_key,
            http_options={"api_version": "v1beta"}
        )
        loop = asyncio.get_event_loop()

        def call_sdk():
            return gemini_client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt
            )

        sdk_resp = await loop.run_in_executor(None, call_sdk)
        if sdk_resp and sdk_resp.text:
            cleaned = sdk_resp.text.strip()
            if cleaned.startswith("```"):
                cleaned = re.sub(r"^```[a-z]*\s*", "", cleaned)
                cleaned = re.sub(r"\s*```$", "", cleaned)
            parsed = json.loads(cleaned)
            if isinstance(parsed, list) and len(parsed) == len(uncached_meals):
                validated_results = []
                for orig_meal, trans_item in zip(uncached_meals, parsed):
                    is_valid, err = validate_translated_item(orig_meal, trans_item)
                    if not is_valid:
                        return None
                    validated_results.append(trans_item)
                print(f"[MealTranslator] provider=gemini (SDK) status=success uncached_count={len(uncached_meals)}")
                return validated_results
    except Exception as e:
        print(f"[MealTranslator] Gemini SDK fallback error: {e}")

    return None


async def translate_meals(
    meals: List[MealPlanItem],
    language: MealLanguage,
    translations_col: Any = None,
    user_tier: str = "free"
) -> MealTranslationResponse:
    """
    Main orchestration entry point:
    1. Validates language.
    2. Identity translation if 'en'.
    3. Checks MongoDB cache.
    4. Separates cached vs. uncached.
    5. Translates uncached via Sarvam (if Pro/Elite) -> Gemini fallback.
    6. Validates and caches new translations in MongoDB.
    7. Assembles and returns structured response in original order.
    """
    if language not in SUPPORTED_MEAL_LANGUAGES:
        raise ValueError(f"Unsupported language code: {language}")

    # Case 1: English requested -> Identity translation
    if language == "en":
        en_items = [
            TranslatedMealItem(
                original_id=m.meal_id,
                translated_name=m.name,
                translated_serving_description=m.serving_description,
                translated_ingredients=m.ingredients,
                translated_warning_reasons=m.conflict.warning_reasons
            )
            for m in meals
        ]
        return MealTranslationResponse(language=language, translations=en_items)

    # Compute content hashes
    meal_hashes: Dict[str, str] = {
        m.meal_id: compute_content_hash(m.name, m.serving_description, m.ingredients, m.conflict.warning_reasons)
        for m in meals
    }

    cached_map: Dict[str, TranslatedMealItem] = {}
    uncached_meals: List[MealPlanItem] = []

    # Step 2: Cache lookup
    if translations_col is not None:
        meal_ids = [m.meal_id for m in meals]
        try:
            cursor = translations_col.find({
                "meal_id": {"$in": meal_ids},
                "language_code": language,
                "translation_version": 1
            })
            cached_docs = await cursor.to_list(length=len(meal_ids))
            doc_map = {doc["meal_id"]: doc for doc in cached_docs}

            for meal in meals:
                cached_doc = doc_map.get(meal.meal_id)
                current_hash = meal_hashes[meal.meal_id]
                # Validate source_content_hash to prevent stale cache
                if cached_doc and cached_doc.get("source_content_hash") == current_hash:
                    cached_map[meal.meal_id] = TranslatedMealItem(
                        original_id=meal.meal_id,
                        translated_name=cached_doc["translated_name"],
                        translated_serving_description=cached_doc["translated_serving_description"],
                        translated_ingredients=cached_doc["translated_ingredients"],
                        translated_warning_reasons=cached_doc.get("translated_warning_reasons", [])
                    )
                else:
                    uncached_meals.append(meal)
        except Exception as e:
            print(f"[MealTranslator] Cache lookup error: {e}. Falling back to uncached.")
            uncached_meals = list(meals)
    else:
        uncached_meals = list(meals)

    print(f"[MealTranslator] cache_hit language={language} cached_count={len(cached_map)} uncached_count={len(uncached_meals)}")

    # Step 3: Translate uncached meals
    if uncached_meals:
        translated_results: Optional[List[Dict[str, Any]]] = None

        # Provider routing:
        # If user tier is elite/pro/premium or SARVAM_API_KEY is available, try Sarvam first
        if user_tier in ["elite", "pro", "premium"] or os.getenv("SARVAM_API_KEY"):
            translated_results = await call_sarvam_batch(uncached_meals, language)
            if not translated_results:
                print(f"[MealTranslator] fallback provider=gemini reason=sarvam_unavailable_or_failed")

        # Fallback to Gemini 2.5 Flash
        if not translated_results:
            translated_results = await call_gemini_fallback(uncached_meals, language)

        # Step 4: Cache storage and result aggregation
        if translated_results:
            for meal, res in zip(uncached_meals, translated_results):
                item = TranslatedMealItem(
                    original_id=meal.meal_id,
                    translated_name=res["translated_name"],
                    translated_serving_description=res["translated_serving_description"],
                    translated_ingredients=res["translated_ingredients"],
                    translated_warning_reasons=res["translated_warning_reasons"]
                )
                cached_map[meal.meal_id] = item

                # Persist to MongoDB
                if translations_col is not None:
                    try:
                        hash_val = meal_hashes[meal.meal_id]
                        await translations_col.update_one(
                            {
                                "meal_id": meal.meal_id,
                                "language_code": language,
                                "translation_version": 1
                            },
                            {
                                "$set": {
                                    "meal_id": meal.meal_id,
                                    "language_code": language,
                                    "translation_version": 1,
                                    "source_content_hash": hash_val,
                                    "translated_name": res["translated_name"],
                                    "translated_serving_description": res["translated_serving_description"],
                                    "translated_ingredients": res["translated_ingredients"],
                                    "translated_warning_reasons": res["translated_warning_reasons"],
                                    "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
                                },
                                "$setOnInsert": {
                                    "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
                                }
                            },
                            upsert=True
                        )
                    except Exception as ce:
                        print(f"[MealTranslator] Cache write failure for {meal.meal_id}: {ce}")
        else:
            # Controlled fallback: if both providers failed, preserve canonical English presentation
            print(f"[MealTranslator] Both providers failed. Falling back to canonical English display for uncached.")
            for meal in uncached_meals:
                cached_map[meal.meal_id] = TranslatedMealItem(
                    original_id=meal.meal_id,
                    translated_name=meal.name,
                    translated_serving_description=meal.serving_description,
                    translated_ingredients=meal.ingredients,
                    translated_warning_reasons=meal.conflict.warning_reasons
                )

    # Assemble results in exact original meal order
    ordered_translations: List[TranslatedMealItem] = []
    for m in meals:
        ordered_translations.append(cached_map[m.meal_id])

    return MealTranslationResponse(
        language=language,
        translations=ordered_translations
    )
