import { useState, useEffect, useCallback } from 'react';
import {
  Users,
  ScanLine,
  UtensilsCrossed,
  Activity,
  IndianRupee,
  RefreshCw,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  ArrowUpRight,
} from 'lucide-react';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import { API_BASE } from '../../../config';

interface AnalyticsData {
  status: string;
  timestamp: string;
  users: {
    total: number;
    active_today: number;
    tier_breakdown: {
      free: number;
      starter: number;
      pro: number;
      elite: number;
    };
  };
  foods: {
    total_catalog: number;
    pending_moderation: number;
    approved_ratio: number;
  };
  revenue: {
    currency: string;
    mrr: number;
    active_paying_subscribers: number;
    plans: {
      starter: { count: number; price: number };
      pro: { count: number; price: number };
      elite: { count: number; price: number };
    };
  };
  scans: {
    total_this_month: number;
  };
  telemetry: {
    total_errors: number;
    total_failovers: number;
    error_rate_status: string;
  };
}

interface OverviewTabProps {
  onNavigateTab: (tabId: string) => void;
}

export default function OverviewTab({ onNavigateTab }: OverviewTabProps) {
  const { getAdminAuthHeader } = useAdminAuth();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await getAdminAuthHeader();
      const res = await fetch(`${API_BASE}/api/admin/analytics/overview`, {
        headers,
      });
      if (!res.ok) {
        throw new Error(`Analytics overview responded with HTTP ${res.status}`);
      }
      const json: AnalyticsData = await res.json();
      setData(json);
      setLastRefreshed(new Date().toLocaleTimeString());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch analytics overview';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [getAdminAuthHeader]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchOverview();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchOverview]);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800/80 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-mono uppercase tracking-widest text-emerald-400 font-bold">
              Telemetry Grid // Live Realtime
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black font-outfit uppercase tracking-tight text-white mt-1">
            Platform Operations Overview
          </h2>
          <p className="text-xs text-slate-400 mt-0.5 font-mono">
            FastAPI Engine // MongoDB Atlas // Indian Market Food Intelligence
          </p>
        </div>

        <div className="flex items-center gap-3">
          {lastRefreshed && (
            <span className="text-[11px] font-mono text-slate-500 hidden md:inline-block">
              Updated: {lastRefreshed}
            </span>
          )}
          <button
            onClick={fetchOverview}
            disabled={loading}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold uppercase tracking-wider text-slate-200 rounded-xl transition-all flex items-center gap-2 active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
            Refresh Telemetry
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-mono flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>Error retrieving overview metrics: {error}</span>
        </div>
      )}

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* Total Users Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 relative overflow-hidden group hover:border-slate-700 transition-all">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Users className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-slate-950 border border-slate-800 text-slate-400 font-bold uppercase">
              {data?.users.active_today ?? 0} active today
            </span>
          </div>
          <div className="text-3xl font-black font-outfit text-white tracking-tight">
            {data ? data.users.total.toLocaleString() : '—'}
          </div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-1">
            Registered Users
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
            <span>Free: {data?.users.tier_breakdown.free ?? 0}</span>
            <span className="text-emerald-400 font-mono font-bold">
              Paid: {data ? (data.users.tier_breakdown.starter + data.users.tier_breakdown.pro + data.users.tier_breakdown.elite) : 0}
            </span>
          </div>
        </div>

        {/* Monthly Scans Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 relative overflow-hidden group hover:border-slate-700 transition-all">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <ScanLine className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-slate-950 border border-slate-800 text-blue-400 font-bold uppercase">
              OCR + AI Vision
            </span>
          </div>
          <div className="text-3xl font-black font-outfit text-white tracking-tight">
            {data ? data.scans.total_this_month.toLocaleString() : '—'}
          </div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-1">
            Scans Executed This Month
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
            <span>Quota Enforcement</span>
            <span className="text-blue-400 font-mono font-bold">Active</span>
          </div>
        </div>

        {/* Pending Food Moderation Card */}
        <div 
          onClick={() => onNavigateTab('moderation')}
          className="bg-slate-900 border border-slate-800 rounded-3xl p-6 relative overflow-hidden group hover:border-amber-500/40 cursor-pointer transition-all"
        >
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <UtensilsCrossed className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 font-bold uppercase flex items-center gap-1">
              Review Queue <ArrowUpRight className="w-3 h-3" />
            </span>
          </div>
          <div className="text-3xl font-black font-outfit text-amber-400 tracking-tight">
            {data ? data.foods.pending_moderation.toLocaleString() : '—'}
          </div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-1">
            Pending Food Scans
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
            <span>Total Catalog: {data?.foods.total_catalog ?? 0}</span>
            <span className="text-amber-400 font-mono font-bold">
              {data ? `${data.foods.approved_ratio}% Verified` : '—'}
            </span>
          </div>
        </div>

        {/* Estimated MRR Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 relative overflow-hidden group hover:border-slate-700 transition-all">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <IndianRupee className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-slate-950 border border-slate-800 text-emerald-400 font-bold uppercase">
              Razorpay Ledger
            </span>
          </div>
          <div className="text-3xl font-black font-outfit text-emerald-400 tracking-tight flex items-baseline">
            <span>₹</span>
            <span>{data ? data.revenue.mrr.toLocaleString() : '—'}</span>
          </div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-1">
            Estimated MRR (Monthly)
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
            <span>Paying Subs</span>
            <span className="text-emerald-400 font-mono font-bold">
              {data?.revenue.active_paying_subscribers ?? 0} Accounts
            </span>
          </div>
        </div>
      </div>

      {/* Subscription Breakdown & System Telemetry Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tier Distribution Bar */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-lg font-bold font-outfit uppercase tracking-tight text-white">
                Subscription Tier Distribution
              </h3>
              <p className="text-xs text-slate-400">
                Active member count by commercial subscription plan
              </p>
            </div>
            <TrendingUp className="w-5 h-5 text-emerald-400" />
          </div>

          {/* Progress stack */}
          {data && (
            <div className="space-y-4">
              <div className="h-4 w-full bg-slate-950 rounded-full overflow-hidden flex border border-slate-800">
                <div
                  style={{
                    width: `${
                      data.users.total > 0
                        ? (data.users.tier_breakdown.free / data.users.total) * 100
                        : 100
                    }%`,
                  }}
                  className="bg-slate-700 h-full transition-all"
                  title={`Free Tier: ${data.users.tier_breakdown.free}`}
                />
                <div
                  style={{
                    width: `${
                      data.users.total > 0
                        ? (data.users.tier_breakdown.starter / data.users.total) * 100
                        : 0
                    }%`,
                  }}
                  className="bg-blue-500 h-full transition-all"
                  title={`Starter: ${data.users.tier_breakdown.starter}`}
                />
                <div
                  style={{
                    width: `${
                      data.users.total > 0
                        ? (data.users.tier_breakdown.pro / data.users.total) * 100
                        : 0
                    }%`,
                  }}
                  className="bg-emerald-500 h-full transition-all"
                  title={`Pro: ${data.users.tier_breakdown.pro}`}
                />
                <div
                  style={{
                    width: `${
                      data.users.total > 0
                        ? (data.users.tier_breakdown.elite / data.users.total) * 100
                        : 0
                    }%`,
                  }}
                  className="bg-amber-400 h-full transition-all"
                  title={`Elite: ${data.users.tier_breakdown.elite}`}
                />
              </div>

              {/* Tier Cards Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-3.5">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-600" />
                    <span className="text-[11px] font-black uppercase text-slate-400">Free</span>
                  </div>
                  <div className="text-xl font-bold font-mono text-white">
                    {data.users.tier_breakdown.free}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">₹0 // 20 scans</div>
                </div>

                <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-3.5">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                    <span className="text-[11px] font-black uppercase text-blue-400">Starter</span>
                  </div>
                  <div className="text-xl font-bold font-mono text-white">
                    {data.users.tier_breakdown.starter}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">₹366/mo // 80 scans</div>
                </div>

                <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-3.5">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span className="text-[11px] font-black uppercase text-emerald-400">Pro</span>
                  </div>
                  <div className="text-xl font-bold font-mono text-white">
                    {data.users.tier_breakdown.pro}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">₹732/mo // 200 scans</div>
                </div>

                <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-3.5">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    <span className="text-[11px] font-black uppercase text-amber-300">Elite</span>
                  </div>
                  <div className="text-xl font-bold font-mono text-white">
                    {data.users.tier_breakdown.elite}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">₹998/mo // 500 scans</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Telemetry & System Health Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold font-outfit uppercase tracking-tight text-white">
                System Health
              </h3>
              <Activity className="w-5 h-5 text-emerald-400" />
            </div>

            <div className="space-y-4 font-mono text-xs">
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400">API Gateway:</span>
                <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> ONLINE
                </span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400">MongoDB Atlas:</span>
                <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> CONNECTED
                </span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400">AI Failovers:</span>
                <span className="text-amber-400 font-bold">
                  {data?.telemetry.total_failovers ?? 0} Recorded
                </span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400">System Exceptions:</span>
                <span className="text-rose-400 font-bold">
                  {data?.telemetry.total_errors ?? 0} Logged
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={() => onNavigateTab('logs')}
            className="w-full mt-6 py-3 px-4 rounded-2xl bg-slate-950 hover:bg-slate-800 border border-slate-700 text-xs font-bold uppercase tracking-wider text-slate-300 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Inspect System Logs
          </button>
        </div>
      </div>
    </div>
  );
}
