# backend/services/meal_planner/conflict_analyzer.py
from typing import Dict, Any, List
from .rules import MEDICAL_NUTRITION_RULES, DIETARY_RULES, INGREDIENT_ALIASES

def normalize_ingredients(ingredients: List[str]) -> List[str]:
    normalized = []
    for ing in ingredients:
        lower_ing = ing.lower().strip()
        matched = False
        for alias, standard in INGREDIENT_ALIASES.items():
            if alias in lower_ing:
                normalized.append(standard)
                matched = True
        if not matched:
            normalized.append(lower_ing)
    return normalized

def analyze_meal_conflict(meal: Dict[str, Any], health_vault: Dict[str, Any], preferences: Dict[str, Any]) -> Dict[str, Any]:
    rule_results = []
    warning_reasons = []
    conflict_severity = "none"
    is_safe = True
    penalties = 0

    user_allergies = [a.lower() for a in preferences.get("allergies", [])]
    user_diet = preferences.get("diet", "None").lower()
    user_conditions = health_vault.get("medicalConditions", "").lower()
    
    meal_allergens = [a.lower() for a in meal.get("allergen_tags", [])]
    meal_tags = [t.lower() for t in meal.get("dietary_tags", [])]
    meal_ingredients = [i.lower() for i in meal.get("ingredients", [])]
    meal_ingredients_norm = normalize_ingredients(meal_ingredients)
    
    # 1. ALLERGENS (Hard Exclusion - CRITICAL)
    for allergy in user_allergies:
        allergy_norm = INGREDIENT_ALIASES.get(allergy, allergy)
        # Check explicit allergen tags
        if allergy_norm in meal_allergens or allergy in meal_allergens:
            is_safe = False
            conflict_severity = "critical"
            msg = f"Contains allergen: {allergy}"
            warning_reasons.append(msg)
            rule_results.append({
                "rule_id": f"ALLERGEN_{allergy.upper()}",
                "category": "allergen",
                "severity": "critical",
                "message": msg
            })
            penalties += 100
            
        # Check normalized ingredients
        elif any(allergy_norm in ing or allergy in ing for ing in meal_ingredients_norm):
            is_safe = False
            conflict_severity = "critical"
            msg = f"Ingredient match for allergen: {allergy}"
            if msg not in warning_reasons:
                warning_reasons.append(msg)
                rule_results.append({
                    "rule_id": f"ALLERGEN_ING_{allergy.upper()}",
                    "category": "allergen",
                    "severity": "critical",
                    "message": msg
                })
                penalties += 100

    # 2. DIETARY PREFERENCES (Hard Exclusion - CRITICAL)
    if user_diet and user_diet != "none" and user_diet in DIETARY_RULES:
        diet_rules = DIETARY_RULES[user_diet]
        forbidden = diet_rules.get("forbidden_tags", [])
        
        # If meal lacks the required tag, it's a conflict
        if user_diet not in meal_tags:
            is_safe = False
            conflict_severity = "critical"
            msg = f"Does not meet {user_diet} dietary preference."
            warning_reasons.append(msg)
            rule_results.append({
                "rule_id": f"DIET_{user_diet.upper()}",
                "category": "diet",
                "severity": "critical",
                "message": msg
            })
            penalties += 100

    # 3. MEDICAL CONDITIONS (Moderate / Rules-based)
    # DIABETES
    if "diabetes" in user_conditions:
        diab_rules = MEDICAL_NUTRITION_RULES["diabetes"]
        sugar = meal.get("added_sugar_g", 0)
        carbs = meal.get("carbs_g", 0)
        if sugar > diab_rules["max_added_sugar_g"]:
            if conflict_severity != "critical":
                conflict_severity = "moderate"
            msg = "High added sugar for diabetic profile."
            warning_reasons.append(msg)
            rule_results.append({
                "rule_id": "DIABETES_HIGH_SUGAR",
                "category": "medical",
                "severity": "moderate",
                "message": msg,
                "observed_value": float(sugar),
                "threshold": float(diab_rules["max_added_sugar_g"]),
                "unit": "g"
            })
            penalties += 20
            
        if diab_rules["refined_flour_allowed"] == False:
            if any("refined wheat flour" in ing for ing in meal_ingredients_norm):
                if conflict_severity != "critical":
                    conflict_severity = "moderate"
                msg = "Contains refined flour, limiting for diabetic profile."
                warning_reasons.append(msg)
                rule_results.append({
                    "rule_id": "DIABETES_REFINED_FLOUR",
                    "category": "medical",
                    "severity": "moderate",
                    "message": msg
                })
                penalties += 20

    # HYPERTENSION
    if "hypertension" in user_conditions:
        hyp_rules = MEDICAL_NUTRITION_RULES["hypertension"]
        sodium = meal.get("sodium_mg", 0)
        if sodium > hyp_rules["sodium_threshold_mg_critical"]:
            is_safe = False
            conflict_severity = "critical"
            msg = "Critically high sodium for hypertension profile."
            warning_reasons.append(msg)
            rule_results.append({
                "rule_id": "HYPERTENSION_CRITICAL_SODIUM",
                "category": "medical",
                "severity": "critical",
                "message": msg,
                "observed_value": float(sodium),
                "threshold": float(hyp_rules["sodium_threshold_mg_critical"]),
                "unit": "mg"
            })
            penalties += 100
        elif sodium > hyp_rules["sodium_threshold_mg_moderate"]:
            if conflict_severity != "critical":
                conflict_severity = "moderate"
            msg = "Moderately high sodium for hypertension profile."
            warning_reasons.append(msg)
            rule_results.append({
                "rule_id": "HYPERTENSION_MODERATE_SODIUM",
                "category": "medical",
                "severity": "moderate",
                "message": msg,
                "observed_value": float(sodium),
                "threshold": float(hyp_rules["sodium_threshold_mg_moderate"]),
                "unit": "mg"
            })
            penalties += 30

    # CVD
    if "cvd" in user_conditions:
        cvd_rules = MEDICAL_NUTRITION_RULES["cvd"]
        sodium = meal.get("sodium_mg", 0)
        sugar = meal.get("added_sugar_g", 0)
        if sodium > cvd_rules["sodium_threshold_mg_moderate"]:
            if conflict_severity != "critical":
                conflict_severity = "moderate"
            msg = "High sodium for CVD profile."
            warning_reasons.append(msg)
            rule_results.append({
                "rule_id": "CVD_HIGH_SODIUM",
                "category": "medical",
                "severity": "moderate",
                "message": msg,
                "observed_value": float(sodium),
                "threshold": float(cvd_rules["sodium_threshold_mg_moderate"]),
                "unit": "mg"
            })
            penalties += 20
        if sugar > cvd_rules["max_added_sugar_g"]:
            if conflict_severity != "critical":
                conflict_severity = "moderate"
            msg = "High added sugar for CVD profile."
            warning_reasons.append(msg)
            rule_results.append({
                "rule_id": "CVD_HIGH_SUGAR",
                "category": "medical",
                "severity": "moderate",
                "message": msg,
                "observed_value": float(sugar),
                "threshold": float(cvd_rules["max_added_sugar_g"]),
                "unit": "g"
            })
            penalties += 20
            
    # KIDNEY DISEASE
    if "kidney" in user_conditions:
        if conflict_severity != "critical":
            conflict_severity = "moderate"
        msg = "Kidney disease profile requires professional dietary monitoring."
        warning_reasons.append(msg)
        rule_results.append({
            "rule_id": "KIDNEY_CAUTION",
            "category": "medical",
            "severity": "moderate",
            "message": msg
        })
        penalties += 10

    safety_score = max(0.0, 100.0 - penalties)
    
    return {
        "is_safe": is_safe,
        "conflict_severity": conflict_severity,
        "warning_reasons": warning_reasons,
        "suggested_alternatives": [],
        "rule_results": rule_results,
        "safety_score": safety_score,
        "safety_class": conflict_severity if conflict_severity != "none" else "safe"
    }
