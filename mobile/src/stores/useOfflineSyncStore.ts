/**
 * Z-SeHealth Offline Sync Zustand Store
 *
 * Provides observable UI synchronization state, NetInfo connectivity monitoring,
 * AppState lifecycle integration, and manual retry/quarantine management.
 * SQLite remains the durable source of truth.
 */

import { create } from 'zustand';
import NetInfo, { NetInfoSubscription } from '@react-native-community/netinfo';
import { AppState, AppStateStatus, NativeEventSubscription } from 'react-native';
import {
  processQueue,
  getQueueStats,
  getQuarantinedMutations,
  retryMutation,
  retryAllQuarantined,
  removeMutation,
  recoverStaleProcessing,
  ProcessQueueResult,
} from '../services/offlineQueue';
import { OfflineMutationRow, getDatabase } from '../services/db';
import { useAuthStore } from './useAuthStore';

export interface OfflineSyncState {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  processingCount: number;
  failedCount: number;
  quarantinedCount: number;
  totalCount: number;
  lastSyncAt: number | null;
  lastSyncError: string | null;
  quarantinedItems: OfflineMutationRow[];

  // Actions
  initialize: () => Promise<void>;
  startNetworkMonitoring: () => () => void;
  stopNetworkMonitoring: () => void;
  syncNow: () => Promise<ProcessQueueResult>;
  retryFailed: () => Promise<void>;
  retryQuarantined: (id?: string) => Promise<void>;
  removeQuarantined: (id: string) => Promise<void>;
  refreshQueueStats: () => Promise<void>;
  handleAuthChanged: (userId: string | null) => Promise<void>;
}

let netInfoUnsubscribe: NetInfoSubscription | null = null;
let appStateSubscription: NativeEventSubscription | null = null;
let syncDebounceTimer: any = null;

export const useOfflineSyncStore = create<OfflineSyncState>((set, get) => ({
  isOnline: true,
  isSyncing: false,
  pendingCount: 0,
  processingCount: 0,
  failedCount: 0,
  quarantinedCount: 0,
  totalCount: 0,
  lastSyncAt: null,
  lastSyncError: null,
  quarantinedItems: [],

  initialize: async () => {
    try {
      // 1. Initialize SQLite database & migrations
      await getDatabase();

      // 2. Recover stale processing rows
      await recoverStaleProcessing();

      // 3. Refresh statistics
      await get().refreshQueueStats();
    } catch (err) {
      console.error('[useOfflineSyncStore] Initialization error:', err);
      set({ lastSyncError: err instanceof Error ? err.message : 'Database initialization failed' });
    }
  },

  startNetworkMonitoring: () => {
    get().stopNetworkMonitoring();

    // 1. NetInfo subscription
    netInfoUnsubscribe = NetInfo.addEventListener((state) => {
      const isOnline = Boolean(state.isConnected && (state.isInternetReachable ?? true));
      const wasOffline = !get().isOnline;
      set({ isOnline });

      // If transitioning to online, trigger debounced queue drain
      if (isOnline && wasOffline) {
        if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
        syncDebounceTimer = setTimeout(() => {
          get().syncNow();
        }, 1000);
      }
    });

    // 2. AppState lifecycle subscription (foreground resume)
    appStateSubscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active' && get().isOnline) {
        get().syncNow();
      }
    });

    return () => {
      get().stopNetworkMonitoring();
    };
  },

  stopNetworkMonitoring: () => {
    if (netInfoUnsubscribe) {
      netInfoUnsubscribe();
      netInfoUnsubscribe = null;
    }
    if (appStateSubscription) {
      appStateSubscription.remove();
      appStateSubscription = null;
    }
    if (syncDebounceTimer) {
      clearTimeout(syncDebounceTimer);
      syncDebounceTimer = null;
    }
  },

  syncNow: async () => {
    const userId = useAuthStore.getState().userId;
    if (!userId) {
      return { processed: 0, synced: 0, failed: 0, quarantined: 0, pausedForAuth: true };
    }

    set({ isSyncing: true, lastSyncError: null });

    try {
      const result = await processQueue(userId);
      set({
        lastSyncAt: Date.now(),
        lastSyncError: result.pausedForAuth ? 'Authentication required' : null,
      });
      await get().refreshQueueStats();
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Sync execution failed';
      set({ lastSyncError: errorMessage });
      await get().refreshQueueStats();
      return { processed: 0, synced: 0, failed: 1, quarantined: 0, pausedForAuth: false };
    } finally {
      set({ isSyncing: false });
    }
  },

  retryFailed: async () => {
    const userId = useAuthStore.getState().userId;
    if (!userId) return;
    await get().syncNow();
  },

  retryQuarantined: async (id?: string) => {
    const userId = useAuthStore.getState().userId;
    if (!userId) return;

    if (id) {
      await retryMutation(id);
    } else {
      await retryAllQuarantined(userId);
    }

    await get().refreshQueueStats();
    await get().syncNow();
  },

  removeQuarantined: async (id: string) => {
    await removeMutation(id);
    await get().refreshQueueStats();
  },

  refreshQueueStats: async () => {
    const userId = useAuthStore.getState().userId;
    if (!userId) {
      set({
        pendingCount: 0,
        processingCount: 0,
        failedCount: 0,
        quarantinedCount: 0,
        totalCount: 0,
        quarantinedItems: [],
      });
      return;
    }

    try {
      const stats = await getQueueStats(userId);
      const quarantined = await getQuarantinedMutations(userId);
      set({
        pendingCount: stats.pendingCount,
        processingCount: stats.processingCount,
        failedCount: stats.failedCount,
        quarantinedCount: stats.quarantinedCount,
        totalCount: stats.totalCount,
        quarantinedItems: quarantined,
      });
    } catch (err) {
      console.warn('[useOfflineSyncStore] refreshQueueStats failed:', err);
    }
  },

  handleAuthChanged: async (userId: string | null) => {
    if (!userId) {
      // User logged out: Reset in-memory telemetry, stop active replay
      set({
        pendingCount: 0,
        processingCount: 0,
        failedCount: 0,
        quarantinedCount: 0,
        totalCount: 0,
        quarantinedItems: [],
        lastSyncError: null,
      });
    } else {
      // New user active: Refresh stats and trigger drain
      await get().refreshQueueStats();
      if (get().isOnline) {
        await get().syncNow();
      }
    }
  },
}));
