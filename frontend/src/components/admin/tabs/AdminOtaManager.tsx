import { useState, useEffect, useCallback } from 'react';
import {
  Smartphone,
  Send,
  RotateCcw,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  GitBranch,
} from 'lucide-react';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import { API_BASE } from '../../../config';

interface UpdateItem {
  id: string;
  createdAt: string;
  group?: string;
  message: string;
  runtimeVersion: string;
  platform: string;
}

export default function AdminOtaManager() {
  const { getAdminAuthHeader, permissions } = useAdminAuth();
  const [channel, setChannel] = useState<'production' | 'staging'>('production');
  const [updates, setUpdates] = useState<UpdateItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [dispatchMessage, setDispatchMessage] = useState<string>('');
  const [statusText, setStatusText] = useState<string | null>(null);
  const [isError, setIsError] = useState<boolean>(false);

  const fetchUpdates = useCallback(async () => {
    setLoading(true);
    setStatusText(null);
    setIsError(false);

    try {
      const headers = await getAdminAuthHeader();
      const res = await fetch(`${API_BASE}/api/admin/ota/releases?channel=${channel}`, {
        headers,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setUpdates(data.updates || []);
      setStatusText(`Fetched ${data.updates?.length || 0} active releases for channel: [${channel.toUpperCase()}]`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Fetch failed';
      setStatusText(`Error: ${msg}`);
      setIsError(true);
    } finally {
      setLoading(false);
    }
  }, [channel, getAdminAuthHeader]);

  useEffect(() => {
    fetchUpdates();
  }, [fetchUpdates]);

  const triggerDispatch = async (action: 'publish' | 'rollback' = 'publish') => {
    if (!permissions.canTriggerOTA) {
      setStatusText('Permission Denied: You do not possess EAS OTA dispatch capabilities.');
      setIsError(true);
      return;
    }

    if (action === 'publish' && !dispatchMessage.trim()) {
      setStatusText('Please enter a hotfix message or commit note.');
      setIsError(true);
      return;
    }

    setLoading(true);
    setStatusText(null);
    setIsError(false);

    try {
      const headers = await getAdminAuthHeader();
      const res = await fetch(`${API_BASE}/api/admin/ota/dispatch`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          channel,
          message: action === 'rollback' ? 'Emergency OTA Rollback triggered from Admin Portal' : dispatchMessage.trim(),
          action,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || data.error || 'Failed to dispatch OTA');
      }

      setStatusText(`Success: ${data.message}`);
      setDispatchMessage('');
      fetchUpdates();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Dispatch failed';
      setStatusText(`Error: ${msg}`);
      setIsError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-emerald-400" />
            <span className="text-[11px] font-mono uppercase tracking-widest text-emerald-400 font-bold">
              React Native Expo / EAS Distribution
            </span>
          </div>
          <h2 className="text-2xl font-black font-outfit uppercase tracking-tight text-white mt-1">
            Over-The-Air (OTA) Hotfix Manager
          </h2>
          <p className="text-xs text-slate-400 font-mono">
            Dispatch zero-downtime runtime bundle hotfixes to mobile clients via GitHub Actions CI/CD
          </p>
        </div>

        {/* Channel Switcher */}
        <div className="flex gap-2">
          <button
            onClick={() => setChannel('production')}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase transition-all cursor-pointer ${
              channel === 'production'
                ? 'bg-emerald-500 text-slate-950 font-black shadow-lg shadow-emerald-950'
                : 'bg-slate-900 text-slate-400 border border-slate-800 hover:border-slate-700'
            }`}
          >
            Production
          </button>
          <button
            onClick={() => setChannel('staging')}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase transition-all cursor-pointer ${
              channel === 'staging'
                ? 'bg-amber-400 text-slate-950 font-black shadow-lg shadow-amber-950'
                : 'bg-slate-900 text-slate-400 border border-slate-800 hover:border-slate-700'
            }`}
          >
            Staging
          </button>
        </div>
      </div>

      {/* Status Notice */}
      {statusText && (
        <div
          className={`p-4 rounded-2xl border text-xs font-mono flex items-center gap-3 ${
            isError
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
          }`}
        >
          {isError ? (
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          )}
          <span>{statusText}</span>
        </div>
      )}

      {/* Dispatch Action Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl">
        <div className="flex items-center gap-2 mb-2">
          <GitBranch className="w-4 h-4 text-emerald-400" />
          <h3 className="text-base font-bold font-outfit uppercase tracking-tight text-white">
            Dispatch Instant Remote Hotfix
          </h3>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Publishes an immediate OTA bundle update without requiring an app store review. Locked to runtimeVersion policy.
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Commit / hotfix note (e.g., Fix quote progress bar 8s/15s algorithm)..."
            value={dispatchMessage}
            onChange={(e) => setDispatchMessage(e.target.value)}
            disabled={!permissions.canTriggerOTA}
            className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl px-4 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono disabled:opacity-50"
          />
          <button
            onClick={() => triggerDispatch('publish')}
            disabled={loading || !permissions.canTriggerOTA}
            className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black uppercase tracking-wider rounded-2xl transition-all flex items-center justify-center gap-2 active:scale-95 shadow-lg shadow-emerald-950 cursor-pointer disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            Deploy OTA
          </button>
          <button
            onClick={() => triggerDispatch('rollback')}
            disabled={loading || !permissions.canTriggerOTA}
            className="px-4 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-bold uppercase tracking-wider rounded-2xl transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4 text-rose-400" />
            Rollback
          </button>
        </div>
      </div>

      {/* Active Releases Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
        <div className="p-5 border-b border-slate-800 flex justify-between items-center">
          <div>
            <h4 className="text-xs font-black font-mono uppercase tracking-widest text-slate-400">
              Active Releases on [{channel.toUpperCase()}]
            </h4>
            <p className="text-[11px] text-slate-500 font-mono mt-0.5">
              Querying Expo Application Services updates API
            </p>
          </div>
          <button
            onClick={fetchUpdates}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500 font-mono text-[10px] uppercase tracking-wider bg-slate-950/40">
                <th className="py-3 px-4">Update ID</th>
                <th className="py-3 px-4">Runtime</th>
                <th className="py-3 px-4">Hotfix Message</th>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Platform</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {updates.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-600 font-mono text-xs">
                    {loading ? 'Querying EAS...' : 'No update releases recorded for this channel.'}
                  </td>
                </tr>
              ) : (
                updates.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-950/40 transition-colors">
                    <td className="py-3 px-4 font-mono text-emerald-400 font-bold">
                      {item.id.slice(0, 12)}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-400">{item.runtimeVersion}</td>
                    <td className="py-3 px-4 text-slate-200">{item.message}</td>
                    <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">
                      {item.createdAt ? new Date(item.createdAt).toLocaleString() : 'N/A'}
                    </td>
                    <td className="py-3 px-4 font-mono uppercase text-slate-400">{item.platform}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
