import React from 'react';
import { 
  UserCircle, 
  Settings as SettingsIcon, 
  LogOut, 
  Crown, 
  Flame, 
  HelpCircle, 
  ChevronRight,
  Search,
  Scan
} from 'lucide-react';


interface ProfileDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: any;
  tier?: string;
  streak?: number;
  onNavigate: (tab: 'dashboard' | 'search' | 'scan' | 'profile' | 'settings' | 'pricing') => void;
  onLogout: () => void;
  onOpenHelp: () => void;
}

export const ProfileDropdown: React.FC<ProfileDropdownProps> = ({
  isOpen,
  currentUser,
  onClose,
  tier = 'free',
  streak = 0,
  onNavigate,
  onLogout,
  onOpenHelp,
}) => {
  if (!isOpen) return null;

  const formattedTier = tier.toUpperCase();
  const getTierBadgeStyle = () => {
    switch (tier.toLowerCase()) {
      case 'elite':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      case 'pro':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'starter':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      default:
        return 'bg-slate-800 text-gray-300 border-slate-700';
    }
  };

  return (
    <>
      {/* Invisible overlay for clicking outside */}
      <div 
        className="fixed inset-0 z-40" 
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="absolute right-0 mt-2 w-64 bg-slate-900/95 border border-slate-800 rounded-2xl shadow-2xl z-50 py-2 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
      >
        {/* User Account Header */}
        <div className="px-4 py-3 border-b border-slate-800 bg-slate-800/40">
          <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Account</p>
          <p className="text-sm font-bold text-white truncate">{currentUser?.displayName || 'Health Enthusiast'}</p>
          <p className="text-xs text-gray-400 truncate">{currentUser?.email}</p>
          <div className="mt-2 flex items-center justify-between">
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${getTierBadgeStyle()}`}>
              {formattedTier} TIER
            </span>
            <span className="text-xs text-amber-400 font-bold flex items-center gap-1">
              <Flame className="w-3.5 h-3.5 fill-amber-400/20" /> {streak}d streak
            </span>
          </div>
        </div>

        {/* Core Options */}
        <div className="py-1 border-b border-slate-800">
          <button
            onClick={() => { onNavigate('search'); onClose(); }}
            className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-slate-800 hover:text-white transition-colors flex items-center justify-between group cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <Search className="w-4 h-4 text-emerald-400" />
              <span className="font-medium">Search Food</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-gray-500 group-hover:text-gray-300 group-hover:translate-x-0.5 transition-all" />
          </button>

          <button
            onClick={() => { onNavigate('scan'); onClose(); }}
            className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-slate-800 hover:text-white transition-colors flex items-center justify-between group cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <Scan className="w-4 h-4 text-emerald-400" />
              <span className="font-medium">Food Scanner</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-gray-500 group-hover:text-gray-300 group-hover:translate-x-0.5 transition-all" />
          </button>

          <button
            onClick={() => { onNavigate('profile'); onClose(); }}
            className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-slate-800 hover:text-white transition-colors flex items-center justify-between group cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <UserCircle className="w-4 h-4 text-blue-400" />
              <span className="font-medium">Personal Details</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-gray-500 group-hover:text-gray-300 group-hover:translate-x-0.5 transition-all" />
          </button>

          <button
            onClick={() => { onNavigate('pricing'); onClose(); }}
            className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-slate-800 hover:text-white transition-colors flex items-center justify-between group cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <Crown className="w-4 h-4 text-amber-400" />
              <span className="font-medium">Membership & Plan</span>
            </div>
            <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/30">
              Upgrade
            </span>
          </button>
        </div>

        {/* Preferences & Help Options */}
        <div className="py-1 border-b border-slate-800">
          <button
            onClick={() => { onNavigate('settings'); onClose(); }}
            className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-slate-800 hover:text-white transition-colors flex items-center justify-between group cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <SettingsIcon className="w-4 h-4 text-purple-400" />
              <span className="font-medium">App Settings</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-gray-500 group-hover:text-gray-300 group-hover:translate-x-0.5 transition-all" />
          </button>

          <button
            onClick={() => { onOpenHelp(); onClose(); }}
            className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-slate-800 hover:text-white transition-colors flex items-center justify-between group cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <HelpCircle className="w-4 h-4 text-cyan-400" />
              <span className="font-medium">Help & Support</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-gray-500 group-hover:text-gray-300 group-hover:translate-x-0.5 transition-all" />
          </button>
        </div>

        {/* Sign Out Option */}
        <div className="pt-1">
          <button
            onClick={() => { onLogout(); onClose(); }}
            className="w-full text-left px-4 py-2.5 text-sm text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-colors flex items-center gap-2.5 font-medium cursor-pointer"
          >
            <LogOut className="w-4 h-4 text-rose-400" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </>
  );
};

export default ProfileDropdown;
