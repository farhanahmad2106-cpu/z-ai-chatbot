"""
Z-SeHealth Custom Recipe & Home-Cooked Meal Clinical Analyzer
Computes deterministic multi-serving nutritional breakdown, screens against
Health Vault clinical rules (hypertension, diabetes), detects allergens, and
scores recipe safety.
"""

from typing import Dict, Any, List, Tuple
try:
    from schemas.custom_meal import (
        CustomMealCreateRequest,
        MacroNutrients,
        AnalyzedIngredientDetail,
    )
    from services.nutrition_lookup import resolve_ingredient_nutrition, normalize_ingredient_name
    from services.meal_planner.rules import INGREDIENT_ALIASES, MEDICAL_NUTRITION_RULES
    from services.meal_planner.conflict_analyzer import analyze_meal_conflict, normalize_ingredients
except ImportError:
    from backend.schemas.custom_meal import (
        CustomMealCreateRequest,
        MacroNutrients,
        AnalyzedIngredientDetail,
    )
    from backend.services.nutrition_lookup import resolve_ingredient_nutrition, normalize_ingredient_name
    from backend.services.meal_planner.rules import INGREDIENT_ALIASES, MEDICAL_NUTRITION_RULES
    from backend.services.meal_planner.conflict_analyzer import analyze_meal_conflict, normalize_ingredients



async def analyze_custom_recipe(
    request: CustomMealCreateRequest,
    user_health_vault: Dict[str, Any],
    user_preferences: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Deterministically analyzes custom recipe ingredients:
    1. Resolves each ingredient against local DB / Gemini fallback.
    2. Computes total and per-serving macronutrients (calories, protein, carbs, fat, sodium, added sugar).
    3. Screens against declared allergies in user profile.
    4. Evaluates against Health Vault clinical conditions (Hypertension, Diabetes, CVD, Kidney).
    5. Calculates deterministic safety score (0-100), safety tier, and planner eligibility.
    """
    analyzed_ingredients: List[AnalyzedIngredientDetail] = []
    nutrition_provenance: Dict[str, str] = {}
    all_allergen_tags: List[str] = []
    has_refined_flour = False

    # 1. Resolve each ingredient
    for item in request.ingredients:
        nutr_data, provenance = await resolve_ingredient_nutrition(item.name)
        if not nutr_data:
            raise ValueError(
                f"Unable to verify nutritional safety for ingredient: '{item.name}'. "
                "Please check the spelling or specify a known Indian ingredient or staple."
            )

        scale = item.quantity_grams / 100.0
        cals = round(nutr_data["calories"] * scale, 1)
        prot = round(nutr_data["protein_g"] * scale, 1)
        carbs = round(nutr_data["carbs_g"] * scale, 1)
        fat = round(nutr_data["fat_g"] * scale, 1)
        sodium = round(nutr_data["sodium_mg"] * scale, 1)
        sugar = round(nutr_data.get("added_sugar_g", 0.0) * scale, 1)
        tags = nutr_data.get("allergen_tags", [])
        if nutr_data.get("refined_flour", False):
            has_refined_flour = True

        analyzed_detail = AnalyzedIngredientDetail(
            name=nutr_data.get("name", item.name.title()),
            quantity_grams=item.quantity_grams,
            calories=cals,
            protein_g=prot,
            carbs_g=carbs,
            fat_g=fat,
            sodium_mg=sodium,
            added_sugar_g=sugar,
            allergen_tags=tags,
            provenance=provenance
        )
        analyzed_ingredients.append(analyzed_detail)
        nutrition_provenance[item.name] = provenance
        all_allergen_tags.extend([t.lower() for t in tags])

    # 2. Total & Per-Serving Nutrition
    servings = max(1, request.servings)
    total_cals = round(sum(i.calories for i in analyzed_ingredients), 1)
    total_prot = round(sum(i.protein_g for i in analyzed_ingredients), 1)
    total_carbs = round(sum(i.carbs_g for i in analyzed_ingredients), 1)
    total_fat = round(sum(i.fat_g for i in analyzed_ingredients), 1)
    total_sodium = round(sum(i.sodium_mg for i in analyzed_ingredients), 1)
    total_sugar = round(sum(i.added_sugar_g for i in analyzed_ingredients), 1)

    total_nutrition = MacroNutrients(
        calories=total_cals,
        protein_g=total_prot,
        carbs_g=total_carbs,
        fat_g=total_fat,
        sodium_mg=total_sodium,
        added_sugar_g=total_sugar
    )

    per_serving_nutrition = MacroNutrients(
        calories=round(total_cals / servings, 1),
        protein_g=round(total_prot / servings, 1),
        carbs_g=round(total_carbs / servings, 1),
        fat_g=round(total_fat / servings, 1),
        sodium_mg=round(total_sodium / servings, 1),
        added_sugar_g=round(total_sugar / servings, 1)
    )

    # 3. Dietary tags derivation
    non_veg_indicators = ["chicken", "mutton", "lamb", "fish", "egg", "beef", "pork", "seafood", "prawn", "crab"]
    is_non_veg = any(
        any(nv in i.name.lower() or nv in " ".join(i.allergen_tags).lower() for nv in non_veg_indicators)
        for i in analyzed_ingredients
    )
    dietary_tags = []
    if not is_non_veg:
        dietary_tags.append("vegetarian")
        # Check if dairy is present for vegan tag
        has_dairy = any("dairy" in i.allergen_tags or "milk" in i.name.lower() or "paneer" in i.name.lower() or "ghee" in i.name.lower() for i in analyzed_ingredients)
        if not has_dairy:
            dietary_tags.append("vegan")

    # 4. Conflict Analysis with Z-SeHealth Clinical Engine
    simulated_meal = {
        "name": request.name,
        "meal_type": request.meal_type,
        "calories": per_serving_nutrition.calories,
        "protein_g": per_serving_nutrition.protein_g,
        "carbs_g": per_serving_nutrition.carbs_g,
        "fat_g": per_serving_nutrition.fat_g,
        "sodium_mg": per_serving_nutrition.sodium_mg,
        "added_sugar_g": per_serving_nutrition.added_sugar_g,
        "allergen_tags": list(set(all_allergen_tags)),
        "dietary_tags": dietary_tags,
        "ingredients": [i.name for i in request.ingredients]
    }

    conflict_res = analyze_meal_conflict(
        meal=simulated_meal,
        health_vault=user_health_vault,
        preferences=user_preferences
    )

    detected_allergens: List[str] = []
    clinical_conflicts: List[str] = []
    warnings: List[str] = []
    
    # Extract user allergies safely
    raw_allergies = user_preferences.get("allergies", [])
    if isinstance(raw_allergies, str):
        user_allergies = [a.strip().lower() for a in raw_allergies.split(",") if a.strip()]
    else:
        user_allergies = [str(a).strip().lower() for a in raw_allergies if str(a).strip()]

    # Extract user conditions safely
    conditions_str = ""
    if "medicalConditions" in user_health_vault:
        conditions_str += " " + str(user_health_vault["medicalConditions"])
    if "chronic_conditions" in user_health_vault:
        val = user_health_vault["chronic_conditions"]
        if isinstance(val, list):
            conditions_str += " " + " ".join(val)
        else:
            conditions_str += " " + str(val)
    conditions_lower = conditions_str.lower()

    # Allergen screening
    for allergy in user_allergies:
        allergy_norm = INGREDIENT_ALIASES.get(allergy, allergy)
        for ing in analyzed_ingredients:
            ing_lower = ing.name.lower()
            ing_tags = [t.lower() for t in ing.allergen_tags]
            
            is_match = (
                allergy in ing_lower or
                allergy_norm in ing_lower or
                allergy in ing_tags or
                allergy_norm in ing_tags
            )
            if is_match:
                if allergy not in detected_allergens:
                    detected_allergens.append(allergy)
                msg = f"Contains allergen '{allergy}' matching ingredient '{ing.name}'."
                if msg not in clinical_conflicts:
                    clinical_conflicts.append(msg)

    # Health Vault Screening: Hypertension
    if "hypertension" in conditions_lower:
        serv_sod = per_serving_nutrition.sodium_mg
        if serv_sod > MEDICAL_NUTRITION_RULES["hypertension"]["sodium_threshold_mg_critical"]:
            conflict_msg = f"Critical Sodium Alert: {serv_sod}mg per serving exceeds the 800mg critical limit for hypertension."
            if conflict_msg not in clinical_conflicts:
                clinical_conflicts.append(conflict_msg)
        elif serv_sod > MEDICAL_NUTRITION_RULES["hypertension"]["sodium_threshold_mg_moderate"]:
            warn_msg = f"Moderate Sodium Warning: {serv_sod}mg per serving exceeds the 500mg guideline for hypertension."
            if warn_msg not in warnings:
                warnings.append(warn_msg)

    # Health Vault Screening: Diabetes
    if "diabetes" in conditions_lower:
        serv_sugar = per_serving_nutrition.added_sugar_g
        if serv_sugar > MEDICAL_NUTRITION_RULES["diabetes"]["max_added_sugar_g"]:
            warn_msg = f"High Added Sugar: {serv_sugar}g per serving exceeds the 5g guideline for diabetes."
            if warn_msg not in warnings:
                warnings.append(warn_msg)
        if has_refined_flour or any("maida" in i.name.lower() for i in request.ingredients):
            warn_msg = "Contains refined flour (maida), which can cause rapid blood glucose spikes in diabetic individuals."
            if warn_msg not in warnings:
                warnings.append(warn_msg)

    # Merge warnings from conflict_analyzer
    for w in conflict_res.get("warning_reasons", []):
        if "allergen" in w.lower() or "critical" in w.lower():
            if w not in clinical_conflicts:
                clinical_conflicts.append(w)
        else:
            if w not in warnings:
                warnings.append(w)

    # Determine Safety Tier & Score
    if detected_allergens or clinical_conflicts or conflict_res.get("conflict_severity") == "critical":
        safety_tier = "CRITICAL"
        planner_eligible = False
        safety_score = min(int(conflict_res.get("safety_score", 0)), 40)
    elif warnings or conflict_res.get("conflict_severity") == "moderate":
        safety_tier = "MODERATE"
        planner_eligible = request.include_in_planner
        safety_score = max(50, min(int(conflict_res.get("safety_score", 70)), 85))
    else:
        safety_tier = "SAFE"
        planner_eligible = request.include_in_planner
        safety_score = max(90, int(conflict_res.get("safety_score", 100)))

    return {
        "name": request.name,
        "meal_type": request.meal_type,
        "servings": servings,
        "cooking_method": request.cooking_method,
        "total_nutrition": total_nutrition,
        "per_serving_nutrition": per_serving_nutrition,
        "ingredients": analyzed_ingredients,
        "safety_score": safety_score,
        "safety_tier": safety_tier,
        "detected_allergens": detected_allergens,
        "clinical_conflicts": clinical_conflicts,
        "warnings": warnings,
        "planner_eligible": planner_eligible,
        "nutrition_provenance": nutrition_provenance,
    }
