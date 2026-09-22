# backend/services/meal_planner/grocery_generator.py
from typing import Dict, Any, List, Tuple
from collections import defaultdict
from .meal_repository import get_meal_by_id

ORDERED_CATEGORIES = [
    "Produce",
    "Grains & Flours",
    "Pulses & Legumes",
    "Dairy & Plant Alternatives",
    "Spices & Pantry",
    "Other"
]

INGREDIENT_CANONICAL_NAMES = {
    "jowar": "Jowar Flour",
    "jowar flour": "Jowar Flour",
    "sorghum flour": "Jowar Flour",
    "bajra": "Bajra Flour",
    "bajra flour": "Bajra Flour",
    "besan": "Besan (Gram Flour)",
    "gram flour": "Besan (Gram Flour)",
    "besan (gram flour)": "Besan (Gram Flour)",
    "ragi": "Ragi Flour",
    "ragi flour": "Ragi Flour",
    "brown rice": "Brown Rice",
    "quinoa": "Quinoa",
    "rice": "Rice",
    "wheat": "Whole Wheat Flour",
    "whole wheat flour": "Whole Wheat Flour",
    "maida": "Maida (Refined Wheat Flour)",
    "maida (refined wheat flour)": "Maida (Refined Wheat Flour)",
    "kidney beans": "Kidney Beans (Rajma)",
    "kidney beans (rajma)": "Kidney Beans (Rajma)",
    "rajma": "Kidney Beans (Rajma)",
    "chickpeas": "Chickpeas (Chana)",
    "chickpeas (chana)": "Chickpeas (Chana)",
    "chana": "Chickpeas (Chana)",
    "chana dal": "Chana Dal",
    "moong dal": "Moong Dal",
    "yellow moong dal": "Yellow Moong Dal",
    "urad dal": "Urad Dal",
    "toor dal": "Toor Dal",
    "kala chana": "Kala Chana",
    "mung bean sprouts": "Mung Bean Sprouts",
    "paneer": "Paneer",
    "tofu": "Tofu",
    "ghee": "Ghee",
    "butter": "Butter",
    "cream": "Fresh Cream",
    "fresh cream": "Fresh Cream",
    "spinach": "Spinach (Palak)",
    "spinach (palak)": "Spinach (Palak)",
    "tomato": "Tomato",
    "onion": "Onion",
    "cucumber": "Cucumber",
    "broccoli": "Broccoli",
    "eggplant": "Eggplant (Baingan)",
    "bottle gourd": "Bottle Gourd (Lauki)",
    "bottle gourd (lauki)": "Bottle Gourd (Lauki)",
    "carrot": "Carrot",
    "green peas": "Green Peas",
    "green beans": "Green Beans",
    "bell peppers": "Bell Peppers",
    "avocado": "Avocado",
    "drumstick": "Drumstick",
    "lemon juice": "Lemon Juice",
    "fresh mint": "Fresh Mint",
    "fresh coriander": "Fresh Coriander",
    "green chilli": "Green Chilli",
    "ginger": "Ginger",
    "garlic": "Garlic",
    "curry leaves": "Curry Leaves",
    "grated coconut": "Grated Coconut",
    "salt": "Salt",
    "rock salt": "Rock Salt",
    "black pepper": "Black Pepper",
    "cumin": "Cumin Seeds",
    "mustard seeds": "Mustard Seeds",
    "turmeric": "Turmeric Powder",
    "chaat masala": "Chaat Masala",
    "mixed spices": "Mixed Spices",
    "cooking oil": "Cooking Oil",
    "olive oil": "Olive Oil",
    "mustard oil": "Mustard Oil",
    "soy sauce": "Soy Sauce",
    "jaggery": "Jaggery",
    "peanuts": "Peanuts",
    "foxnuts (makhana)": "Foxnuts (Makhana)",
    "foxnuts": "Foxnuts (Makhana)",
    "chicken breast": "Chicken Breast",
    "fish fillet": "Fish Fillet",
    "eggs": "Eggs",
    "egg white": "Egg Whites"
}

def normalize_ingredient_name(raw_name: str) -> str:
    cleaned = raw_name.strip()
    lower = cleaned.lower()
    return INGREDIENT_CANONICAL_NAMES.get(lower, cleaned.title())

def generate_grocery_list_from_plan(plan: Dict[str, Any]) -> Dict[str, Any]:
    """
    Compiles ingredients across all 7 days × 4 slots = 28 planned meals.
    Scales base quantities by each meal's serving multiplier, aggregates
    compatible units safely, and groups into deterministic categories.
    """
    # Key: (category, canonical_name, unit) -> total_quantity
    aggregated_items: Dict[Tuple[str, str, str], float] = defaultdict(float)

    days = plan.get("days", [])
    for day in days:
        meals = day.get("meals", [])
        for meal in meals:
            serving_mult = float(meal.get("servings", 1.0))
            ing_details = meal.get("ingredient_details")

            # Fallback to meal repository if details not directly embedded
            if not ing_details:
                base_repo_meal = get_meal_by_id(meal.get("meal_id", ""))
                if base_repo_meal:
                    ing_details = base_repo_meal.get("ingredient_details", [])

            if ing_details:
                for item in ing_details:
                    raw_name = item.get("name", "Unknown Item")
                    base_qty = float(item.get("quantity", 0.0))
                    unit = item.get("unit", "g").strip()
                    category = item.get("category", "Other").strip()
                    if category not in ORDERED_CATEGORIES:
                        category = "Other"

                    canonical_name = normalize_ingredient_name(raw_name)
                    scaled_qty = base_qty * serving_mult
                    aggregated_items[(category, canonical_name, unit)] += scaled_qty
            else:
                # String fallback
                for raw_str in meal.get("ingredients", []):
                    canonical_name = normalize_ingredient_name(raw_str)
                    aggregated_items[("Other", canonical_name, "units")] += 1.0 * serving_mult

    # Group into categories
    category_map: Dict[str, List[Dict[str, Any]]] = {c: [] for c in ORDERED_CATEGORIES}
    total_distinct_items = 0

    for (category, name, unit), qty in sorted(aggregated_items.items(), key=lambda x: (x[0][0], x[0][1])):
        total_distinct_items += 1
        category_map[category].append({
            "name": name,
            "quantity": round(qty, 1),
            "unit": unit
        })

    # Build response categories array, only including non-empty categories
    categories_output = []
    for c_name in ORDERED_CATEGORIES:
        items = category_map[c_name]
        if items:
            categories_output.append({
                "name": c_name,
                "items": items
            })

    return {
        "plan_id": plan.get("plan_id", ""),
        "week_id": plan.get("week_id", ""),
        "week_start": plan.get("week_start", ""),
        "week_end": plan.get("week_end", ""),
        "categories": categories_output,
        "total_items": total_distinct_items
    }
