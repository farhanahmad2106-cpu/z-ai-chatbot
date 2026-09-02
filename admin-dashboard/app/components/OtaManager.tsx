'use client';

import React, { useState, useEffect, useCallback } from 'react';

interface UpdateItem {
  id: string;
  createdAt: string;
  group: string;
  message: string;
  runtimeVersion: string;
  platform: string;
}

export default function OtaManager() {
  const [adminKey, setAdminKey] = useState('');
  const [channel, setChannel] = useState<'production' | 'staging'>('production');
  const [updates, setUpdates] = useState<UpdateItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [dispatchMessage, setDispatchMessage] = useState('');
  const [statusText, setStatusText] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const fetchUpdates = useCallback(async () => {
    if (!adminKey) {
      setStatusText('Please enter your X-Admin-Key to fetch EAS updates.');
      setIsError(true);
      return;
    }

    setLoading(true);
    setStatusText(null);
    setIsError(false);

    try {
      const res = await fetch(`/api/ota?channel=${channel}`, {
        headers: {
          'X-Admin-Key': adminKey,
        },
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setUpdates(data.updates || data.recentUpdates || []);
      setStatusText(`Fetched ${data.updates?.length || data.recentUpdates?.length || 0} updates for channel: ${channel}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Fetch failed';
      setStatusText(`Error: ${msg}`);
      setIsError(true);
    } finally {
      setLoading(false);
    }
  }, [adminKey, channel]);

  const triggerDispatch = async (action: 'publish' | 'rollback' = 'publish') => {
    if (!adminKey) {
      setStatusText('Please enter your X-Admin-Key.');
      setIsError(true);
      return;
    }

    if (action === 'publish' && !dispatchMessage.trim()) {
      setStatusText('Please enter a hotfix message for this OTA update.');
      setIsError(true);
      return;
    }

    setLoading(true);
    setStatusText(null);
    setIsError(false);

    try {
      const res = await fetch('/api/ota', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': adminKey,
        },
        body: JSON.stringify({
          channel,
          message: action === 'rollback' ? 'Emergency OTA Rollback' : dispatchMessage,
          action,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to dispatch OTA');
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
    <div className="bg-slate-950 text-slate-100 p-8 rounded-3xl border border-slate-800 max-w-4xl mx-auto font-sans">
      <div className="flex justify-between items-center mb-6 pb-6 border-b border-slate-800">
        <div>
          <h2 className="text-2xl font-black font-outfit uppercase tracking-tight text-emerald-400">
            OTA Update Control Center
          </h2>
          <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider">
            Z-SeHealth React Native Expo / EAS Distribution
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setChannel('production')}
            className={`px-4 py-1.5 rounded-xl text-xs font-bold uppercase transition-all ${
              channel === 'production'
                ? 'bg-emerald-500 text-slate-950'
                : 'bg-slate-900 text-slate-400 border border-slate-800 hover:border-slate-700'
            }`}
          >
            Production
          </button>
          <button
            onClick={() => setChannel('staging')}
            className={`px-4 py-1.5 rounded-xl text-xs font-bold uppercase transition-all ${
              channel === 'staging'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-900 text-slate-400 border border-slate-800 hover:border-slate-700'
            }`}
          >
            Staging
          </button>
        </div>
      </div>

      {/* Admin Key Input */}
      <div className="mb-6">
        <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">
          Admin Authorization Key (X-Admin-Key)
        </label>
        <div className="flex gap-3">
          <input
            type="password"
            placeholder="Enter X-Admin-Key..."
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-all"
          />
          <button
            onClick={fetchUpdates}
            disabled={loading}
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-2xl text-xs font-bold uppercase text-slate-200 transition-all active:scale-95 disabled:opacity-50"
          >
            {loading ? 'Fetching...' : 'Query Releases'}
          </button>
        </div>
      </div>

      {/* Dispatch Action Box */}
      <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 mb-6">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 mb-3">
          Dispatch Instant Remote Hotfix
        </h3>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Hotfix commit notes (e.g., Fix quote duration 8s/15s algorithm)..."
            value={dispatchMessage}
            onChange={(e) => setDispatchMessage(e.target.value)}
            className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500"
          />
          <button
            onClick={() => triggerDispatch('publish')}
            disabled={loading}
            className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs uppercase tracking-wide transition-all active:scale-95 disabled:opacity-50"
          >
            Deploy OTA
          </button>
          <button
            onClick={() => triggerDispatch('rollback')}
            disabled={loading}
            className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 font-bold rounded-xl text-xs uppercase tracking-wide transition-all active:scale-95 disabled:opacity-50"
          >
            Rollback
          </button>
        </div>
      </div>

      {/* Status Notice */}
      {statusText && (
        <div
          className={`p-3 rounded-xl mb-6 text-xs font-medium border ${
            isError
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
          }`}
        >
          {statusText}
        </div>
      )}

      {/* Update Releases Table */}
      <div>
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">
          Active Releases on [{channel.toUpperCase()}]
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500">
                <th className="py-2.5 px-3">Update ID</th>
                <th className="py-2.5 px-3">Runtime</th>
                <th className="py-2.5 px-3">Message</th>
                <th className="py-2.5 px-3">Timestamp</th>
                <th className="py-2.5 px-3">Platform</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900 text-slate-300">
              {updates.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-600">
                    No update releases recorded or query not yet executed.
                  </td>
                </tr>
              ) : (
                updates.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-900/50">
                    <td className="py-2.5 px-3 font-mono text-emerald-400">{item.id.slice(0, 12)}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-400">{item.runtimeVersion}</td>
                    <td className="py-2.5 px-3">{item.message}</td>
                    <td className="py-2.5 px-3 text-slate-400">
                      {new Date(item.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 uppercase text-slate-400">{item.platform}</td>
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
