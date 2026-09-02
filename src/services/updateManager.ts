import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import * as Updates from 'expo-updates';
import { useTelemetryStore } from '../store/telemetryStore';

export interface UpdateManifestInfo {
  id?: string;
  createdAt?: string;
  runtimeVersion?: string;
  channel?: string;
}

export interface UpdateManagerState {
  isChecking: boolean;
  isDownloading: boolean;
  isDownloaded: boolean;
  isUpdateAvailable: boolean;
  updateError: string | null;
  manifestInfo: UpdateManifestInfo | null;
  lastCheckedAt: number | null;
}

export interface UpdateManagerActions {
  checkForUpdates: () => Promise<boolean>;
  applyUpdate: () => Promise<void>;
  dismissUpdate: () => void;
}

export type UseUpdateManagerReturn = UpdateManagerState & UpdateManagerActions;

/**
 * Production OTA Update Lifecycle Engine
 * Handles background bundle acquisition, development bypass, telemetry logging,
 * and graceful reloads without interrupting active sessions.
 */
export function useUpdateManager(): UseUpdateManagerReturn {
  const [state, setState] = useState<UpdateManagerState>({
    isChecking: false,
    isDownloading: false,
    isDownloaded: false,
    isUpdateAvailable: false,
    updateError: null,
    manifestInfo: null,
    lastCheckedAt: null,
  });

  const isOperationInProgress = useRef(false);
  const logOtaError = useTelemetryStore((s) => s.logOtaError);

  /**
   * Primary check & fetch pipeline
   */
  const checkForUpdates = useCallback(async (): Promise<boolean> => {
    // 1. Bypass OTA in local development or unsupported environments
    if (__DEV__ || !Updates.isEnabled) {
      if (__DEV__) {
        // Safe debug notice in dev environment
        console.log('[UpdateManager] Bypassing OTA update check: Running in __DEV__ mode.');
      }
      return false;
    }

    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
      return false;
    }

    if (isOperationInProgress.current) {
      return false;
    }

    isOperationInProgress.current = true;
    setState((prev) => ({ ...prev, isChecking: true, updateError: null }));

    try {
      const checkResult = await Updates.checkForUpdateAsync();

      setState((prev) => ({
        ...prev,
        isChecking: false,
        lastCheckedAt: Date.now(),
        isUpdateAvailable: checkResult.isAvailable,
      }));

      if (checkResult.isAvailable) {
        setState((prev) => ({ ...prev, isDownloading: true }));

        // Fetch bundle in the background
        const fetchResult = await Updates.fetchUpdateAsync();

        if (fetchResult.isNew) {
          const manifest = fetchResult.manifest as Record<string, unknown> | undefined;
          setState((prev) => ({
            ...prev,
            isDownloading: false,
            isDownloaded: true,
            manifestInfo: {
              id: (manifest?.id as string) || (manifest?.updateId as string) || 'latest-bundle',
              createdAt: (manifest?.createdAt as string) || new Date().toISOString(),
              runtimeVersion: (manifest?.runtimeVersion as string) || Updates.runtimeVersion || '1.0.0',
              channel: Updates.channel || 'production',
            },
          }));
          return true;
        } else {
          setState((prev) => ({ ...prev, isDownloading: false }));
          return false;
        }
      }

      return false;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown OTA check error';
      // Record in local telemetry store without crashing active UI
      logOtaError(error);

      setState((prev) => ({
        ...prev,
        isChecking: false,
        isDownloading: false,
        updateError: errorMessage,
      }));
      return false;
    } finally {
      isOperationInProgress.current = false;
    }
  }, [logOtaError]);

  /**
   * Reload application immediately to run the newly downloaded JavaScript bundle
   */
  const applyUpdate = useCallback(async (): Promise<void> => {
    if (__DEV__ || !Updates.isEnabled) {
      console.log('[UpdateManager] Reload bypassed in __DEV__ environment.');
      return;
    }

    try {
      await Updates.reloadAsync();
    } catch (error: unknown) {
      logOtaError(error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to reload application';
      setState((prev) => ({ ...prev, updateError: errorMessage }));
    }
  }, [logOtaError]);

  /**
   * Dismiss notification banner and defer reload to the next cold boot
   */
  const dismissUpdate = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isDownloaded: false,
    }));
  }, []);

  // Listen for AppState changes to check updates on foregrounding
  useEffect(() => {
    // Initial check on mount
    checkForUpdates();

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        // Debounced check if last check was more than 30 minutes ago
        const thirtyMinutesMs = 30 * 60 * 1000;
        if (!state.lastCheckedAt || Date.now() - state.lastCheckedAt > thirtyMinutesMs) {
          checkForUpdates();
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [checkForUpdates, state.lastCheckedAt]);

  return {
    ...state,
    checkForUpdates,
    applyUpdate,
    dismissUpdate,
  };
}
