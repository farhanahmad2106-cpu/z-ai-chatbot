import { Platform } from 'react-native';
import { useAuthStore } from '../stores/useAuthStore';
import { Backup } from '../types/chat';

const getBaseUrl = () => {
  if (__DEV__ && Platform.OS === 'android') {
    return 'http://10.0.2.2:8000';
  }
  return 'http://localhost:8000';
};

const request = async (path: string, options: RequestInit = {}) => {
  const token = useAuthStore.getState().token;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorDetail = 'Operation failed';
    try {
      const errRes = await response.json();
      errorDetail = errRes.detail || errorDetail;
    } catch (e) {}
    throw new Error(errorDetail);
  }

  if (response.status === 204) return;
  return response.json();
};

export const SyncService = {
  startDiscovery: async (): Promise<void> => {
    return request('/api/v1/sync/discovery/start', { method: 'POST' });
  },

  stopDiscovery: async (): Promise<void> => {
    return request('/api/v1/sync/discovery/stop', { method: 'POST' });
  },

  listPeers: async (): Promise<any[]> => {
    return request('/api/v1/sync/peers');
  },

  listBackups: async (): Promise<Backup[]> => {
    return request('/api/v1/backups');
  },

  createBackup: async (pin: string): Promise<Backup> => {
    return request('/api/v1/backups/create', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    });
  },

  verifyBackup: async (filename: string, pin: string): Promise<any> => {
    return request(`/api/v1/backups/${filename}/verify`, {
      method: 'POST',
      body: JSON.stringify({ pin }),
    });
  },

  restoreBackup: async (filename: string, pin: string): Promise<any> => {
    return request(`/api/v1/backups/${filename}/restore`, {
      method: 'POST',
      body: JSON.stringify({ pin }),
    });
  },
};
