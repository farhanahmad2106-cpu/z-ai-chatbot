import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useUserProfile } from '../context/UserProfileContext';
import { useUserStats } from '../context/UserStatsContext';
import { useToast } from '../context/ToastContext';
import { API_BASE } from '../config';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  RefreshCw,
  Plus,
  Calendar,
  ShoppingBag,
  Sun,
  Globe
} from 'lucide-react';
import WeeklyMealPlanner, { MealLanguage, TranslatedMealItem, TranslatableMealItem } from './WeeklyMealPlanner';
import { CustomRecipeModal } from './CustomRecipeModal';

export interface MacroMetricCardProps {
  label: string;
  current: number;
  target?: number;
  unit: string;
  textColor: string;
  barColor: string;
}

export const MacroMetricCard: React.FC<MacroMetricCardProps> = ({
  label,
  current,
  target,
  unit,
  textColor,
  barColor,
}) => {
  const hasTarget = typeof target === 'number' && target > 0;
  const percentage = hasTarget ? (current / target) * 100 : 0;
  const clampedWidth = Math.min(Math.max(percentage, 0), 100);
  const roundedCurrent = Math.round(current);
  const roundedTarget = hasTarget ? Math.round(target) : 0;

  return (
    <div className="p-3.5 sm:p-4 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col justify-between transition-all hover:border-slate-700 min-w-0">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 font-mono truncate">
          {label}
        </p>
        <div className="mt-1 flex items-baseline gap-1 flex-wrap">
          <span className={`text-lg sm:text-xl font-bold font-outfit ${textColor} tracking-tight`}>
            {roundedCurrent.toLocaleString()}
          </span>
          {hasTarget && (
            <span className="text-xs text-gray-500 font-mono">
              {`/ ${roundedTarget.toLocaleString()}`}
            </span>
          )}
          <span className="text-xs text-gray-400 font-medium">
            {unit}
          </span>
        </div>
      </div>

      {hasTarget && (
        <div className="mt-2.5 sm:mt-3">
          <div
            role="progressbar"
            aria-valuenow={roundedCurrent}
            aria-valuemin={0}
            aria-valuemax={roundedTarget}
            aria-label={`${label} progress: ${roundedCurrent} of ${roundedTarget} ${unit}`}
            className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden"
          >
            <div
              className={`h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none ${barColor}`}
              style={{ width: `${clampedWidth}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between items-center text-[10px] font-mono text-gray-500">
            <span>{`${Math.round(percentage)}%`}</span>
            {percentage > 100 && (
              <span className="text-amber-400 font-bold">{`+${Math.round(percentage - 100)}% over`}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};




export const MEAL_LANGUAGES: { code: MealLanguage; label: string; native: string }[] = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
  { code: 'mr', label: 'Marathi', native: 'मराठी' },
  { code: 'ta', label: 'Tamil', native: 'தமிழ்' },
  { code: 'bn', label: 'Bengali', native: 'বাংলা' },
  { code: 'te', label: 'Telugu', native: 'తెలుగు' },
];

interface MealConflict {
  is_safe: boolean;
  conflict_severity: 'none' | 'moderate' | 'critical';
  warning_reasons: string[];
}

interface MealPlanItem {
  meal_id: string;
  name: string;
  meal_type: 'breakfast' | 'lunch' | 'snack' | 'dinner';
  serving_description: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  sodium_mg: number;
  sugar_g: number;
  ingredients: string[];
  conflict: MealConflict;
  safety_class: 'safe' | 'moderate' | 'critical';
}

interface MealPlanResponse {
  plan_id: string;
  target_calories: number;
  meals: MealPlanItem[];
  daily_totals: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };
  calorie_deviation_percent: number;
  data_disclaimer: string;
}

const MealPlanner: React.FC = () => {
  const { currentUser } = useAuth();
  const { healthProfile, preferences } = useUserProfile();
  const { dailyGoals, logMultipleMeals } = useUserStats();
  const { showToast } = useToast();

  // Mode: 'weekly' (default), 'daily', or 'grocery'
  const [plannerTab, setPlannerTab] = useState<'daily' | 'weekly' | 'grocery'>('weekly');

  const [plan, setPlan] = useState<MealPlanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [swapping, setSwapping] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);
  
  // Indic Localization State
  const [selectedLang, setSelectedLang] = useState<MealLanguage>(() => {
    try {
      const saved = localStorage.getItem('z_sehealth_preferred_meal_lang');
      if (saved && ['en', 'hi', 'mr', 'ta', 'bn', 'te'].includes(saved)) {
        return saved as MealLanguage;
      }
    } catch (e) {}
    return 'en';
  });
  const [translationCache, setTranslationCache] = useState<Record<string, Record<string, TranslatedMealItem>>>({});
  const [isTranslating, setIsTranslating] = useState(false);
  const [showRecipeModal, setShowRecipeModal] = useState(false);


  // Health Profile Reminder
  const [showReminder, setShowReminder] = useState(false);

  useEffect(() => {
    // Check if the user's Health Vault is somewhat empty
    const isProfileIncomplete = !healthProfile.age || !healthProfile.weight || !preferences.diet;
    if (isProfileIncomplete) {
      const lastPrompt = localStorage.getItem('z_health_vault_prompt_date');
      const now = new Date();
      if (!lastPrompt) {
        setShowReminder(true);
      } else {
        const lastDate = new Date(lastPrompt);
        const diffDays = (now.getTime() - lastDate.getTime()) / (1000 * 3600 * 24);
        if (diffDays >= 30) {
          setShowReminder(true);
        }
      }
    }
  }, [healthProfile, preferences]);

  const handleReminderLater = () => {
    localStorage.setItem('z_health_vault_prompt_date', new Date().toISOString());
    setShowReminder(false);
  };

  // Translation fetcher with in-memory caching and deduplication
  const ensureTranslations = async (mealsToTranslate: TranslatableMealItem[], targetLang?: MealLanguage) => {
    const lang = targetLang || selectedLang;
    if (!currentUser || lang === 'en' || mealsToTranslate.length === 0) return;

    // Filter uncached meals
    const existingMap = translationCache[lang] || {};
    const uncached = mealsToTranslate.filter(m => !existingMap[m.meal_id]);
    if (uncached.length === 0) return;

    const payloadMeals = uncached.map(m => ({
      ...m,
      calories: (m as any).calories || 250,
      protein_g: (m as any).protein_g || 10,
      carbs_g: (m as any).carbs_g || 30,
      fat_g: (m as any).fat_g || 5,
      sodium_mg: (m as any).sodium_mg || 100,
      sugar_g: (m as any).sugar_g || 0,
      safety_score: (m as any).safety_score || 90,
      safety_class: (m as any).safety_class || 'safe',
      conflict: m.conflict || { is_safe: true, conflict_severity: 'none', warning_reasons: [] }
    }));

    setIsTranslating(true);
    try {
      const token = await currentUser.getIdToken();
      const res = await fetch(`${API_BASE}/api/meals/translate-plan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          language: lang,
          meals: payloadMeals,
        }),
      });


      if (res.ok) {
        const data = await res.json();
        const newTranslations: TranslatedMealItem[] = data.translations;
        setTranslationCache(prev => {
          const currentLangMap = { ...(prev[lang] || {}) };
          for (const item of newTranslations) {
            currentLangMap[item.original_id] = item;
          }
          return {
            ...prev,
            [lang]: currentLangMap,
          };
        });
      } else {
        console.error('Translation request returned status', res.status);
      }
    } catch (err) {
      console.error('Failed to translate meals:', err);
    } finally {
      setIsTranslating(false);
    }
  };

  // Trigger translation when single-day plan is loaded
  useEffect(() => {
    if (plan && plan.meals.length > 0 && selectedLang !== 'en') {
      ensureTranslations(plan.meals, selectedLang);
    }
  }, [plan, selectedLang]);

  const handleLanguageSelect = (lang: MealLanguage) => {
    setSelectedLang(lang);
    try {
      localStorage.setItem('z_sehealth_preferred_meal_lang', lang);
    } catch (e) {}
    if (lang !== 'en' && plan && plan.meals.length > 0) {
      ensureTranslations(plan.meals, lang);
    }
  };

  const generatePlan = async () => {
    if (!currentUser) return;
    setLoading(true);
    setError(null);
    try {
      const token = await currentUser.getIdToken();
      const res = await fetch(`${API_BASE}/api/meals/generate-plan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          target_calories: dailyGoals.calories > 0 ? dailyGoals.calories : 2000,
          meal_types: ['breakfast', 'lunch', 'snack', 'dinner']
        })
      });
      if (res.ok) {
        const data = await res.json();
        setPlan(data);
      } else {
        const err = await res.json();
        setError(err.detail || 'Failed to generate plan.');
      }
    } catch (e) {
      setError('Network error while generating plan.');
    } finally {
      setLoading(false);
    }
  };

  const swapMeal = async (meal: MealPlanItem) => {
    if (!currentUser || !plan) return;
    setSwapping(meal.meal_id);
    try {
      const token = await currentUser.getIdToken();
      const res = await fetch(`${API_BASE}/api/meals/swap`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          current_meal_id: meal.meal_id,
          meal_type: meal.meal_type,
          target_calories: plan.target_calories
        })
      });
      
      if (res.ok) {
        const newMeal = await res.json();
        const updatedMeals = plan.meals.map(m => m.meal_id === meal.meal_id ? newMeal : m);
        
        // Recalculate totals
        const daily_totals = updatedMeals.reduce((acc, m) => {
          acc.calories += m.calories;
          acc.protein_g += m.protein_g;
          acc.carbs_g += m.carbs_g;
          acc.fat_g += m.fat_g;
          return acc;
        }, { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });

        setPlan({ ...plan, meals: updatedMeals, daily_totals });
        showToast('Meal swapped successfully.');
      } else {
        const err = await res.json();
        showToast(err.detail || 'No compatible alternative found.', 'error');
      }
    } catch (e) {
      showToast('Network error while swapping meal.', 'error');
    } finally {
      setSwapping(null);
    }
  };

  const handleLogAll = async () => {
    if (!plan) return;
    setLogging(true);
    const items = plan.meals.map(m => ({
      food: {
        name: m.name,
        ingredients: m.ingredients,
        calories: m.calories,
        protein: m.protein_g,
        carbs: m.carbs_g,
        fat: m.fat_g,
      },
      count: 1
    }));
    
    const success = await logMultipleMeals(items);
    if (success) {
      showToast('All meals logged to tracker successfully!');
    } else {
      showToast('Some meals failed to log.', 'error');
    }
    setLogging(false);
  };

  const getSafetyBadge = (cls?: string) => {
    const safety = cls || 'safe';
    const isCritical = safety === 'critical';
    const isModerate = safety === 'moderate';

    return (
      <span
        className={`shrink-0 px-2.5 py-1 text-xs font-mono font-semibold rounded-full flex items-center gap-1 border ${
          isCritical
            ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
            : isModerate
            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
        }`}
        aria-label={`Dietary status: ${safety.toUpperCase()}`}
      >
        {isCritical || isModerate ? (
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        )}
        <span>{safety.toUpperCase()}</span>
      </span>
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {showReminder && (
        <div className="p-4 bg-slate-800 border border-emerald-500/30 rounded-xl flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <Info className="w-6 h-6 text-emerald-400" />
            <p className="text-sm text-gray-200">
              Your Health Vault seems incomplete. Please complete your profile so we can provide accurate and safe meal recommendations.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button 
              onClick={handleReminderLater}
              className="px-3 py-1.5 text-xs font-medium bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
            >
              Remind me next month
            </button>
            <button 
              onClick={() => {
                handleReminderLater();
              }}
              className="px-3 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors"
            >
              Update Profile Now
            </button>
          </div>
        </div>
      )}

      {/* Main Header & Tab Navigation Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-outfit font-bold tracking-tight text-white">Smart Meal Planner</h2>
          <p className="text-sm text-gray-400">Revolving Clinical Schedule & Smart Grocery List</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowRecipeModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300 shadow-sm"
          >
            <span>🍲</span>
            <span>Add My Recipe</span>
          </button>

          {/* Navigation Tabs: Daily View | 7-Day Revolving Plan | Smart Grocery List */}
          <div className="flex items-center gap-1.5 bg-slate-900 p-1.5 rounded-2xl border border-slate-800 shadow-inner">
            <button
              onClick={() => setPlannerTab('daily')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                plannerTab === 'daily'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'text-gray-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              Daily View
            </button>
            <button
              onClick={() => setPlannerTab('weekly')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                plannerTab === 'weekly'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'text-gray-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              7-Day Revolving Plan
            </button>
            <button
              onClick={() => setPlannerTab('grocery')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                plannerTab === 'grocery'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'text-gray-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              Smart Grocery List
            </button>
          </div>
        </div>
      </div>

      {/* Indic Language Selector Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 p-2.5 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-300 px-1">
          <Globe className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="hidden sm:inline">Presentation Language:</span>
        </div>
        <div
          role="radiogroup"
          aria-label="Select meal planner display language"
          className="flex flex-wrap items-center gap-1.5"
        >
          {MEAL_LANGUAGES.map((lang) => {
            const isSelected = selectedLang === lang.code;
            return (
              <button
                key={lang.code}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => handleLanguageSelect(lang.code)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all focus-visible:outline-2 focus-visible:outline-emerald-400 ${
                  isSelected
                    ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20'
                    : 'text-gray-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {lang.native}
              </button>
            );
          })}
        </div>
        {isTranslating && (
          <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/50 px-2.5 py-1 rounded-full animate-pulse ml-auto sm:ml-0">
            <RefreshCw className="w-3 h-3 animate-spin" />
            <span>Translating...</span>
          </div>
        )}
      </div>

      {/* TAB 1 & 2: WEEKLY PLANNER & GROCERY VIEWS */}
      {plannerTab === 'weekly' && (
        <WeeklyMealPlanner
          initialSubView="plan"
          selectedLang={selectedLang}
          translationCache={translationCache}
          onEnsureTranslations={ensureTranslations}
        />
      )}
      {plannerTab === 'grocery' && (
        <WeeklyMealPlanner
          initialSubView="grocery"
          selectedLang={selectedLang}
          translationCache={translationCache}
          onEnsureTranslations={ensureTranslations}
        />
      )}

      {/* TAB 3: EXISTING DAILY VIEW (100% BACKWARD COMPATIBLE) */}
      {plannerTab === 'daily' && (
        <div className="space-y-6">
          <div className="flex justify-end gap-2">
            <button
              onClick={generatePlan}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-all disabled:opacity-50 text-sm"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {plan ? 'Regenerate Single Day' : 'Generate Daily Plan'}
            </button>
            {plan && (
              <button
                onClick={handleLogAll}
                disabled={logging}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition-all disabled:opacity-50 text-sm"
              >
                {logging ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Log All Meals
              </button>
            )}
          </div>

          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-sm">
              {error}
            </div>
          )}

          {!plan && !loading && (
            <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-3xl">
              <Calendar className="w-10 h-10 text-emerald-400 mx-auto mb-3 opacity-60" />
              <h3 className="text-lg font-bold text-white font-outfit">No Daily Plan Loaded</h3>
              <p className="text-sm text-gray-400 mt-1 mb-4">Generate an immediate 4-slot daily nutrition plan.</p>
              <button
                onClick={generatePlan}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-bold text-sm"
              >
                Generate Daily Plan
              </button>
            </div>
          )}

          {plan && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                <MacroMetricCard
                  label="Calories"
                  current={plan.daily_totals.calories}
                  target={plan.target_calories}
                  unit="kcal"
                  textColor="text-emerald-400"
                  barColor="bg-emerald-400"
                />
                <MacroMetricCard
                  label="Protein"
                  current={plan.daily_totals.protein_g}
                  target={dailyGoals?.protein && dailyGoals.protein > 0 ? dailyGoals.protein : undefined}
                  unit="g"
                  textColor="text-sky-400"
                  barColor="bg-sky-400"
                />
                <MacroMetricCard
                  label="Carbs"
                  current={plan.daily_totals.carbs_g}
                  target={dailyGoals?.carbs && dailyGoals.carbs > 0 ? dailyGoals.carbs : undefined}
                  unit="g"
                  textColor="text-amber-400"
                  barColor="bg-amber-400"
                />
                <MacroMetricCard
                  label="Fat"
                  current={plan.daily_totals.fat_g}
                  target={dailyGoals?.fat && dailyGoals.fat > 0 ? dailyGoals.fat : undefined}
                  unit="g"
                  textColor="text-rose-400"
                  barColor="bg-rose-400"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {plan.meals.map(meal => {
                  const trans = selectedLang !== 'en' ? translationCache[selectedLang]?.[meal.meal_id] : null;
                  const displayName = trans?.translated_name || meal.name;
                  const displayDesc = trans?.translated_serving_description || meal.serving_description;
                  const displayIngredients = trans?.translated_ingredients || meal.ingredients;
                  const displayWarnings = trans?.translated_warning_reasons || meal.conflict.warning_reasons;

                  return (
                    <div key={meal.meal_id} className={`p-5 rounded-3xl border ${meal.safety_class === 'critical' ? 'bg-red-950/20 border-red-900/50' : meal.safety_class === 'moderate' ? 'bg-amber-950/20 border-amber-900/50' : 'bg-slate-900 border-slate-800'} shadow-lg relative overflow-hidden flex flex-col justify-between group`}>
                      <div>
                        {/* Collision-free Meal Header */}
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <h3 className="min-w-0 flex-1 font-outfit text-base sm:text-lg font-bold text-white tracking-tight leading-snug break-words">
                            {meal.meal_type.toUpperCase()}: {displayName}
                          </h3>
                          {getSafetyBadge(meal.safety_class)}
                        </div>
                        <p className="text-xs text-gray-400 mb-3 leading-relaxed break-words">{displayDesc}</p>

                        <div className="flex flex-wrap gap-2 text-xs mb-3 text-gray-300 bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/60 font-mono">
                          <span><strong className="text-emerald-400">{Math.round(meal.calories)}</strong> kcal</span>
                          <span className="text-gray-600">•</span>
                          <span><strong className="text-sky-400">{meal.protein_g}g</strong> P</span>
                          <span className="text-gray-600">•</span>
                          <span><strong className="text-amber-400">{meal.carbs_g}g</strong> C</span>
                          <span className="text-gray-600">•</span>
                          <span><strong className="text-rose-400">{meal.fat_g}g</strong> F</span>
                          <span className="text-gray-600">•</span>
                          <span><strong className="text-gray-400">{meal.sodium_mg}mg</strong> Sod</span>
                        </div>

                        <div className="mb-4">
                          <p className="text-[10px] text-gray-400 uppercase font-mono font-bold tracking-wider mb-1.5">Key Ingredients</p>
                          <div className="flex flex-wrap gap-1">
                            {displayIngredients.map((ing, i) => (
                              <span key={i} className="text-[10px] bg-slate-950 px-2 py-0.5 rounded-md text-gray-300 border border-slate-800 break-words">{ing}</span>
                            ))}
                          </div>
                        </div>

                        {displayWarnings.length > 0 && (
                          <div className={`mt-2 mb-4 p-2.5 rounded-xl text-xs ${meal.safety_class === 'critical' ? 'bg-red-900/20 text-red-300 border border-red-900/30' : 'bg-amber-900/20 text-amber-300 border border-amber-900/30'}`}>
                            <ul className="list-disc pl-4 space-y-1">
                              {displayWarnings.map((warn, i) => (
                                <li key={i}>{warn}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-800/80">
                        <button
                          type="button"
                          onClick={() => swapMeal(meal)}
                          disabled={swapping === meal.meal_id}
                          aria-label={`Swap ${displayName} for alternative`}
                          className="w-full min-h-[44px] py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl text-xs font-bold transition-all disabled:opacity-50 flex justify-center items-center gap-2 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
                        >
                          {swapping === meal.meal_id ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" aria-hidden="true" /> : <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />}
                          <span>{swapping === meal.meal_id ? 'Validating Alternative...' : 'Swap Meal'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-xs text-gray-400 flex items-start gap-2">
                <Info className="w-4 h-4 inline-block text-emerald-500 shrink-0 mt-0.5" />
                <p>{plan.data_disclaimer}</p>
              </div>
            </div>
          )}
        </div>
      )}
      {/* Custom Recipe Ingestion Modal */}
      <CustomRecipeModal
        isOpen={showRecipeModal}
        onClose={() => setShowRecipeModal(false)}
        onRecipeSaved={(savedRecipe) => {
          showToast(`Recipe "${savedRecipe.name}" saved!`, 'success');
        }}
      />
    </div>
  );
};

export default MealPlanner;

