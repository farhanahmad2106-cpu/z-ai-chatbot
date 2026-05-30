import { create } from 'zustand';
import { AIModel } from '../types/chat';
import { Platform } from 'react-native';
import { useAuthStore } from './useAuthStore';

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
    let errorDetail = 'Model operations failed';
    try {
      const errRes = await response.json();
      errorDetail = errRes.detail || errorDetail;
    } catch (e) {}
    throw new Error(errorDetail);
  }

  return response.json();
};

interface ModelStoreState {
  models: AIModel[];
  isLoading: boolean;
  error: string | null;

  fetchModels: () => Promise<void>;
  loadModel: (id: string) => Promise<void>;
  unloadModel: (id: string) => Promise<void>;
  setDefaultModel: (id: string) => Promise<void>;
}

export const useModelStore = create<ModelStoreState>((set, get) => ({
  models: [],
  isLoading: false,
  error: null,

  fetchModels: async () => {
    set({ isLoading: true, error: null });
    try {
      const list = await request('/api/v1/models');
      set({ models: list, isLoading: false });
    } catch (err: any) {
      set({ error: err.message || 'Failed to fetch models', isLoading: false });
    }
  },

  loadModel: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      await request(`/api/v1/models/${id}/load`, { method: 'POST' });
      set(state => {
        const nextModels = state.models.map(m => {
          if (m.id === id) {
            return { ...m, is_loaded: true };
          }
          return { ...m, is_loaded: false };
        });
        return { models: nextModels, isLoading: false };
      });
    } catch (err: any) {
      set({ error: err.message || 'Failed to load model', isLoading: false });
      throw err;
    }
  },

  unloadModel: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      await request(`/api/v1/models/${id}/unload`, { method: 'POST' });
      set(state => {
        const nextModels = state.models.map(m => {
          if (m.id === id) {
            return { ...m, is_loaded: false };
          }
          return m;
        });
        return { models: nextModels, isLoading: false };
      });
    } catch (err: any) {
      set({ error: err.message || 'Failed to unload model', isLoading: false });
      throw err;
    }
  },

  setDefaultModel: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      await request(`/api/v1/models/${id}/default`, { method: 'POST' });
      set(state => {
        const nextModels = state.models.map(m => {
          if (m.id === id) {
            return { ...m, is_default: true };
          }
          return { ...m, is_default: false };
        });
        return { models: nextModels, isLoading: false };
      });
    } catch (err: any) {
      set({ error: err.message || 'Failed to set default model', isLoading: false });
      throw err;
    }
  }
}));
