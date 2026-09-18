import { useState, useEffect, useCallback } from 'react';
import { User, Flame, ShieldAlert } from 'lucide-react';
import Dashboard from './components/Dashboard';
import Search from './components/Search';
import Scan from './components/Scan';
import Profile from './components/Profile';
import Settings from './components/Settings';
import PricingPage from './components/PricingPage';
import PaymentStatus from './components/PaymentStatus';
import LoginModal from './components/auth/LoginModal';
import ProfileDropdown from './components/ProfileDropdown';
import HelpModal from './components/HelpModal';
import AdminDashboard from './components/admin/AdminDashboard';
import AdminRouteGuard from './components/admin/AdminRouteGuard';
import { useAuth } from './context/AuthContext';
import { useAdminAuth } from './context/AdminAuthContext';
import { useUserStats } from './context/UserStatsContext';
import { useUserProfile } from './context/UserProfileContext';
import Footer from './components/Footer';
import LegalViewer from './components/legal/LegalViewer';

export type AppTab = 'dashboard' | 'search' | 'scan' | 'profile' | 'settings' | 'pricing' | 'admin' | 'privacy' | 'terms' | 'refund' | 'cookies';

function App() {
  // Simple tab-based navigation state with /admin and legal path support
  const [activeTab, setActiveTab] = useState<AppTab>(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      if (path.startsWith('/admin')) return 'admin';
      if (path.startsWith('/privacy')) return 'privacy';
      if (path.startsWith('/terms')) return 'terms';
      if (path.startsWith('/refund')) return 'refund';
      if (path.startsWith('/cookies')) return 'cookies';
    }
    return 'dashboard';
  });
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [scanImageData, setScanImageData] = useState<string | null>(null);

  // --- Freemium: Payment result state ---
  const [paymentResult, setPaymentResult] = useState<{
    status: 'success' | 'failure';
    planName?: string;
    transactionId?: string;
    subscriptionId?: string;
    errorMessage?: string;
  } | null>(null);

  const { currentUser, setShowLoginModal, logout } = useAuth();
  const { isAdmin } = useAdminAuth();
  const { streak, tier } = useUserStats();
  const { settings } = useUserProfile();

  const navigateToTab = useCallback((tab: AppTab) => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      const paths: Record<string, string> = {
        'admin': '/admin',
        'privacy': '/privacy',
        'terms': '/terms',
        'refund': '/refund',
        'cookies': '/cookies'
      };
      
      const newPath = paths[tab] || '/';
      if (window.location.pathname !== newPath) {
        window.history.pushState(null, '', newPath);
      }
    }
  }, []);

  // --- URL Path Sync: Support direct navigation and browser back/forward ---
  useEffect(() => {
    const onPopState = () => {
      const path = window.location.pathname;
      if (path.startsWith('/admin')) {
        setActiveTab('admin');
      } else if (path.startsWith('/privacy')) {
        setActiveTab('privacy');
      } else if (path.startsWith('/terms')) {
        setActiveTab('terms');
      } else if (path.startsWith('/refund')) {
        setActiveTab('refund');
      } else if (path.startsWith('/cookies')) {
        setActiveTab('cookies');
      } else {
        setActiveTab('dashboard');
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // --- Theme Switching: Wire settings.darkMode → data-theme on root element ---
  useEffect(() => {
    const theme = settings.darkMode ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    // Also set on app-root for scoped CSS override selectors
    const appRoot = document.getElementById('app-root');
    if (appRoot) appRoot.setAttribute('data-theme', theme);
  }, [settings.darkMode]);

  // --- Freemium: Listen for Razorpay payment events ---
  useEffect(() => {
    const onSuccess = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setPaymentResult({ status: 'success', ...detail });
    };
    const onFailure = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setPaymentResult({ status: 'failure', planName: detail?.planName, errorMessage: detail?.error });
    };

    window.addEventListener('z-payment-success', onSuccess);
    window.addEventListener('z-payment-failure', onFailure);
    return () => {
      window.removeEventListener('z-payment-success', onSuccess);
      window.removeEventListener('z-payment-failure', onFailure);
    };
  }, []);

  return (
    <div
      id="app-root"
      data-theme={settings.darkMode ? 'dark' : 'light'}
      className="min-h-screen font-manrope text-white bg-slate-950"
    >
      <LoginModal />
      <HelpModal isOpen={isHelpModalOpen} onClose={() => setIsHelpModalOpen(false)} />
      {/* Universal Navigation Header */}
      <header className="border-b border-slate-800 bg-gradient-to-r from-slate-950 via-[#162032] to-slate-900 shadow-xl sticky top-0 z-50">
        <div className="flex flex-col md:flex-row justify-between items-center py-3 md:py-4 px-4 sm:px-8 max-w-6xl mx-auto gap-3 md:gap-0">
          <div className="flex justify-between items-center w-full md:w-auto">
            <h1 
              className="text-2xl sm:text-3xl font-outfit font-bold tracking-tight text-white cursor-pointer flex items-center gap-2 sm:gap-3 drop-shadow-md hover:opacity-90 transition-opacity"
              onClick={() => {
                setActiveTab('dashboard');
                setIsProfileDropdownOpen(false);
              }}
            >
              <img src="/logo.png" alt="Z-SeHealth Logo" className="w-10 h-10 sm:w-12 sm:h-12 object-contain" />
              <span>Z-SeHealth</span>
            </h1>
            <div className="md:hidden flex items-center gap-2">
              {currentUser ? (
                <div className="relative">
                  <button 
                    onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                    className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center overflow-hidden border border-slate-700 cursor-pointer hover:ring-2 hover:ring-emerald-500 transition-all"
                    aria-label="User profile menu"
                  >
                    {currentUser.photoURL ? (
                      <img src={currentUser.photoURL} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                  
                  <ProfileDropdown
                    isOpen={isProfileDropdownOpen}
                    onClose={() => setIsProfileDropdownOpen(false)}
                    currentUser={currentUser}
                    tier={tier}
                    streak={streak}
                    isAdmin={isAdmin}
                    onNavigate={(tab) => navigateToTab(tab)}
                    onLogout={() => {
                      if (window.confirm("Are you sure you want to log out?")) {
                        logout();
                      }
                    }}
                    onOpenHelp={() => setIsHelpModalOpen(true)}
                  />
                </div>
              ) : (
                <button 
                  onClick={() => setShowLoginModal(true)}
                  className="px-3 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors"
                >
                  Log In
                </button>
              )}
            </div>
          </div>

          <nav className="flex space-x-4 sm:space-x-6 text-sm font-semibold w-full md:w-auto justify-center md:justify-start pt-1 pb-1 md:pt-0 md:pb-0">
            <button 
              onClick={() => navigateToTab('dashboard')} 
              className={`pb-1 transition-all whitespace-nowrap ${activeTab === 'dashboard' ? 'text-emerald-400 border-b-2 border-emerald-500' : 'text-gray-400 hover:text-white'}`}
            >
              Dashboard
            </button>
            <button 
              onClick={() => navigateToTab('search')} 
              className={`pb-1 transition-all whitespace-nowrap ${activeTab === 'search' ? 'text-emerald-400 border-b-2 border-emerald-500' : 'text-gray-400 hover:text-white'}`}
            >
              Search
            </button>
            <button 
              onClick={() => navigateToTab('scan')} 
              className={`pb-1 transition-all whitespace-nowrap ${activeTab === 'scan' ? 'text-emerald-400 border-b-2 border-emerald-500' : 'text-gray-400 hover:text-white'}`}
            >
              Scan
            </button>
            {isAdmin && (
              <button 
                onClick={() => navigateToTab('admin')} 
                className={`pb-1 transition-all whitespace-nowrap flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider ${activeTab === 'admin' ? 'text-emerald-400 border-b-2 border-emerald-500 font-bold' : 'text-emerald-500/80 hover:text-emerald-300'}`}
              >
                <ShieldAlert className="w-3.5 h-3.5 text-emerald-400" />
                Admin
              </button>
            )}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            {currentUser ? (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 bg-amber-500/10 px-3 py-1.5 rounded-xl border border-amber-500/20 shadow-sm">
                  <Flame className="w-4 h-4 text-amber-500" />
                  <span className="text-sm font-bold text-amber-500">{streak} Day{streak !== 1 && 's'}</span>
                </div>
                <div className="relative">
                  <button 
                    onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                    className="flex items-center gap-2 hover:bg-slate-800/50 p-1.5 rounded-lg transition-colors cursor-pointer"
                    aria-label="User profile menu"
                  >
                    <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center overflow-hidden border border-slate-700">
                      {currentUser.photoURL ? (
                        <img src={currentUser.photoURL} alt="Profile" className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-4 h-4 text-gray-400" />
                      )}
                    </div>
                    <span className="text-sm font-medium text-gray-300 hidden lg:block">
                      {currentUser.displayName || currentUser.email}
                    </span>
                  </button>
                  
                  <ProfileDropdown
                    isOpen={isProfileDropdownOpen}
                    onClose={() => setIsProfileDropdownOpen(false)}
                    currentUser={currentUser}
                    tier={tier}
                    streak={streak}
                    isAdmin={isAdmin}
                    onNavigate={(tab) => navigateToTab(tab)}
                    onLogout={() => {
                      if (window.confirm("Are you sure you want to log out?")) {
                        logout();
                      }
                    }}
                    onOpenHelp={() => setIsHelpModalOpen(true)}
                  />
                </div>
              </div>
            ) : (
              <button 
                onClick={() => setShowLoginModal(true)}
                className="px-4 py-2 text-sm font-bold bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-lg shadow-emerald-900/20 transition-all hover:-translate-y-0.5"
              >
                Log In / Sign Up
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ---- Freemium: PaymentStatus Overlay ---- */}
      {paymentResult && (
        <PaymentStatus
          status={paymentResult.status}
          planName={paymentResult.planName}
          transactionId={paymentResult.transactionId}
          subscriptionId={paymentResult.subscriptionId}
          errorMessage={paymentResult.errorMessage}
          onClose={() => setPaymentResult(null)}
          onRetry={paymentResult.status === 'failure' ? () => { setPaymentResult(null); navigateToTab('pricing'); } : undefined}
          onGoToDashboard={() => { setPaymentResult(null); navigateToTab('dashboard'); }}
        />
      )}

      {/* Render the Active Tab Page */}
      <main className="py-8 px-4">
        {activeTab === 'dashboard' && (
          <Dashboard
            onNavigateToScan={(imgData) => {
              setScanImageData(imgData);
              navigateToTab('scan');
            }}
            onGoToPricing={() => navigateToTab('pricing')}
          />
        )}
        {activeTab === 'search' && <Search onNavigateToDashboard={() => navigateToTab('dashboard')} />}
        {activeTab === 'scan' && (
          <Scan
            onNavigateToSearch={() => navigateToTab('search')}
            initialImage={scanImageData}
            onClearInitialImage={() => setScanImageData(null)}
          />
        )}
        {activeTab === 'profile' && <Profile onBack={() => navigateToTab('dashboard')} onGoToPricing={() => navigateToTab('pricing')} />}
        {activeTab === 'settings' && <Settings onBack={() => navigateToTab('dashboard')} />}
        {activeTab === 'pricing' && <PricingPage onClose={() => navigateToTab('dashboard')} />}
        {activeTab === 'admin' && (
          <AdminRouteGuard onExit={() => navigateToTab('dashboard')}>
            <AdminDashboard onExit={() => navigateToTab('dashboard')} />
          </AdminRouteGuard>
        )}
        {(activeTab === 'privacy' || activeTab === 'terms' || activeTab === 'refund' || activeTab === 'cookies') && (
          <LegalViewer 
            activeDoc={activeTab} 
            onNavigate={(doc) => navigateToTab(doc)} 
            onBackToApp={() => navigateToTab('dashboard')} 
          />
        )}
      </main>

      {/* Shared Footer (hidden on admin dashboard for space) */}
      {activeTab !== 'admin' && (
        <Footer onNavigate={(doc) => navigateToTab(doc)} />
      )}
    </div>
  );
}

export default App;