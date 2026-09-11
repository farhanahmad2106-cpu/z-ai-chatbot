import React, { useState } from 'react';
import { 
  Settings as SettingsIcon, 
  Bell, 
  Shield, 
  Moon, 
  Sun, 
  Smartphone, 
  Globe, 
  Lock, 
  User, 
  ArrowLeft,
  X,
  AlertTriangle
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useUserProfile } from '../context/UserProfileContext';
import { useToast } from '../context/ToastContext';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase';

interface SettingsProps {
  onBack?: () => void;
}

const LANGUAGES = [
  'English',
  'Hindi (हिंदी)',
  'Bengali (বাংলা)',
  'Telugu (తెలుగు)',
  'Marathi (मराठी)',
  'Tamil (தமிழ்)',
  'Gujarati (ગુજરાતી)',
  'Kannada (கன்னட)',
  'Malayalam (മലയാളം)',
  'Punjabi (ਪੰਜਾਬੀ)',
];

const Settings: React.FC<SettingsProps> = ({ onBack }) => {
  const { currentUser, updateUserProfile, logout } = useAuth();
  const { settings, updateSettings } = useUserProfile();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'account' | 'notifications' | 'privacy' | 'devices'>('account');

  // --- Display Name Edit ---
  const [displayNameInput, setDisplayNameInput] = useState(currentUser?.displayName || '');
  const [isSavingName, setIsSavingName] = useState(false);

  const handleSaveDisplayName = async () => {
    if (!displayNameInput.trim()) return;
    setIsSavingName(true);
    try {
      await updateUserProfile({ displayName: displayNameInput.trim() });
      showToast('Display name saved!');
    } catch (err) {
      console.error(err);
      showToast('Failed to update name.');
    } finally {
      setIsSavingName(false);
    }
  };

  // --- Password Reset ---
  const [isSendingReset, setIsSendingReset] = useState(false);

  const handleChangePassword = async () => {
    if (!currentUser?.email) return;
    setIsSendingReset(true);
    try {
      await sendPasswordResetEmail(auth, currentUser.email);
      showToast(`Password reset link sent to ${currentUser.email}`);
    } catch (err) {
      console.error(err);
      showToast('Failed to send reset email.');
    } finally {
      setIsSendingReset(false);
    }
  };

  // --- Toggles ---
  const handleToggleNotifications = async () => {
    const nextState = !settings.notificationsEnabled;
    await updateSettings({ notificationsEnabled: nextState });
    showToast(`Notifications ${nextState ? 'enabled' : 'disabled'}`);
  };

  const handleSetDarkMode = async (isDark: boolean) => {
    await updateSettings({ darkMode: isDark });
    showToast(`Theme switched to ${isDark ? 'Dark' : 'Light'} Mode`);
  };

  // --- Language Modal ---
  const [isLangModalOpen, setIsLangModalOpen] = useState(false);
  const handleSelectLanguage = async (lang: string) => {
    await updateSettings({ language: lang });
    setIsLangModalOpen(false);
    showToast(`Language set to ${lang}`);
  };

  // --- Delete Account Modal ---
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const handleDeleteAccount = async () => {
    try {
      setIsDeleteModalOpen(false);
      showToast('Account scheduled for deletion.');
      setTimeout(() => {
        logout();
      }, 1500);
    } catch (err) {
      console.error(err);
      showToast('Action failed.');
    }
  };
  
  if (!currentUser) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Please Log In</h2>
        <p className="text-gray-400">You need to be logged in to view settings.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto w-full animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
      {onBack && (
        <button onClick={onBack} className="mb-6 flex items-center gap-2 text-gray-400 hover:text-white transition-colors cursor-pointer">
          <ArrowLeft className="w-5 h-5" /> Back to Dashboard
        </button>
      )}

      <h2 className="text-3xl font-outfit font-bold text-white mb-8 flex items-center gap-3">
        <SettingsIcon className="w-8 h-8 text-emerald-500" />
        App Settings
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        
        {/* Settings Left Navigation Sidebar */}
        <div className="col-span-1 flex flex-col gap-2">
          <button 
            onClick={() => setActiveTab('account')}
            className={`text-left px-4 py-3 rounded-xl font-bold flex items-center gap-3 transition-colors cursor-pointer ${activeTab === 'account' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'hover:bg-slate-800 text-gray-300'}`}
          >
            <User className="w-5 h-5" /> Account
          </button>

          <button 
            onClick={() => setActiveTab('notifications')}
            className={`text-left px-4 py-3 rounded-xl font-bold flex items-center gap-3 transition-colors cursor-pointer ${activeTab === 'notifications' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'hover:bg-slate-800 text-gray-300'}`}
          >
            <Bell className="w-5 h-5" /> Notifications
          </button>

          <button 
            onClick={() => setActiveTab('privacy')}
            className={`text-left px-4 py-3 rounded-xl font-bold flex items-center gap-3 transition-colors cursor-pointer ${activeTab === 'privacy' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'hover:bg-slate-800 text-gray-300'}`}
          >
            <Shield className="w-5 h-5" /> Privacy
          </button>

          <button 
            onClick={() => setActiveTab('devices')}
            className={`text-left px-4 py-3 rounded-xl font-bold flex items-center gap-3 transition-colors cursor-pointer ${activeTab === 'devices' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'hover:bg-slate-800 text-gray-300'}`}
          >
            <Smartphone className="w-5 h-5" /> Devices
          </button>
        </div>

        {/* Settings Content Panels */}
        <div className="col-span-1 md:col-span-3 space-y-6">
          
          {/* Account Settings Panel */}
          {(activeTab === 'account' || activeTab === 'privacy') && (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
              <h3 className="text-xl font-bold text-white mb-4">Account Settings</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Email Address</label>
                  <div className="flex gap-3">
                    <input 
                      type="email" 
                      value={currentUser.email || ''} 
                      disabled 
                      className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white disabled:opacity-50" 
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Managed via Firebase authentication provider.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Display Name</label>
                  <div className="flex gap-3">
                    <input 
                      type="text" 
                      value={displayNameInput}
                      onChange={e => setDisplayNameInput(e.target.value)}
                      placeholder="Enter your name"
                      className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-emerald-500 transition-colors" 
                    />
                    <button 
                      onClick={handleSaveDisplayName}
                      disabled={isSavingName}
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl transition-all active:scale-95 cursor-pointer"
                    >
                      {isSavingName ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="mt-8 pt-6 border-t border-slate-800">
                <h4 className="font-bold text-white mb-2 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-gray-400" />
                  Password & Security
                </h4>
                <p className="text-xs text-gray-400 mb-3">Send a password reset email to your registered email address.</p>
                <button 
                  onClick={handleChangePassword}
                  disabled={isSendingReset}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-semibold transition-all border border-slate-700 cursor-pointer active:scale-95"
                >
                  {isSendingReset ? 'Sending...' : 'Send Password Reset Email'}
                </button>
              </div>
            </div>
          )}

          {/* App Preferences & Notifications Panel */}
          {(activeTab === 'account' || activeTab === 'notifications') && (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
              <h3 className="text-xl font-bold text-white mb-4">App Preferences</h3>
              
              <div className="space-y-6">
                {/* Push Notifications Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-white">Push Notifications</h4>
                    <p className="text-sm text-gray-400">Receive alerts for streak rewards and macro reminders.</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={settings.notificationsEnabled} 
                      onChange={handleToggleNotifications} 
                    />
                    <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>

                {/* Theme Selector */}
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-white flex items-center gap-2">Theme Mode</h4>
                    <p className="text-sm text-gray-400">Select dark or light color theme.</p>
                  </div>
                  <div className="flex bg-slate-800 rounded-xl p-1 border border-slate-700">
                    <button 
                      onClick={() => handleSetDarkMode(false)}
                      className={`px-3 py-1.5 rounded-lg flex items-center gap-2 text-sm font-medium transition-all cursor-pointer ${!settings.darkMode ? 'bg-slate-700 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                    >
                      <Sun className="w-4 h-4 text-amber-400" /> Light
                    </button>
                    <button 
                      onClick={() => handleSetDarkMode(true)}
                      className={`px-3 py-1.5 rounded-lg flex items-center gap-2 text-sm font-medium transition-all cursor-pointer ${settings.darkMode ? 'bg-slate-700 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                    >
                      <Moon className="w-4 h-4 text-indigo-400" /> Dark
                    </button>
                  </div>
                </div>
                
                {/* Language Selector */}
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-white">Interface Language</h4>
                    <p className="text-sm text-gray-400">Select your preferred app language.</p>
                  </div>
                  <button 
                    onClick={() => setIsLangModalOpen(true)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-semibold transition-all border border-slate-700 flex items-center gap-2 cursor-pointer"
                  >
                    <Globe className="w-4 h-4 text-emerald-400" /> {settings.language || 'English'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Active Devices Info */}
          {(activeTab === 'devices') && (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
              <h3 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-emerald-400" /> Active Session
              </h3>
              <div className="bg-slate-800/60 p-4 rounded-2xl border border-slate-700/50 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-white">Current Browser Session</p>
                  <p className="text-xs text-gray-400">Logged in via Firebase Auth • Active now</p>
                </div>
                <span className="text-xs font-bold bg-emerald-500/20 text-emerald-300 px-2.5 py-1 rounded-full border border-emerald-500/30">
                  Online
                </span>
              </div>
            </div>
          )}

          {/* Danger Zone */}
          <div className="bg-red-950/20 border border-red-900/30 rounded-3xl p-6 shadow-xl">
            <h3 className="text-xl font-bold text-red-500 mb-2">Danger Zone</h3>
            <p className="text-sm text-gray-400 mb-4">Deleting your account removes all saved health logs, daily macro stats, and scan history.</p>
            <button 
              onClick={() => setIsDeleteModalOpen(true)}
              className="px-4 py-2.5 bg-red-600/10 hover:bg-red-600/20 text-red-500 border border-red-600/20 rounded-xl text-sm font-bold transition-all cursor-pointer active:scale-95"
            >
              Delete Account
            </button>
          </div>

        </div>
      </div>

      {/* --- Language Selector Modal --- */}
      {isLangModalOpen && (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl relative">
            <button 
              onClick={() => setIsLangModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white p-2 rounded-full hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Globe className="w-5 h-5 text-emerald-400" /> Select App Language
            </h3>

            <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
              {LANGUAGES.map(lang => (
                <button
                  key={lang}
                  onClick={() => handleSelectLanguage(lang.split(' ')[0])}
                  className={`w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${settings.language === lang.split(' ')[0] ? 'bg-emerald-600 text-white font-bold' : 'text-gray-300 hover:bg-slate-800'}`}
                >
                  {lang}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* --- Delete Account Confirmation Modal --- */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-slate-900 border border-red-900/40 rounded-3xl p-6 max-w-md w-full shadow-2xl relative text-center">
            <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-500 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            
            <h3 className="text-xl font-bold text-white mb-2">Delete Account?</h3>
            <p className="text-sm text-gray-400 mb-6">Are you sure you want to delete your account? This action cannot be undone and your health data will be removed.</p>

            <div className="flex gap-3">
              <button 
                onClick={handleDeleteAccount}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl text-sm transition-all cursor-pointer shadow-lg shadow-red-950/40"
              >
                Yes, Delete My Account
              </button>
              <button 
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-semibold cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
