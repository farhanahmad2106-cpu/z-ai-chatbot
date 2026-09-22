export interface IngredientItemInput {
  name: string;
  quantity_grams: number;
}

export interface CustomMealCreateRequest {
  name: string;
  meal_type: "breakfast" | "lunch" | "snack" | "dinner";
  servings: number;
  ingredients: IngredientItemInput[];
  cooking_method?: string;
  include_in_planner: boolean;
  log_to_today: boolean;
}

export interface MacroNutrients {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  sodium_mg: number;
  added_sugar_g: number;
}

export interface AnalyzedIngredientDetail {
  name: string;
  quantity_grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  sodium_mg: number;
  added_sugar_g: number;
  allergen_tags: string[];
  provenance: string;
}

export interface CustomMealResponse {
  id: string;
  user_id: string;
  name: string;
  meal_type: "breakfast" | "lunch" | "snack" | "dinner";
  servings: number;
  cooking_method?: string;
  total_nutrition: MacroNutrients;
  per_serving_nutrition: MacroNutrients;
  ingredients: AnalyzedIngredientDetail[];
  safety_score: number;
  safety_tier: "SAFE" | "MODERATE" | "CRITICAL";
  detected_allergens: string[];
  clinical_conflicts: string[];
  warnings: string[];
  planner_eligible: boolean;
  nutrition_provenance: Record<string, string>;
  created_at: string;
}
