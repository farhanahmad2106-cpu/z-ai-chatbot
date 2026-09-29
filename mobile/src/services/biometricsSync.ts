/**
 * Z-SeHealth Biometrics Synchronization Service (Durable-before-send)
 *
 * Transmits wearable and manual metrics (step_count, active_energy_burned_kcal, resting_heart_rate_bpm)
 * to POST /api/user/biometrics/sync with offline durability.
 */

import { enqueueMutation } from './offlineQueue';
import { useOfflineSyncStore } from '../stores/useOfflineSyncStore';
import { ENDPOINTS } from '../api/endpoints';

export interface BiometricMetricsInput {
  source: 'apple_healthkit' | 'google_health_connect' | 'manual';
  recorded_date: string; // YYYY-MM-DD
  step_count: number;
  active_energy_burned_kcal: number;
  resting_heart_rate_bpm: number;
  client_sync_id?: string;
}

export async function syncBiometricsDurable(
  metrics: BiometricMetricsInput,
  userId: string
): Promise<string> {
  if (!userId) {
    throw new Error('[BiometricsSync] User ID is required to sync biometrics.');
  }

  // Enqueue mutation to SQLite first
  const mutation = await enqueueMutation({
    endpoint: ENDPOINTS.BIOMETRICS_SYNC,
    method: 'POST',
    userId,
    payload: {
      source: metrics.source,
      recorded_date: metrics.recorded_date,
      step_count: metrics.step_count,
      active_energy_burned_kcal: metrics.active_energy_burned_kcal,
      resting_heart_rate_bpm: metrics.resting_heart_rate_bpm,
      client_sync_id: metrics.client_sync_id,
    },
  });

  const store = useOfflineSyncStore.getState();
  await store.refreshQueueStats();
  if (store.isOnline) {
    store.syncNow().catch((e) => {
      console.log('[BiometricsSync] Background sync drain error (retained in queue):', e);
    });
  }

  return mutation.id;
}

// Backward-compatible alias
export const syncBiometrics = syncBiometricsDurable;
