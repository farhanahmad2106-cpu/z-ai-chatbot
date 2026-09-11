import { useState, useRef, useEffect } from 'react';
import { useUserStats } from '../context/UserStatsContext';
import { useUserProfile } from '../context/UserProfileContext';
import { Camera, Utensils } from 'lucide-react';
import SubscriptionBadge from './SubscriptionBadge';
import UpgradeModal from './UpgradeModal';
import { LandingLoadingOverlay, InteractiveQuoteCard } from './LandingLoadingOverlay';

interface DashboardProps {
  onNavigateToScan?: (imageData: string) => void;
  onGoToPricing?: () => void;
}

export default function Dashboard({ onNavigateToScan, onGoToPricing }: DashboardProps) {
  const { stats, streak, loadingStats, showUpgradeModal, setShowUpgradeModal } = useUserStats();
  const { preferences } = useUserProfile();
  
  const [isCameraActive, setIsCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = async () => {
    setIsCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Error accessing camera: ", err);
      alert("Could not access camera. Please check permissions.");
      setIsCameraActive(false);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (context) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        const imageDataUrl = canvas.toDataURL('image/png');
        stopCamera();
        if (onNavigateToScan) {
          onNavigateToScan(imageDataUrl);
        }
      }
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    setIsCameraActive(false);
  };
  
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);
  
  // Set goals
  const caloriesGoal = 2000;
  const proteinGoal = 140;
  const carbsGoal = 250;
  const fatGoal = 70;

  if (loadingStats) {
    return (
      <LandingLoadingOverlay
        isLoading={loadingStats}
        userStreakDays={streak}
        userName={preferences.diet || 'Farhan Ahmad'}
      />
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-5 sm:p-8 lg:p-12 bg-gradient-to-br from-slate-900 via-[#162032] to-slate-950 rounded-3xl sm:rounded-[3rem] shadow-2xl border border-slate-800/50 mt-4 mb-12">
      {/* Upgrade Modal Overlay */}
      {showUpgradeModal && (
        <UpgradeModal
          onClose={() => setShowUpgradeModal(false)}
          onGoToPricing={() => { setShowUpgradeModal(false); onGoToPricing?.(); }}
        />
      )}

      {/* Welcome Heading */}
      <div className="mb-6 text-left flex items-start justify-between gap-4">
        <div>
          <h2 className="text-4xl font-extrabold tracking-tight text-white drop-shadow-sm">
            Your day, in nutrients.
          </h2>
          <p className="text-base text-gray-400 mt-2">
            Track your nutritional limits and keep your health score optimal.
          </p>
        </div>
        <SubscriptionBadge variant="full" onUpgradeClick={onGoToPricing} />
      </div>

      {/* Top Section: Dietary Profile (Left) and Quote Card (Right) */}
      <div className={`grid grid-cols-1 ${(preferences.diet !== 'None' || (preferences.allergies && preferences.allergies.length > 0)) ? 'lg:grid-cols-2' : ''} gap-6 mb-6`}>
        {/* Active Dietary Preferences & Allergies Summary Card */}
        {(preferences.diet !== 'None' || (preferences.allergies && preferences.allergies.length > 0)) && (
          <div className="h-full p-7 bg-slate-800/60 backdrop-blur-xl border border-slate-700/50 rounded-3xl flex flex-col gap-5 text-left shadow-xl hover:bg-slate-800/80 transition-all duration-300">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                <Utensils className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-gray-400">Safety Profile</p>
                <p className="text-sm font-bold text-emerald-400 mt-0.5">Active Dietary Filters</p>
              </div>
            </div>
            
            <div className="flex flex-wrap items-start gap-2 mt-1">
              {preferences.diet !== 'None' && (
                <span className="text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm hover:bg-emerald-500/30 transition-colors cursor-default">
                  {preferences.diet}
                </span>
              )}
              {preferences.allergies?.map((allergy, i) => (
                <span key={i} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30 shadow-sm hover:bg-rose-500/30 transition-colors cursor-default">
                  {allergy}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Interactive Motivational Quote Deck Card */}
        <div className="h-full flex flex-col justify-center">
          <InteractiveQuoteCard userStreakDays={streak} />
        </div>
      </div>

      {/* Embedded Live Camera Scanner Widget inside Dashboard */}
      <div className="mb-10 bg-slate-900/90 rounded-3xl overflow-hidden border border-slate-800 shadow-2xl relative">
        <canvas ref={canvasRef} className="hidden" />
        
        {isCameraActive ? (
          <div className="relative w-full h-[320px] bg-black flex items-center justify-center overflow-hidden">
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              className="w-full h-full object-cover"
            />
            {/* Viewfinder overlay */}
            <div className="absolute inset-0 border-2 border-emerald-500/40 pointer-events-none flex items-center justify-center">
              <div className="w-64 h-48 border-2 border-emerald-400/80 rounded-3xl relative animate-pulse shadow-[0_0_50px_rgba(16,185,129,0.3)]">
                <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-white rounded-tl-3xl drop-shadow-md"></div>
                <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-white rounded-tr-3xl drop-shadow-md"></div>
                <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-white rounded-bl-3xl drop-shadow-md"></div>
                <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-white rounded-br-3xl drop-shadow-md"></div>
                
                <div className="absolute inset-0 flex flex-col items-center justify-center drop-shadow-2xl">
                  <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-2 border-white/70 bg-black/30 backdrop-blur-sm flex items-center justify-center p-3">
                    <img src="/logo.png" alt="Scan Target" className="w-full h-full object-contain opacity-100 drop-shadow-md animate-pulse" />
                  </div>
                </div>
              </div>
            </div>
            
            <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-4 z-10 px-4">
              <button 
                onClick={capturePhoto} 
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-bold shadow-xl transition transform hover:scale-105"
              >
                Capture & Analyze
              </button>
              <button 
                onClick={stopCamera} 
                className="px-6 py-3 bg-slate-800/80 hover:bg-slate-700 text-white rounded-2xl font-bold shadow-xl transition backdrop-blur-md border border-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="p-8 sm:p-10 flex flex-col items-center justify-center text-center min-h-[220px]">
            <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center text-emerald-400 mb-4 ring-8 ring-emerald-500/10">
              <Camera className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Quick Scan</h3>
            <p className="text-gray-400 text-sm mb-6 max-w-sm">Scan a label directly from your dashboard to instantly analyze ingredients and health score.</p>
            <button 
              onClick={startCamera}
              className="px-8 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-bold shadow-lg shadow-emerald-900/30 transition transform hover:-translate-y-1"
            >
              Start Camera
            </button>
          </div>
        )}
      </div>

      {/* Grid Layout for Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        
        {/* CARD 1: DAILY CALORIES */}
        <div className="bg-slate-800/60 backdrop-blur-xl p-7 rounded-3xl border border-slate-700/50 shadow-xl flex flex-col justify-between hover:bg-slate-800/80 transition-all duration-300">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-rose-500/20 rounded-2xl flex items-center justify-center text-rose-400 shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                  <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
                </svg>
              </div>
              <span className="text-xs text-gray-400 font-black tracking-widest uppercase">
                Daily Calories
              </span>
            </div>

            <div className="text-left">
              <span className="text-4xl font-black text-white drop-shadow-md">{stats.calories}</span>
              <span className="text-gray-400 text-sm font-bold ml-1">/ {caloriesGoal} kcal</span>
            </div>
          </div>

          <div className="border-t border-slate-700/50 pt-5 mt-8 text-left">
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-gray-500 font-medium">
              <div>Sodium: <span className="font-bold text-gray-300">140mg</span></div>
              <div>Sugar: <span className="font-bold text-gray-300">0g</span></div>
              <div>Fiber: <span className="font-bold text-gray-300">0g</span></div>
            </div>
          </div>
        </div>

        {/* CARD 2: MACRONUTRIENT TARGETS */}
        <div className="bg-slate-800/60 backdrop-blur-xl p-7 rounded-3xl border border-slate-700/50 shadow-xl flex flex-col justify-between hover:bg-slate-800/80 transition-all duration-300">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-emerald-500/20 rounded-2xl flex items-center justify-center text-emerald-400 shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="12" r="6" />
                  <circle cx="12" cy="12" r="2" />
                </svg>
              </div>
              <span className="text-xs text-gray-400 font-black tracking-widest uppercase">
                Macronutrients
              </span>
            </div>

            <div className="space-y-4 text-left">
              <div>
                <div className="flex justify-between text-xs font-bold mb-1.5">
                  <span className="text-gray-400">Protein</span>
                  <span className="text-white">{stats.protein}g / {proteinGoal}g</span>
                </div>
                <div className="w-full bg-slate-700 h-2.5 rounded-full overflow-hidden shadow-inner">
                  <div className="bg-emerald-400 h-full rounded-full" style={{ width: `${Math.min((stats.protein / proteinGoal) * 100, 100)}%` }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold mb-1.5">
                  <span className="text-gray-400">Carbs</span>
                  <span className="text-white">{stats.carbs}g / {carbsGoal}g</span>
                </div>
                <div className="w-full bg-slate-700 h-2.5 rounded-full overflow-hidden shadow-inner">
                  <div className="bg-rose-400 h-full rounded-full" style={{ width: `${Math.min((stats.carbs / carbsGoal) * 100, 100)}%` }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold mb-1.5">
                  <span className="text-gray-400">Fats</span>
                  <span className="text-white">{stats.fat}g / {fatGoal}g</span>
                </div>
                <div className="w-full bg-slate-700 h-2.5 rounded-full overflow-hidden shadow-inner">
                  <div className="bg-amber-400 h-full rounded-full" style={{ width: `${Math.min((stats.fat / fatGoal) * 100, 100)}%` }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
