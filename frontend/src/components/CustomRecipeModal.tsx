import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { createCustomMeal, getUserCustomMeals, deleteCustomMeal } from "../services/customMeals";
import { CustomMealResponse, IngredientItemInput } from "../types/customMeal";
import { ConfirmModal } from "./ui/ConfirmModal";

interface CustomRecipeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRecipeSaved?: (recipe: CustomMealResponse) => void;
}

const COMMON_INGREDIENTS = [
  "Rice", "Cooked Rice", "Atta", "Maida", "Poha", "Rava", "Besan", "Oats",
  "Moong Dal", "Toor Dal", "Chana Dal", "Urad Dal", "Masoor Dal", "Rajma", "Chole",
  "Paneer", "Milk", "Curd", "Ghee", "Butter", "Tofu",
  "Onion", "Tomato", "Potato", "Spinach (Palak)", "Cauliflower (Gobi)", "Cabbage (Patta Gobi)",
  "Carrot", "Green Peas (Matar)", "Bhindi (Okra)", "Capsicum", "Ginger", "Garlic", "Green Chilli",
  "Salt", "Sugar", "Jaggery", "Mustard Oil", "Sunflower Oil", "Olive Oil",
  "Cumin Seeds (Jeera)", "Mustard Seeds (Rai)", "Turmeric (Haldi)", "Coriander Powder", "Garam Masala",
  "Peanut", "Cashew", "Almonds", "Chicken Breast", "Egg", "Fish"
];

export const CustomRecipeModal: React.FC<CustomRecipeModalProps> = ({
  isOpen,
  onClose,
  onRecipeSaved,
}) => {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<"create" | "my_recipes">("create");
  const [recipeToDelete, setRecipeToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeletingRecipe, setIsDeletingRecipe] = useState(false);

  // Form State
  const [name, setName] = useState("");
  const [mealType, setMealType] = useState<"breakfast" | "lunch" | "snack" | "dinner">("lunch");
  const [servings, setServings] = useState<number>(1);
  const [cookingMethod, setCookingMethod] = useState("");
  const [includeInPlanner, setIncludeInPlanner] = useState(true);
  const [logToToday, setLogToToday] = useState(false);
  const [ingredients, setIngredients] = useState<IngredientItemInput[]>([
    { name: "Rice", quantity_grams: 100 },
    { name: "Moong Dal", quantity_grams: 50 },
  ]);

  // Loading & Result States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [analyzedResult, setAnalyzedResult] = useState<CustomMealResponse | null>(null);

  // Saved Recipes State
  const [myRecipes, setMyRecipes] = useState<CustomMealResponse[]>([]);
  const [loadingRecipes, setLoadingRecipes] = useState(false);

  useEffect(() => {
    if (isOpen && activeTab === "my_recipes" && currentUser) {
      loadMyRecipes();
    }
  }, [isOpen, activeTab, currentUser]);

  const loadMyRecipes = async () => {
    if (!currentUser) return;
    setLoadingRecipes(true);
    try {
      const token = await currentUser.getIdToken();
      const res = await getUserCustomMeals(token);
      setMyRecipes(res);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingRecipes(false);
    }
  };

  if (!isOpen) return null;

  const handleAddIngredient = () => {
    setIngredients([...ingredients, { name: "", quantity_grams: 50 }]);
  };

  const handleRemoveIngredient = (index: number) => {
    if (ingredients.length <= 1) return;
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  const handleIngredientChange = (index: number, field: keyof IngredientItemInput, value: any) => {
    const updated = [...ingredients];
    if (field === "quantity_grams") {
      updated[index].quantity_grams = Math.max(1, parseFloat(value) || 0);
    } else {
      updated[index].name = value;
    }
    setIngredients(updated);
  };

  const handleQuickAddGrams = (index: number, delta: number) => {
    const updated = [...ingredients];
    updated[index].quantity_grams = Math.max(1, (updated[index].quantity_grams || 0) + delta);
    setIngredients(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      setErrorMessage("Please sign in to save custom recipes.");
      return;
    }
    if (!name.trim()) {
      setErrorMessage("Please enter a recipe name.");
      return;
    }
    const validIngredients = ingredients.filter((ing) => ing.name.trim() && ing.quantity_grams > 0);
    if (validIngredients.length === 0) {
      setErrorMessage("Please provide at least one ingredient with a valid weight in grams.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const token = await currentUser.getIdToken();
      const result = await createCustomMeal(token, {
        name: name.trim(),
        meal_type: mealType,
        servings,
        ingredients: validIngredients,
        cooking_method: cookingMethod.trim() || undefined,
        include_in_planner: includeInPlanner,
        log_to_today: logToToday,
      });

      setAnalyzedResult(result);
      if (onRecipeSaved) {
        onRecipeSaved(result);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to analyze and save recipe.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!recipeToDelete || !currentUser) return;
    setIsDeletingRecipe(true);
    try {
      const token = await currentUser.getIdToken();
      await deleteCustomMeal(token, recipeToDelete.id);
      setMyRecipes((prev) => prev.filter((r) => r.id !== recipeToDelete.id));
      showToast(`Recipe "${recipeToDelete.name}" deleted.`, "success");
      setRecipeToDelete(null);
    } catch (err: any) {
      showToast("Failed to delete recipe: " + (err.message || "An unexpected error occurred"), "error");
    } finally {
      setIsDeletingRecipe(false);
    }
  };

  const handleResetForm = () => {
    setName("");
    setMealType("lunch");
    setServings(1);
    setCookingMethod("");
    setIngredients([{ name: "", quantity_grams: 100 }]);
    setAnalyzedResult(null);
    setErrorMessage(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-3xl my-8 bg-[#0B0F17] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🍲</span>
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide">
                Custom Recipe & Nutrition Ingestion
              </h2>
              <p className="text-xs text-slate-400">
                Deterministic macro breakdown & clinical health vault screening
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-white/10 bg-white/[0.01]">
          <button
            onClick={() => setActiveTab("create")}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition ${
              activeTab === "create"
                ? "text-emerald-400 border-b-2 border-emerald-400 bg-emerald-500/10"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            ➕ Ingest New Recipe
          </button>
          <button
            onClick={() => setActiveTab("my_recipes")}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition ${
              activeTab === "my_recipes"
                ? "text-emerald-400 border-b-2 border-emerald-400 bg-emerald-500/10"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            📋 My Recipes ({myRecipes.length})
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-slate-200 flex-1">
          {activeTab === "create" ? (
            analyzedResult ? (
              /* Analysis Success View */
              <div className="space-y-6">
                <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                      Recipe Successfully Analyzed & Saved
                    </span>
                    <h3 className="text-xl font-black text-white">{analyzedResult.name}</h3>
                    <p className="text-xs text-slate-300 capitalize">
                      {analyzedResult.meal_type} • {analyzedResult.servings} serving(s) • {analyzedResult.cooking_method || "Home-cooked"}
                    </p>
                  </div>
                  <div className="text-right">
                    <div
                      className={`inline-block px-3 py-1 text-xs font-black rounded-md ${
                        analyzedResult.safety_tier === "SAFE"
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                          : analyzedResult.safety_tier === "MODERATE"
                          ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                          : "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                      }`}
                    >
                      {analyzedResult.safety_tier} ({analyzedResult.safety_score}/100)
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">
                      {analyzedResult.planner_eligible ? "✓ Planner Eligible" : "⚠️ Planner Excluded"}
                    </div>
                  </div>
                </div>

                {/* Warnings / Conflicts */}
                {analyzedResult.clinical_conflicts.length > 0 && (
                  <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 space-y-1">
                    <div className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                      <span>⚠️</span> Clinical Boundary Conflicts
                    </div>
                    {analyzedResult.clinical_conflicts.map((c, i) => (
                      <p key={i} className="text-xs text-rose-200 pl-5">
                        • {c}
                      </p>
                    ))}
                  </div>
                )}

                {analyzedResult.warnings.length > 0 && (
                  <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 space-y-1">
                    <div className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                      <span>⚡</span> Clinical Health Vault Warnings
                    </div>
                    {analyzedResult.warnings.map((w, i) => (
                      <p key={i} className="text-xs text-amber-200 pl-5">
                        • {w}
                      </p>
                    ))}
                  </div>
                )}

                {/* Nutrition Cards: Per Serving vs Total */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Nutritional Breakdown (Per Serving)
                    </h4>
                    <span className="text-[10px] text-slate-500">
                      Total ({analyzedResult.servings} serv): {analyzedResult.total_nutrition.calories} kcal
                    </span>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    <div className="p-3 bg-white/[0.03] border border-white/10 rounded-xl text-center">
                      <div className="text-[10px] uppercase font-bold text-slate-400">Calories</div>
                      <div className="text-base font-black text-white">
                        {analyzedResult.per_serving_nutrition.calories}
                      </div>
                      <div className="text-[9px] text-slate-500">kcal</div>
                    </div>
                    <div className="p-3 bg-white/[0.03] border border-white/10 rounded-xl text-center">
                      <div className="text-[10px] uppercase font-bold text-slate-400">Protein</div>
                      <div className="text-base font-black text-emerald-400">
                        {analyzedResult.per_serving_nutrition.protein_g}
                      </div>
                      <div className="text-[9px] text-slate-500">grams</div>
                    </div>
                    <div className="p-3 bg-white/[0.03] border border-white/10 rounded-xl text-center">
                      <div className="text-[10px] uppercase font-bold text-slate-400">Carbs</div>
                      <div className="text-base font-black text-blue-400">
                        {analyzedResult.per_serving_nutrition.carbs_g}
                      </div>
                      <div className="text-[9px] text-slate-500">grams</div>
                    </div>
                    <div className="p-3 bg-white/[0.03] border border-white/10 rounded-xl text-center">
                      <div className="text-[10px] uppercase font-bold text-slate-400">Fat</div>
                      <div className="text-base font-black text-yellow-400">
                        {analyzedResult.per_serving_nutrition.fat_g}
                      </div>
                      <div className="text-[9px] text-slate-500">grams</div>
                    </div>
                    <div className="p-3 bg-white/[0.03] border border-white/10 rounded-xl text-center">
                      <div className="text-[10px] uppercase font-bold text-slate-400">Sodium</div>
                      <div className="text-base font-black text-purple-400">
                        {analyzedResult.per_serving_nutrition.sodium_mg}
                      </div>
                      <div className="text-[9px] text-slate-500">mg</div>
                    </div>
                    <div className="p-3 bg-white/[0.03] border border-white/10 rounded-xl text-center">
                      <div className="text-[10px] uppercase font-bold text-slate-400">Sugar</div>
                      <div className="text-base font-black text-pink-400">
                        {analyzedResult.per_serving_nutrition.added_sugar_g}
                      </div>
                      <div className="text-[9px] text-slate-500">grams</div>
                    </div>
                  </div>
                </div>

                {/* Analyzed Ingredients List */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Ingredients ({analyzedResult.ingredients.length})
                  </h4>
                  <div className="divide-y divide-white/5 border border-white/10 rounded-xl overflow-hidden bg-white/[0.02]">
                    {analyzedResult.ingredients.map((ing, idx) => (
                      <div key={idx} className="p-2.5 flex items-center justify-between text-xs">
                        <div>
                          <span className="font-semibold text-white">{ing.name}</span>
                          <span className="text-slate-400 ml-2 font-mono">({ing.quantity_grams}g)</span>
                          {ing.allergen_tags.length > 0 && (
                            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400">
                              {ing.allergen_tags.join(", ")}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-slate-300">
                          <span>{ing.calories} kcal</span>
                          <span className="text-emerald-400">{ing.protein_g}p</span>
                          <span className="text-blue-400">{ing.carbs_g}c</span>
                          <span className="text-yellow-400">{ing.fat_g}f</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-slate-400">
                            {ing.provenance === "local_nutrition_db" ? "Local DB" : "AI Verified"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={handleResetForm}
                    className="px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg border border-white/20 text-white hover:bg-white/5 transition"
                  >
                    Create Another Recipe
                  </button>
                  <button
                    onClick={onClose}
                    className="px-5 py-2 text-xs font-bold uppercase tracking-wider rounded-lg bg-emerald-500 text-black hover:bg-emerald-400 transition"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              /* Create Recipe Form View */
              <form onSubmit={handleSubmit} className="space-y-5">
                {errorMessage && (
                  <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs flex items-center gap-2">
                    <span>⚠️</span>
                    <span>{errorMessage}</span>
                  </div>
                )}

                {/* Recipe Name & Meal Type */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                      Recipe Name *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Grandma's Moong Dal Tadka"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white/[0.04] border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-400 transition"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                      Meal Type
                    </label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {(["breakfast", "lunch", "snack", "dinner"] as const).map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setMealType(type)}
                          className={`py-2 text-xs font-bold capitalize rounded-lg transition ${
                            mealType === type
                              ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/20"
                              : "bg-white/[0.04] border border-white/10 text-slate-300 hover:text-white"
                          }`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Servings & Cooking Method */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                      Total Servings ({servings})
                    </label>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setServings(Math.max(1, servings - 1))}
                        className="w-9 h-9 flex items-center justify-center rounded-lg bg-white/[0.06] border border-white/10 text-white font-bold hover:bg-white/10 transition"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={servings}
                        onChange={(e) => setServings(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-20 text-center py-2 bg-white/[0.04] border border-white/10 rounded-lg text-white font-mono font-bold text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setServings(Math.min(20, servings + 1))}
                        className="w-9 h-9 flex items-center justify-center rounded-lg bg-white/[0.06] border border-white/10 text-white font-bold hover:bg-white/10 transition"
                      >
                        +
                      </button>
                      <span className="text-xs text-slate-400">
                        {servings === 1 ? "Single serving" : `Yields ${servings} equal servings`}
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                      Cooking Method (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Pressure cooked, Sauteed, Steamed"
                      value={cookingMethod}
                      onChange={(e) => setCookingMethod(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white/[0.04] border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-400 transition"
                    />
                  </div>
                </div>

                {/* Ingredients Dynamic Rows */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      Ingredients & Gram Weights *
                    </label>
                    <button
                      type="button"
                      onClick={handleAddIngredient}
                      className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition"
                    >
                      + Add Another Ingredient
                    </button>
                  </div>

                  <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                    {ingredients.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-white/[0.02] border border-white/10 rounded-xl flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
                      >
                        <div className="flex-1 relative">
                          <input
                            type="text"
                            list="ingredients-datalist"
                            placeholder="Ingredient name (e.g. Rice, Moong Dal, Salt)"
                            value={item.name}
                            onChange={(e) => handleIngredientChange(idx, "name", e.target.value)}
                            className="w-full px-3 py-1.5 bg-white/[0.04] border border-white/10 rounded-lg text-white text-xs focus:outline-none focus:border-emerald-400"
                            required
                          />
                        </div>

                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="1"
                            step="any"
                            placeholder="grams"
                            value={item.quantity_grams || ""}
                            onChange={(e) => handleIngredientChange(idx, "quantity_grams", e.target.value)}
                            className="w-20 px-2.5 py-1.5 bg-white/[0.04] border border-white/10 rounded-lg text-white text-xs text-right font-mono"
                            required
                          />
                          <span className="text-xs text-slate-400">g</span>

                          <div className="flex items-center gap-1 ml-1">
                            <button
                              type="button"
                              onClick={() => handleQuickAddGrams(idx, 10)}
                              className="px-1.5 py-1 text-[10px] rounded bg-white/[0.06] text-slate-300 hover:bg-white/10"
                            >
                              +10g
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuickAddGrams(idx, 50)}
                              className="px-1.5 py-1 text-[10px] rounded bg-white/[0.06] text-slate-300 hover:bg-white/10"
                            >
                              +50g
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveIngredient(idx)}
                            disabled={ingredients.length <= 1}
                            className={`p-1.5 rounded-lg text-xs transition ml-1 ${
                              ingredients.length <= 1
                                ? "text-slate-600 cursor-not-allowed"
                                : "text-rose-400 hover:bg-rose-500/10"
                            }`}
                            title="Remove ingredient"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <datalist id="ingredients-datalist">
                    {COMMON_INGREDIENTS.map((ing) => (
                      <option key={ing} value={ing} />
                    ))}
                  </datalist>
                </div>

                {/* Toggles */}
                <div className="p-3.5 bg-white/[0.02] border border-white/10 rounded-xl space-y-2.5">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeInPlanner}
                      onChange={(e) => setIncludeInPlanner(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-500 bg-white/10 border-white/20 focus:ring-0"
                    />
                    <div>
                      <div className="text-xs font-bold text-white">Include in Smart Meal Planner</div>
                      <div className="text-[11px] text-slate-400">
                        Eligible recipes will be considered when revolving daily and 7-day meal plans.
                      </div>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={logToToday}
                      onChange={(e) => setLogToToday(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-500 bg-white/10 border-white/20 focus:ring-0"
                    />
                    <div>
                      <div className="text-xs font-bold text-white">Log to Today's Nutrition Diary</div>
                      <div className="text-[11px] text-slate-400">
                        Immediately add 1 serving of this recipe to your daily macro dashboard tracker.
                      </div>
                    </div>
                  </label>
                </div>

                {/* Submit Action */}
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl border border-white/10 text-slate-300 hover:bg-white/5 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-6 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl bg-emerald-500 text-black hover:bg-emerald-400 transition flex items-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <span className="animate-spin text-sm">⏳</span>
                        <span>Analyzing Macros...</span>
                      </>
                    ) : (
                      <>
                        <span>⚡</span>
                        <span>Analyze & Save Recipe</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )
          ) : (
            /* My Recipes Tab */
            <div className="space-y-4">
              {loadingRecipes ? (
                <div className="py-12 text-center text-slate-400 text-xs">Loading saved recipes...</div>
              ) : myRecipes.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  No custom recipes saved yet. Create your first regional recipe above!
                </div>
              ) : (
                <div className="space-y-3">
                  {myRecipes.map((meal) => (
                    <div
                      key={meal.id}
                      className="p-4 bg-white/[0.03] border border-white/10 rounded-xl flex items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-white text-sm">{meal.name}</h4>
                          <span
                            className={`px-2 py-0.5 text-[10px] font-black rounded ${
                              meal.safety_tier === "SAFE"
                                ? "bg-emerald-500/20 text-emerald-400"
                                : meal.safety_tier === "MODERATE"
                                ? "bg-amber-500/20 text-amber-400"
                                : "bg-rose-500/20 text-rose-400"
                            }`}
                          >
                            {meal.safety_tier}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 capitalize">
                          {meal.meal_type} • {meal.servings} serv • {meal.per_serving_nutrition.calories} kcal/serv •{" "}
                          <span className="text-emerald-400">{meal.per_serving_nutrition.protein_g}g protein</span>
                        </p>
                        <div className="text-[10px] text-slate-500">
                          Ingredients: {meal.ingredients.map((i) => `${i.name} (${i.quantity_grams}g)`).join(", ")}
                        </div>
                      </div>

                      <button
                        onClick={() => setRecipeToDelete({ id: meal.id, name: meal.name })}
                        className="px-3 py-1.5 text-xs text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 rounded-lg transition cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={Boolean(recipeToDelete)}
        title="Delete Custom Recipe"
        message="Are you sure you want to delete this recipe? This will remove it from your personal Smart Meal Planner candidate pool."
        confirmLabel="Delete Recipe"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={isDeletingRecipe}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          if (!isDeletingRecipe) setRecipeToDelete(null);
        }}
      />
    </div>
  );
};
