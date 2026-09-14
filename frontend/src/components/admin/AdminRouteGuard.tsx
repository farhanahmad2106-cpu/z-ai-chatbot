import React from 'react';
import { ShieldAlert, Terminal, ArrowLeft, RefreshCw, LogIn } from 'lucide-react';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { useAuth } from '../../context/AuthContext';

interface AdminRouteGuardProps {
  children: React.ReactNode;
  onExit?: () => void;
}

export default function AdminRouteGuard({ children, onExit }: AdminRouteGuardProps) {
  const { currentUser, setShowLoginModal } = useAuth();
  const { isAdmin, loading, error, refreshAdminStatus } = useAdminAuth();

  // Loading / Authorization handshake state
  if (loading) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300">
        <div className="w-20 h-20 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center relative shadow-2xl mb-6">
          <Terminal className="w-8 h-8 text-emerald-400 animate-pulse" />
          <div className="absolute -inset-1 rounded-3xl border border-emerald-500/20 animate-ping pointer-events-none" />
        </div>
        <h2 className="text-xl font-bold font-outfit uppercase tracking-wider text-slate-200 mb-2">
          Verifying Security Clearance
        </h2>
        <p className="text-xs font-mono text-emerald-400/80 uppercase tracking-widest mb-4">
          RBAC // Handshake with MongoDB Atlas admins registry...
        </p>
        <div className="w-48 h-1 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
          <div className="h-full bg-emerald-500 rounded-full w-2/3 animate-[shimmer_2s_infinite]" />
        </div>
      </div>
    );
  }

  // Non-admin / 403 Access Denied State
  if (!currentUser || !isAdmin) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4 animate-in fade-in duration-300">
        <div className="max-w-xl w-full bg-slate-900 border-2 border-rose-500/30 rounded-4xl p-8 sm:p-10 shadow-2xl relative overflow-hidden backdrop-blur-xl">
          {/* Subtle background glow */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-rose-500/5 rounded-full blur-3xl pointer-events-none" />
          
          <div className="flex items-center gap-3 mb-6 border-b border-slate-800 pb-5">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="text-[11px] font-black uppercase tracking-widest text-rose-400">
                Security Protocol // Error 403
              </div>
              <h1 className="text-2xl font-black font-outfit uppercase tracking-tight text-white">
                Administrative Access Denied
              </h1>
            </div>
          </div>

          <p className="text-sm text-slate-300 leading-relaxed mb-6">
            The requested operations and telemetry console requires authenticated clearance in the master
            <span className="font-mono text-emerald-400 font-bold mx-1">MongoDB admins</span> collection.
            Standard user credentials and unauthorized sessions are blocked at this gateway.
          </p>

          {/* Caller Context Box */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 font-mono text-xs mb-8 space-y-2 text-slate-400">
            <div className="flex justify-between items-center">
              <span className="text-slate-500 uppercase tracking-wider">Caller Identity:</span>
              <span className="text-slate-200 font-bold">
                {currentUser?.email || 'Unauthenticated Guest'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 uppercase tracking-wider">Firebase UID:</span>
              <span className="text-slate-300 truncate max-w-[200px]">
                {currentUser?.uid || 'N/A'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 uppercase tracking-wider">Registry Match:</span>
              <span className="text-rose-400 font-bold">NON_PRIVILEGED_ROLE</span>
            </div>
            {error && (
              <div className="text-[11px] text-rose-400/90 pt-1 border-t border-slate-900">
                Notice: {error}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            {currentUser ? (
              <>
                <button
                  onClick={() => refreshAdminStatus()}
                  className="flex-1 px-5 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold uppercase tracking-wider text-white transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  Re-Verify Credentials
                </button>
                {onExit && (
                  <button
                    onClick={onExit}
                    className="flex-1 px-5 py-3 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-xs font-bold uppercase tracking-wider text-rose-300 transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Exit to App
                  </button>
                )}
              </>
            ) : (
              <button
                onClick={() => setShowLoginModal(true)}
                className="w-full px-5 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 active:scale-95 shadow-lg shadow-emerald-950 cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                Sign In with Admin Account
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
