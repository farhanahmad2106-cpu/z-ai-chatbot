import { create } from 'zustand';
import { useOfflineSyncStore } from './useOfflineSyncStore';

export interface UserAuthData {
  uid: string;
  token: string;
  email?: string | null;
  displayName?: string | null;
}

interface AuthState {
  userId: string | null;
  token: string | null;
  email: string | null;
  displayName: string | null;
  setAuth: (user: UserAuthData | null) => void;
  setToken: (token: string | null, userId?: string | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  userId: null,
  token: null,
  email: null,
  displayName: null,

  setAuth: (user) => {
    set({
      userId: user?.uid ?? null,
      token: user?.token ?? null,
      email: user?.email ?? null,
      displayName: user?.displayName ?? null,
    });
    // Trigger user boundary synchronization
    useOfflineSyncStore.getState().handleAuthChanged(user?.uid ?? null);
  },

  setToken: (token, userId) => {
    set((state) => ({
      token,
      userId: userId !== undefined ? userId : state.userId,
    }));
    if (userId !== undefined) {
      useOfflineSyncStore.getState().handleAuthChanged(userId);
    }
  },

  logout: () => {
    set({
      userId: null,
      token: null,
      email: null,
      displayName: null,
    });
    useOfflineSyncStore.getState().handleAuthChanged(null);
  },
}));
