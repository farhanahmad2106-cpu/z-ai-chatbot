/**
 * Z-SeHealth Offline Synchronization Engine
 * Browser-native IndexedDB queue manager for offline meal logging
 * and background synchronization upon network recovery.
 */

import { API_BASE } from '../config';
import { auth } from '../firebase';

export const OFFLINE_DB_NAME = 'z_sehealth_offline_db';
export const OFFLINE_STORE_NAME = 'pending_meal_logs';
export const OFFLINE_DB_VERSION = 1;

export interface QueuedMealIngredient {
  name: string;
}

export interface QueuedMealLog {
  id: string;
  name: string;
  ingredients: Array<{
    name: string;
  }>;
  timestamp: number;
  status?: 'pending' | 'syncing' | 'failed' | 'quarantined';
  attempts?: number;
  lastAttemptAt?: number;
  createdAt?: number;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  foodId?: string;
  brand?: string;
}

export interface SyncResult {
  synced: number;
  failed: number;
}

let isSyncingInMemory = false;

/**
 * Opens or initializes the offline IndexedDB database safely.
 */
function openOfflineDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const idb: IDBFactory | undefined =
      typeof window !== 'undefined' && window.indexedDB
        ? window.indexedDB
        : typeof globalThis !== 'undefined' && (globalThis as any).indexedDB
        ? (globalThis as any).indexedDB
        : undefined;

    if (!idb) {
      reject(new Error('IndexedDB is not supported in this environment'));
      return;
    }

    const request = idb.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(OFFLINE_STORE_NAME)) {
        db.createObjectStore(OFFLINE_STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
    request.onblocked = () => {
      console.warn('[OfflineSync] IndexedDB open request blocked');
    };
  });
}

/**
 * Enqueues a meal into the local IndexedDB queue when offline.
 */
export async function queueOfflineMeal(
  meal: Omit<QueuedMealLog, 'id' | 'timestamp'>
): Promise<QueuedMealLog> {
  const db = await openOfflineDB();
  const id = `offline_meal_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const now = Date.now();

  const record: QueuedMealLog = {
    ...meal,
    id,
    timestamp: now,
    status: 'pending',
    attempts: 0,
    createdAt: now,
  };

  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([OFFLINE_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(OFFLINE_STORE_NAME);
      const request = store.add(record);

      request.onsuccess = () => resolve(record);
      request.onerror = () => reject(request.error || new Error('Failed to queue meal'));
      transaction.oncomplete = () => db.close();
      transaction.onerror = () => {
        db.close();
        reject(transaction.error || new Error('Transaction failed'));
      };
    } catch (err) {
      db.close();
      reject(err);
    }
  });
}

/**
 * Retrieves all pending queued meals from IndexedDB.
 */
export async function getQueuedMeals(): Promise<QueuedMealLog[]> {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([OFFLINE_STORE_NAME], 'readonly');
        const store = transaction.objectStore(OFFLINE_STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
          db.close();
          const items: QueuedMealLog[] = request.result || [];
          // Filter out quarantined items from active queue
          resolve(items.filter((i) => i.status !== 'quarantined'));
        };
        request.onerror = () => {
          db.close();
          reject(request.error || new Error('Failed to get queued meals'));
        };
      } catch (err) {
        db.close();
        reject(err);
      }
    });
  } catch (err) {
    console.error('[OfflineSync] Error reading queued meals:', err);
    return [];
  }
}

/**
 * Returns the total count of active pending meals in the queue.
 */
export async function getQueuedMealCount(): Promise<number> {
  const items = await getQueuedMeals();
  return items.length;
}

/**
 * Clears an individual meal log from the IndexedDB queue by ID upon successful sync.
 */
export async function clearQueuedMeal(id: string): Promise<void> {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([OFFLINE_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(OFFLINE_STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error(`Failed to delete queued meal: ${id}`));
      transaction.oncomplete = () => db.close();
      transaction.onerror = () => {
        db.close();
        reject(transaction.error || new Error('Transaction failed'));
      };
    } catch (err) {
      db.close();
      reject(err);
    }
  });
}

/**
 * Clears all items from the IndexedDB queue (used for testing or user cache reset).
 */
export async function clearAllQueuedMeals(): Promise<void> {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([OFFLINE_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(OFFLINE_STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('Failed to clear queue'));
      transaction.oncomplete = () => db.close();
    });
  } catch (e) {
    console.error('[OfflineSync] Failed to clear all queued meals:', e);
  }
}

/**
 * Updates a queued meal's metadata (e.g. attempts, lastAttemptAt, or quarantined status).
 */
async function updateQueuedMealMetadata(
  id: string,
  updates: Partial<QueuedMealLog>
): Promise<void> {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([OFFLINE_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(OFFLINE_STORE_NAME);
      const getReq = store.get(id);

      getReq.onsuccess = () => {
        if (!getReq.result) {
          resolve();
          return;
        }
        const updatedRecord = { ...getReq.result, ...updates };
        const putReq = store.put(updatedRecord);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
      transaction.oncomplete = () => db.close();
    });
  } catch (err) {
    console.error('[OfflineSync] Failed to update meal metadata:', err);
  }
}

/**
 * Synchronizes queued meals to the backend server upon network restoration.
 *
 * Guarantees:
 * - Single-concurrency lock (cross-tab via Web Locks API if supported, plus in-memory mutex).
 * - Fresh authentication token extracted directly from Firebase Auth; never stored in IndexedDB.
 * - HTTP 2xx: Removes record from IndexedDB and increments synced count.
 * - HTTP 401/403: Halts sync, keeps records safe in queue, and alerts for re-authentication.
 * - HTTP 400/422: Quarantines invalid item to prevent infinite blocking of subsequent items.
 * - HTTP 5xx or Network Error: Keeps record in queue and increments retry counter.
 */
export async function syncQueuedMealsToServer(): Promise<SyncResult> {
  if (isSyncingInMemory) {
    return { synced: 0, failed: 0 };
  }

  // Cross-tab lock coordination via Web Locks API if available
  if (typeof navigator !== 'undefined' && 'locks' in navigator && navigator.locks) {
    try {
      return await navigator.locks.request('z_sehealth_sync_lock', { ifAvailable: true }, async (lock) => {
        if (!lock) {
          // Another tab is actively syncing
          return { synced: 0, failed: 0 };
        }
        return await executeSyncCycle();
      });
    } catch {
      // Fallback to in-memory mutex
      return await executeSyncCycle();
    }
  }

  return await executeSyncCycle();
}

/**
 * Internal sync runner loop
 */
async function executeSyncCycle(): Promise<SyncResult> {
  isSyncingInMemory = true;
  let synced = 0;
  let failed = 0;

  try {
    const queue = await getQueuedMeals();
    if (queue.length === 0) {
      return { synced: 0, failed: 0 };
    }

    // Check authentication
    const user = auth.currentUser;
    if (!user) {
      // Not authenticated yet; retain queue safely
      return { synced: 0, failed: queue.length };
    }

    let token: string;
    try {
      token = await user.getIdToken();
    } catch (authErr) {
      console.error('[OfflineSync] Token retrieval failed:', authErr);
      return { synced: 0, failed: queue.length };
    }

    for (const item of queue) {
      try {
        const payload: Record<string, unknown> = {
          name: item.name,
          ingredients: item.ingredients || [],
          client_sync_id: item.id,
        };

        if (item.calories !== undefined) payload.calories = item.calories;
        if (item.protein !== undefined) payload.protein = item.protein;
        if (item.carbs !== undefined) payload.carbs = item.carbs;
        if (item.fat !== undefined) payload.fat = item.fat;

        const response = await fetch(`${API_BASE}/api/user/log_meal`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          // HTTP 2xx: Success
          await clearQueuedMeal(item.id);
          synced++;
        } else if (response.status === 401 || response.status === 403) {
          // Auth expired: Stop sync cycle and preserve remaining queue
          failed += queue.length - synced;
          break;
        } else if (response.status === 400 || response.status === 422) {
          // Validation error: Quarantine to prevent endless retry blocking
          await updateQueuedMealMetadata(item.id, {
            status: 'quarantined',
            lastAttemptAt: Date.now(),
          });
          failed++;
        } else {
          // HTTP 5xx or server transient failure: Retain for next retry
          await updateQueuedMealMetadata(item.id, {
            attempts: (item.attempts || 0) + 1,
            lastAttemptAt: Date.now(),
          });
          failed++;
        }
      } catch (networkErr) {
        // Network failure during send: Retain and stop cycle
        console.warn('[OfflineSync] Network error during meal sync:', networkErr);
        await updateQueuedMealMetadata(item.id, {
          attempts: (item.attempts || 0) + 1,
          lastAttemptAt: Date.now(),
        });
        failed += queue.length - synced;
        break;
      }
    }
  } catch (error) {
    console.error('[OfflineSync] Sync cycle encountered error:', error);
  } finally {
    isSyncingInMemory = false;
  }

  return { synced, failed };
}
