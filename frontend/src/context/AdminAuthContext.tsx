import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { API_BASE } from '../config';

export interface AdminPermissions {
  canManageAdmins: boolean;
  canManageUsers: boolean;
  canApproveFoods: boolean;
  canTriggerOTA: boolean;
  canViewRevenue: boolean;
  canViewLogs: boolean;
}

export interface AdminUser {
  id: string;
  uid: string | null;
  email: string;
  name: string;
  is_super_admin: boolean;
  permissions: AdminPermissions;
  created_at: string;
  last_login: string | null;
  is_active: boolean;
}

interface AdminAuthContextType {
  isAdmin: boolean;
  isSuperAdmin: boolean;
  adminUser: AdminUser | null;
  permissions: AdminPermissions;
  loading: boolean;
  error: string | null;
  verifyAdmin: () => Promise<boolean>;
  refreshAdminStatus: () => Promise<void>;
  getAdminAuthHeader: () => Promise<Record<string, string>>;
}

const defaultPermissions: AdminPermissions = {
  canManageAdmins: false,
  canManageUsers: false,
  canApproveFoods: false,
  canTriggerOTA: false,
  canViewRevenue: false,
  canViewLogs: false,
};

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  }
  return context;
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const { currentUser, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [permissions, setPermissions] = useState<AdminPermissions>(defaultPermissions);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const getAdminAuthHeader = useCallback(async (): Promise<Record<string, string>> => {
    if (!currentUser) return {};
    const token = await currentUser.getIdToken();
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }, [currentUser]);

  const verifyAdmin = useCallback(async (): Promise<boolean> => {
    if (!currentUser) {
      setIsAdmin(false);
      setIsSuperAdmin(false);
      setAdminUser(null);
      setPermissions(defaultPermissions);
      setLoading(false);
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      const headers = await getAdminAuthHeader();
      const response = await fetch(`${API_BASE}/api/admin/auth/verify`, {
        method: 'POST',
        headers,
      });

      if (response.status === 403 || response.status === 401) {
        setIsAdmin(false);
        setIsSuperAdmin(false);
        setAdminUser(null);
        setPermissions(defaultPermissions);
        setError('Access denied: You do not have administrative clearance.');
        return false;
      }

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      const data: AdminUser = await response.json();
      setAdminUser(data);
      setIsAdmin(true);
      setIsSuperAdmin(Boolean(data.is_super_admin));
      setPermissions(data.permissions || defaultPermissions);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Admin verification failed';
      console.error('[AdminAuth] Verification check failed:', msg);
      setIsAdmin(false);
      setIsSuperAdmin(false);
      setAdminUser(null);
      setPermissions(defaultPermissions);
      setError(msg);
      return false;
    } finally {
      setLoading(false);
    }
  }, [currentUser, getAdminAuthHeader]);

  useEffect(() => {
    if (!authLoading) {
      verifyAdmin();
    }
  }, [currentUser, authLoading, verifyAdmin]);

  const value: AdminAuthContextType = {
    isAdmin,
    isSuperAdmin,
    adminUser,
    permissions,
    loading: authLoading || loading,
    error,
    verifyAdmin,
    refreshAdminStatus: async () => {
      await verifyAdmin();
    },
    getAdminAuthHeader,
  };

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
}
