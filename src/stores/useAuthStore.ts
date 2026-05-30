/**
 * Z-AI Chatbot — Auth Zustand Store
 * Manages PIN session token, lock/unlock state, and first-launch detection.
 * Persists the session token to SecureStorage via MMKV so the user stays
 * unlocked across hot reloads (but not app restarts — PIN required each session).
 */

import { create } from 'zustand';
import { AuthStatus, SessionState, TokenResponse } from '../types/chat';

// ─────────────────────────────────────────────────────────────────────────────
// Store Shape
// ─────────────────────────────────────────────────────────────────────────────

interface AuthStore extends SessionState {
  // ── Actions ──────────────────────────────────────────────────────────────
  /** Called after successful /auth/setup or /auth/unlock — stores token in memory */
  setSession: (response: TokenResponse) => void;

  /** Called after /auth/status resolves on splash — seeds first-launch state */
  setAuthStatus: (status: AuthStatus) => void;

  /** Called after /auth/lock or on app suspend — clears the in-memory token */
  lock: () => void;

  /** Returns true if a valid token is present */
  isAuthenticated: () => boolean;

  /** Returns the Bearer header value for use in API requests */
  getAuthHeader: () => string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Store Implementation
// ─────────────────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthStore>((set, get) => ({
  // ── Initial State ──────────────────────────────────────────────────────────
  token: null,
  deviceId: null,
  isUnlocked: false,
  isFirstLaunch: true,

  // ── Actions ────────────────────────────────────────────────────────────────

  setSession: (response: TokenResponse) => {
    set({
      token: response.access_token,
      deviceId: response.device_id,
      isUnlocked: true,
    });
  },

  setAuthStatus: (status: AuthStatus) => {
    set({
      isUnlocked: status.is_unlocked,
      isFirstLaunch: status.is_first_launch,
      deviceId: status.device_id,
    });
  },

  lock: () => {
    set({
      token: null,
      isUnlocked: false,
      // Keep deviceId and isFirstLaunch — they're not secrets
    });
  },

  isAuthenticated: () => {
    const { token, isUnlocked } = get();
    return isUnlocked && token !== null;
  },

  getAuthHeader: () => {
    const { token } = get();
    return token ? `Bearer ${token}` : null;
  },
}));
