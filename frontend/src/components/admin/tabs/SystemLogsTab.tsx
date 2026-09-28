import { useState, useEffect, useCallback } from 'react';
import {
  Terminal,
  Search,
  RefreshCw,
  Maximize2,
  X,
  Layers,
} from 'lucide-react';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import { API_BASE } from '../../../config';

interface LogEntry {
  id: string;
  timestamp: string;
  level: string;
  service: string;
  message: string;
  details?: Record<string, unknown>;
}

export default function SystemLogsTab() {
  const { getAdminAuthHeader } = useAdminAuth();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [levelFilter, setLevelFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [inspectEntry, setInspectEntry] = useState<LogEntry | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAdminAuthHeader();
      const params = new URLSearchParams({ limit: '150' });
      if (levelFilter !== 'ALL') params.append('level', levelFilter);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());

      const res = await fetch(`${API_BASE}/api/admin/logs?${params.toString()}`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (err: unknown) {
      console.error('[SystemLogs] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [getAdminAuthHeader, levelFilter, searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchLogs();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchLogs]);

  // Auto-refresh interval
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchLogs();
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300 font-mono">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <span className="text-[11px] uppercase tracking-widest text-emerald-400 font-bold">
              MongoDB system_logs Stream // Realtime Audit
            </span>
          </div>
          <h2 className="text-2xl font-black font-outfit uppercase tracking-tight text-white mt-1">
            System Telemetry & Error Stream
          </h2>
          <p className="text-xs text-slate-400 font-sans">
            Structured exceptions, multi-model AI failovers (Sarvam → NVIDIA → Gemini), and admin audit traces
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer bg-slate-900 border border-slate-800 px-3 py-2 rounded-xl">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="accent-emerald-500 w-3.5 h-3.5"
            />
            <span className="text-[11px] uppercase tracking-wider">Live Tail (5s)</span>
          </label>
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold uppercase tracking-wider text-slate-200 rounded-xl transition-all flex items-center gap-2 active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 flex flex-col md:flex-row gap-3 items-center justify-between">
        {/* Search Input */}
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
          <input
            type="text"
            placeholder="Grep messages, service tags, error codes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
          />
        </div>

        {/* Level Filters */}
        <div className="flex gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          {['ALL', 'ERROR', 'WARNING', 'INFO'].map((lvl) => {
            const isActive = levelFilter === lvl;
            return (
              <button
                key={lvl}
                onClick={() => setLevelFilter(lvl)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  isActive
                    ? lvl === 'ERROR'
                      ? 'bg-rose-500 text-white shadow-lg shadow-rose-950'
                      : lvl === 'WARNING'
                      ? 'bg-amber-400 text-slate-950 shadow-lg shadow-amber-950'
                      : lvl === 'INFO'
                      ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-950'
                      : 'bg-slate-200 text-slate-950'
                    : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {lvl}
              </button>
            );
          })}
        </div>
      </div>

      {/* Terminal Monospace Stream Box */}
      <div className="bg-slate-950 border border-slate-800 rounded-3xl p-4 overflow-hidden shadow-2xl">
        <div className="flex justify-between items-center px-2 pb-3 border-b border-slate-900 text-[11px] text-slate-500 uppercase tracking-widest">
          <span>Log Output Stream ({logs.length} entries)</span>
          <span>FastAPI // Standard Out</span>
        </div>

        <div className="divide-y divide-slate-900/60 max-h-[650px] overflow-y-auto text-xs font-mono">
          {logs.length === 0 ? (
            <div className="py-16 text-center text-slate-600">
              {loading ? 'Streaming logs...' : 'No telemetry entries matching query.'}
            </div>
          ) : (
            logs.map((log) => {
              const isError = log.level === 'ERROR' || log.level === 'CRASH';
              const isWarn = log.level === 'WARNING' || log.level === 'FAILOVER';

              return (
                <div
                  key={log.id}
                  className={`py-3 px-3 hover:bg-slate-900/50 transition-colors flex items-start justify-between gap-3 group rounded-xl ${
                    isError
                      ? 'border-l-2 border-rose-500'
                      : isWarn
                      ? 'border-l-2 border-amber-400'
                      : 'border-l-2 border-emerald-400'
                  }`}
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-slate-500 text-[10px]">
                        {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : 'N/A'}
                      </span>
                      <span
                        className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase ${
                          isError
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            : isWarn
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        }`}
                      >
                        {log.level}
                      </span>
                      <span className="text-[10px] text-slate-400 font-bold px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800">
                        [{log.service}]
                      </span>
                    </div>

                    <div className={`text-xs break-all ${isError ? 'text-rose-200' : isWarn ? 'text-amber-200' : 'text-slate-300'}`}>
                      {log.message}
                    </div>
                  </div>

                  {log.details && (
                    <button
                      onClick={() => setInspectEntry(log)}
                      className="opacity-0 group-hover:opacity-100 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] uppercase font-bold flex items-center gap-1 transition-all cursor-pointer shrink-0"
                    >
                      <Maximize2 className="w-3 h-3" />
                      Payload
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Inspect JSON Details Modal */}
      {inspectEntry && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-2xl w-full shadow-2xl">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-emerald-400" />
                <h4 className="text-sm font-bold uppercase tracking-wider text-white">
                  Structured Payload Trace
                </h4>
              </div>
              <button
                onClick={() => setInspectEntry(null)}
                className="p-1 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 mb-4 text-xs">
              <div className="text-slate-400">
                Service: <span className="text-emerald-400 font-bold">{inspectEntry.service}</span>
              </div>
              <div className="text-slate-400">
                Timestamp: <span className="text-slate-200">{inspectEntry.timestamp}</span>
              </div>
              <div className="text-slate-300 break-all bg-slate-950 p-3 rounded-xl border border-slate-800">
                {inspectEntry.message}
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 max-h-96 overflow-y-auto">
              <pre className="text-xs text-emerald-400 font-mono whitespace-pre-wrap">
                {JSON.stringify(inspectEntry.details, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
