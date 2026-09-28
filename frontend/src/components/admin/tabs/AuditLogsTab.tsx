import { useState, useEffect, useCallback } from 'react';
import {
  History,
  Search,
  RefreshCw,
  Download,
  Filter,
  CheckCircle2,
  XCircle,
  RotateCcw,
  UserX,
  UserCheck,
  Crown,
  KeyRound,
  Trash2,
  Banknote,
  Eye,
  X,
  Copy,
  Check,
  Globe,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Shield,
} from 'lucide-react';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import { API_BASE } from '../../../config';

export interface AuditEvent {
  id?: string;
  event_id?: string;
  timestamp: string;
  admin_email?: string;
  actor_email?: string;
  actor_id?: string;
  admin_id?: string;
  admin_role?: string;
  action: string;
  target_resource?: string;
  target_resource_type?: string;
  target_resource_id?: string;
  target_id?: string;
  ip_address?: string;
  request_id?: string;
  user_agent?: string;
  status?: string;
  details?: Record<string, unknown>;
}

const ACTION_OPTIONS = [
  { value: 'ALL', label: 'All Actions' },
  { value: 'FOOD_APPROVED', label: 'Food Approved' },
  { value: 'FOOD_REJECTED', label: 'Food Rejected' },
  { value: 'USER_QUOTA_RESET', label: 'User Quota Reset' },
  { value: 'USER_BANNED', label: 'User Banned' },
  { value: 'USER_UNBANNED', label: 'User Unbanned' },
  { value: 'ADMIN_INVITED', label: 'Admin Invited' },
  { value: 'ADMIN_PERMISSIONS_UPDATED', label: 'Admin Permissions Updated' },
  { value: 'ADMIN_REVOKED', label: 'Admin Revoked' },
  { value: 'SUBSCRIPTION_REFUNDED', label: 'Subscription Refunded' },
];

function formatRelativeTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSec < 0) return 'just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function getActionMeta(action: string) {
  switch (action) {
    case 'FOOD_APPROVED':
      return {
        label: 'Food Approved',
        icon: CheckCircle2,
        badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
        textClass: 'text-emerald-400',
      };
    case 'FOOD_REJECTED':
      return {
        label: 'Food Rejected',
        icon: XCircle,
        badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
        textClass: 'text-rose-400',
      };
    case 'USER_QUOTA_RESET':
      return {
        label: 'Quota Reset',
        icon: RotateCcw,
        badgeClass: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
        textClass: 'text-sky-400',
      };
    case 'USER_BANNED':
      return {
        label: 'User Banned',
        icon: UserX,
        badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40 font-bold',
        textClass: 'text-rose-400',
      };
    case 'USER_UNBANNED':
      return {
        label: 'User Unbanned',
        icon: UserCheck,
        badgeClass: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
        textClass: 'text-emerald-400',
      };
    case 'ADMIN_INVITED':
      return {
        label: 'Admin Invited',
        icon: Crown,
        badgeClass: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
        textClass: 'text-purple-400',
      };
    case 'ADMIN_PERMISSIONS_UPDATED':
      return {
        label: 'Permissions Updated',
        icon: KeyRound,
        badgeClass: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
        textClass: 'text-indigo-400',
      };
    case 'ADMIN_REVOKED':
      return {
        label: 'Admin Revoked',
        icon: Trash2,
        badgeClass: 'bg-red-500/15 text-red-400 border-red-500/30',
        textClass: 'text-red-400',
      };
    case 'SUBSCRIPTION_REFUNDED':
      return {
        label: 'Refund Processed',
        icon: Banknote,
        badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
        textClass: 'text-amber-400',
      };
    default:
      return {
        label: action,
        icon: Shield,
        badgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
        textClass: 'text-slate-300',
      };
  }
}

export default function AuditLogsTab() {
  const { getAdminAuthHeader, isSuperAdmin, permissions } = useAdminAuth();

  const [logs, setLogs] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [exporting, setExporting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState<boolean>(false);

  // Filters
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [emailFilter, setEmailFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);
  const PAGE_SIZE = 25;

  // Inspector Modal
  const [inspectEvent, setInspectEvent] = useState<AuditEvent | null>(null);
  const [copiedJson, setCopiedJson] = useState<boolean>(false);

  // Debounce search query to prevent hammering the server on every keystroke
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const fetchAuditLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);

    try {
      const headers = await getAdminAuthHeader();
      const params = new URLSearchParams({
        skip: String((currentPage - 1) * PAGE_SIZE),
        limit: String(PAGE_SIZE),
      });

      if (actionFilter !== 'ALL') {
        params.append('action', actionFilter);
      }
      if (emailFilter.trim()) {
        params.append('admin_email', emailFilter.trim());
      }
      if (debouncedSearch.trim()) {
        params.append('search', debouncedSearch.trim());
      }

      const res = await fetch(`${API_BASE}/api/admin/audit-logs?${params.toString()}`, {
        headers,
      });

      if (res.status === 403) {
        setForbidden(true);
        setLogs([]);
        setTotalCount(0);
        return;
      }

      if (!res.ok) {
        throw new Error(`Failed to load audit logs (HTTP ${res.status})`);
      }

      const data = await res.json();
      setLogs(data.items || []);
      setTotalCount(data.total || 0);
    } catch (err: unknown) {
      console.error('[AuditLogs] Fetch error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error loading audit logs');
    } finally {
      setLoading(false);
    }
  }, [getAdminAuthHeader, currentPage, actionFilter, emailFilter, debouncedSearch]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchAuditLogs();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchAuditLogs]);

  // Handle CSV Export
  const handleExportCsv = async () => {
    setExporting(true);
    setExportNotice(null);
    try {
      const headers = await getAdminAuthHeader();
      const params = new URLSearchParams();
      if (actionFilter !== 'ALL') {
        params.append('action', actionFilter);
      }
      if (emailFilter.trim()) {
        params.append('admin_email', emailFilter.trim());
      }
      if (debouncedSearch.trim()) {
        params.append('search', debouncedSearch.trim());
      }

      const res = await fetch(`${API_BASE}/api/admin/audit-logs/export?${params.toString()}`, {
        headers,
      });

      if (res.status === 403) {
        setExportNotice('Access Denied: Super Admin clearance required for CSV export.');
        return;
      }

      if (!res.ok) {
        throw new Error(`Export failed with HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      const today = new Date().toISOString().split('T')[0];
      link.download = `z_sehealth_audit_trail_${today}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
      setExportNotice('Audit trail exported successfully.');
      setTimeout(() => setExportNotice(null), 4000);
    } catch (err: unknown) {
      console.error('[AuditLogs] CSV Export error:', err);
      setExportNotice(err instanceof Error ? err.message : 'Failed to export CSV');
    } finally {
      setExporting(false);
    }
  };

  const resetFilters = () => {
    setActionFilter('ALL');
    setEmailFilter('');
    setSearchQuery('');
    setDebouncedSearch('');
    setCurrentPage(1);
  };

  const copyEventJson = () => {
    if (!inspectEvent) return;
    navigator.clipboard.writeText(JSON.stringify(inspectEvent, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1;

  // Handle escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && inspectEvent) {
        setInspectEvent(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inspectEvent]);

  if (forbidden || (!isSuperAdmin && !permissions.canManageAdmins)) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-4 max-w-xl mx-auto mt-12 font-mono">
        <div className="w-14 h-14 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl flex items-center justify-center mx-auto">
          <AlertTriangle className="w-7 h-7" />
        </div>
        <h3 className="text-xl font-black text-white font-outfit uppercase">
          Access Restricted: Super Admin Clearance Required
        </h3>
        <p className="text-xs text-slate-400 font-sans leading-relaxed">
          The Administrative Audit Trail contains immutable security records and privileged mutation logs.
          Your current administrative account does not possess Super Admin or Admin Governance privileges.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300 font-mono">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-emerald-400" />
            <span className="text-[11px] uppercase tracking-widest text-emerald-400 font-bold">
              Security Governance // Immutable Audit Trail
            </span>
          </div>
          <h2 className="text-2xl font-black font-outfit uppercase tracking-tight text-white mt-1">
            Multi-Admin Activity Audit Trail
          </h2>
          <p className="text-xs text-slate-400 font-sans">
            Chronological, immutable ledger of all administrative mutations, approvals, quota resets, and financial operations
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleExportCsv}
            disabled={exporting || loading || totalCount === 0}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold uppercase tracking-wider text-slate-200 rounded-xl transition-all flex items-center gap-2 active:scale-95 disabled:opacity-50 cursor-pointer"
            title="Export filtered records to CSV"
          >
            <Download className={`w-3.5 h-3.5 ${exporting ? 'animate-bounce text-emerald-400' : ''}`} />
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>

          <button
            onClick={() => fetchAuditLogs()}
            disabled={loading}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold uppercase tracking-wider text-slate-200 rounded-xl transition-all flex items-center gap-2 active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Notice Banner */}
      {exportNotice && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 px-4 py-2.5 rounded-xl text-xs flex items-center justify-between animate-in fade-in duration-200">
          <span>{exportNotice}</span>
          <button onClick={() => setExportNotice(null)} className="text-emerald-400 hover:text-white cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Filter and Search Panel */}
      <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-4 space-y-3 backdrop-blur-md">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Action Filter */}
          <div className="relative">
            <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1 font-bold">
              Action Filter
            </label>
            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl px-3 py-2.5 outline-none focus:border-emerald-500/50 appearance-none cursor-pointer"
            >
              {ACTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Admin Email Filter */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1 font-bold">
              Admin Email Filter
            </label>
            <input
              type="text"
              value={emailFilter}
              onChange={(e) => {
                setEmailFilter(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="e.g. admin@z-sehealth.com"
              className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl px-3 py-2.5 outline-none focus:border-emerald-500/50"
            />
          </div>

          {/* Search Query */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1 font-bold">
              Search Target ID / Reason (Debounced)
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Target ID, User ID, food name..."
                className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl pl-9 pr-3 py-2.5 outline-none focus:border-emerald-500/50"
              />
            </div>
          </div>
        </div>

        {/* Clear Filters Row */}
        {(actionFilter !== 'ALL' || emailFilter || searchQuery) && (
          <div className="flex justify-end pt-1">
            <button
              onClick={resetFilters}
              className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Filter className="w-3 h-3" />
              Reset active filters
            </button>
          </div>
        )}
      </div>

      {/* Main Ledger Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 text-center space-y-3">
            <RefreshCw className="w-6 h-6 animate-spin text-emerald-400 mx-auto" />
            <p className="text-xs text-slate-400">Loading audit trail records...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center space-y-3">
            <p className="text-xs text-rose-400">{error}</p>
            <button
              onClick={() => fetchAuditLogs()}
              className="px-3 py-1.5 bg-slate-800 text-xs text-slate-200 rounded-lg hover:bg-slate-700"
            >
              Retry
            </button>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <History className="w-8 h-8 text-slate-600 mx-auto" />
            <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">
              No Audit Events Recorded
            </h3>
            <p className="text-xs text-slate-500 font-sans max-w-sm mx-auto">
              No administrative mutations match your current filter parameters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950/80 border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-400">
                  <th className="py-3.5 px-4 font-bold">Timestamp</th>
                  <th className="py-3.5 px-4 font-bold">Action</th>
                  <th className="py-3.5 px-4 font-bold">Actor</th>
                  <th className="py-3.5 px-4 font-bold">Resource & Target</th>
                  <th className="py-3.5 px-4 font-bold">Origin IP</th>
                  <th className="py-3.5 px-4 font-bold text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {logs.map((event, idx) => {
                  const meta = getActionMeta(event.action);
                  const Icon = meta.icon;
                  const eventKey = event.event_id || event.id || `${event.timestamp}-${idx}`;
                  const actorEmail = event.actor_email || event.admin_email || 'System';
                  const targetType = event.target_resource_type || event.target_resource || 'Resource';
                  const targetId = event.target_resource_id || event.target_id || (event.details?.food_id as string) || (event.details?.target_user_uid as string) || 'N/A';

                  return (
                    <tr
                      key={eventKey}
                      className="hover:bg-slate-800/40 transition-colors group cursor-pointer"
                      onClick={() => setInspectEvent(event)}
                    >
                      {/* Timestamp */}
                      <td className="py-3.5 px-4 text-slate-300 whitespace-nowrap">
                        <div className="font-semibold text-slate-200">
                          {formatRelativeTime(event.timestamp)}
                        </div>
                        <div className="text-[10px] text-slate-500 font-sans">
                          {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </div>
                      </td>

                      {/* Action Badge */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${meta.badgeClass}`}
                        >
                          <Icon className="w-3.5 h-3.5 shrink-0" />
                          {meta.label}
                        </span>
                      </td>

                      {/* Actor */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="text-slate-200 font-medium">{actorEmail}</div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1">
                          {event.admin_role === 'SUPER_ADMIN' || actorEmail.includes('farhan') ? (
                            <span className="text-amber-400 font-bold flex items-center gap-0.5">
                              <Crown className="w-2.5 h-2.5" /> Super Admin
                            </span>
                          ) : (
                            <span className="text-slate-400">Admin</span>
                          )}
                        </div>
                      </td>

                      {/* Target Resource */}
                      <td className="py-3.5 px-4">
                        <div className="text-slate-300 font-medium uppercase tracking-wider text-[11px]">
                          {targetType}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono truncate max-w-[200px]" title={targetId}>
                          {targetId}
                        </div>
                      </td>

                      {/* IP Address */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-400">
                        <div className="flex items-center gap-1.5 text-[11px]">
                          <Globe className="w-3 h-3 text-slate-500" />
                          <span>{event.ip_address || 'unknown'}</span>
                        </div>
                      </td>

                      {/* Action / Inspect */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setInspectEvent(event);
                          }}
                          className="px-2.5 py-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-700/80 rounded-lg text-slate-300 hover:text-white transition-all flex items-center gap-1.5 ml-auto cursor-pointer"
                        >
                          <Eye className="w-3 h-3 text-emerald-400" />
                          <span>Inspect</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div>
            Showing{' '}
            <span className="text-slate-200 font-bold">
              {logs.length > 0 ? (currentPage - 1) * PAGE_SIZE + 1 : 0}
            </span>{' '}
            to{' '}
            <span className="text-slate-200 font-bold">
              {Math.min(currentPage * PAGE_SIZE, totalCount)}
            </span>{' '}
            of <span className="text-slate-200 font-bold">{totalCount}</span> events
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1 || loading}
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 disabled:opacity-40 disabled:hover:bg-slate-900 cursor-pointer"
              title="Previous Page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-[11px] font-bold text-slate-300 px-2">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages || loading}
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 disabled:opacity-40 disabled:hover:bg-slate-900 cursor-pointer"
              title="Next Page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Inspector Modal */}
      {inspectEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200 font-mono">
          <div className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
              <div className="flex items-center gap-2.5">
                <History className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-black uppercase text-white font-outfit tracking-wide">
                  Audit Event Inspector // {inspectEvent.action}
                </h3>
              </div>
              <button
                onClick={() => setInspectEvent(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
              {/* Event Metadata Grid */}
              <div className="grid grid-cols-2 gap-3 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Event ID</span>
                  <span className="text-slate-300 font-semibold truncate block">{inspectEvent.event_id || inspectEvent.id}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Timestamp</span>
                  <span className="text-slate-300 font-semibold block">{new Date(inspectEvent.timestamp).toISOString()}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Admin Actor</span>
                  <span className="text-emerald-400 font-semibold block">{inspectEvent.actor_email || inspectEvent.admin_email}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Actor ID</span>
                  <span className="text-slate-300 font-semibold block">{inspectEvent.actor_id || inspectEvent.admin_id || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Target Resource</span>
                  <span className="text-slate-300 font-semibold uppercase block">{inspectEvent.target_resource_type || inspectEvent.target_resource}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Target Identifier</span>
                  <span className="text-slate-300 font-semibold truncate block">{inspectEvent.target_resource_id || inspectEvent.target_id || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block">IP Address</span>
                  <span className="text-slate-300 font-semibold block">{inspectEvent.ip_address || 'unknown'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Request ID</span>
                  <span className="text-slate-300 font-semibold truncate block">{inspectEvent.request_id || 'N/A'}</span>
                </div>
              </div>

              {/* JSON Payload Inspector */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                    Mutation Details Payload
                  </span>
                  <button
                    onClick={copyEventJson}
                    className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    {copiedJson ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy JSON</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 overflow-x-auto text-[11px] leading-relaxed max-h-60">
                  <pre className="text-emerald-400/90 whitespace-pre font-mono">
                    {JSON.stringify(inspectEvent.details || {}, null, 2)}
                  </pre>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex justify-end">
              <button
                onClick={() => setInspectEvent(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
