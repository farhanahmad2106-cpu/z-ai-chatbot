import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useUserProfile } from '../context/UserProfileContext';
import { useUserStats } from '../context/UserStatsContext';
import { useToast } from '../context/ToastContext';
import { API_BASE } from '../config';
import {
  AlertTriangle,
  CheckCircle,
  Info,
  RefreshCw,
  Plus,
  Calendar,
  ShoppingBag,
  Sun
} from 'lucide-react';
import WeeklyMealPlanner from './WeeklyMealPlanner';

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

  const getSafetyBadge = (cls: string) => {
    switch (cls) {
      case 'safe':
        return <span className="flex items-center gap-1 text-xs font-bold text-emerald-400 bg-emerald-900/40 px-2 py-1 rounded-full"><CheckCircle className="w-3 h-3" /> SAFE</span>;
      case 'moderate':
        return <span className="flex items-center gap-1 text-xs font-bold text-amber-400 bg-amber-900/40 px-2 py-1 rounded-full"><AlertTriangle className="w-3 h-3" /> MODERATE</span>;
      case 'critical':
        return <span className="flex items-center gap-1 text-xs font-bold text-red-400 bg-red-900/40 px-2 py-1 rounded-full"><AlertTriangle className="w-3 h-3" /> CRITICAL</span>;
      default:
        return null;
    }
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

      {/* TAB 1 & 2: WEEKLY PLANNER & GROCERY VIEWS */}
      {plannerTab === 'weekly' && <WeeklyMealPlanner initialSubView="plan" />}
      {plannerTab === 'grocery' && <WeeklyMealPlanner initialSubView="grocery" />}

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
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-center">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Calories</p>
                  <p className="text-xl font-bold text-emerald-400">{Math.round(plan.daily_totals.calories)} / {plan.target_calories}</p>
                </div>
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-center">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Protein</p>
                  <p className="text-xl font-bold text-blue-400">{Math.round(plan.daily_totals.protein_g)}g</p>
                </div>
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-center">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Carbs</p>
                  <p className="text-xl font-bold text-amber-400">{Math.round(plan.daily_totals.carbs_g)}g</p>
                </div>
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-center">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Fat</p>
                  <p className="text-xl font-bold text-red-400">{Math.round(plan.daily_totals.fat_g)}g</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {plan.meals.map(meal => (
                  <div key={meal.meal_id} className={`p-5 rounded-2xl border ${meal.safety_class === 'critical' ? 'bg-red-950/20 border-red-900/50' : meal.safety_class === 'moderate' ? 'bg-amber-950/20 border-amber-900/50' : 'bg-slate-900 border-slate-800'} shadow-lg relative overflow-hidden group`}>
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-outfit font-bold text-lg capitalize">{meal.meal_type}: {meal.name}</h3>
                        <p className="text-xs text-gray-400">{meal.serving_description}</p>
                      </div>
                      {getSafetyBadge(meal.safety_class)}
                    </div>

                    <div className="flex gap-3 text-xs mb-3 text-gray-300 bg-slate-950/50 p-2 rounded-lg">
                      <span><strong className="text-emerald-400">{Math.round(meal.calories)}</strong> kcal</span>
                      <span><strong className="text-blue-400">{meal.protein_g}g</strong> p</span>
                      <span><strong className="text-amber-400">{meal.carbs_g}g</strong> c</span>
                      <span><strong className="text-red-400">{meal.fat_g}g</strong> f</span>
                      <span><strong className="text-gray-400">{meal.sodium_mg}mg</strong> sod</span>
                    </div>

                    <div className="mb-4">
                      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Key Ingredients</p>
                      <div className="flex flex-wrap gap-1">
                        {meal.ingredients.map((ing, i) => (
                          <span key={i} className="text-[10px] bg-slate-800 px-2 py-0.5 rounded-full text-gray-300">{ing}</span>
                        ))}
                      </div>
                    </div>

                    {meal.conflict.warning_reasons.length > 0 && (
                      <div className={`mt-2 mb-4 p-2 rounded-lg text-xs ${meal.safety_class === 'critical' ? 'bg-red-900/20 text-red-300' : 'bg-amber-900/20 text-amber-300'}`}>
                        <ul className="list-disc pl-4 space-y-1">
                          {meal.conflict.warning_reasons.map((warn, i) => (
                            <li key={i}>{warn}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <button
                      onClick={() => swapMeal(meal)}
                      disabled={swapping === meal.meal_id}
                      className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-sm font-medium rounded-xl transition-colors disabled:opacity-50 flex justify-center items-center gap-2 text-white"
                    >
                      {swapping === meal.meal_id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                      Swap Meal
                    </button>
                  </div>
                ))}
              </div>

              <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-xs text-gray-400 flex items-start gap-2">
                <Info className="w-4 h-4 inline-block text-emerald-500 shrink-0 mt-0.5" />
                <p>{plan.data_disclaimer}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MealPlanner;
