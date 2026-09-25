import { useState } from 'react';
import {
  LayoutDashboard,
  UtensilsCrossed,
  Users,
  ShieldAlert,
  Terminal,
  Smartphone,
  Crown,
  ArrowLeft,
  LogOut,
  Database,
  History,
} from 'lucide-react';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { useAuth } from '../../context/AuthContext';
import OverviewTab from './tabs/OverviewTab';
import FoodModerationTab from './tabs/FoodModerationTab';
import UserManagementTab from './tabs/UserManagementTab';
import AdminTeamTab from './tabs/AdminTeamTab';
import SystemLogsTab from './tabs/SystemLogsTab';
import AdminOtaManager from './tabs/AdminOtaManager';
import AuditLogsTab from './tabs/AuditLogsTab';
import { ConfirmModal } from '../ui/ConfirmModal';

interface AdminDashboardProps {
  onExit: () => void;
}

type TabKey = 'overview' | 'moderation' | 'users' | 'team' | 'logs' | 'ota' | 'audit';

export default function AdminDashboard({ onExit }: AdminDashboardProps) {
  const { adminUser, isSuperAdmin, permissions } = useAdminAuth();
  const { logout } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [showLogoutConfirm, setShowLogoutConfirm] = useState<boolean>(false);

  const navItems = [
    {
      id: 'overview',
      label: 'Overview',
      icon: LayoutDashboard,
      visible: true,
    },
    {
      id: 'moderation',
      label: 'Food Moderation',
      icon: UtensilsCrossed,
      visible: permissions.canApproveFoods || isSuperAdmin,
    },
    {
      id: 'users',
      label: 'User Governance',
      icon: Users,
      visible: permissions.canManageUsers || isSuperAdmin,
    },
    {
      id: 'team',
      label: 'Admin Team',
      icon: Crown,
      visible: isSuperAdmin || permissions.canManageAdmins,
      highlight: true,
    },
    {
      id: 'audit',
      label: 'Audit Trail',
      icon: History,
      visible: isSuperAdmin || permissions.canManageAdmins,
      highlight: true,
    },
    {
      id: 'logs',
      label: 'System Logs',
      icon: Terminal,
      visible: permissions.canViewLogs || isSuperAdmin,
    },
    {
      id: 'ota',
      label: 'Mobile OTA',
      icon: Smartphone,
      visible: permissions.canTriggerOTA || isSuperAdmin,
    },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-300">
      {/* Brutalist Admin Master Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-4xl p-6 sm:p-8 shadow-2xl relative overflow-hidden backdrop-blur-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 relative">
          {/* Title & Brand */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-mono font-black uppercase tracking-widest px-3 py-1 rounded-full bg-slate-950 border border-slate-800 text-emerald-400 flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5" />
                Z-SeHealth Operations Core
              </span>
              {isSuperAdmin && (
                <span className="text-[11px] font-mono font-black uppercase tracking-widest px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center gap-1.5">
                  <Crown className="w-3.5 h-3.5" /> Super Admin Clearance
                </span>
              )}
            </div>

            <h1 className="text-3xl sm:text-4xl font-black font-outfit uppercase tracking-tight text-white flex items-center gap-3">
              Admin Telemetry & Operations Hub
            </h1>
            <p className="text-xs text-slate-400 font-mono">
              Identity: <span className="text-slate-200 font-bold">{adminUser?.name || 'Administrator'}</span> ({adminUser?.email})
            </p>
          </div>

          {/* Telemetry Status Bar & Actions */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Live DB Indicator */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl px-3.5 py-2 flex items-center gap-2.5 font-mono text-xs text-slate-400">
              <Database className="w-4 h-4 text-emerald-400" />
              <span>Atlas Connected</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>

            {/* Return to App Button */}
            <button
              onClick={onExit}
              className="px-4 py-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white rounded-2xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 active:scale-95 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 text-emerald-400" />
              Exit to App
            </button>

            {/* Logout */}
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="p-2 bg-slate-950 hover:bg-rose-500/10 border border-slate-800 hover:border-rose-500/30 text-slate-400 hover:text-rose-400 rounded-2xl transition-all cursor-pointer"
              title="End Admin Session"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Switcher Navigation Bar */}
        <div className="mt-8 pt-6 border-t border-slate-800/80 flex gap-2 overflow-x-auto pb-2 scrollbar-none">
          {navItems
            .filter((item) => item.visible)
            .map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as TabKey)}
                  className={`px-4 py-2.5 rounded-2xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                    isActive
                      ? item.highlight
                        ? 'bg-amber-400 text-slate-950 shadow-lg shadow-amber-950'
                        : 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-950 font-black'
                      : 'bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </button>
              );
            })}
        </div>
      </div>

      {/* Active Tab View */}
      <div className="pb-16">
        {activeTab === 'overview' && (
          <OverviewTab onNavigateTab={(tab) => setActiveTab(tab as TabKey)} />
        )}
        {activeTab === 'moderation' && <FoodModerationTab />}
        {activeTab === 'users' && <UserManagementTab />}
        {activeTab === 'team' && <AdminTeamTab />}
        {activeTab === 'audit' && <AuditLogsTab />}
        {activeTab === 'logs' && <SystemLogsTab />}
        {activeTab === 'ota' && <AdminOtaManager />}
      </div>

      <ConfirmModal
        isOpen={showLogoutConfirm}
        title="Sign Out"
        message="Are you sure you want to sign out of the administrative session?"
        confirmLabel="Sign Out"
        cancelLabel="Cancel"
        variant="primary"
        onConfirm={() => {
          setShowLogoutConfirm(false);
          logout();
        }}
        onCancel={() => setShowLogoutConfirm(false)}
      />
    </div>
  );
}
