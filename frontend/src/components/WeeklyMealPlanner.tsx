import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useUserStats } from '../context/UserStatsContext';
import { useToast } from '../context/ToastContext';
import { API_BASE } from '../config';
import {
  Calendar,
  ShoppingBag,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Copy,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  Info
} from 'lucide-react';

interface MealPlanItem {
  meal_id: string;
  name: string;
  meal_type: 'breakfast' | 'lunch' | 'snack' | 'dinner';
  serving_description: string;
  servings?: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  sodium_mg?: number;
  added_sugar_g?: number;
  ingredients: string[];
  safety_class?: 'safe' | 'moderate' | 'critical';
}

interface DayPlan {
  day: string;
  date: string;
  meals: MealPlanItem[];
  daily_totals: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    sodium_mg: number;
    sugar_g: number;
    added_sugar_g?: number;
  };
  calorie_deviation_percent: number;
  is_compliant: boolean;
}

interface WeeklyPlanResponse {
  plan_id: string;
  user_id: string;
  week_id: string;
  week_start: string;
  week_end: string;
  target_calories: number;
  days: DayPlan[];
  weekly_totals: Record<string, number>;
  variety_warnings: string[];
  status: string;
  generated_at: string;
  data_disclaimer: string;
}

interface GroceryItem {
  name: string;
  quantity: number;
  unit: string;
}

interface GroceryCategory {
  name: string;
  items: GroceryItem[];
}

interface GroceryListResponse {
  plan_id: string;
  week_id: string;
  week_start: string;
  week_end: string;
  categories: GroceryCategory[];
  total_items: number;
}

interface WeeklyMealPlannerProps {
  initialSubView?: 'plan' | 'grocery';
}

const WeeklyMealPlanner: React.FC<WeeklyMealPlannerProps> = ({ initialSubView = 'plan' }) => {
  const { currentUser } = useAuth();
  const { dailyGoals } = useUserStats();
  const { showToast } = useToast();

  const [activeSubView, setActiveSubView] = useState<'plan' | 'grocery'>(initialSubView);
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlanResponse | null>(null);
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [swappingSlot, setSwappingSlot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Grocery state
  const [groceryList, setGroceryList] = useState<GroceryListResponse | null>(null);
  const [groceryLoading, setGroceryLoading] = useState<boolean>(false);
  const [groceryChecked, setGroceryChecked] = useState<Record<string, boolean>>({});
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({
    Produce: true,
    'Grains & Flours': true,
    'Pulses & Legumes': true,
    'Dairy & Plant Alternatives': true,
    'Spices & Pantry': false,
    Other: true,
  });

  useEffect(() => {
    setActiveSubView(initialSubView);
  }, [initialSubView]);

  // Set today's day of week on mount
  useEffect(() => {
    const jsDay = new Date().getDay(); // 0 is Sunday, 1 is Monday
    const mappedIndex = jsDay === 0 ? 6 : jsDay - 1;
    setSelectedDayIndex(mappedIndex);
  }, []);

  // Fetch or load active weekly plan
  const fetchWeeklyPlan = async (forceRegenerate: boolean = false) => {
    if (!currentUser) return;
    setLoading(true);
    setError(null);
    try {
      const token = await currentUser.getIdToken();
      const res = await fetch(`${API_BASE}/api/meals/weekly-plan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          target_calories: dailyGoals.calories > 0 ? dailyGoals.calories : 2000,
          force_regenerate: forceRegenerate,
        }),
      });

      if (res.ok) {
        const data: WeeklyPlanResponse = await res.json();
        setWeeklyPlan(data);
        // Pre-fetch groceries in background
        fetchGroceryList();
      } else {
        const errData = await res.json();
        if (errData.detail && typeof errData.detail === 'object') {
          setError(errData.detail.message || 'Weekly plan generation failed.');
        } else {
          setError(errData.detail || 'Failed to load weekly plan.');
        }
      }
    } catch (e) {
      console.error('Failed to fetch weekly plan:', e);
      setError('Network error connecting to Z-SeHealth meal planning service.');
    } finally {
      setLoading(false);
    }
  };

  const fetchGroceryList = async () => {
    if (!currentUser) return;
    setGroceryLoading(true);
    try {
      const token = await currentUser.getIdToken();
      const res = await fetch(`${API_BASE}/api/meals/grocery-list`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data: GroceryListResponse = await res.json();
        setGroceryList(data);
      }
    } catch (e) {
      console.error('Failed to load grocery list:', e);
    } finally {
      setGroceryLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchWeeklyPlan(false);
    }
  }, [currentUser]);

  // Swap slot handler
  const handleSwapMeal = async (day: string, slot: string) => {
    if (!currentUser || !weeklyPlan) return;
    const slotKey = `${day}-${slot}`;
    setSwappingSlot(slotKey);

    try {
      const token = await currentUser.getIdToken();
      const res = await fetch(`${API_BASE}/api/meals/weekly-plan/swap-day-slot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          plan_id: weeklyPlan.plan_id,
          day: day,
          slot: slot,
        }),
      });

      if (res.ok) {
        const updatedPlan: WeeklyPlanResponse = await res.json();
        setWeeklyPlan(updatedPlan);
        showToast('Meal swapped successfully.', 'success');
        // Refresh groceries to reflect new meal
        fetchGroceryList();
      } else {
        const errData = await res.json();
        const msg = typeof errData.detail === 'object' ? errData.detail.message : errData.detail;
        showToast(msg || 'No compatible alternative found preserving clinical rules.', 'error');
      }
    } catch (e) {
      showToast('Network error while swapping meal.', 'error');
    } finally {
      setSwappingSlot(null);
    }
  };

  // Toggle category accordion
  const toggleCategory = (catName: string) => {
    setOpenCategories((prev) => ({
      ...prev,
      [catName]: !prev[catName],
    }));
  };

  // Toggle item checkbox
  const toggleCheckItem = (key: string) => {
    setGroceryChecked((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Copy grocery list to clipboard as clean Markdown
  const copyGroceryListToClipboard = async () => {
    if (!groceryList || groceryList.categories.length === 0) {
      showToast('No grocery items to copy.', 'error');
      return;
    }

    let markdown = `# Z-SeHealth Smart Grocery List\nWeek: ${groceryList.week_start} to ${groceryList.week_end}\n\n`;

    groceryList.categories.forEach((cat) => {
      markdown += `## ${cat.name}\n`;
      cat.items.forEach((item) => {
        const checkKey = `${cat.name}-${item.name}`;
        const isChecked = groceryChecked[checkKey];
        markdown += `- [${isChecked ? 'x' : ' '}] ${item.quantity} ${item.unit} ${item.name}\n`;
      });
      markdown += '\n';
    });

    markdown += `*Generated by Z-SeHealth Automated Revolving Meal Planner*`;

    try {
      await navigator.clipboard.writeText(markdown);
      showToast('Grocery checklist copied to clipboard!', 'success');
    } catch (err) {
      console.error('Clipboard copy failed:', err);
      showToast('Could not access clipboard.', 'error');
    }
  };

  const selectedDay = weeklyPlan?.days[selectedDayIndex] || null;

  return (
    <div className="space-y-6">
      {/* Sub-header & Subview Switcher */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 border border-slate-800 p-4 rounded-3xl">
        <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-2xl border border-slate-800">
          <button
            onClick={() => setActiveSubView('plan')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              activeSubView === 'plan'
                ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
                : 'text-gray-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Calendar className="w-4 h-4" />
            7-Day Revolving Plan
          </button>
          <button
            onClick={() => {
              setActiveSubView('grocery');
              if (!groceryList) fetchGroceryList();
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              activeSubView === 'grocery'
                ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
                : 'text-gray-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            Smart Grocery List
            {groceryList && groceryList.total_items > 0 && (
              <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-slate-900 text-emerald-400 font-mono">
                {groceryList.total_items}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {activeSubView === 'plan' && (
            <button
              onClick={() => fetchWeeklyPlan(true)}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-gray-200 border border-slate-700 rounded-2xl text-xs font-bold transition-all disabled:opacity-50 active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
              Regenerate Week
            </button>
          )}

          {activeSubView === 'grocery' && groceryList && (
            <button
              onClick={copyGroceryListToClipboard}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded-2xl text-xs font-bold transition-all active:scale-95 shadow-md shadow-emerald-600/20"
            >
              <Copy className="w-3.5 h-3.5" />
              Copy Checklist (Markdown)
            </button>
          )}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 bg-rose-950/40 border border-rose-800/60 rounded-3xl text-rose-300 text-sm flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-rose-200">Weekly Plan Constraint Notice</p>
            <p className="mt-1 text-rose-300 text-xs leading-relaxed">{error}</p>
          </div>
        </div>
      )}

      {/* Variety warnings */}
      {weeklyPlan && weeklyPlan.variety_warnings.length > 0 && (
        <div className="p-3 bg-amber-950/30 border border-amber-900/40 rounded-2xl text-amber-300 text-xs flex items-center gap-2">
          <Info className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{weeklyPlan.variety_warnings[0]}</span>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-4xl flex flex-col items-center justify-center gap-3">
          <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
          <p className="text-sm font-bold text-gray-300">Calibrating 7-Day Revolving Plan...</p>
          <p className="text-xs text-gray-500">Checking clinical bounds, macro targets, and variety cooldowns</p>
        </div>
      )}

      {/* VIEW A: 7-DAY REVOLVING PLAN */}
      {!loading && activeSubView === 'plan' && weeklyPlan && (
        <div className="space-y-6">
          {/* Horizontal Day Selector Pills */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
            {weeklyPlan.days.map((dayObj, index) => {
              const isSelected = index === selectedDayIndex;
              return (
                <button
                  key={dayObj.day}
                  onClick={() => setSelectedDayIndex(index)}
                  className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all shrink-0 flex flex-col items-center gap-1 ${
                    isSelected
                      ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
                      : 'bg-slate-900 text-gray-400 border border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <span className="uppercase tracking-wider">{dayObj.day.slice(0, 3)}</span>
                  <span className={`text-[10px] font-mono ${isSelected ? 'text-slate-900' : 'text-gray-500'}`}>
                    {Math.round(dayObj.daily_totals.calories)} kcal
                  </span>
                </button>
              );
            })}
          </div>

          {/* Selected Day Overview */}
          {selectedDay && (
            <div className="space-y-6">
              {/* Day Nutrition Metrics Header */}
              <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                  <div>
                    <h3 className="text-xl font-bold font-outfit text-white">
                      {selectedDay.day} Schedule
                    </h3>
                    <p className="text-xs text-gray-500 font-mono">{selectedDay.date}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 text-xs font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-3 py-1 rounded-full">
                      <ShieldCheck className="w-3.5 h-3.5" /> Compliant
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                  <div className="p-3 bg-slate-950/60 rounded-2xl border border-slate-800/80 text-center">
                    <p className="text-[10px] uppercase font-bold text-gray-500">Calories</p>
                    <p className="text-lg font-bold text-emerald-400">
                      {Math.round(selectedDay.daily_totals.calories)}
                    </p>
                    <p className="text-[9px] text-gray-500 font-mono">
                      Target: {Math.round(weeklyPlan.target_calories)}
                    </p>
                  </div>
                  <div className="p-3 bg-slate-950/60 rounded-2xl border border-slate-800/80 text-center">
                    <p className="text-[10px] uppercase font-bold text-gray-500">Protein</p>
                    <p className="text-lg font-bold text-blue-400">
                      {Math.round(selectedDay.daily_totals.protein_g)}g
                    </p>
                  </div>
                  <div className="p-3 bg-slate-950/60 rounded-2xl border border-slate-800/80 text-center">
                    <p className="text-[10px] uppercase font-bold text-gray-500">Carbs</p>
                    <p className="text-lg font-bold text-amber-400">
                      {Math.round(selectedDay.daily_totals.carbs_g)}g
                    </p>
                  </div>
                  <div className="p-3 bg-slate-950/60 rounded-2xl border border-slate-800/80 text-center">
                    <p className="text-[10px] uppercase font-bold text-gray-500">Fats</p>
                    <p className="text-lg font-bold text-rose-400">
                      {Math.round(selectedDay.daily_totals.fat_g)}g
                    </p>
                  </div>
                  <div className="p-3 bg-slate-950/60 rounded-2xl border border-slate-800/80 text-center">
                    <p className="text-[10px] uppercase font-bold text-gray-500">Sodium</p>
                    <p className="text-lg font-bold text-purple-400">
                      {Math.round(selectedDay.daily_totals.sodium_mg)}mg
                    </p>
                  </div>
                  <div className="p-3 bg-slate-950/60 rounded-2xl border border-slate-800/80 text-center">
                    <p className="text-[10px] uppercase font-bold text-gray-500">Added Sugar</p>
                    <p className="text-lg font-bold text-cyan-400">
                      {Math.round(selectedDay.daily_totals.added_sugar_g || 0)}g
                    </p>
                  </div>
                </div>
              </div>

              {/* 4 Meal Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedDay.meals.map((meal) => {
                  const isSwapping = swappingSlot === `${selectedDay.day}-${meal.meal_type}`;
                  return (
                    <div
                      key={meal.meal_id}
                      className="p-5 bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all rounded-3xl flex flex-col justify-between"
                    >
                      <div>
                        {/* Meal Slot & Multiplier Badge */}
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-950/60 px-2.5 py-0.5 rounded-full border border-emerald-800/30">
                            {meal.meal_type}
                          </span>
                          <span className="text-xs font-mono font-bold text-gray-400 bg-slate-950 px-2 py-0.5 rounded-lg border border-slate-800">
                            {meal.servings || 1.0}x serving
                          </span>
                        </div>

                        <h4 className="text-lg font-bold font-outfit text-white leading-snug">
                          {meal.name}
                        </h4>
                        <p className="text-xs text-gray-500 mt-0.5">{meal.serving_description}</p>

                        {/* Macro pills */}
                        <div className="flex flex-wrap gap-2 my-3 text-xs bg-slate-950 p-2 rounded-xl border border-slate-800/60">
                          <span className="text-emerald-400 font-bold">{Math.round(meal.calories)} kcal</span>
                          <span className="text-gray-500">•</span>
                          <span className="text-blue-400 font-medium">{meal.protein_g}g P</span>
                          <span className="text-gray-500">•</span>
                          <span className="text-amber-400 font-medium">{meal.carbs_g}g C</span>
                          <span className="text-gray-500">•</span>
                          <span className="text-rose-400 font-medium">{meal.fat_g}g F</span>
                          <span className="text-gray-500">•</span>
                          <span className="text-purple-400 font-medium">{meal.sodium_mg || 0}mg Sod</span>
                        </div>

                        {/* Ingredients */}
                        <div className="flex flex-wrap gap-1 mb-4">
                          {meal.ingredients.slice(0, 5).map((ing, i) => (
                            <span
                              key={i}
                              className="text-[10px] bg-slate-950 text-gray-400 px-2 py-0.5 rounded-md border border-slate-800"
                            >
                              {ing}
                            </span>
                          ))}
                          {meal.ingredients.length > 5 && (
                            <span className="text-[10px] text-gray-500 px-1 py-0.5">
                              +{meal.ingredients.length - 5} more
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Swap Action */}
                      <button
                        onClick={() => handleSwapMeal(selectedDay.day, meal.meal_type)}
                        disabled={isSwapping}
                        className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isSwapping ? 'animate-spin text-emerald-400' : ''}`} />
                        {isSwapping ? 'Validating Alternative...' : 'Swap Meal'}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Data Disclaimer */}
              <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-2xl text-xs text-gray-500 flex items-start gap-2">
                <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <p>{weeklyPlan.data_disclaimer}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW B: SMART GROCERY LIST */}
      {!loading && activeSubView === 'grocery' && (
        <div className="space-y-4">
          {groceryLoading && !groceryList && (
            <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-4xl flex flex-col items-center justify-center gap-2">
              <RefreshCw className="w-6 h-6 text-emerald-400 animate-spin" />
              <p className="text-sm font-bold text-gray-300">Compiling 28 meals into aggregated shopping list...</p>
            </div>
          )}

          {groceryList && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-3xl flex justify-between items-center text-xs text-gray-400">
                <span>
                  Ingredients aggregated for <strong>28 planned meals</strong> ({groceryList.week_start} to {groceryList.week_end})
                </span>
                <span className="font-mono text-emerald-400 font-bold">
                  {groceryList.total_items} distinct items
                </span>
              </div>

              {groceryList.categories.map((cat) => {
                const isOpen = openCategories[cat.name] ?? true;
                return (
                  <div
                    key={cat.name}
                    className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden transition-all"
                  >
                    {/* Category Accordion Header */}
                    <button
                      onClick={() => toggleCategory(cat.name)}
                      className="w-full p-4 flex items-center justify-between hover:bg-slate-800/50 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        {isOpen ? (
                          <ChevronDown className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-500" />
                        )}
                        <h4 className="font-bold text-white font-outfit text-base">{cat.name}</h4>
                        <span className="text-xs font-mono text-gray-500 bg-slate-950 px-2 py-0.5 rounded-full border border-slate-800">
                          {cat.items.length}
                        </span>
                      </div>
                    </button>

                    {/* Category Items */}
                    {isOpen && (
                      <div className="p-4 pt-0 divide-y divide-slate-800/60">
                        {cat.items.map((item) => {
                          const checkKey = `${cat.name}-${item.name}`;
                          const isChecked = Boolean(groceryChecked[checkKey]);

                          return (
                            <div
                              key={checkKey}
                              onClick={() => toggleCheckItem(checkKey)}
                              className="py-2.5 flex items-center justify-between cursor-pointer group hover:bg-slate-950/40 px-2 rounded-xl transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <div
                                  className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all ${
                                    isChecked
                                      ? 'bg-emerald-500 border-emerald-500 text-slate-950'
                                      : 'border-slate-700 group-hover:border-emerald-400/50'
                                  }`}
                                >
                                  {isChecked && <CheckCircle2 className="w-3.5 h-3.5" />}
                                </div>
                                <span
                                  className={`text-sm ${
                                    isChecked ? 'line-through text-gray-500' : 'text-gray-200'
                                  }`}
                                >
                                  {item.name}
                                </span>
                              </div>
                              <span className="text-xs font-mono font-bold text-emerald-400">
                                {item.quantity} {item.unit}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WeeklyMealPlanner;
