/**
 * Z-SeHealth Meal Logging Service (Durable-before-send)
 */

import { enqueueMutation } from './offlineQueue';
import { useOfflineSyncStore } from '../stores/useOfflineSyncStore';
import { ENDPOINTS } from '../api/endpoints';
import { getCachedUserStats, setCachedUserStats } from './foodCacheService';

export interface LogMealInput {
  name: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  ingredients?: Array<{ name: string }>;
  client_sync_id?: string;
}

export async function logMealDurable(input: LogMealInput, userId: string): Promise<string> {
  if (!userId) {
    throw new Error('[MealService] User ID is required to log a meal.');
  }

  // 1. Transactionally enqueue mutation to SQLite first (Durable-before-send)
  const mutation = await enqueueMutation({
    endpoint: ENDPOINTS.LOG_MEAL,
    method: 'POST',
    userId,
    payload: {
      name: input.name,
      ingredients: input.ingredients || [],
      calories: input.calories,
      protein: input.protein,
      carbs: input.carbs,
      fat: input.fat,
      client_sync_id: input.client_sync_id,
    },
  });

  // 2. Optimistically update local cached user stats
  try {
    const existingStats = (await getCachedUserStats(userId)) || {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      last_updated: new Date().toISOString().split('T')[0],
    };

    const updatedStats = {
      ...existingStats,
      calories: existingStats.calories + (input.calories || 0),
      protein: existingStats.protein + (input.protein || 0),
      carbs: existingStats.carbs + (input.carbs || 0),
      fat: existingStats.fat + (input.fat || 0),
    };
    await setCachedUserStats(userId, updatedStats);
  } catch (err) {
    console.warn('[MealService] Optimistic stats update failed:', err);
  }

  // 3. Trigger immediate sync drain if online
  const store = useOfflineSyncStore.getState();
  await store.refreshQueueStats();
  if (store.isOnline) {
    store.syncNow().catch((e) => {
      console.log('[MealService] Background sync drain error (retained in queue):', e);
    });
  }

  return mutation.id;
}
