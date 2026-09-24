import { useState, useEffect, useCallback } from 'react';
import {
  UserPlus,
  RefreshCw,
  Trash2,
  Lock,
  Crown,
  CheckCircle2,
  AlertTriangle,
  FileEdit,
} from 'lucide-react';
import { useAdminAuth, AdminUser, AdminPermissions } from '../../../context/AdminAuthContext';
import { API_BASE } from '../../../config';
import { ConfirmModal } from '../../ui/ConfirmModal';

export default function AdminTeamTab() {
  const { isSuperAdmin, getAdminAuthHeader } = useAdminAuth();
  const [team, setTeam] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [notice, setNotice] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Revoke Admin Modal State
  const [adminToRevoke, setAdminToRevoke] = useState<AdminUser | null>(null);

  // Invite Modal State
  const [inviteModalOpen, setInviteModalOpen] = useState<boolean>(false);
  const [inviteEmail, setInviteEmail] = useState<string>('');
  const [inviteName, setInviteName] = useState<string>('');
  const [invitePerms, setInvitePerms] = useState<AdminPermissions>({
    canManageAdmins: false,
    canManageUsers: true,
    canApproveFoods: true,
    canTriggerOTA: false,
    canViewRevenue: false,
    canViewLogs: true,
  });

  // Edit Permissions Modal State
  const [editingAdmin, setEditingAdmin] = useState<AdminUser | null>(null);
  const [editPerms, setEditPerms] = useState<AdminPermissions>({
    canManageAdmins: false,
    canManageUsers: true,
    canApproveFoods: true,
    canTriggerOTA: false,
    canViewRevenue: false,
    canViewLogs: true,
  });
  const [editActive, setEditActive] = useState<boolean>(true);

  const fetchTeam = useCallback(async () => {
    if (!isSuperAdmin) return;
    setLoading(true);
    setNotice(null);
    try {
      const headers = await getAdminAuthHeader();
      const res = await fetch(`${API_BASE}/api/admin/team`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: AdminUser[] = await res.json();
      setTeam(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch admin team';
      setNotice({ text: msg, type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [getAdminAuthHeader, isSuperAdmin]);

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  // Guard for non-super admins
  if (!isSuperAdmin) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center max-w-xl mx-auto space-y-4">
        <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto text-amber-400">
          <Lock className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold font-outfit uppercase tracking-tight text-white">
          Super Admin Governance Restricted
        </h3>
        <p className="text-xs text-slate-400 font-mono leading-relaxed">
          The Admin Team Management module is strictly reserved for the Master Super Administrator
          (Farhan Ahmad). Subordinate moderators do not possess governance authorization to invite,
          reconfigure, or revoke administrative roles.
        </p>
      </div>
    );
  }

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !inviteName.trim()) {
      setNotice({ text: 'Please fill out all required fields.', type: 'error' });
      return;
    }

    setActionLoading(true);
    setNotice(null);
    try {
      const headers = await getAdminAuthHeader();
      const res = await fetch(`${API_BASE}/api/admin/team/invite`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          email: inviteEmail.trim(),
          name: inviteName.trim(),
          permissions: invitePerms,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || `Invite failed: HTTP ${res.status}`);
      }

      const newAdmin: AdminUser = await res.json();
      setTeam((prev) => [newAdmin, ...prev]);
      setNotice({ text: `Administrator invite sent for ${newAdmin.email}`, type: 'success' });
      setInviteModalOpen(false);
      setInviteEmail('');
      setInviteName('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invite failed';
      setNotice({ text: msg, type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleEditSave = async () => {
    if (!editingAdmin) return;
    setActionLoading(true);
    setNotice(null);
    try {
      const headers = await getAdminAuthHeader();
      const res = await fetch(`${API_BASE}/api/admin/team/${editingAdmin.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          permissions: editPerms,
          is_active: editActive,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || `Update failed: HTTP ${res.status}`);
      }

      const updated: AdminUser = await res.json();
      setTeam((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      setNotice({ text: `Updated permissions for ${updated.email}`, type: 'success' });
      setEditingAdmin(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Update failed';
      setNotice({ text: msg, type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteAdmin = (admin: AdminUser) => {
    if (admin.is_super_admin) return;
    setAdminToRevoke(admin);
  };

  const handleConfirmDeleteAdmin = async () => {
    if (!adminToRevoke || adminToRevoke.is_super_admin) return;
    const admin = adminToRevoke;
    setActionLoading(true);
    setNotice(null);
    try {
      const headers = await getAdminAuthHeader();
      const res = await fetch(`${API_BASE}/api/admin/team/${admin.id}`, {
        method: 'DELETE',
        headers,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || `Deletion failed: HTTP ${res.status}`);
      }

      setTeam((prev) => prev.filter((a) => a.id !== admin.id));
      setNotice({ text: `Administrator ${admin.email} deleted successfully.`, type: 'success' });
      setAdminToRevoke(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Deletion failed';
      setNotice({ text: msg, type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Crown className="w-4 h-4 text-amber-400" />
            <span className="text-[11px] font-mono uppercase tracking-widest text-amber-400 font-bold">
              Master Governance // Super Admin Exclusive
            </span>
          </div>
          <h2 className="text-2xl font-black font-outfit uppercase tracking-tight text-white mt-1">
            Admin Team & RBAC Permissions
          </h2>
          <p className="text-xs text-slate-400 font-mono">
            Provision moderators, configure granular capability flags, inspect last logins, and audit access
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchTeam}
            disabled={loading}
            className="p-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded-xl transition-all cursor-pointer active:scale-95"
            title="Refresh Team List"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
          <button
            onClick={() => setInviteModalOpen(true)}
            className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 active:scale-95 shadow-lg shadow-emerald-950 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            Invite Admin / Mod
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

      {/* Admin Personnel Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {team.map((member) => (
          <div
            key={member.id}
            className={`bg-slate-900 border rounded-3xl p-6 relative overflow-hidden transition-all ${
              member.is_super_admin
                ? 'border-amber-500/40 shadow-xl shadow-amber-950/20'
                : member.is_active
                ? 'border-slate-800 hover:border-slate-700'
                : 'border-rose-500/30 opacity-70'
            }`}
          >
            {/* Header Badge */}
            <div className="flex justify-between items-start mb-4">
              <div className="w-12 h-12 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center font-mono font-bold text-lg text-emerald-400">
                {(member.name || member.email)[0].toUpperCase()}
              </div>
              <div className="flex items-center gap-2">
                {member.is_super_admin ? (
                  <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 uppercase flex items-center gap-1">
                    <Crown className="w-3 h-3" /> Super Admin
                  </span>
                ) : member.is_active ? (
                  <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 uppercase">
                    Moderator
                  </span>
                ) : (
                  <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 uppercase">
                    Deactivated
                  </span>
                )}
              </div>
            </div>

            {/* Info */}
            <div className="mb-5">
              <h4 className="text-base font-bold text-white font-outfit truncate">{member.name}</h4>
              <div className="font-mono text-xs text-slate-400 truncate mt-0.5">{member.email}</div>
              <div className="font-mono text-[10px] text-slate-500 mt-2">
                Last Login: {member.last_login ? new Date(member.last_login).toLocaleDateString() : 'Never'}
              </div>
            </div>

            {/* Capability Chips */}
            <div className="border-t border-slate-800/80 pt-4 mb-5">
              <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-2.5">
                Authorized Capabilities
              </div>
              <div className="flex flex-wrap gap-1.5">
                {member.is_super_admin ? (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-bold">
                    UNRESTRICTED MASTER CLEARANCE
                  </span>
                ) : (
                  <>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                        member.permissions.canManageUsers
                          ? 'bg-slate-950 border-slate-800 text-slate-300'
                          : 'bg-slate-950 border-slate-900 text-slate-600 line-through'
                      }`}
                    >
                      Users
                    </span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                        member.permissions.canApproveFoods
                          ? 'bg-slate-950 border-slate-800 text-slate-300'
                          : 'bg-slate-950 border-slate-900 text-slate-600 line-through'
                      }`}
                    >
                      Food Approval
                    </span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                        member.permissions.canTriggerOTA
                          ? 'bg-slate-950 border-slate-800 text-slate-300'
                          : 'bg-slate-950 border-slate-900 text-slate-600 line-through'
                      }`}
                    >
                      EAS OTA
                    </span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                        member.permissions.canViewRevenue
                          ? 'bg-slate-950 border-slate-800 text-slate-300'
                          : 'bg-slate-950 border-slate-900 text-slate-600 line-through'
                      }`}
                    >
                      Revenue
                    </span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                        member.permissions.canViewLogs
                          ? 'bg-slate-950 border-slate-800 text-slate-300'
                          : 'bg-slate-950 border-slate-900 text-slate-600 line-through'
                      }`}
                    >
                      Logs
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            {!member.is_super_admin && (
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setEditingAdmin(member);
                    setEditPerms(member.permissions);
                    setEditActive(member.is_active);
                  }}
                  className="flex-1 py-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-300 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <FileEdit className="w-3.5 h-3.5 text-emerald-400" />
                  Permissions
                </button>
                <button
                  onClick={() => handleDeleteAdmin(member)}
                  className="p-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-xl text-rose-400 transition-all cursor-pointer"
                  title="Revoke Admin Account"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Invite Admin Modal */}
      {inviteModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 max-w-lg w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <UserPlus className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-lg font-bold font-outfit uppercase tracking-tight text-white">
                  Invite Administrator or Moderator
                </h4>
                <p className="text-xs text-slate-400">
                  Provision new team clearance linked to their Google or Firebase login
                </p>
              </div>
            </div>

            <form onSubmit={handleInviteSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">
                  Admin Full Name
                </label>
                <input
                  type="text"
                  placeholder="e.g., Surya Das"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">
                  Email Address
                </label>
                <input
                  type="email"
                  placeholder="admin@zsehealth.internal"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
                  required
                />
              </div>

              {/* Checkboxes */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2.5">
                <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-2">
                  Granular Permissions
                </div>

                <label className="flex items-center gap-3 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={invitePerms.canManageUsers}
                    onChange={(e) => setInvitePerms({ ...invitePerms, canManageUsers: e.target.checked })}
                    className="accent-emerald-500 w-4 h-4 rounded"
                  />
                  <span>Can Manage Users (Inspect profiles, reset quotas, toggle bans)</span>
                </label>

                <label className="flex items-center gap-3 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={invitePerms.canApproveFoods}
                    onChange={(e) => setInvitePerms({ ...invitePerms, canApproveFoods: e.target.checked })}
                    className="accent-emerald-500 w-4 h-4 rounded"
                  />
                  <span>Can Moderate Food (Approve/reject crowdsourced scans)</span>
                </label>

                <label className="flex items-center gap-3 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={invitePerms.canTriggerOTA}
                    onChange={(e) => setInvitePerms({ ...invitePerms, canTriggerOTA: e.target.checked })}
                    className="accent-emerald-500 w-4 h-4 rounded"
                  />
                  <span>Can Trigger EAS OTA Updates (GitHub Actions hotfixes)</span>
                </label>

                <label className="flex items-center gap-3 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={invitePerms.canViewRevenue}
                    onChange={(e) => setInvitePerms({ ...invitePerms, canViewRevenue: e.target.checked })}
                    className="accent-emerald-500 w-4 h-4 rounded"
                  />
                  <span>Can Inspect Revenue (Razorpay ledgers & MRR statistics)</span>
                </label>

                <label className="flex items-center gap-3 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={invitePerms.canViewLogs}
                    onChange={(e) => setInvitePerms({ ...invitePerms, canViewLogs: e.target.checked })}
                    className="accent-emerald-500 w-4 h-4 rounded"
                  />
                  <span>Can View System Telemetry & Logs</span>
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setInviteModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-bold uppercase text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black uppercase tracking-wider disabled:opacity-50 cursor-pointer"
                >
                  {actionLoading ? 'Inviting...' : 'Send Invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Permissions Modal */}
      {editingAdmin && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 max-w-lg w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <FileEdit className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-lg font-bold font-outfit uppercase tracking-tight text-white">
                  Edit Admin Capabilities
                </h4>
                <p className="text-xs text-slate-400 font-mono">{editingAdmin.email}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <span className="text-xs font-bold uppercase text-slate-300">Account Active State</span>
                  <input
                    type="checkbox"
                    checked={editActive}
                    onChange={(e) => setEditActive(e.target.checked)}
                    className="accent-emerald-500 w-4 h-4 rounded cursor-pointer"
                  />
                </div>

                <label className="flex items-center gap-3 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editPerms.canManageUsers}
                    onChange={(e) => setEditPerms({ ...editPerms, canManageUsers: e.target.checked })}
                    className="accent-emerald-500 w-4 h-4 rounded"
                  />
                  <span>Can Manage Users</span>
                </label>

                <label className="flex items-center gap-3 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editPerms.canApproveFoods}
                    onChange={(e) => setEditPerms({ ...editPerms, canApproveFoods: e.target.checked })}
                    className="accent-emerald-500 w-4 h-4 rounded"
                  />
                  <span>Can Moderate Foods</span>
                </label>

                <label className="flex items-center gap-3 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editPerms.canTriggerOTA}
                    onChange={(e) => setEditPerms({ ...editPerms, canTriggerOTA: e.target.checked })}
                    className="accent-emerald-500 w-4 h-4 rounded"
                  />
                  <span>Can Trigger EAS OTA Updates</span>
                </label>

                <label className="flex items-center gap-3 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editPerms.canViewRevenue}
                    onChange={(e) => setEditPerms({ ...editPerms, canViewRevenue: e.target.checked })}
                    className="accent-emerald-500 w-4 h-4 rounded"
                  />
                  <span>Can View Revenue Stats</span>
                </label>

                <label className="flex items-center gap-3 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editPerms.canViewLogs}
                    onChange={(e) => setEditPerms({ ...editPerms, canViewLogs: e.target.checked })}
                    className="accent-emerald-500 w-4 h-4 rounded"
                  />
                  <span>Can View System Logs</span>
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingAdmin(null)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-bold uppercase text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleEditSave}
                  disabled={actionLoading}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black uppercase tracking-wider disabled:opacity-50 cursor-pointer"
                >
                  {actionLoading ? 'Saving...' : 'Save Permissions'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Revoke Admin Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(adminToRevoke)}
        title="Revoke Administrator"
        message={`Permanently revoke and delete administrative privileges for ${adminToRevoke?.email}? This action is immediate and cannot be undone.`}
        confirmLabel="Revoke Admin"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={actionLoading}
        onConfirm={handleConfirmDeleteAdmin}
        onCancel={() => {
          if (!actionLoading) setAdminToRevoke(null);
        }}
      />
    </div>
  );
}
