'use client';

import React, { useState, useEffect } from 'react';

interface SystemSummary {
  total_conversations: number;
  total_messages: number;
  active_flags: number;
  system_status: string;
}

interface FeatureFlag {
  id: string;
  flag_key: string;
  flag_value: string;
  is_enabled: boolean;
  description: string | null;
  pushed_by: string;
  created_at: string;
  updated_at: string;
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}

const BACKEND_URL = 'http://127.0.0.1:8765';

export default function AdminDashboardPage() {
  const [apiKey, setApiKey] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [authError, setAuthError] = useState('');
  
  // Dashboard states
  const [summary, setSummary] = useState<SystemSummary | null>(null);
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  
  // New Flag Modal
  const [newFlagKey, setNewFlagKey] = useState('');
  const [newFlagVal, setNewFlagVal] = useState('true');
  const [newFlagDesc, setNewFlagDesc] = useState('');
  
  const [isLoading, setIsLoading] = useState(false);

  // Check saved session
  useEffect(() => {
    const saved = localStorage.getItem('zai_admin_key');
    if (saved) {
      setApiKey(saved);
      verifyKey(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verifyKey = async (key: string) => {
    setIsLoading(true);
    setAuthError('');
    try {
      const response = await fetch(`${BACKEND_URL}/api/v1/admin/summary`, {
        headers: { 'X-Admin-Key': key }
      });
      if (response.ok) {
        localStorage.setItem('zai_admin_key', key);
        setIsAuthorized(true);
        loadDashboardData(key);
      } else {
        setAuthError('Access Denied: Invalid Admin API Key.');
        localStorage.removeItem('zai_admin_key');
      }
    } catch {
      setAuthError('Connection Failed: Make sure backend is running locally.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) return;
    verifyKey(apiKey.trim());
  };

  const loadDashboardData = async (key: string) => {
    try {
      // 1. Fetch summary
      const sumRes = await fetch(`${BACKEND_URL}/api/v1/admin/summary`, {
        headers: { 'X-Admin-Key': key }
      });
      if (sumRes.ok) setSummary(await sumRes.json());

      // 2. Fetch flags
      const flagRes = await fetch(`${BACKEND_URL}/api/v1/admin/feature-flags`, {
        headers: { 'X-Admin-Key': key }
      });
      if (flagRes.ok) setFlags(await flagRes.json());

      // 3. Fetch logs
      const logRes = await fetch(`${BACKEND_URL}/api/v1/admin/diagnostics/logs`, {
        headers: { 'X-Admin-Key': key }
      });
      if (logRes.ok) setLogs(await logRes.json());

    } catch (e) {
      console.error('Error fetching admin data', e);
    }
  };

  const handleToggleFlag = async (flagKey: string) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/admin/feature-flags/${flagKey}/toggle`, {
        method: 'POST',
        headers: { 'X-Admin-Key': apiKey }
      });
      if (res.ok) {
        await loadDashboardData(apiKey);
      }
    } catch {
      alert('Failed to toggle flag');
    }
  };

  const handleCreateFlag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFlagKey.trim()) return;

    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/admin/feature-flags`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': apiKey
        },
        body: JSON.stringify({
          flag_key: newFlagKey.trim(),
          flag_value: newFlagVal.trim(),
          is_enabled: true,
          description: newFlagDesc.trim() || undefined
        })
      });

      if (res.ok) {
        setNewFlagKey('');
        setNewFlagDesc('');
        await loadDashboardData(apiKey);
      }
    } catch {
      alert('Failed to create flag');
    }
  };

  const handleLogOut = () => {
    localStorage.removeItem('zai_admin_key');
    setIsAuthorized(false);
    setApiKey('');
  };

  if (!isAuthorized) {
    return (
      <div style={styles.loginOverlay}>
        <div style={styles.loginCard}>
          <div style={styles.loginHeader}>
            <h1 style={styles.loginTitle}>Z-AI ADMIN PORTAL</h1>
            <p style={styles.loginDesc}>Input secure admin key to decrypt dashboard metrics</p>
          </div>
          
          <form onSubmit={handleLogin} style={styles.form}>
            <input
              type="password"
              placeholder="Enter Admin API Key..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              style={styles.loginInput}
              required
            />
            {authError && <p style={styles.errorText}>{authError}</p>}
            <button type="submit" style={styles.loginBtn} disabled={isLoading}>
              {isLoading ? 'DECRYPTING...' : 'ACCESS DASHBOARD'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.appContainer}>
      {/* Sidebar Header */}
      <header style={styles.navbar}>
        <div style={styles.brandRow}>
          <h1 style={styles.logo}>Z-AI ADMIN DASHBOARD</h1>
          <span style={styles.pill}>Local-First v1.0</span>
        </div>
        <button onClick={handleLogOut} style={styles.logoutBtn}>
          SECURE LOG OUT
        </button>
      </header>

      {/* Main Grid */}
      <main style={styles.main}>
        {/* Core telemetry cards */}
        <section style={styles.summaryGrid}>
          <div style={styles.sumCard}>
            <span style={styles.sumLabel}>SYSTEM METRIC STATUS</span>
            <h3 style={{ ...styles.sumVal, color: '#10b981' }}>{summary?.system_status || 'ONLINE'}</h3>
          </div>
          <div style={styles.sumCard}>
            <span style={styles.sumLabel}>SECURE THREAD CONVERSATIONS</span>
            <h3 style={styles.sumVal}>{summary?.total_conversations ?? 0}</h3>
          </div>
          <div style={styles.sumCard}>
            <span style={styles.sumLabel}>ENCRYPTED MESSAGE TURNS</span>
            <h3 style={styles.sumVal}>{summary?.total_messages ?? 0}</h3>
          </div>
          <div style={styles.sumCard}>
            <span style={styles.sumLabel}>ACTIVE RUNTIME FLAGS</span>
            <h3 style={styles.sumVal}>{summary?.active_flags ?? 0}</h3>
          </div>
        </section>

        <div style={styles.splitRow}>
          {/* Left panel: Feature Flags control */}
          <div style={styles.panel}>
            <h2 style={styles.panelTitle}>REMOTE CONFIG FEATURE FLAGS</h2>
            
            <div style={styles.flagList}>
              {flags.length === 0 ? (
                <p style={styles.emptyText}>No feature flags configured on system.</p>
              ) : (
                flags.map((flag) => (
                  <div key={flag.id} style={styles.flagRow}>
                    <div style={styles.flagInfo}>
                      <div style={styles.flagKeyRow}>
                        <strong style={styles.flagKey}>{flag.flag_key}</strong>
                        <span style={{
                          ...styles.flagBadge,
                          backgroundColor: flag.is_enabled ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                          borderColor: flag.is_enabled ? '#10b981' : '#ef4444',
                          color: flag.is_enabled ? '#10b981' : '#ef4444'
                        }}>
                          {flag.is_enabled ? 'ENABLED' : 'DISABLED'}
                        </span>
                      </div>
                      <p style={styles.flagDesc}>{flag.description || 'No description provided.'}</p>
                    </div>

                    <button
                      onClick={() => handleToggleFlag(flag.flag_key)}
                      style={{
                        ...styles.toggleBtn,
                        backgroundColor: flag.is_enabled ? '#ef4444' : '#10b981'
                      }}
                    >
                      {flag.is_enabled ? 'DISABLE' : 'ENABLE'}
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Create new flag form */}
            <form onSubmit={handleCreateFlag} style={styles.newFlagForm}>
              <h3 style={styles.formHeader}>PUSH NEW CONFIG FLAG</h3>
              <div style={styles.formGrid}>
                <input
                  type="text"
                  placeholder="Flag Key (e.g. search_web)"
                  value={newFlagKey}
                  onChange={(e) => setNewFlagKey(e.target.value)}
                  style={styles.flagInput}
                  required
                />
                <input
                  type="text"
                  placeholder="Flag Value (e.g. true)"
                  value={newFlagVal}
                  onChange={(e) => setNewFlagVal(e.target.value)}
                  style={styles.flagInput}
                  required
                />
              </div>
              <input
                type="text"
                placeholder="Description of the config toggle..."
                value={newFlagDesc}
                onChange={(e) => setNewFlagDesc(e.target.value)}
                style={{ ...styles.flagInput, marginTop: '8px', width: '100%' }}
              />
              <button type="submit" style={styles.submitFlagBtn}>
                DEPLOY FEATURE FLAG
              </button>
            </form>
          </div>

          {/* Right panel: System Telemetry warnings */}
          <div style={styles.panel}>
            <h2 style={styles.panelTitle}>DIAGNOSTIC SYSTEM WARNINGS LOGS</h2>
            <div style={styles.logsList}>
              {logs.map((log, idx) => (
                <div key={idx} style={styles.logRow}>
                  <div style={styles.logMeta}>
                    <span style={styles.logTime}>{new Date(log.timestamp).toLocaleTimeString()}</span>
                    <span style={{
                      ...styles.logLevel,
                      color: log.level === 'WARNING' ? '#f59e0b' : '#3b82f6'
                    }}>[{log.level}]</span>
                  </div>
                  <p style={styles.logMsg}>{log.message}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}

// Brutalist premium inline CSS variables
const styles = {
  loginOverlay: {
    height: '100vh',
    width: '100vw',
    backgroundColor: '#030303',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
  },
  loginCard: {
    width: '100%',
    maxWidth: '460px',
    backgroundColor: '#0a0a0c',
    border: '1.5px solid #1f2025',
    padding: '32px',
  },
  loginHeader: {
    marginBottom: '28px',
    textAlign: 'center' as const,
  },
  loginTitle: {
    fontSize: '20px',
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: '1px',
  },
  loginDesc: {
    fontSize: '12.5px',
    color: '#9ca3af',
    marginTop: '6px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
  },
  loginInput: {
    height: '42px',
    backgroundColor: '#030303',
    border: '1.5px solid #1f2025',
    borderRadius: '0px',
    paddingHorizontal: '12px',
    padding: '0 12px',
    color: '#ffffff',
    fontSize: '13.5px',
    outline: 'none',
  },
  errorText: {
    fontSize: '12px',
    color: '#ef4444',
    fontWeight: '600',
  },
  loginBtn: {
    height: '42px',
    backgroundColor: '#4f46e5',
    color: '#ffffff',
    fontWeight: '700',
    fontSize: '12.5px',
    letterSpacing: '0.5px',
    border: 'none',
    cursor: 'pointer',
  },
  appContainer: {
    minHeight: '100vh',
    backgroundColor: '#030303',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  navbar: {
    height: '60px',
    backgroundColor: '#0a0a0c',
    borderBottom: '1.5px solid #1f2025',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
  },
  brandRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  logo: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#ffffff',
    letterSpacing: '0.5px',
  },
  pill: {
    fontSize: '9.5px',
    fontWeight: 'bold',
    backgroundColor: 'rgba(79,70,229,0.1)',
    border: '1px solid #4f46e5',
    color: '#4f46e5',
    padding: '3px 8px',
  },
  logoutBtn: {
    backgroundColor: 'transparent',
    border: '1.5px solid #ef4444',
    color: '#ef4444',
    fontWeight: '700',
    fontSize: '10.5px',
    padding: '6px 12px',
    cursor: 'pointer',
  },
  main: {
    flex: 1,
    padding: '24px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '24px',
    maxWidth: '1440px',
    width: '100%',
    margin: '0 auto',
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '16px',
  },
  sumCard: {
    backgroundColor: '#0a0a0c',
    border: '1.5px solid #1f2025',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  sumLabel: {
    fontSize: '10px',
    fontWeight: 'bold',
    color: '#9ca3af',
    letterSpacing: '0.5px',
  },
  sumVal: {
    fontSize: '28px',
    fontWeight: '800',
    color: '#ffffff',
  },
  splitRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '24px',
  },
  panel: {
    backgroundColor: '#0a0a0c',
    border: '1.5px solid #1f2025',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  panelTitle: {
    fontSize: '12.5px',
    fontWeight: '800',
    color: '#9ca3af',
    marginBottom: '20px',
    letterSpacing: '0.5px',
  },
  flagList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
    flex: 1,
    minHeight: '260px',
    overflowY: 'auto' as const,
  },
  emptyText: {
    fontSize: '13px',
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  flagRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px',
    backgroundColor: '#030303',
    border: '1px solid #1f2025',
  },
  flagInfo: {
    flex: 1,
    paddingRight: '16px',
  },
  flagKeyRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  flagKey: {
    fontSize: '14px',
    color: '#ffffff',
  },
  flagBadge: {
    fontSize: '8.5px',
    fontWeight: 'bold',
    border: '1px solid',
    padding: '2px 6px',
  },
  flagDesc: {
    fontSize: '12px',
    color: '#9ca3af',
    marginTop: '4px',
    lineHeight: '16px',
  },
  toggleBtn: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: '10px',
    padding: '6px 12px',
    border: 'none',
    cursor: 'pointer',
    width: '80px',
    textAlign: 'center' as const,
  },
  newFlagForm: {
    marginTop: '24px',
    borderTop: '1px solid #1f2025',
    paddingTop: '20px',
  },
  formHeader: {
    fontSize: '11px',
    fontWeight: 'bold',
    color: '#9ca3af',
    marginBottom: '12px',
    letterSpacing: '0.5px',
  },
  formGrid: {
    display: 'flex',
    gap: '8px',
  },
  flagInput: {
    flex: 1,
    height: 36,
    backgroundColor: '#030303',
    border: '1px solid #1f2025',
    padding: '0 10px',
    color: '#ffffff',
    fontSize: '13px',
    outline: 'none',
  },
  submitFlagBtn: {
    marginTop: '12px',
    height: '36px',
    width: '100%',
    backgroundColor: '#4f46e5',
    color: '#ffffff',
    fontWeight: '700',
    fontSize: '11.5px',
    letterSpacing: '0.5px',
    border: 'none',
    cursor: 'pointer',
  },
  logsList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
    maxHeight: '440px',
    overflowY: 'auto' as const,
  },
  logRow: {
    padding: '12px',
    backgroundColor: '#030303',
    border: '1px solid #1f2025',
    fontFamily: 'JetBrains Mono, monospace',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  logMeta: {
    display: 'flex',
    gap: '8px',
    fontSize: '11px',
  },
  logTime: {
    color: '#9ca3af',
  },
  logLevel: {
    fontWeight: 'bold',
  },
  logMsg: {
    fontSize: '12px',
    color: '#ffffff',
    lineHeight: '17px',
  }
};
