import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Info,
  ExternalLink,
  X,
  Zap,
  Play,
  Pause,
  Square,
  RotateCcw
} from 'lucide-react';
import {
  QuickCommerceProvider,
  PROVIDER_CONFIG,
  GrocerySearchItem,
  RunnerState,
  DEFAULT_OPEN_DELAY_MS,
  sanitizeIngredientForSearch,
  generateQuickCommerceLinks,
  deduplicateGroceryItems,
  formatSearchListForClipboard,
  safeOpenProviderSearch,
} from '../utils/groceryDeepLinks';

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

export type MealLanguage = 'en' | 'hi' | 'mr' | 'ta' | 'bn' | 'te';

export interface TranslatedMealItem {
  original_id: string;
  translated_name: string;
  translated_serving_description: string;
  translated_ingredients: string[];
  translated_warning_reasons: string[];
}

export interface TranslatableMealItem {
  meal_id: string;
  name: string;
  serving_description: string;
  ingredients: string[];
  conflict?: {
    warning_reasons?: string[];
  };
}

interface WeeklyMealPlannerProps {
  initialSubView?: 'plan' | 'grocery';
  selectedLang?: MealLanguage;
  translationCache?: Record<string, Record<string, TranslatedMealItem>>;
  onEnsureTranslations?: (meals: TranslatableMealItem[]) => Promise<void>;
}

interface QuickCommerceExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  groceryList: GroceryListResponse | null;
  groceryChecked: Record<string, boolean>;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

/**
 * Batch Export Modal with Provider selection, unpurchased/checked filters,
 * clipboard export, and sequential search runner with popup-blocker safety.
 */
const QuickCommerceExportModal: React.FC<QuickCommerceExportModalProps> = ({
  isOpen,
  onClose,
  groceryList,
  groceryChecked,
  showToast,
}) => {
  const [selectedProvider, setSelectedProvider] = useState<QuickCommerceProvider>('blinkit');
  const [includeChecked, setIncludeChecked] = useState<boolean>(false);
  const [runnerState, setRunnerState] = useState<RunnerState>('idle');
  const [runnerIndex, setRunnerIndex] = useState<number>(0);
  const [openedItemIds, setOpenedItemIds] = useState<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Compile and deduplicate items from grocery list
  const allItems: GrocerySearchItem[] = useMemo(() => {
    if (!groceryList) return [];
    const list: GrocerySearchItem[] = [];
    groceryList.categories.forEach((cat) => {
      cat.items.forEach((item) => {
        const id = `${cat.name}-${item.name}`;
        const sanitized = sanitizeIngredientForSearch(item.name);
        list.push({
          id,
          rawName: item.name,
          sanitizedName: sanitized,
          quantity: `${item.quantity} ${item.unit}`,
          department: cat.name,
          checked: Boolean(groceryChecked[id]),
        });
      });
    });
    return deduplicateGroceryItems(list);
  }, [groceryList, groceryChecked]);

  const unpurchasedCount = allItems.filter((i) => !i.checked).length;
  const checkedCount = allItems.filter((i) => i.checked).length;

  const exportableItems = useMemo(() => {
    return includeChecked ? allItems : allItems.filter((i) => !i.checked);
  }, [allItems, includeChecked]);

  // Clean timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const openItemAtIndex = (index: number): boolean => {
    if (index < 0 || index >= exportableItems.length) return false;
    const item = exportableItems[index];
    if (!item.sanitizedName) return false;
    const url = PROVIDER_CONFIG[selectedProvider].buildSearchUrl(item.sanitizedName);
    if (!url) return false;
    const success = safeOpenProviderSearch(url);
    if (success) {
      setOpenedItemIds((prev) => new Set(prev).add(item.id));
    }
    return success;
  };

  const scheduleNextStep = (nextIdx: number) => {
    timerRef.current = setTimeout(() => {
      if (nextIdx >= exportableItems.length) {
        setRunnerState('completed');
        return;
      }
      setRunnerIndex(nextIdx);
      const success = openItemAtIndex(nextIdx);
      if (!success) {
        setRunnerState('blocked');
        return;
      }
      if (nextIdx + 1 >= exportableItems.length) {
        setRunnerState('completed');
      } else {
        scheduleNextStep(nextIdx + 1);
      }
    }, DEFAULT_OPEN_DELAY_MS);
  };

  const handleStartRunner = () => {
    if (exportableItems.length === 0) {
      showToast('No items to search.', 'error');
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);

    const startIdx = runnerState === 'paused' ? runnerIndex : 0;
    setRunnerIndex(startIdx);
    setRunnerState('running');

    // Direct user click triggers first open safely
    const success = openItemAtIndex(startIdx);
    if (!success) {
      setRunnerState('blocked');
      return;
    }

    if (startIdx + 1 >= exportableItems.length) {
      setRunnerState('completed');
      return;
    }

    scheduleNextStep(startIdx + 1);
  };

  const handleOpenNextManual = () => {
    const nextIdx = runnerState === 'blocked' || runnerState === 'paused' ? runnerIndex + 1 : runnerIndex;
    if (nextIdx >= exportableItems.length) {
      setRunnerState('completed');
      return;
    }
    setRunnerIndex(nextIdx);
    const success = openItemAtIndex(nextIdx);
    if (success) {
      if (nextIdx + 1 >= exportableItems.length) {
        setRunnerState('completed');
      }
    }
  };

  const handlePause = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setRunnerState('paused');
  };

  const handleStop = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setRunnerState('idle');
    setRunnerIndex(0);
  };

  const handleReset = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setRunnerState('idle');
    setRunnerIndex(0);
    setOpenedItemIds(new Set());
  };

  const handleCopySearchList = async () => {
    if (exportableItems.length === 0) {
      showToast('No items available to copy.', 'error');
      return;
    }
    const text = formatSearchListForClipboard(exportableItems);
    try {
      await navigator.clipboard.writeText(text);
      showToast('Search list copied', 'success');
    } catch (err) {
      console.error('Copy search list failed:', err);
      showToast('Could not access clipboard.', 'error');
    }
  };

  const handleModalClose = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setRunnerState('idle');
    onClose();
  };

  if (!isOpen) return null;

  const currentItem = exportableItems[runnerIndex] || null;
  const currentProviderConfig = PROVIDER_CONFIG[selectedProvider];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-commerce-modal-title"
      className="fixed inset-0 bg-black/90 backdrop-blur-xl z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={handleModalClose}
    >
      <div
        className="bg-slate-900 border border-slate-800 rounded-4xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-800 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-400" />
              <h3 id="quick-commerce-modal-title" className="text-xl font-bold font-outfit text-white">
                Quick-Commerce Grocery Export
              </h3>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Search ingredients directly on Indian quick-commerce platforms without manual entry.
            </p>
          </div>
          <button
            type="button"
            onClick={handleModalClose}
            aria-label="Close export modal"
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-gray-400 hover:text-white transition-all active:scale-95 focus-visible:outline-emerald-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Provider Selector */}
        <div className="p-6 pb-4 border-b border-slate-800/80 bg-slate-950/40">
          <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2 block">
            Select Provider Platform
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(['blinkit', 'zepto', 'instamart'] as QuickCommerceProvider[]).map((prov) => {
              const cfg = PROVIDER_CONFIG[prov];
              const isSelected = selectedProvider === prov;
              return (
                <button
                  key={prov}
                  type="button"
                  onClick={() => {
                    setSelectedProvider(prov);
                    if (runnerState !== 'idle') handleStop();
                  }}
                  className={`p-3 rounded-2xl border text-xs font-bold transition-all flex flex-col items-center gap-1 active:scale-95 focus-visible:outline-emerald-400 ${
                    isSelected
                      ? `bg-slate-900 ${cfg.accentBorder} ${cfg.accentColor} shadow-lg shadow-black/40 ring-1 ring-current`
                      : 'bg-slate-900/60 border-slate-800 text-gray-400 hover:text-gray-200 hover:border-slate-700'
                  }`}
                >
                  <span className="text-sm font-extrabold">{cfg.label}</span>
                  <span className="text-[10px] opacity-75 font-mono">
                    {prov === 'blinkit' ? '10m delivery' : prov === 'zepto' ? 'Quick search' : 'Instamart mart'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Summary & Filters Bar */}
        <div className="px-6 py-3 bg-slate-950/70 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 font-mono text-gray-300">
              Total: <strong>{allItems.length}</strong>
            </span>
            <span className="px-2.5 py-1 rounded-full bg-emerald-950/40 border border-emerald-800/40 text-emerald-400 font-mono">
              Unpurchased: <strong>{unpurchasedCount}</strong>
            </span>
            <span className="px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-gray-400 font-mono">
              Checked: <strong>{checkedCount}</strong>
            </span>
          </div>

          <label className="flex items-center gap-2 cursor-pointer text-gray-300 select-none">
            <input
              type="checkbox"
              checked={includeChecked}
              onChange={(e) => {
                setIncludeChecked(e.target.checked);
                if (runnerState !== 'idle') handleStop();
              }}
              className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-emerald-500 focus:ring-emerald-400"
            />
            <span className="text-xs">Include checked items</span>
          </label>
        </div>

        {/* Items List */}
        <div className="flex-1 overflow-y-auto p-6 divide-y divide-slate-800/60 max-h-64">
          {exportableItems.length === 0 ? (
            <div className="py-8 text-center text-gray-400 text-sm">
              <p className="font-bold text-gray-300">No grocery items are available for export.</p>
              <p className="text-xs text-gray-500 mt-1">
                {checkedCount > 0 && !includeChecked
                  ? 'All items are currently marked as purchased. Enable "Include checked items" to view all.'
                  : 'Generate a weekly meal plan to populate grocery items.'}
              </p>
            </div>
          ) : (
            exportableItems.map((item, idx) => {
              const isOpened = openedItemIds.has(item.id);
              const isCurrent = runnerState !== 'idle' && runnerIndex === idx;
              const directUrl = PROVIDER_CONFIG[selectedProvider].buildSearchUrl(item.sanitizedName);

              return (
                <div
                  key={item.id}
                  className={`py-2.5 flex items-center justify-between gap-3 text-xs transition-colors rounded-xl px-2 ${
                    isCurrent
                      ? 'bg-slate-800/80 border border-emerald-500/40'
                      : item.checked
                      ? 'opacity-60 bg-slate-950/20'
                      : 'hover:bg-slate-950/40'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ${
                        isOpened
                          ? 'bg-blue-500 border-blue-500 text-slate-950'
                          : item.checked
                          ? 'bg-emerald-500/80 border-emerald-500 text-slate-950'
                          : 'border-slate-700'
                      }`}
                    >
                      {(isOpened || item.checked) && <CheckCircle2 className="w-3.5 h-3.5" />}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-bold truncate ${
                            item.checked && !isOpened ? 'line-through text-gray-400' : 'text-white'
                          }`}
                        >
                          {item.sanitizedName || item.rawName}
                        </span>
                        {item.department && (
                          <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-slate-950 text-gray-500 border border-slate-800">
                            {item.department}
                          </span>
                        )}
                      </div>
                      {item.rawName !== item.sanitizedName && (
                        <p className="text-[10px] text-gray-500 truncate">Orig: {item.rawName}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {item.quantity && (
                      <span className="font-mono text-emerald-400 font-medium">{item.quantity}</span>
                    )}

                    {directUrl ? (
                      <a
                        href={directUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setOpenedItemIds((prev) => new Set(prev).add(item.id))}
                        className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-gray-300 hover:text-emerald-400 border border-slate-700 text-[10px] font-bold flex items-center gap-1 transition-all active:scale-95 focus-visible:outline-emerald-400"
                      >
                        Search <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    ) : (
                      <span className="text-[10px] text-rose-400">Invalid query</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Runner Status / Warning Banner */}
        {runnerState === 'blocked' && (
          <div className="p-3 bg-amber-950/60 border-t border-amber-800/80 text-amber-200 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Your browser blocked a new tab. Use "Open Next" to continue manually.</span>
            </div>
            <button
              type="button"
              onClick={handleOpenNextManual}
              className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs transition-all active:scale-95 shrink-0 focus-visible:outline-emerald-400"
            >
              Open Next
            </button>
          </div>
        )}

        {runnerState === 'completed' && (
          <div className="p-3 bg-emerald-950/60 border-t border-emerald-800/80 text-emerald-200 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>All selected grocery searches have been opened on {currentProviderConfig.label}.</span>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-gray-200 rounded-xl text-xs font-bold transition-all focus-visible:outline-emerald-400"
            >
              <RotateCcw className="w-3 h-3 inline mr-1" /> Reset
            </button>
          </div>
        )}

        {runnerState === 'running' && currentItem && (
          <div className="p-3 bg-slate-950 border-t border-slate-800 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 truncate">
              <RefreshCw className="w-3.5 h-3.5 text-emerald-400 animate-spin shrink-0" />
              <span className="text-gray-300">
                Searching with {currentProviderConfig.label}:{' '}
                <strong className="text-emerald-400 font-mono">
                  {runnerIndex + 1} / {exportableItems.length}
                </strong>{' '}
                — Current:{' '}
                <strong className="text-white">{currentItem.sanitizedName}</strong>
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handlePause}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-gray-200 font-bold rounded-xl text-xs transition-all flex items-center gap-1 active:scale-95 focus-visible:outline-emerald-400"
              >
                <Pause className="w-3 h-3" /> Pause
              </button>
              <button
                type="button"
                onClick={handleStop}
                className="px-2.5 py-1 bg-rose-950/60 hover:bg-rose-900/60 border border-rose-800/60 text-rose-300 font-bold rounded-xl text-xs transition-all flex items-center gap-1 active:scale-95 focus-visible:outline-emerald-400"
              >
                <Square className="w-3 h-3" /> Stop
              </button>
            </div>
          </div>
        )}

        {runnerState === 'paused' && (
          <div className="p-3 bg-slate-950 border-t border-slate-800 text-xs flex items-center justify-between gap-3">
            <span className="text-amber-300">
              Paused at item {runnerIndex + 1} of {exportableItems.length}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleStartRunner}
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded-xl text-xs transition-all flex items-center gap-1 active:scale-95 focus-visible:outline-emerald-400"
              >
                <Play className="w-3 h-3" /> Resume
              </button>
              <button
                type="button"
                onClick={handleOpenNextManual}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-gray-200 font-bold rounded-xl text-xs transition-all active:scale-95 focus-visible:outline-emerald-400"
              >
                Open Next
              </button>
              <button
                type="button"
                onClick={handleStop}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-gray-300 font-bold rounded-xl text-xs transition-all active:scale-95 focus-visible:outline-emerald-400"
              >
                Stop
              </button>
            </div>
          </div>
        )}

        {/* Modal Actions Footer */}
        <div className="p-6 border-t border-slate-800 bg-slate-950/90 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[11px] text-gray-500 leading-tight">
            Opens search queries in new browser tabs. This tool does not access accounts, manipulate carts, or place orders.
          </p>

          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-end">
            <button
              type="button"
              onClick={handleCopySearchList}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-gray-200 border border-slate-700 rounded-2xl text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5 focus-visible:outline-emerald-400"
            >
              <Copy className="w-3.5 h-3.5" />
              Copy Search List
            </button>

            {runnerState === 'idle' ? (
              <button
                type="button"
                onClick={handleStartRunner}
                disabled={exportableItems.length === 0}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded-2xl text-xs transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1.5 shadow-lg shadow-emerald-600/20 focus-visible:outline-emerald-400"
              >
                <Zap className="w-3.5 h-3.5" />
                Start Sequential Search
              </button>
            ) : runnerState === 'blocked' ? (
              <button
                type="button"
                onClick={handleOpenNextManual}
                className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-2xl text-xs transition-all active:scale-95 flex items-center gap-1.5 focus-visible:outline-emerald-400"
              >
                Open Next
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

const WeeklyMealPlanner: React.FC<WeeklyMealPlannerProps> = ({
  initialSubView = 'plan',
  selectedLang = 'en',
  translationCache = {},
  onEnsureTranslations,
}) => {
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

  // Quick-Commerce Popover & Modal state
  const [activePopoverKey, setActivePopoverKey] = useState<string | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setActiveSubView(initialSubView);
  }, [initialSubView]);

  // Set today's day of week on mount
  useEffect(() => {
    const jsDay = new Date().getDay(); // 0 is Sunday, 1 is Monday
    const mappedIndex = jsDay === 0 ? 6 : jsDay - 1;
    setSelectedDayIndex(mappedIndex);
  }, []);

  // Close popover and modal on Escape or outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setActivePopoverKey(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActivePopoverKey(null);
        setIsExportModalOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Ensure translations when weekly plan is loaded in an Indic language
  useEffect(() => {
    if (weeklyPlan && selectedLang !== 'en' && onEnsureTranslations) {
      const allMeals: MealPlanItem[] = [];
      weeklyPlan.days.forEach(d => allMeals.push(...d.meals));
      if (allMeals.length > 0) {
        onEnsureTranslations(allMeals);
      }
    }
  }, [weeklyPlan, selectedLang, onEnsureTranslations]);

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

        <div className="flex flex-wrap items-center gap-2">
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
            <>
              <button
                type="button"
                onClick={() => setIsExportModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-2xl text-xs font-bold transition-all active:scale-95 focus-visible:outline-emerald-400"
              >
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                ⚡ Order Ingredients on Quick-Commerce
              </button>
              <button
                type="button"
                onClick={copyGroceryListToClipboard}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded-2xl text-xs font-bold transition-all active:scale-95 shadow-md shadow-emerald-600/20 focus-visible:outline-emerald-400"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy Checklist (Markdown)
              </button>
            </>
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
                  const trans = selectedLang !== 'en' ? translationCache[selectedLang]?.[meal.meal_id] : null;
                  const displayName = trans?.translated_name || meal.name;
                  const displayDesc = trans?.translated_serving_description || meal.serving_description;
                  const displayIngredients = trans?.translated_ingredients || meal.ingredients;

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
                          {displayName}
                        </h4>
                        <p className="text-xs text-gray-500 mt-0.5">{displayDesc}</p>

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
                          {displayIngredients.slice(0, 5).map((ing, i) => (
                            <span
                              key={i}
                              className="text-[10px] bg-slate-950 text-gray-400 px-2 py-0.5 rounded-md border border-slate-800"
                            >
                              {ing}
                            </span>
                          ))}
                          {displayIngredients.length > 5 && (
                            <span className="text-[10px] text-gray-500 px-1 py-0.5">
                              +{displayIngredients.length - 5} more
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
                          const isPopoverOpen = activePopoverKey === checkKey;
                          const links = generateQuickCommerceLinks(item.name);

                          return (
                            <div
                              key={checkKey}
                              onClick={() => toggleCheckItem(checkKey)}
                              className="py-2.5 flex items-center justify-between cursor-pointer group hover:bg-slate-950/40 px-2 rounded-xl transition-colors relative"
                            >
                              <div className="flex items-center gap-3 min-w-0 pr-2">
                                <div
                                  className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all shrink-0 ${
                                    isChecked
                                      ? 'bg-emerald-500 border-emerald-500 text-slate-950'
                                      : 'border-slate-700 group-hover:border-emerald-400/50'
                                  }`}
                                >
                                  {isChecked && <CheckCircle2 className="w-3.5 h-3.5" />}
                                </div>
                                <span
                                  className={`text-sm truncate ${
                                    isChecked ? 'line-through text-gray-500' : 'text-gray-200'
                                  }`}
                                >
                                  {item.name}
                                </span>
                              </div>

                              <div className="flex items-center gap-2.5 shrink-0">
                                <span className="text-xs font-mono font-bold text-emerald-400">
                                  {item.quantity} {item.unit}
                                </span>

                                {/* Quick-Commerce Popover Action */}
                                <div className="relative">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActivePopoverKey(isPopoverOpen ? null : checkKey);
                                    }}
                                    aria-label={`Search ${links.sanitizedName || item.name} on quick-commerce platforms`}
                                    title={`Search ${links.sanitizedName || item.name} on quick-commerce`}
                                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-gray-400 hover:text-emerald-400 border border-slate-700/80 transition-all active:scale-95 focus-visible:outline-emerald-400"
                                  >
                                    <ShoppingBag className="w-3.5 h-3.5" />
                                  </button>

                                  {/* Floating Provider Popover */}
                                  {isPopoverOpen && (
                                    <div
                                      ref={popoverRef}
                                      onClick={(e) => e.stopPropagation()}
                                      className="absolute right-0 top-full mt-1.5 z-40 w-48 p-2 bg-slate-950 border border-slate-700 rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-150"
                                    >
                                      <div className="px-2 py-1 mb-1 border-b border-slate-800 flex items-center justify-between">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 truncate">
                                          Search: {links.sanitizedName || item.name}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => setActivePopoverKey(null)}
                                          className="text-gray-500 hover:text-gray-300 p-0.5 rounded"
                                          aria-label="Close search popover"
                                        >
                                          <X className="w-3 h-3" />
                                        </button>
                                      </div>
                                      <div className="space-y-1">
                                        {(['blinkit', 'zepto', 'instamart'] as QuickCommerceProvider[]).map((prov) => {
                                          const cfg = PROVIDER_CONFIG[prov];
                                          const url = links[prov];
                                          return (
                                            <a
                                              key={prov}
                                              href={url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setActivePopoverKey(null);
                                              }}
                                              className={`flex items-center justify-between w-full px-2.5 py-1.5 text-xs font-bold rounded-xl transition-all border border-transparent ${cfg.accentBorder} bg-slate-900/80 hover:bg-slate-900 ${cfg.accentColor}`}
                                            >
                                              <span>{cfg.label}</span>
                                              <ExternalLink className="w-3 h-3 opacity-70" />
                                            </a>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
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

      {/* Batch Export Modal */}
      <QuickCommerceExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        groceryList={groceryList}
        groceryChecked={groceryChecked}
        showToast={showToast}
      />
    </div>
  );
};

export default WeeklyMealPlanner;

