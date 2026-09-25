import { useState, useEffect, useCallback } from 'react';
import {
  Search,
  RefreshCw,
  RotateCcw,
  Ban,
  ShieldAlert,
  Flame,
  UserCheck,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Banknote,
} from 'lucide-react';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import { API_BASE } from '../../../config';
import { ConfirmModal } from '../../ui/ConfirmModal';

interface UserRecord {
  id: string;
  uid: string;
  email: string;
  name: string;
  picture?: string;
  tier: string;
  scans_used: number;
  scan_limit: number;
  streak: number;
  last_login_date?: string;
  is_banned: boolean;
  ban_reason?: string;
  subscription_status?: string;
}

export default function UserManagementTab() {
  const { getAdminAuthHeader, permissions } = useAdminAuth();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [tierFilter, setTierFilter] = useState<string>('');
  const [bannedFilter, setBannedFilter] = useState<string>('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Ban confirmation modal
  const [banModalTarget, setBanModalTarget] = useState<UserRecord | null>(null);
  const [banReason, setBanReason] = useState<string>('');

  // Refund modal
  const [refundModalTarget, setRefundModalTarget] = useState<UserRecord | null>(null);
  const [refundPaymentId, setRefundPaymentId] = useState<string>('');
  const [refundAmount, setRefundAmount] = useState<string>('');
  const [refundReason, setRefundReason] = useState<string>('');

  // Reset Quota Modal
  const [resetQuotaTarget, setResetQuotaTarget] = useState<UserRecord | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setNotice(null);
    try {
      const headers = await getAdminAuthHeader();
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '15',
      });
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      if (tierFilter) params.append('tier', tierFilter);
      if (bannedFilter) params.append('banned', bannedFilter);

      const res = await fetch(`${API_BASE}/api/admin/users?${params.toString()}`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setUsers(data.users || []);
      setTotalPages(data.total_pages || 1);
      setTotalCount(data.total || 0);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch users';
      setNotice({ text: msg, type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [getAdminAuthHeader, page, searchQuery, tierFilter, bannedFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleResetQuota = (user: UserRecord) => {
    if (!permissions.canManageUsers) return;
    setResetQuotaTarget(user);
  };

  const handleConfirmResetQuota = async () => {
    if (!resetQuotaTarget || !permissions.canManageUsers) return;
    const user = resetQuotaTarget;
    setActionLoadingId(user.id);
    setNotice(null);
    try {
      const headers = await getAdminAuthHeader();
      const res = await fetch(`${API_BASE}/api/admin/users/${user.uid || user.id}/reset-quota`, {
        method: 'POST',
        headers,
      });
      if (!res.ok) throw new Error(`Quota reset failed: HTTP ${res.status}`);
      const data = await res.json();
      setNotice({ text: data.message, type: 'success' });
      // Update local state
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, scans_used: 0 } : u))
      );
      setResetQuotaTarget(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Reset failed';
      setNotice({ text: msg, type: 'error' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleToggleBan = async () => {
    if (!banModalTarget || !permissions.canManageUsers) return;
    setActionLoadingId(banModalTarget.id);
    setNotice(null);
    try {
      const headers = await getAdminAuthHeader();
      const params = banReason.trim() ? `?reason=${encodeURIComponent(banReason.trim())}` : '';
      const res = await fetch(
        `${API_BASE}/api/admin/users/${banModalTarget.uid || banModalTarget.id}/toggle-ban${params}`,
        {
          method: 'POST',
          headers,
        }
      );
      if (!res.ok) throw new Error(`Ban toggle failed: HTTP ${res.status}`);
      const data = await res.json();
      setNotice({ text: data.message, type: 'success' });

      // Update local state
      setUsers((prev) =>
        prev.map((u) =>
          u.id === banModalTarget.id ? { ...u, is_banned: data.is_banned, ban_reason: banReason } : u
        )
      );
      setBanModalTarget(null);
      setBanReason('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ban action failed';
      setNotice({ text: msg, type: 'error' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRefund = async () => {
    if (!refundModalTarget || !permissions.canManageAdmins) return; // Super admin required
    if (!refundPaymentId.trim() || !refundReason.trim()) return;

    setActionLoadingId(refundModalTarget.id);
    setNotice(null);
    try {
      const headers = await getAdminAuthHeader();
      
      const payload: any = {
        payment_id: refundPaymentId.trim(),
        reason: refundReason
      };
      
      if (refundAmount.trim()) {
        payload.amount = parseInt(refundAmount, 10);
      }

      const res = await fetch(`${API_BASE}/api/admin/subscriptions/refund`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `Refund failed: HTTP ${res.status}`);
      
      setNotice({ text: `Refund successful. ${data.user_downgraded ? 'User downgraded to free tier.' : ''}`, type: 'success' });
      setRefundModalTarget(null);
      setRefundPaymentId('');
      setRefundAmount('');
      setRefundReason('');
      
      // Refresh list to show potential tier changes
      fetchUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Refund failed';
      setNotice({ text: msg, type: 'error' });
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-pulse" />
            <span className="text-[11px] font-mono uppercase tracking-widest text-blue-400 font-bold">
              User Registry & Quota Engine
            </span>
          </div>
          <h2 className="text-2xl font-black font-outfit uppercase tracking-tight text-white mt-1">
            User Accounts & Subscription Governance
          </h2>
          <p className="text-xs text-slate-400 font-mono">
            Manage member tiers, inspect 20-scan free limits, reset quotas, and enforce account suspensions
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-slate-400">
            Total Users: <span className="text-white font-bold">{totalCount}</span>
          </span>
          <button
            onClick={fetchUsers}
            disabled={loading}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold uppercase tracking-wider text-slate-200 rounded-xl transition-all flex items-center gap-2 active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {notice && (
        <div
          className={`p-4 rounded-2xl border text-xs font-mono flex items-center gap-3 ${
            notice.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {notice.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          )}
          <span>{notice.text}</span>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
          <input
            type="text"
            placeholder="Search by name, email or UID..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
          />
        </div>

        <div className="flex gap-2 w-full md:w-auto">
          <select
            value={tierFilter}
            onChange={(e) => {
              setTierFilter(e.target.value);
              setPage(1);
            }}
            className="bg-slate-950 border border-slate-800 rounded-2xl px-3 py-2 text-xs text-slate-300 font-mono focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            <option value="">All Tiers</option>
            <option value="free">Free (₹0)</option>
            <option value="starter">Starter (₹366)</option>
            <option value="pro">Pro (₹732)</option>
            <option value="elite">Elite (₹998)</option>
          </select>

          <select
            value={bannedFilter}
            onChange={(e) => {
              setBannedFilter(e.target.value);
              setPage(1);
            }}
            className="bg-slate-950 border border-slate-800 rounded-2xl px-3 py-2 text-xs text-slate-300 font-mono focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            <option value="">All Statuses</option>
            <option value="false">Active Accounts</option>
            <option value="true">Suspended / Banned</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-mono uppercase text-[10px] tracking-wider bg-slate-950/40">
                <th className="py-3.5 px-4">User</th>
                <th className="py-3.5 px-4">Tier Plan</th>
                <th className="py-3.5 px-4">Monthly Scan Quota</th>
                <th className="py-3.5 px-4">Streak</th>
                <th className="py-3.5 px-4">Last Activity</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500 font-mono">
                    {loading ? 'Querying user registry...' : 'No users match the active filter criteria.'}
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const quotaPct = Math.min(
                    100,
                    Math.round(((u.scans_used || 0) / (u.scan_limit || 20)) * 100)
                  );
                  return (
                    <tr
                      key={u.id}
                      className={`hover:bg-slate-950/40 transition-colors ${
                        u.is_banned ? 'bg-rose-950/10' : ''
                      }`}
                    >
                      {/* User Info */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden shrink-0">
                            {u.picture ? (
                              <img src={u.picture} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="font-bold font-mono text-emerald-400">
                                {(u.name || u.email || 'U')[0].toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-white truncate max-w-[180px]">
                              {u.name || 'Anonymous User'}
                            </div>
                            <div className="font-mono text-[10px] text-slate-400 truncate max-w-[180px]">
                              {u.email}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Tier */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`font-mono text-[11px] font-bold px-2.5 py-1 rounded-full uppercase border ${
                            u.tier === 'elite'
                              ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                              : u.tier === 'pro'
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                              : u.tier === 'starter'
                              ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                              : 'bg-slate-800 border-slate-700 text-slate-400'
                          }`}
                        >
                          {u.tier || 'Free'}
                        </span>
                      </td>

                      {/* Quota Progress */}
                      <td className="py-3.5 px-4">
                        <div className="w-36">
                          <div className="flex justify-between font-mono text-[10px] text-slate-400 mb-1">
                            <span>{u.scans_used} used</span>
                            <span className="text-slate-300 font-bold">{u.scan_limit} limit</span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                            <div
                              style={{ width: `${quotaPct}%` }}
                              className={`h-full rounded-full transition-all ${
                                quotaPct >= 90
                                  ? 'bg-rose-500'
                                  : quotaPct >= 60
                                  ? 'bg-amber-400'
                                  : 'bg-emerald-400'
                              }`}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Streak */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 font-mono text-amber-400">
                          <Flame className="w-3.5 h-3.5 fill-amber-500/20" />
                          <span className="font-bold">{u.streak}</span>
                        </div>
                      </td>

                      {/* Last Activity */}
                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-400">
                        {u.last_login_date || 'N/A'}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {u.is_banned ? (
                          <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/10 border border-rose-500/30 text-rose-400 uppercase">
                            Banned
                          </span>
                        ) : (
                          <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 uppercase">
                            Active
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleResetQuota(u)}
                            disabled={actionLoadingId === u.id || !permissions.canManageUsers}
                            className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-emerald-400 transition-all cursor-pointer disabled:opacity-50"
                            title="Reset Scan Quota back to 0"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>

                          {u.tier !== 'free' && permissions.canManageAdmins && (
                            <button
                              onClick={() => {
                                setRefundModalTarget(u);
                                setRefundPaymentId('');
                                setRefundAmount('');
                                setRefundReason('');
                              }}
                              disabled={actionLoadingId === u.id}
                              className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 transition-all cursor-pointer disabled:opacity-50"
                              title="Process Refund"
                            >
                              <Banknote className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            onClick={() => {
                              setBanModalTarget(u);
                              setBanReason(u.ban_reason || '');
                            }}
                            disabled={actionLoadingId === u.id || !permissions.canManageUsers}
                            className={`p-1.5 rounded-lg border transition-all cursor-pointer disabled:opacity-50 ${
                              u.is_banned
                                ? 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
                                : 'bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/30 text-rose-400'
                            }`}
                            title={u.is_banned ? 'Unban User Account' : 'Suspend / Ban Account'}
                          >
                            {u.is_banned ? <UserCheck className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="p-4 bg-slate-950/60 border-t border-slate-800 flex items-center justify-between font-mono text-xs text-slate-400">
          <div>
            Page <span className="text-white font-bold">{page}</span> of{' '}
            <span className="text-white font-bold">{totalPages}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 disabled:opacity-40 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Ban / Suspension Modal */}
      {banModalTarget && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                  banModalTarget.is_banned
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                }`}
              >
                {banModalTarget.is_banned ? <UserCheck className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
              </div>
              <div>
                <h4 className="text-lg font-bold font-outfit uppercase tracking-tight text-white">
                  {banModalTarget.is_banned ? 'Lift Account Suspension' : 'Suspend User Account'}
                </h4>
                <p className="text-xs text-slate-400 font-mono">{banModalTarget.email}</p>
              </div>
            </div>

            {!banModalTarget.is_banned && (
              <div className="mb-4">
                <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-2">
                  Suspension Reason (Audit Record)
                </label>
                <textarea
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  placeholder="e.g., API abuse, repeated non-food OCR spam, or chargeback violation..."
                  rows={3}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3 text-xs text-slate-200 focus:outline-none focus:border-rose-500 font-mono"
                />
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setBanModalTarget(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-bold uppercase text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleToggleBan}
                disabled={actionLoadingId === banModalTarget.id}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide cursor-pointer ${
                  banModalTarget.is_banned
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black'
                    : 'bg-rose-500 hover:bg-rose-400 text-white'
                }`}
              >
                {banModalTarget.is_banned ? 'Confirm Re-Activation' : 'Confirm Suspension'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Refund Modal */}
      {refundModalTarget && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                <Banknote className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-lg font-bold font-outfit uppercase tracking-tight text-white">
                  Process Refund
                </h4>
                <p className="text-xs text-slate-400 font-mono">
                  {refundModalTarget.email} • Tier: {refundModalTarget.tier}
                </p>
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">
                  Razorpay Payment ID *
                </label>
                <input
                  type="text"
                  value={refundPaymentId}
                  onChange={(e) => setRefundPaymentId(e.target.value)}
                  placeholder="pay_..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">
                  Amount in Paise (Optional)
                </label>
                <input
                  type="number"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  placeholder="Leave empty for full refund"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">
                  Reason *
                </label>
                <select
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono cursor-pointer"
                >
                  <option value="">Select Reason</option>
                  <option value="duplicate_charge">Duplicate Charge</option>
                  <option value="customer_request">Customer Request</option>
                  <option value="disputed_transaction">Disputed Transaction</option>
                  <option value="unused_quota_cancellation">Unused Quota Cancellation</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setRefundModalTarget(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-bold uppercase text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleRefund}
                disabled={actionLoadingId === refundModalTarget.id || !refundPaymentId.trim() || !refundReason.trim()}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide cursor-pointer bg-emerald-500 hover:bg-emerald-400 text-slate-950 disabled:opacity-50"
              >
                Refund Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Quota Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(resetQuotaTarget)}
        title="Reset Monthly Scan Quota"
        message="Reset monthly scan usage to 0 for this user? This will be recorded in the admin audit ledger."
        confirmLabel="Reset Quota"
        cancelLabel="Cancel"
        variant="warning"
        isLoading={actionLoadingId === resetQuotaTarget?.id}
        onConfirm={handleConfirmResetQuota}
        onCancel={() => {
          if (actionLoadingId !== resetQuotaTarget?.id) {
            setResetQuotaTarget(null);
          }
        }}
      />
    </div>
  );
}
