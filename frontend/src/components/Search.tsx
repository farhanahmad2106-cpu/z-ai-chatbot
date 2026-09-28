import React, { useState, useEffect, useMemo } from 'react';
import { Search as SearchIcon, SlidersHorizontal, Plus, Minus, Check, X, Globe, Search as MiniSearch, Loader2, AlertTriangle } from 'lucide-react';
import { useUserStats } from '../context/UserStatsContext';
import { useUserProfile } from '../context/UserProfileContext';
import { useToast } from '../context/ToastContext';
import { API_BASE } from '../config';

// UI Component for disabled "Coming Soon" features
const ComingSoonOption = ({ title }: { title: string }) => (
  <div className="relative group">
    <div className="absolute top-0 right-4 -translate-y-1/2 bg-slate-800 text-[9px] font-black px-2 py-1 rounded border border-slate-700 text-emerald-500/80 tracking-tighter z-10">
      COMING SOON
    </div>
    <button className="w-full p-6 bg-slate-900/40 border border-slate-800/60 rounded-4xl text-gray-500 font-bold text-left cursor-default pointer-events-none">
      {title}
    </button>
  </div>
);

/** * INTERFACES
 * Define the structure of our data to ensure Type Safety across the app.
 */
interface Ingredient {
  name: string;
  safety: string;
  description: string;
}

interface FoodItem {
  _id: string;
  name: string;
  brand: string;
  safety_score: number;
  status: string;
  ingredients: Ingredient[];
  warnings: string[];
}


const DEFAULT_FALLBACK_FOODS: FoodItem[] = [
  {
    _id: 'fallback-1',
    name: 'Paneer Butter Masala',
    brand: 'Amul / Fresh Cottage',
    safety_score: 92,
    status: 'Safe',
    ingredients: [
      { name: 'Cottage Cheese (Paneer)', safety: 'Safe', description: 'Rich in protein and healthy fats.' },
      { name: 'Tomato Puree', safety: 'Safe', description: 'Natural lycopene and vitamin C source.' },
      { name: 'Butter & Cream', safety: 'Moderate', description: 'Provides richness; consume in moderation.' },
      { name: 'Kasuri Methi', safety: 'Safe', description: 'Traditional aromatic herb.' }
    ],
    warnings: ['Contains Dairy']
  },
  {
    _id: 'fallback-2',
    name: 'Whole Wheat Tawa Roti',
    brand: 'Mother Dairy Atta',
    safety_score: 96,
    status: 'Safe',
    ingredients: [
      { name: 'Whole Wheat Flour', safety: 'Safe', description: 'High dietary fiber and complex carbs.' },
      { name: 'Water & Sea Salt', safety: 'Safe', description: 'Pure hydration and minimal sodium.' }
    ],
    warnings: ['Contains Gluten']
  },
  {
    _id: 'fallback-3',
    name: 'Yellow Dal Tadka',
    brand: 'MTR Foods',
    safety_score: 94,
    status: 'Safe',
    ingredients: [
      { name: 'Arhar Dal (Toor)', safety: 'Safe', description: 'Plant-based lean protein.' },
      { name: 'Desi Ghee', safety: 'Safe', description: 'Healthy butyric acid for gut health.' },
      { name: 'Cumin & Mustard', safety: 'Safe', description: 'Digestive spices.' }
    ],
    warnings: []
  },
  {
    _id: 'fallback-4',
    name: 'Rolled Oats Porridge',
    brand: 'Quaker Oats',
    safety_score: 97,
    status: 'Safe',
    ingredients: [
      { name: 'Whole Grain Rolled Oats', safety: 'Safe', description: 'Beta-glucan fiber lowers cholesterol.' },
      { name: 'Skimmed Milk', safety: 'Safe', description: 'Calcium and protein.' },
      { name: 'Raw Honey', safety: 'Safe', description: 'Natural antioxidant sweetener.' }
    ],
    warnings: ['Contains Gluten']
  },
  {
    _id: 'fallback-5',
    name: 'Punjabi Chana Masala',
    brand: "Haldiram's",
    safety_score: 90,
    status: 'Safe',
    ingredients: [
      { name: 'Kabuli Chana (Chickpeas)', safety: 'Safe', description: 'High fiber and plant protein.' },
      { name: 'Onion & Tomato Gravy', safety: 'Safe', description: 'Rich flavor base.' },
      { name: 'Amchur (Dry Mango)', safety: 'Safe', description: 'Tangy digestive spice.' }
    ],
    warnings: []
  },
  {
    _id: 'fallback-6',
    name: 'Crispy Masala Dosa',
    brand: 'iD Fresh Food',
    safety_score: 89,
    status: 'Safe',
    ingredients: [
      { name: 'Fermented Batter', safety: 'Safe', description: 'Probiotic benefits for digestion.' },
      { name: 'Spiced Potato Masala', safety: 'Safe', description: 'Carbohydrates and potassium.' }
    ],
    warnings: []
  },
  {
    _id: 'fallback-7',
    name: 'Protein Egg Bhurji',
    brand: 'Farm Fresh',
    safety_score: 95,
    status: 'Safe',
    ingredients: [
      { name: 'Whole Eggs', safety: 'Safe', description: 'Complete protein and choline.' },
      { name: 'Green Chilies & Onions', safety: 'Safe', description: 'Metabolism boosting veggies.' }
    ],
    warnings: ['Contains Eggs']
  },
  {
    _id: 'fallback-8',
    name: 'Steamed Idli & Sambar',
    brand: 'iD Fresh Food',
    safety_score: 96,
    status: 'Safe',
    ingredients: [
      { name: 'Steamed Rice & Urad Dal', safety: 'Safe', description: 'Easy to digest fermented meal.' },
      { name: 'Mixed Vegetable Sambar', safety: 'Safe', description: 'Fiber-rich lentil soup.' }
    ],
    warnings: []
  },
  {
    _id: 'fallback-9',
    name: 'Brown Basmati Rice',
    brand: 'Daawat',
    safety_score: 93,
    status: 'Safe',
    ingredients: [
      { name: 'Whole Grain Brown Rice', safety: 'Safe', description: 'Low glycemic index carb.' }
    ],
    warnings: []
  },
  {
    _id: 'fallback-10',
    name: 'Grilled Chicken Salad',
    brand: 'Fresho',
    safety_score: 96,
    status: 'Safe',
    ingredients: [
      { name: 'Boneless Chicken Breast', safety: 'Safe', description: 'Lean muscle building protein.' },
      { name: 'Lettuce & Bell Peppers', safety: 'Safe', description: 'Vitamins A & C.' }
    ],
    warnings: ['Poultry']
  },
  {
    _id: 'fallback-11',
    name: 'Fresh Plain Dahi / Curd',
    brand: 'Mother Dairy',
    safety_score: 98,
    status: 'Safe',
    ingredients: [
      { name: 'Pasteurized Milk', safety: 'Safe', description: 'Calcium rich.' },
      { name: 'Lactic Cultures', safety: 'Safe', description: 'Gut microbiome support.' }
    ],
    warnings: ['Contains Dairy']
  },
  {
    _id: 'fallback-12',
    name: 'Palak Paneer',
    brand: 'ITC Master Chef',
    safety_score: 94,
    status: 'Safe',
    ingredients: [
      { name: 'Spinach Puree', safety: 'Safe', description: 'Iron and folate rich.' },
      { name: 'Cottage Cheese', safety: 'Safe', description: 'Quality dairy protein.' }
    ],
    warnings: ['Contains Dairy']
  },
  {
    _id: 'fallback-13',
    name: 'Rajma Chawal Curry',
    brand: "Haldiram's",
    safety_score: 91,
    status: 'Safe',
    ingredients: [
      { name: 'Red Kidney Beans', safety: 'Safe', description: 'Complex carbohydrates and protein.' },
      { name: 'Spiced Tomato Onion Gravy', safety: 'Safe', description: 'Rich flavor profile.' }
    ],
    warnings: []
  },
  {
    _id: 'fallback-14',
    name: 'Almonds & Walnut Mix',
    brand: 'Happilo',
    safety_score: 97,
    status: 'Safe',
    ingredients: [
      { name: 'Raw California Almonds', safety: 'Safe', description: 'Vitamin E and healthy monounsaturated fats.' },
      { name: 'Chilean Walnuts', safety: 'Safe', description: 'Omega-3 fatty acid powerhouse.' }
    ],
    warnings: ['Contains Tree Nuts']
  },
  {
    _id: 'fallback-15',
    name: 'Moong Dal Khichdi',
    brand: 'MTR Foods',
    safety_score: 95,
    status: 'Safe',
    ingredients: [
      { name: 'Yellow Moong Dal & Rice', safety: 'Safe', description: 'Comforting, balanced, gut-friendly meal.' },
      { name: 'Cumin & Ghee', safety: 'Safe', description: 'Digestive aid.' }
    ],
    warnings: []
  },
  {
    _id: 'fallback-16',
    name: 'Vegetable Pulao',
    brand: "Haldiram's",
    safety_score: 90,
    status: 'Safe',
    ingredients: [
      { name: 'Basmati Rice', safety: 'Safe', description: 'Aromatic carbohydrate source.' },
      { name: 'Green Peas & Carrots', safety: 'Safe', description: 'Essential micronutrients.' }
    ],
    warnings: []
  },
  {
    _id: 'fallback-17',
    name: 'Sprouts & Chana Salad',
    brand: 'Fresho',
    safety_score: 97,
    status: 'Safe',
    ingredients: [
      { name: 'Sprouted Moong & Chana', safety: 'Safe', description: 'Enzyme-rich raw plant power.' },
      { name: 'Pomegranate & Lemon', safety: 'Safe', description: 'Vitamin C boost.' }
    ],
    warnings: []
  },
  {
    _id: 'fallback-18',
    name: 'Multigrain Chapati',
    brand: 'Aashirvaad',
    safety_score: 95,
    status: 'Safe',
    ingredients: [
      { name: 'Multi-Grain Atta Mix', safety: 'Safe', description: 'Oats, Soy, Chana, and Wheat blend.' }
    ],
    warnings: ['Contains Gluten', 'Contains Soy']
  }
];

const ALL_INDIAN_LANGUAGES = [
  'Hindi', 'Bengali', 'Marathi', 'Telugu', 'Tamil', 'Gujarati', 'Urdu', 'Kannada', 'Odia', 'Punjabi', 
  'Malayalam', 'Assamese', 'Sanskrit', 'Maithili', 'Santali', 'Kashmiri', 'Konkani', 'Dogri', 'Nepali', 'Sindhi',
  'Manipuri', 'Bodo', 'Tulu', 'Kodava', 'Magahi', 'Bhojpuri', 'Marwari', 'Chhattisgarhi', 'Haryanvi', 'Garhwali',
  'Kumaoni', 'Angika', 'Mundari', 'Khasi', 'Garo', 'Mizo', 'Kokborok', 'Lepcha', 'Sikkimese', 'Bhutia',
  'Mina', 'Bhil', 'Gondi', 'Korku', 'Varli', 'Dravidian', 'Badaga', 'Irula', 'Paniya', 'Kurumba'
];

export default function Search({ onNavigateToDashboard }: { onNavigateToDashboard?: () => void }) {
  // --- STATE MANAGEMENT ---
  const [searchQuery, setSearchQuery] = useState('');           // Main search input
  const [foods, setFoods] = useState<FoodItem[]>(() => {
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem('z_sehealth_cached_search_foods');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        } catch (e) {
          console.error("Failed to parse cached search foods", e);
        }
      }
    }
    return DEFAULT_FALLBACK_FOODS;
  });
  const [isRevalidating, setIsRevalidating] = useState(false);           // Data from Backend
  const [isOfflineCatalog, setIsOfflineCatalog] = useState<boolean>(() => 
    typeof navigator !== 'undefined' && !navigator.onLine
  );
  const [loading, setLoading] = useState(false);                 // Loading spinner toggle
  const [searchError, setSearchError] = useState<string | null>(null); // Error for non-food search
  const [visibleCount, setVisibleCount] = useState(18);          // Pagination: items to show

  const [activeModal, setActiveModal] = useState<'main' | 'translator' | null>(null); // Modal routing
  const [selectedFoodItem, setSelectedFoodItem] = useState<FoodItem | null>(null);    // Item targeted for options/translation
  
  const [isSearchingLang, setIsSearchingLang] = useState(false); // Toggle for language search bar
  const [langSearchTerm, setLangSearchTerm] = useState('');      // Search term for the language list
  const [showMoreClicks, setShowMoreClicks] = useState(0);       // "Show More" language pagination
  const [translating, setTranslating] = useState(false);         // Loading state for API translation
  const [recentItems, setRecentItems] = useState<FoodItem[]>([]); // Recently clicked items

  // --- MULTI-MEAL LOG SELECTION STATE ---
  const [selectedMealsMap, setSelectedMealsMap] = useState<Record<string, { food: FoodItem; count: number }>>({});
  const [lastSelectedFoodId, setLastSelectedFoodId] = useState<string | null>(null);
  const [isSubmittingBatch, setIsSubmittingBatch] = useState(false);
  const { showToast } = useToast();

  /**
   * CRITICAL FIX: Translated Data Store
   * We store translations in a Record where the Key is the Food ID.
   * The value is an array of strings [TranslatedName1, TranslatedDesc1, TranslatedName2, TranslatedDesc2...]
   */
  const [translatedData, setTranslatedData] = useState<Record<string, string[]>>({});
  
  const { logMultipleMeals } = useUserStats();
  const { preferences } = useUserProfile();

  // --- MULTI-MEAL SELECTION HELPERS ---
  const addMealToSelection = (food: FoodItem) => {
    addToRecent(food);
    setSelectedMealsMap(prev => {
      const existing = prev[food._id];
      const count = existing ? existing.count + 1 : 1;
      return {
        ...prev,
        [food._id]: { food, count }
      };
    });
    setLastSelectedFoodId(food._id);
  };

  const removeMealFromSelection = (foodId: string) => {
    setSelectedMealsMap(prev => {
      const existing = prev[foodId];
      if (!existing) return prev;
      if (existing.count <= 1) {
        const copy = { ...prev };
        delete copy[foodId];
        return copy;
      } else {
        return {
          ...prev,
          [foodId]: { ...existing, count: existing.count - 1 }
        };
      }
    });
  };

  const clearAllSelectedMeals = () => {
    setSelectedMealsMap({});
    setLastSelectedFoodId(null);
  };

  const displayedFoods = useMemo(() => {
    if (!searchQuery.trim()) return foods;
    const q = searchQuery.toLowerCase().trim();
    return foods.filter(f => 
      f.name.toLowerCase().includes(q) ||
      f.brand.toLowerCase().includes(q) ||
      (f.ingredients && f.ingredients.some(i => i.name.toLowerCase().includes(q)))
    );
  }, [foods, searchQuery]);

  const totalSelectedCount = useMemo(() => {
    return Object.values(selectedMealsMap).reduce((sum, item) => sum + item.count, 0);
  }, [selectedMealsMap]);

  const handleDecrementLastOrSelected = () => {
    if (lastSelectedFoodId && selectedMealsMap[lastSelectedFoodId]) {
      removeMealFromSelection(lastSelectedFoodId);
      return;
    }
    const keys = Object.keys(selectedMealsMap);
    if (keys.length > 0) {
      removeMealFromSelection(keys[keys.length - 1]);
    }
  };

  const handleIncrementLastOrSelected = () => {
    if (lastSelectedFoodId && selectedMealsMap[lastSelectedFoodId]) {
      addMealToSelection(selectedMealsMap[lastSelectedFoodId].food);
      return;
    }
    const keys = Object.keys(selectedMealsMap);
    if (keys.length > 0) {
      addMealToSelection(selectedMealsMap[keys[keys.length - 1]].food);
    }
  };

  const handleConfirmBatchLog = async () => {
    const items = Object.values(selectedMealsMap);
    if (items.length === 0) return;

    setIsSubmittingBatch(true);
    try {
      const countLogged = totalSelectedCount;
      const success = await logMultipleMeals(items as unknown as { food: Record<string, unknown>; count: number; }[]);
      if (success) {
        showToast(`Successfully logged ${countLogged} meal${countLogged > 1 ? 's' : ''}!`);
        clearAllSelectedMeals();
        if (onNavigateToDashboard) {
          setTimeout(() => {
            onNavigateToDashboard();
          }, 1200);
        }
      } else {
        showToast("Failed to log meals. Please check your network or login status.");
      }
    } catch (err) {
      console.error("Batch log error:", err);
    } finally {
      setIsSubmittingBatch(false);
    }
  };

  // --- API CALLS ---

  async function fetchInitialFoods() {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setIsOfflineCatalog(true);
      return;
    }
    setIsRevalidating(true);
    try {
      const response = await fetch(`${API_BASE}/api/foods?search=`);
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          setFoods(data);
          setIsOfflineCatalog(false);
          localStorage.setItem('z_sehealth_cached_search_foods', JSON.stringify(data));
        }
      }
    } catch (err) {
      console.warn("Background search fetch failed, keeping local catalog:", err);
      setIsOfflineCatalog(true);
    } finally {
      setIsRevalidating(false);
      setLoading(false);
    }
  }

  useEffect(() => { 
    const timer = setTimeout(() => {
      fetchInitialFoods();
      const savedRecents = localStorage.getItem('recentSearchedFoods');
      if (savedRecents) {
        try {
          setRecentItems(JSON.parse(savedRecents));
        } catch (e) {
          console.error("Failed to parse recent items", e);
        }
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const getOfflineCatalog = (): FoodItem[] => {
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem('z_sehealth_cached_search_foods');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        } catch (e) {
          console.error("Failed to parse cached search foods", e);
        }
      }
    }
    return DEFAULT_FALLBACK_FOODS;
  };

  const performLocalSearch = (query: string) => {
    const catalog = getOfflineCatalog();
    const cleanQuery = query.toLowerCase().trim();
    if (!cleanQuery) {
      setFoods(catalog);
      setSearchError(null);
      return;
    }

    const matches = catalog.filter(f =>
      f.name.toLowerCase().includes(cleanQuery) ||
      f.brand.toLowerCase().includes(cleanQuery) ||
      (f.ingredients && f.ingredients.some(i => i.name.toLowerCase().includes(cleanQuery)))
    );

    if (matches.length > 0) {
      setFoods(matches);
      setSearchError(null);
    } else {
      setFoods([]);
      setSearchError(`No foods found matching "${query}" in local offline catalog.`);
    }
  };

  // Listen to network transitions to automatically switch catalog modes
  useEffect(() => {
    const handleOnline = () => {
      setIsOfflineCatalog(false);
      fetchInitialFoods();
    };
    const handleOffline = () => {
      setIsOfflineCatalog(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const addToRecent = (food: FoodItem) => {
    setRecentItems(prev => {
      const filtered = prev.filter(item => item._id !== food._id);
      const updated = [food, ...filtered].slice(0, 15); // Keep last 15 items
      localStorage.setItem('recentSearchedFoods', JSON.stringify(updated));
      return updated;
    });
  };


  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setVisibleCount(18);

    // If browser is offline, instantly filter locally without network stall
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setIsOfflineCatalog(true);
      performLocalSearch(searchQuery);
      return;
    }

    setIsRevalidating(true);
    setSearchError(null);
    try {
      const response = await fetch(`${API_BASE}/api/foods?search=${encodeURIComponent(searchQuery)}`);
      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }
      const data = await response.json();
      setIsOfflineCatalog(false);
      if (data.error) {
        setSearchError(data.error);
      } else if (Array.isArray(data) && data.length === 0) {
        setSearchError("No results found. Please check your spelling or try another food item.");
      } else if (Array.isArray(data)) {
        setFoods(data);
        localStorage.setItem('z_sehealth_cached_search_foods', JSON.stringify(data));
      }
    } catch (err) { 
      console.warn("Search network request failed, falling back to local catalog:", err);
      setIsOfflineCatalog(true);
      performLocalSearch(searchQuery);
    } finally { 
      setIsRevalidating(false);
      setLoading(false); 
    }
  };

  /**
   * TRANSLATION LOGIC
   * 1. Extracts all text (names + descriptions) from the selected food.
   * 2. Sends them to the Python backend.
   * 3. Stores the result under the specific food's ID.
   */
  const handleTranslate = async (language: string) => {
    if (!selectedFoodItem) return;
    setTranslating(true);
    
    // Flatten names and descriptions into a single array for batch processing
    const textsToTranslate = selectedFoodItem.ingredients.flatMap(i => [i.name, i.description]);
    
    try {
      const response = await fetch(`${API_BASE}/api/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text_items: textsToTranslate, target_language: language })
      });
      const data = await response.json();
      
      if (data.translations) {
        setTranslatedData(prev => ({
          ...prev,
          [selectedFoodItem._id]: data.translations 
        }));
      }
      setActiveModal(null); // Close modal on success
      setIsSearchingLang(false);
    } catch (err) { 
      console.error("Translation Error:", err);
    } finally { 
      setTranslating(false); 
    }
  };

  /**
   * LANGUAGE FILTERING LOGIC
   * Dynamically filters the list of 50 languages based on search or "Show More" clicks.
   */
  const visibleLanguages = useMemo(() => {
    const filtered = ALL_INDIAN_LANGUAGES.filter(l => 
      l.toLowerCase().includes(langSearchTerm.toLowerCase())
    );
    // If the user is actively searching, show all matches. Otherwise, use pagination (6, 12, 18...).
    if (isSearchingLang && langSearchTerm !== '') return filtered;
    const countToShow = 6 + (6 * showMoreClicks);
    return filtered.slice(0, countToShow);
  }, [showMoreClicks, langSearchTerm, isSearchingLang]);

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6 font-outfit pb-36 relative">

      {/* Top Right Corner Tick Confirmation Button (Below Navbar) */}
      {totalSelectedCount > 0 && (
        <div className="fixed top-32 md:top-28 right-6 z-40 animate-in slide-in-from-top-4 fade-in duration-300">
          <button
            onClick={handleConfirmBatchLog}
            disabled={isSubmittingBatch}
            title="Confirm & Log Selected Meals"
            className="relative flex items-center gap-2.5 px-5 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 font-black rounded-full shadow-2xl shadow-emerald-500/30 hover:scale-105 active:scale-95 transition-all cursor-pointer border border-emerald-300/40 disabled:opacity-50"
          >
            {isSubmittingBatch ? (
              <Loader2 className="w-5 h-5 animate-spin text-slate-950" />
            ) : (
              <>
                <div className="bg-slate-950/20 p-1.5 rounded-full">
                  <Check className="w-5 h-5 stroke-[3] text-slate-950" />
                </div>
                <span className="text-sm font-black uppercase tracking-wide">
                  Log {totalSelectedCount} Meal{totalSelectedCount > 1 ? 's' : ''}
                </span>
              </>
            )}
            <span className="absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-slate-950 text-emerald-400 text-[11px] font-black border-2 border-emerald-400 shadow-md">
              {totalSelectedCount}
            </span>
          </button>
        </div>
      )}

      {/* Bottom Right Floating Counter Bar */}
      {totalSelectedCount > 0 && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className="flex items-center gap-3 bg-slate-900/95 backdrop-blur-2xl border border-emerald-500/50 p-2.5 px-4 rounded-full shadow-2xl shadow-emerald-950/80">
            {/* Minus Button */}
            <button
              onClick={handleDecrementLastOrSelected}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 active:scale-90 text-emerald-400 rounded-full transition-all border border-slate-700"
              title="Decrease Meal Count"
            >
              <Minus className="w-4 h-4 stroke-[3]" />
            </button>

            {/* Counter Display */}
            <div className="flex items-center gap-1.5 px-2">
              <span className="text-emerald-400 text-xl font-black tracking-tight">{totalSelectedCount}</span>
              <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">
                {totalSelectedCount === 1 ? 'Meal' : 'Meals'}
              </span>
            </div>

            {/* Plus Button */}
            <button
              onClick={handleIncrementLastOrSelected}
              className="p-2.5 bg-emerald-500 hover:bg-emerald-400 active:scale-90 text-slate-950 rounded-full transition-all shadow-md shadow-emerald-500/20"
              title="Increase Meal Count"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
            </button>

            {/* Divider & Clear */}
            <div className="h-6 w-[1px] bg-slate-800 mx-1" />
            
            <button
              onClick={clearAllSelectedMeals}
              className="p-2 hover:bg-rose-500/20 text-gray-400 hover:text-rose-400 rounded-full transition-colors"
              title="Clear Selection"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto">
        {/* Header Section */}
        <h1 className="text-4xl font-bold mb-2 tracking-tight">Search any food.</h1>
        <p className="text-gray-400 mb-8">Explore regional Indian dishes and check health flags instantly.</p>

        {/* Main Search Input */}
        <form onSubmit={handleSearch} className="relative mb-8">
          <input
            type="text"
            placeholder="Try 'paneer', 'roti'..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-14 pr-6 py-5 bg-slate-900 border border-slate-800 rounded-3xl text-lg focus:border-emerald-500 outline-none transition-all shadow-2xl"
          />
          <SearchIcon className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-500 w-6 h-6" />
        </form>

        {/* Offline Catalog Badge */}
        {isOfflineCatalog && (
          <div className="flex items-center justify-center gap-2 mb-6 text-xs font-bold text-amber-300 bg-amber-500/10 py-2 px-4 rounded-full border border-amber-500/30 w-fit mx-auto animate-in fade-in duration-200 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span>⚡ Offline Mode — Showing local food catalog</span>
          </div>
        )}

        {searchError && (
          <div className="mb-8 p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-400 font-bold text-center">
            {searchError}
          </div>
        )}

        {/* Recently Clicked Items */}
        {recentItems.length > 0 && !loading && (
          <div className="mb-12">
            <h2 className="text-xl font-bold mb-4 tracking-tight text-white">Recently Viewed</h2>
            <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar snap-x">
              {recentItems.map(item => {
                const selectedCount = selectedMealsMap[item._id]?.count || 0;
                return (
                  <div 
                    key={`recent-${item._id}`} 
                    className={`flex-shrink-0 w-64 bg-slate-900 border rounded-3xl p-5 hover:border-slate-700 transition-all snap-start cursor-pointer shadow-xl flex flex-col justify-between ${
                      selectedCount > 0 ? 'border-emerald-500/80 bg-slate-900/90 shadow-emerald-500/10' : 'border-slate-800'
                    }`}
                    onClick={() => { addToRecent(item); setSelectedFoodItem(item); setActiveModal('main'); }}
                  >
                    <div>
                      <div className="flex justify-between items-start mb-1">
                        <h3 className="text-lg font-bold text-white truncate leading-tight flex-1">{item.name.replace(/\d+$/, '').trim()}</h3>
                        {selectedCount > 0 && (
                          <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/30 ml-2">
                            {selectedCount}x
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mb-4">
                        <span className="text-gray-500 text-[10px] font-black uppercase tracking-widest">Brand:</span>
                        <p className="text-gray-300 text-[10px] font-black uppercase tracking-widest truncate">{item.brand}</p>
                      </div>
                    </div>
                    <div className="self-start">
                      <div className={`inline-flex px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest ${
                        item.safety_score >= 75 ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400' : 'bg-red-500/10 border-red-500/40 text-red-400'
                      }`}>
                        Score: {item.safety_score}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Non-Blocking Background Revalidation Indicator */}
        {isRevalidating && (
          <div className="flex items-center justify-center gap-2 mb-6 text-xs font-bold text-emerald-400 bg-emerald-500/10 py-2 px-4 rounded-full border border-emerald-500/20 w-fit mx-auto animate-pulse">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
            <span>Syncing fresh database items...</span>
          </div>
        )}

        {/* Food Grid */}
        {displayedFoods.length === 0 && !isRevalidating ? (
          <div className="text-center py-16 text-gray-400 bg-slate-900 border border-slate-800 rounded-3xl p-8 mb-16">
            <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
            <p className="text-lg font-bold text-white">No food items found</p>
            <p className="text-sm text-gray-400 mt-1">Try searching for &apos;paneer&apos;, &apos;roti&apos;, &apos;dal&apos;, or &apos;oats&apos;</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
            {displayedFoods.slice(0, visibleCount).map((food) => {
              const selectedCount = selectedMealsMap[food._id]?.count || 0;
              return (
                <div 
                  key={food._id} 
                  className={`bg-slate-900 border rounded-4xl p-7 flex flex-col h-full shadow-xl transition-all duration-300 ${
                    selectedCount > 0 
                      ? 'border-emerald-500/80 ring-1 ring-emerald-500/50 shadow-emerald-950/40' 
                      : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                
                {/* Food Header (Name, Brand, Score) */}
                <div className="flex justify-between items-start mb-4">
                    <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-2xl font-bold text-white leading-tight">
                          {food.name.replace(/\d+$/, '').trim()}
                      </h3>
                      {selectedCount > 0 && (
                        <span className="px-2.5 py-0.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[10px] font-black rounded-full uppercase tracking-wider animate-in fade-in">
                          {selectedCount}x Selected
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mb-2">
                        <span className="text-gray-500 text-[11px] font-black uppercase tracking-[0.15em]">Brand:</span>
                        <p className="text-gray-200 text-[11px] font-black uppercase tracking-[0.15em]">{food.brand}</p>
                    </div>

                    {/* Allergen Warning Banner based on User's Dietary Preferences */}
                    {(() => {
                      const userAllergies = preferences.allergies || [];
                      if (userAllergies.length === 0) return null;

                      // Check if food name or ingredients match user's configured allergies
                      const matchedAllergies = userAllergies.filter(allergy => {
                        const algLower = allergy.toLowerCase().trim();
                        if (!algLower) return false;
                        const inName = food.name.toLowerCase().includes(algLower);
                        const inIng = food.ingredients?.some(i => i.name.toLowerCase().includes(algLower) || i.description.toLowerCase().includes(algLower));
                        return inName || inIng;
                      });

                      if (matchedAllergies.length > 0) {
                        return (
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-500/15 border border-rose-500/40 text-rose-400 text-xs font-bold rounded-xl animate-pulse">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                            <span>Allergy Alert: Contains {matchedAllergies.join(', ')}</span>
                          </div>
                        );
                      }
                      return null;
                    })()}

                    </div>
                    <div className="flex flex-col items-end gap-3">
                    <button 
                        onClick={() => { addToRecent(food); setSelectedFoodItem(food); setActiveModal('main'); }}
                        className="p-3 bg-slate-800 hover:bg-slate-700 rounded-2xl transition-colors"
                    >
                        <SlidersHorizontal className="w-5 h-5 text-emerald-400" />
                    </button>
                    <div className={`px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest ${
                        food.safety_score >= 75 ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400' : 'bg-red-500/10 border-red-500/40 text-red-400'
                    }`}>
                        Score: {food.safety_score}
                    </div>
                    </div>
                </div>

                {/* Ingredients List with Ingredient-Level Allergen & Diet Marking */}
                <div className="grow space-y-3 mb-6">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black text-slate-500 dark:text-gray-400 uppercase tracking-widest">Key Ingredients & Safety Flags</p>
                      {preferences.allergies?.length > 0 && (
                        <span className="text-[9px] font-extrabold text-emerald-600 dark:text-emerald-400">Checked against profile</span>
                      )}
                    </div>
                    
                    <div className="bg-slate-100/90 dark:bg-slate-950/50 rounded-2xl p-3 sm:p-4 border border-slate-300 dark:border-slate-800/50 max-h-52 overflow-y-auto custom-scrollbar space-y-2.5">
                    {food.ingredients.map((ing, idx) => {
                        const tName = translatedData[food._id]?.[idx * 2];
                        const tDesc = translatedData[food._id]?.[idx * 2 + 1];
                        const displayName = tName || ing.name;
                        const displayDesc = tDesc || ing.description;

                        // Allergen Check
                        const userAllergies = preferences.allergies || [];
                        const matchedAllergy = userAllergies.find(a => {
                          const algLower = a.toLowerCase().trim();
                          if (!algLower) return false;
                          return ing.name.toLowerCase().includes(algLower) || ing.description.toLowerCase().includes(algLower);
                        });

                        // Diet Check (Vegetarian / Vegan vs. Meat / Fish / Egg)
                        const dietMode = preferences.diet?.toLowerCase() || '';
                        let isDietConflict = false;
                        if (dietMode === 'vegetarian' || dietMode === 'vegan') {
                          const nonVegKeywords = ['chicken', 'mutton', 'beef', 'pork', 'fish', 'meat', 'gelatin', 'gelatine', 'lard'];
                          if (dietMode === 'vegan') nonVegKeywords.push('milk', 'dairy', 'cheese', 'butter', 'egg', 'honey');
                          isDietConflict = nonVegKeywords.some(kw => ing.name.toLowerCase().includes(kw) || ing.description.toLowerCase().includes(kw));
                        }
                        
                        return (
                          <div 
                            key={idx} 
                            className={`p-3 rounded-xl transition-all border shadow-sm ${
                              matchedAllergy 
                                ? 'bg-rose-50 border-rose-300 dark:bg-rose-500/15 dark:border-rose-500/40 text-rose-900 dark:text-rose-200' 
                                : isDietConflict
                                ? 'bg-amber-50 border-amber-300 dark:bg-amber-500/15 dark:border-amber-500/40 text-amber-900 dark:text-amber-200'
                                : 'bg-white border-slate-300 dark:bg-slate-900/60 dark:border-slate-800/80'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <p className={`text-sm font-extrabold ${matchedAllergy ? 'text-rose-700 dark:text-rose-400' : isDietConflict ? 'text-amber-800 dark:text-amber-400' : 'text-slate-900 dark:text-slate-100'}`}>
                                {displayName}
                              </p>
                              {matchedAllergy ? (
                                <span className="text-[9px] font-black px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/40 flex items-center gap-1 shrink-0 shadow-sm">
                                  <AlertTriangle className="w-2.5 h-2.5 text-rose-600 dark:text-rose-400" /> ⚠️ Allergen: {matchedAllergy}
                                </span>
                              ) : isDietConflict ? (
                                <span className="text-[9px] font-black px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40 shrink-0 shadow-sm">
                                  ❌ {preferences.diet} Conflict
                                </span>
                              ) : (
                                <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40 shrink-0 shadow-sm flex items-center gap-1">
                                  ✓ Safe
                                </span>
                              )}
                            </div>
                            <p className={`text-xs leading-relaxed ${matchedAllergy ? 'text-rose-800 dark:text-rose-200' : isDietConflict ? 'text-amber-800 dark:text-amber-200' : 'text-slate-700 dark:text-gray-400 font-medium'}`}>
                              {displayDesc}
                            </p>
                          </div>
                        );
                    })}
                    </div>
                </div>

                {/* Multi-Select Action Controls */}
                {selectedCount > 0 ? (
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => removeMealFromSelection(food._id)}
                      className="p-4 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-rose-400 font-bold rounded-2xl flex items-center justify-center transition-all active:scale-95 border border-slate-700"
                      title="Decrease Quantity"
                    >
                      <Minus className="w-5 h-5 stroke-[2.5]" />
                    </button>
                    <div className="grow py-3.5 bg-emerald-500/15 border border-emerald-500/40 rounded-2xl flex items-center justify-center gap-2 text-emerald-400 font-black text-sm shadow-inner">
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>Selected ({selectedCount})</span>
                    </div>
                    <button 
                      onClick={() => addMealToSelection(food)}
                      className="p-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl flex items-center justify-center transition-all active:scale-95 shadow-md shadow-emerald-950/30"
                      title="Add Another Portion"
                    >
                      <Plus className="w-5 h-5 stroke-[2.5]" />
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => addMealToSelection(food)}
                    className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-emerald-950/20"
                  >
                    <Plus className="w-5 h-5" /> Log Meal
                  </button>
                )}
                </div>
              );
            })}
            </div>
        )}

        {/* Load More Button */}
        {displayedFoods.length > visibleCount && !loading && (
          <div className="flex justify-center mt-12 mb-20">
            <button 
              onClick={() => setVisibleCount(prev => prev + 18)}
              className="p-5 bg-slate-900 border border-slate-800 rounded-full hover:bg-slate-800 hover:border-emerald-500 group transition-all shadow-2xl relative z-10"
            >
              <Plus className="w-8 h-8 text-emerald-500 group-hover:rotate-90 transition-transform duration-300" />
            </button>
          </div>
        )}
      </div>

      {/* --- MODAL SYSTEM --- */}
      {activeModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl flex items-center justify-center z-100 p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-4xl p-8 relative shadow-2xl">
            {/* Close Button */}
            <button onClick={() => { setActiveModal(null); setIsSearchingLang(false); }} className="absolute right-8 top-8 text-gray-500 hover:text-white z-20">
              <X className="w-6 h-6" />
            </button>

            {/* MODAL VIEW 1: Main Options */}
            {activeModal === 'main' && (
              <div className="space-y-6 pt-4">
                <div className="mb-8">
                  <h2 className="text-3xl font-bold">Options</h2>
                  <p className="text-gray-500">Configure details for {selectedFoodItem?.name.replace(/\d+$/, '')}</p>
                </div>
                
                <button 
                  onClick={() => setActiveModal('translator')}
                  className="w-full p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-3xl text-emerald-400 font-bold text-left hover:bg-emerald-500/20 transition-all flex justify-between items-center group"
                >
                  Language Translator 
                  <Globe className="w-6 h-6 group-hover:rotate-12 transition-transform" />
                </button>

                <ComingSoonOption title="Explain Briefly—" />
                <ComingSoonOption title="Manufacturer Details" />
                <ComingSoonOption title="Suggest From This Brand" />
              </div>
            )}

            {/* MODAL VIEW 2: Translator Selection */}
            {activeModal === 'translator' && (
              <div className="flex flex-col max-h-[75vh]">
                <div className="flex items-center h-12 mb-6">
                  {!isSearchingLang ? (
                    <div className="flex items-center justify-between w-full pr-12">
                      <div className="flex items-center gap-3">
                        <Globe className="w-6 h-6 text-emerald-500" />
                        <h3 className="text-xl font-bold">Language Translator</h3>
                      </div>
                      <button onClick={() => setIsSearchingLang(true)} className="p-2 hover:bg-slate-800 rounded-full transition-colors">
                        <MiniSearch className="w-5 h-5 text-gray-400" />
                      </button>
                    </div>
                  ) : (
                    /* Search Bar inside Modal */
                    <div className="flex items-center w-full gap-3 bg-slate-800/50 rounded-2xl px-4 py-2 border border-slate-700 animate-in fade-in slide-in-from-right-2">
                      <MiniSearch className="w-4 h-4 text-gray-500" />
                      <input 
                        autoFocus
                        type="text"
                        placeholder="Type to search..."
                        value={langSearchTerm}
                        onChange={(e) => setLangSearchTerm(e.target.value)}
                        className="bg-transparent border-none outline-none w-full text-sm py-1 text-white"
                      />
                      <button onClick={() => { setIsSearchingLang(false); setLangSearchTerm(''); }} className="text-[10px] text-emerald-500 font-black uppercase tracking-widest whitespace-nowrap">Hide Search</button>
                    </div>
                  )}
                </div>

                {/* English Simplifier (Special Case) */}
                <button 
                  onClick={() => handleTranslate('Simplified English')} 
                  disabled={translating}
                  className="w-full p-5 mb-4 bg-emerald-500/10 border border-emerald-500/40 rounded-3xl text-emerald-400 font-black text-center hover:bg-emerald-500/20 transition-all disabled:opacity-50"
                >
                  {translating ? "Translating..." : "Simplify Ing. (English)"}
                </button>

                {/* Regional Languages Grid */}
                <div className="overflow-y-auto custom-scrollbar pr-2 grid grid-cols-2 gap-3 mb-6">
                  {visibleLanguages.map(lang => (
                    <button 
                      key={lang} 
                      onClick={() => handleTranslate(lang)}
                      disabled={translating}
                      className="p-4 bg-slate-950 border border-slate-800 rounded-2xl text-sm font-medium hover:border-emerald-500 hover:text-emerald-400 text-left transition-all disabled:opacity-50"
                    >
                      {lang}
                    </button>
                  ))}
                </div>

                {/* Show More Trigger */}
                {!isSearchingLang && ALL_INDIAN_LANGUAGES.length > visibleLanguages.length && (
                  <button 
                    onClick={() => setShowMoreClicks(prev => prev + 1)}
                    className="w-full py-4 text-emerald-500 text-xs font-black hover:text-emerald-400 transition-colors border-t border-slate-800 tracking-[0.2em]"
                  >
                    SHOW MORE LANGUAGES
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}