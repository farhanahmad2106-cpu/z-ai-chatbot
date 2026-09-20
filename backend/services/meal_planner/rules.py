# backend/services/meal_planner/rules.py

MEDICAL_NUTRITION_RULES = {
    "diabetes": {
        "max_added_sugar_g": 5,      # Above this -> moderate or critical
        "refined_flour_allowed": False,
        "max_carbs_per_meal_g": 60,  # Just an example heuristic
    },
    "hypertension": {
        "sodium_threshold_mg_moderate": 500,
        "sodium_threshold_mg_critical": 800,
    },
    "cvd": {
        "saturated_fat_threshold_g": 5,
        "max_added_sugar_g": 5,
        "sodium_threshold_mg_moderate": 600,
    },
    "kidney_disease": {
        # Kidney disease is complex; we flag it as requiring caution rather than 
        # prescribing universal potassium/protein limits.
        "requires_caution": True,
    }
}

DIETARY_RULES = {
    "vegetarian": {
        "forbidden_tags": ["meat", "poultry", "fish", "shellfish"]
    },
    "vegan": {
        "forbidden_tags": ["meat", "poultry", "fish", "shellfish", "dairy", "eggs", "honey"]
    },
    "halal": {
        "forbidden_tags": ["non_halal", "pork", "alcohol"]
    },
    "keto": {
        # Configurable heuristic for keto meals
        "max_carbs_per_meal_g": 15
    }
}

# Standardized aliases to normalize ingredient names before checking allergens
INGREDIENT_ALIASES = {
    "maida": "refined wheat flour",
    "wheat flour": "wheat",
    "atta": "wheat",
    "suji": "semolina",
    "rava": "semolina",
    "barley": "barley",
    "milk": "dairy",
    "paneer": "dairy",
    "cheese": "dairy",
    "yogurt": "dairy",
    "curd": "dairy",
    "butter": "dairy",
    "ghee": "dairy",
    "soy sauce": "soy",
    "tofu": "soy",
    "peanut": "peanuts",
    "groundnut": "peanuts",
    "cashew": "tree_nuts",
    "almond": "tree_nuts",
    "walnut": "tree_nuts",
    "egg": "eggs"
}
