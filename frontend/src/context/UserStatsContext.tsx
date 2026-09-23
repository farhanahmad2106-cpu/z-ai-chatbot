import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { API_BASE } from '../config';
import { queueOfflineMeal, syncQueuedMealsToServer, type SyncResult } from '../utils/offlineSync';

interface UserStats {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  last_updated: string;
}

export interface DailyGoals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source?: 'auto' | 'manual' | 'default';
  updated_at?: string;
}

interface UserStatsContextType {
  stats: UserStats;
  dailyGoals: DailyGoals;
  updateDailyGoals: (goals: DailyGoals) => Promise<boolean>;
  streak: number;
  tier: string;
  scansUsed: number;
  scanLimit: number;
  loadingUpgrade: boolean;
  showUpgradeModal: boolean;
  setShowUpgradeModal: (show: boolean) => void;
  upgradePlan: (planId: string) => Promise<void>;
  refreshSubscription: () => Promise<void>;
  logMeal: (foodItem: any, options?: { silent?: boolean }) => Promise<boolean>;
  logMultipleMeals: (items: Array<{ food: any; count: number }>) => Promise<boolean>;
  syncQueuedMeals: () => Promise<SyncResult>;
  loadingStats: boolean;
  requestNotificationPermission: () => void;
}

const dummyStats: UserStats = {
  calories: 1250,
  protein: 85,
  carbs: 140,
  fat: 42,
  last_updated: new Date().toISOString()
};

const dummyGoals: DailyGoals = {
  calories: 2000,
  protein: 140,
  carbs: 250,
  fat: 70,
  source: 'default'
};

const UserStatsContext = createContext<UserStatsContextType | undefined>(undefined);

export function useUserStats() {
  const context = useContext(UserStatsContext);
  if (context === undefined) {
    throw new Error('useUserStats must be used within a UserStatsProvider');
  }
  return context;
}

export function UserStatsProvider({ children }: { children: React.ReactNode }) {
  const { currentUser, setShowLoginModal } = useAuth();
  const { showToast } = useToast();

  const [stats, setStats] = useState<UserStats>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('z_sehealth_cached_user_stats');
      if (saved) {
        try { return JSON.parse(saved); } catch (e) { console.error(e); }
      }
    }
    return dummyStats;
  });

  const [streak, setStreak] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('z_sehealth_cached_user_streak');
      if (saved) {
        try { return JSON.parse(saved); } catch (e) { console.error(e); }
      }
    }
    return 1;
  });

  const [dailyGoals, setDailyGoals] = useState<DailyGoals>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('z_sehealth_cached_user_goals');
      if (saved) {
        try { return JSON.parse(saved); } catch (e) { console.error(e); }
      }
    }
    return dummyGoals;
  });

  const [loadingStats, setLoadingStats] = useState<boolean>(false);

  // --- FREEMIUM STATE ---
  const [tier, setTier] = useState<string>('free');
  const [scansUsed, setScansUsed] = useState<number>(0);
  const [scanLimit, setScanLimit] = useState<number>(20);
  const [loadingUpgrade, setLoadingUpgrade] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // --- FREEMIUM: Fetch subscription status ---
  const fetchSubscriptionStatus = useCallback(async () => {
    if (!currentUser) return;
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(`${API_BASE}/api/subscription/status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setTier(data.tier ?? 'free');
        setScansUsed(data.scans_used ?? 0);
        setScanLimit(data.scan_limit ?? 20);
      }
    } catch (error) {
      console.error('Failed to fetch subscription status', error);
    }
  }, [currentUser]);

  const fetchStats = useCallback(async () => {
    if (!currentUser) return;
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(`${API_BASE}/api/user/stats`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.stats) {
          setStats(data.stats);
          localStorage.setItem('z_sehealth_cached_user_stats', JSON.stringify(data.stats));
        }
        if (data.streak !== undefined) {
          setStreak(data.streak);
          localStorage.setItem('z_sehealth_cached_user_streak', JSON.stringify(data.streak));
        }
        if (data.daily_goals) {
          setDailyGoals(data.daily_goals);
          localStorage.setItem('z_sehealth_cached_user_goals', JSON.stringify(data.daily_goals));
        }
      }
    } catch (error) {
      console.error("Failed to fetch user stats", error);
    } finally {
      setLoadingStats(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (currentUser) {
      // Revalidate in background without blocking initial instant cached/dummy render
      Promise.all([fetchStats(), fetchSubscriptionStatus()]);
    } else {
      setStats(dummyStats);
      setStreak(1);
      setDailyGoals(dummyGoals);
      setTier('free');
      setScansUsed(0);
      setScanLimit(20);
    }
  }, [currentUser, fetchStats, fetchSubscriptionStatus]);

  // --- FREEMIUM: Upgrade plan (create Razorpay subscription) ---
  const upgradePlan = useCallback(async (planId: string): Promise<void> => {
    if (!currentUser) {
      setShowLoginModal(true);
      return;
    }
    setLoadingUpgrade(true);
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(`${API_BASE}/api/subscription/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ plan_id: planId }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail ?? `Failed to create subscription (${response.status})`);
      }

      const data = await response.json();
      const { subscription_id, razorpay_key_id } = data;
      const keyIdToUse = razorpay_key_id || import.meta.env.VITE_RAZORPAY_KEY_ID;

      if (!keyIdToUse) {
        throw new Error('Razorpay Key ID is missing. Please check your environment configuration.');
      }

      await new Promise<void>((resolve, reject) => {
        if ((window as any).Razorpay) { resolve(); return; }
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load Razorpay SDK'));
        document.body.appendChild(script);
      });

      const planNames: Record<string, string> = {
        starter: 'Z-Starter',
        pro: 'Z-Pro',
        elite: 'Z-Elite',
      };

      const options = {
        key: keyIdToUse,
        subscription_id: subscription_id,
        name: 'Z-SeHealth',
        description: `${planNames[planId] ?? planId} Premium Subscription`,
        image: '/icon.svg',
        theme: { color: '#10b981' },
        handler: async (response: any) => {
          await fetchSubscriptionStatus();
          window.dispatchEvent(new CustomEvent('z-payment-success', {
            detail: {
              planName: planNames[planId],
              transactionId: response.razorpay_payment_id,
              subscriptionId: response.razorpay_subscription_id,
            }
          }));
        },
        modal: {
          ondismiss: () => setLoadingUpgrade(false),
        },
      };

      new (window as any).Razorpay(options).open();
    } catch (error: any) {
      console.error('Upgrade plan failed:', error);
      window.dispatchEvent(new CustomEvent('z-payment-failure', {
        detail: { planName: planId, error: error.message }
      }));
    } finally {
      setLoadingUpgrade(false);
    }
  }, [currentUser, fetchSubscriptionStatus]);

  const logMeal = async (foodItem: any, options?: { silent?: boolean }): Promise<boolean> => {
    if (!currentUser) {
      showToast("Please log in to log a meal.");
      setShowLoginModal(true);
      return false;
    }

    const estimatedMacros = {
      calories: Number(foodItem?.calories) || 250,
      protein: Number(foodItem?.protein) || 10,
      carbs: Number(foodItem?.carbs) || 30,
      fat: Number(foodItem?.fat) || 10,
    };

    // If offline, queue directly into IndexedDB without attempting fetch
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      try {
        await queueOfflineMeal({
          name: foodItem?.name || 'Meal',
          ingredients: Array.isArray(foodItem?.ingredients) ? foodItem.ingredients : [],
          ...estimatedMacros,
        });

        // Optimistically update stats
        const newStats: UserStats = {
          calories: (stats.calories || 0) + estimatedMacros.calories,
          protein: (stats.protein || 0) + estimatedMacros.protein,
          carbs: (stats.carbs || 0) + estimatedMacros.carbs,
          fat: (stats.fat || 0) + estimatedMacros.fat,
          last_updated: new Date().toISOString(),
        };
        setStats(newStats);
        localStorage.setItem('z_sehealth_cached_user_stats', JSON.stringify(newStats));

        if (!options?.silent) {
          showToast("Meal saved offline. Will sync when connection is restored.", "success");
        }
        return true;
      } catch (err) {
        console.error("Failed to queue offline meal:", err);
        if (!options?.silent) {
          showToast("Failed to save meal offline.");
        }
        return false;
      }
    }
    
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(`${API_BASE}/api/user/log_meal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(foodItem)
      });
      if (response.ok) {
        const data = await response.json();
        setStats(data.new_stats);
        localStorage.setItem('z_sehealth_cached_user_stats', JSON.stringify(data.new_stats));
        if (!options?.silent) {
          showToast(`Successfully logged ${foodItem.name}. Estimated macros added!`);
        }
        return true;
      } else {
        if (!options?.silent) {
          showToast("Failed to log meal. Please try again.");
        }
        return false;
      }
    } catch (error) {
      console.warn("Failed to log meal online, falling back to offline queue:", error);
      try {
        await queueOfflineMeal({
          name: foodItem?.name || 'Meal',
          ingredients: Array.isArray(foodItem?.ingredients) ? foodItem.ingredients : [],
          ...estimatedMacros,
        });

        const newStats: UserStats = {
          calories: (stats.calories || 0) + estimatedMacros.calories,
          protein: (stats.protein || 0) + estimatedMacros.protein,
          carbs: (stats.carbs || 0) + estimatedMacros.carbs,
          fat: (stats.fat || 0) + estimatedMacros.fat,
          last_updated: new Date().toISOString(),
        };
        setStats(newStats);
        localStorage.setItem('z_sehealth_cached_user_stats', JSON.stringify(newStats));

        if (!options?.silent) {
          showToast("Meal saved offline. Will sync when connection is restored.", "success");
        }
        return true;
      } catch (queueErr) {
        console.error("Failed to queue offline meal during network failure:", queueErr);
        if (!options?.silent) {
          showToast("Failed to log meal due to a network error.");
        }
        return false;
      }
    }
  };

  const updateDailyGoals = async (goals: DailyGoals): Promise<boolean> => {
    if (!currentUser) return false;
    
    // Optimistic update
    const previousGoals = dailyGoals;
    setDailyGoals(goals);
    localStorage.setItem('z_sehealth_cached_user_goals', JSON.stringify(goals));
    
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(`${API_BASE}/api/user/goals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(goals)
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.daily_goals) {
          setDailyGoals(data.daily_goals);
          localStorage.setItem('z_sehealth_cached_user_goals', JSON.stringify(data.daily_goals));
        }
        return true;
      } else {
        // Revert on fail
        setDailyGoals(previousGoals);
        localStorage.setItem('z_sehealth_cached_user_goals', JSON.stringify(previousGoals));
        return false;
      }
    } catch (error) {
      console.error("Failed to update daily goals", error);
      // Revert on fail
      setDailyGoals(previousGoals);
      localStorage.setItem('z_sehealth_cached_user_goals', JSON.stringify(previousGoals));
      return false;
    }
  };

  const logMultipleMeals = async (items: Array<{ food: any; count: number }>): Promise<boolean> => {
    if (!currentUser) {
      showToast("Please log in to log meals.");
      setShowLoginModal(true);
      return false;
    }

    if (!items || items.length === 0) return false;

    let overallSuccess = true;
    for (const item of items) {
      for (let i = 0; i < item.count; i++) {
        const success = await logMeal(item.food, { silent: true });
        if (!success) {
          overallSuccess = false;
        }
      }
    }
    return overallSuccess;
  };

  const scheduleDailyNotification = () => {
    const now = new Date();
    let targetTime = new Date();
    targetTime.setHours(21, 0, 0, 0);

    if (now > targetTime) {
      targetTime.setDate(targetTime.getDate() + 1);
    }

    const timeUntil9PM = targetTime.getTime() - now.getTime();

    setTimeout(() => {
      if (Notification.permission === 'granted') {
        new Notification("Z-SeHealth", {
          body: "Don't forget to track your meals today! Keep your streak going."
        });
      }
      setInterval(() => {
        if (Notification.permission === 'granted') {
          new Notification("Z-SeHealth", {
            body: "Don't forget to track your meals today! Keep your streak going."
          });
        }
      }, 24 * 60 * 60 * 1000);
    }, timeUntil9PM);
  };

  const requestNotificationPermission = () => {
    if (!('Notification' in window)) {
      console.log('This browser does not support desktop notification');
      return;
    }
    if (Notification.permission === 'granted') {
      scheduleDailyNotification();
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then((permission) => {
        if (permission === 'granted') {
          scheduleDailyNotification();
        }
      });
    }
  };

  useEffect(() => {
    if (currentUser) {
      requestNotificationPermission();
    }
  }, [currentUser]);

  const syncQueuedMeals = useCallback(async (): Promise<SyncResult> => {
    const result = await syncQueuedMealsToServer();
    if (result.synced > 0) {
      await fetchStats();
    }
    return result;
  }, [fetchStats]);

  const value = {
    stats,
    dailyGoals,
    updateDailyGoals,
    streak,
    tier,
    scansUsed,
    scanLimit,
    loadingUpgrade,
    showUpgradeModal,
    setShowUpgradeModal,
    upgradePlan,
    refreshSubscription: fetchSubscriptionStatus,
    logMeal,
    logMultipleMeals,
    syncQueuedMeals,
    loadingStats,
    requestNotificationPermission
  };

  return (
    <UserStatsContext.Provider value={value}>
      {children}
    </UserStatsContext.Provider>
  );
}
