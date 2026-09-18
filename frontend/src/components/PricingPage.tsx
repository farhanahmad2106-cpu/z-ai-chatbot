import { useState } from 'react';
import { Check, Zap, Crown, Star, Sparkles, ArrowRight, X } from 'lucide-react';
import { useUserStats } from '../context/UserStatsContext';
import { useAuth } from '../context/AuthContext';

interface Plan {
  id: string;
  name: string;
  price: number;
  scan_limit: number;
  ai_model: string;
  accuracy: string;
  translation_languages: number;
  features: Record<string, boolean>;
}

const STATIC_PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Z-Free',
    price: 0,
    scan_limit: 20,
    ai_model: 'NVIDIA + Gemini Flash',
    accuracy: 'Basic',
    translation_languages: 5,
    features: {
      food_search: true, meal_logging: true, daily_stats: true, multi_meal_batch: true,
      dietary_filters: false, smart_meal_planning: false, advanced_analytics: false,
      barcode_scanner: false, priority_ai: false, voice_input: false,
      premium_badge: false, email_support: false, priority_support: false,
    },
  },
  {
    id: 'starter',
    name: 'Z-Starter',
    price: 366,
    scan_limit: 80,
    ai_model: 'NVIDIA LLaMA + Gemini',
    accuracy: 'Better',
    translation_languages: 15,
    features: {
      food_search: true, meal_logging: true, daily_stats: true, multi_meal_batch: true,
      dietary_filters: true, smart_meal_planning: false, advanced_analytics: false,
      barcode_scanner: false, priority_ai: false, voice_input: false,
      premium_badge: true, email_support: true, priority_support: false,
    },
  },
  {
    id: 'pro',
    name: 'Z-Pro',
    price: 732,
    scan_limit: 200,
    ai_model: 'NVIDIA Advanced + Gemini Pro',
    accuracy: 'High',
    translation_languages: 30,
    features: {
      food_search: true, meal_logging: true, daily_stats: true, multi_meal_batch: true,
      dietary_filters: true, smart_meal_planning: true, advanced_analytics: true,
      barcode_scanner: true, priority_ai: false, voice_input: false,
      premium_badge: true, email_support: true, priority_support: false,
    },
  },
  {
    id: 'elite',
    name: 'Z-Elite',
    price: 998,
    scan_limit: 500,
    ai_model: 'Sarvam AI + NVIDIA',
    accuracy: 'Highest (Indian DB)',
    translation_languages: 50,
    features: {
      food_search: true, meal_logging: true, daily_stats: true, multi_meal_batch: true,
      dietary_filters: true, smart_meal_planning: true, advanced_analytics: true,
      barcode_scanner: true, priority_ai: true, voice_input: true,
      premium_badge: true, email_support: true, priority_support: true,
    },
  },
];

const FEATURE_LABELS: Record<string, string> = {
  food_search: 'Food Search',
  meal_logging: 'Meal Logging',
  daily_stats: 'Daily Stats Dashboard',
  multi_meal_batch: 'Multi-Meal Batch Logging',
  dietary_filters: 'Dietary Restriction Filters',
  smart_meal_planning: 'Smart Meal Planning',
  advanced_analytics: 'Advanced Analytics & Charts',
  barcode_scanner: 'Barcode Scanner',
  priority_ai: 'Priority AI Response',
  voice_input: 'Voice Input (Sarvam STT)',
  premium_badge: 'Premium Badge on Profile',
  email_support: 'Email Support',
  priority_support: 'Priority Support',
};

const PLAN_ICONS: Record<string, React.ReactNode> = {
  free: <Star className="w-5 h-5 text-gray-400" />,
  starter: <Zap className="w-5 h-5 text-amber-400" />,
  pro: <Sparkles className="w-5 h-5 text-violet-400" />,
  elite: <Crown className="w-5 h-5 text-emerald-400" />,
};

const PLAN_GRADIENTS: Record<string, string> = {
  free:    'from-slate-800 to-slate-900 border-slate-700',
  starter: 'from-amber-950/60 to-slate-900 border-amber-700/50',
  pro:     'from-violet-950/60 to-slate-900 border-violet-700/50',
  elite:   'from-emerald-950/60 to-slate-900 border-emerald-600/60',
};

const PLAN_BUTTON_STYLES: Record<string, string> = {
  free:    'bg-slate-700 text-slate-300 cursor-default',
  starter: 'bg-gradient-to-r from-amber-500 to-yellow-500 text-black font-bold hover:from-amber-400 hover:to-yellow-400',
  pro:     'bg-gradient-to-r from-violet-500 to-purple-600 text-white font-bold hover:from-violet-400 hover:to-purple-500',
  elite:   'bg-gradient-to-r from-emerald-500 to-teal-500 text-black font-bold hover:from-emerald-400 hover:to-teal-400',
};

interface PricingPageProps {
  onClose?: () => void;
}

export default function PricingPage({ onClose }: PricingPageProps) {
  const { currentUser, setShowLoginModal } = useAuth();
  const { tier: currentTier, upgradePlan, loadingUpgrade } = useUserStats();
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);

  const handleUpgrade = async (planId: string) => {
    if (planId === 'free' || planId === currentTier) return;
    if (!currentUser) {
      setShowLoginModal(true);
      return;
    }
    setLoadingPlanId(planId);
    try {
      await upgradePlan(planId);
    } finally {
      setLoadingPlanId(null);
    }
  };

  const getButtonLabel = (planId: string) => {
    if (planId === currentTier) return 'Current Plan';
    if (planId === 'free') return 'Your Base Plan';
    return `Upgrade to ${STATIC_PLANS.find(p => p.id === planId)?.name}`;
  };

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10 animate-in fade-in duration-300">
      {/* Header */}
      <div className="max-w-6xl mx-auto mb-12 text-center relative">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute right-0 top-0 p-2 rounded-full bg-slate-800 text-gray-400 hover:text-white hover:bg-slate-700 transition-all active:scale-95"
            aria-label="Close pricing page"
          >
            <X className="w-5 h-5" />
          </button>
        )}
        <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-4 py-1.5 mb-4">
          <Crown className="w-4 h-4 text-emerald-400" />
          <span className="text-[11px] font-black uppercase tracking-widest text-emerald-400">Premium Plans</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-bold font-outfit tracking-tight text-white mb-4">
          Unlock Your Full Health Potential
        </h1>
        <p className="text-gray-400 text-sm md:text-base max-w-xl mx-auto leading-relaxed">
          Choose the plan that fits your lifestyle. Upgrade anytime — powered by India's best AI, including Sarvam AI for Elite users.
        </p>
      </div>

      {/* Plan Cards */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-16">
        {STATIC_PLANS.map((plan, idx) => {
          const isElite = plan.id === 'elite';
          const isCurrent = plan.id === currentTier;
          const isLoading = loadingPlanId === plan.id;

          return (
            <div
              key={plan.id}
              className={`relative rounded-4xl border bg-gradient-to-b ${PLAN_GRADIENTS[plan.id]} p-7 flex flex-col gap-5 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl ${isElite ? 'shadow-emerald-500/10 shadow-xl ring-1 ring-emerald-500/20' : ''}`}
              style={{ animationDelay: `${idx * 80}ms` }}
            >
              {isElite && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-black text-[10px] font-black uppercase tracking-widest px-4 py-1 rounded-full shadow-lg">
                  <Crown className="w-3 h-3" /> Best Value
                </div>
              )}
              {isCurrent && !isElite && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-slate-600 text-white text-[10px] font-black uppercase tracking-widest px-4 py-1 rounded-full">
                  Current
                </div>
              )}

              {/* Plan Header */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  {PLAN_ICONS[plan.id]}
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">{plan.id.toUpperCase()}</span>
                </div>
                <h2 className="text-2xl font-bold font-outfit text-white leading-tight">{plan.name}</h2>
                <div className="mt-2 flex items-baseline gap-1">
                  {plan.price === 0 ? (
                    <span className="text-3xl font-bold text-white">Free</span>
                  ) : (
                    <>
                      <span className="text-slate-400 text-sm font-medium">₹</span>
                      <span className="text-3xl font-bold text-white">{plan.price}</span>
                      <span className="text-slate-400 text-sm">/month</span>
                    </>
                  )}
                </div>
              </div>

              {/* Key Stats */}
              <div className="bg-slate-800/50 rounded-2xl p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Scans / Month</span>
                  <span className="text-white font-semibold">{plan.scan_limit}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">AI Engine</span>
                  <span className="text-white font-semibold text-right max-w-[140px] leading-tight">{plan.ai_model}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Accuracy</span>
                  <span className="text-emerald-400 font-semibold">{plan.accuracy}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Languages</span>
                  <span className="text-white font-semibold">{plan.translation_languages}+</span>
                </div>
              </div>

              {/* Features List */}
              <div className="flex-1 space-y-2">
                {Object.entries(FEATURE_LABELS).map(([key, label]) => {
                  const enabled = plan.features[key];
                  return (
                    <div key={key} className={`flex items-center gap-2.5 text-sm ${enabled ? 'text-gray-300' : 'text-gray-600'}`}>
                      {enabled ? (
                        <div className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                          <Check className="w-2.5 h-2.5 text-emerald-400" />
                        </div>
                      ) : (
                        <div className="w-4 h-4 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0">
                          <X className="w-2.5 h-2.5 text-gray-700" />
                        </div>
                      )}
                      <span>{label}</span>
                    </div>
                  );
                })}
              </div>

              {/* Razorpay Pre-Payment Legal Consent */}
              {plan.id !== 'free' && !isCurrent && (
                <p className="text-[11px] text-gray-400 leading-relaxed text-center px-1">
                  By proceeding, you agree to the{' '}
                  <a 
                    href="/terms" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-emerald-400 underline hover:text-emerald-300 transition-colors"
                  >
                    Terms of Service
                  </a>
                  {' '}and acknowledge our{' '}
                  <a 
                    href="/refund" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-emerald-400 underline hover:text-emerald-300 transition-colors"
                  >
                    Refund Policy
                  </a>
                  {' '}(digital scan quotas are non-refundable once utilized). Payment is processed securely by Razorpay. Food safety score is an informational indicator and not medical advice.
                </p>
              )}

              {/* CTA Button */}
              <button
                onClick={() => handleUpgrade(plan.id)}
                disabled={plan.id === 'free' || isCurrent || isLoading || loadingUpgrade}
                className={`w-full py-3 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 transition-all active:scale-95 ${PLAN_BUTTON_STYLES[plan.id]} ${(plan.id === 'free' || isCurrent) ? 'opacity-60 cursor-default' : ''}`}
                id={`upgrade-btn-${plan.id}`}
              >
                {isLoading || (loadingUpgrade && loadingPlanId === plan.id) ? (
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>{getButtonLabel(plan.id)}</span>
                    {plan.id !== 'free' && !isCurrent && <ArrowRight className="w-4 h-4" />}
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Footer note */}
      <div className="max-w-2xl mx-auto text-center text-xs text-gray-600 leading-relaxed">
        <p>All plans include a monthly renewal cycle. Cancel anytime — your premium access remains until the end of the billing period. Payments processed securely via Razorpay. GST may apply.</p>
      </div>
    </div>
  );
}
