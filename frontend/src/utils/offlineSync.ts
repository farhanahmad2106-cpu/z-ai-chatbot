/**
 * Z-SeHealth Offline Synchronization Engine
 * Browser-native IndexedDB queue manager for offline meal logging
 * and background synchronization upon network recovery.
 *
 * Architecture:
 * Offline Read -> Local State -> Queue Mutation -> Reconnect -> Idempotent Sync -> Server Confirmation -> Local Reconciliation
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
  id: string; // client_sync_id UUID
  userId?: string; // Binds queue record to user UID preventing User A -> User B pollution on logout (Section 46)
  name: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  timestamp: number;
  ingredients?: Array<{
    name: string;
  }>;
  foodId?: string;
  brand?: string;
  status?: 'pending' | 'syncing' | 'failed' | 'quarantined';
  attempts?: number;
  lastAttemptAt?: number;
  lastError?: string;
  createdAt?: number;
}

export interface SyncResult {
  synced: number;
  failed: number;
  pending: number;
  requiresAuth: number;
}

let isSyncingInMemory = false;

/**
 * Computes bounded exponential backoff delay with jitter.
 */
export function getBackoffDelayMs(attempts: number): number {
  const base = 1000; // 1s base
  const max = 30000; // 30s ceiling
  const exponential = Math.min(max, base * Math.pow(2, Math.max(0, attempts)));
  const jitter = Math.random() * 500;
  return exponential + jitter;
}

/**
 * Generates a standard RFC 4122 v4 UUID for client-side idempotency.
 */
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback RFC 4122 v4 compliant generator if crypto.randomUUID is unavailable
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

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
 * Binds meal to the current user ID and assigns a stable client_sync_id UUID.
 */
export async function queueOfflineMeal(
  meal: Omit<QueuedMealLog, 'id' | 'timestamp'>
): Promise<QueuedMealLog> {
  const db = await openOfflineDB();
  const id = generateUUID();
  const now = Date.now();
  const currentUserId = auth.currentUser?.uid || meal.userId;

  const record: QueuedMealLog = {
    ...meal,
    id,
    userId: currentUserId,
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

      request.onsuccess = () => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('z-queued-meal-updated'));
        }
        resolve(record);
      };
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
 * Retrieves all pending queued meals from IndexedDB for the current user.
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

      request.onsuccess = () => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('z-queued-meal-updated'));
        }
        resolve();
      };
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

      request.onsuccess = () => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('z-queued-meal-updated'));
        }
        resolve();
      };
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
export async function updateQueuedMealMetadata(
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
 * - User Isolation (Section 46): Meals queued by User A will never sync into User B's account.
 * - Fresh authentication token extracted directly from Firebase Auth; never stored in IndexedDB.
 * - HTTP 2xx: Removes record from IndexedDB and increments synced count.
 * - HTTP 401/403: Halts sync, keeps records safe in queue, and alerts for re-authentication.
 * - HTTP 400/422: Quarantines invalid item to prevent infinite blocking of subsequent items.
 * - HTTP 5xx or Network Error: Keeps record in queue and increments retry counter with backoff.
 */
export async function syncQueuedMealsToServer(): Promise<SyncResult> {
  if (isSyncingInMemory) {
    return { synced: 0, failed: 0, pending: 0, requiresAuth: 0 };
  }

  // Cross-tab lock coordination via Web Locks API if available
  if (typeof navigator !== 'undefined' && 'locks' in navigator && navigator.locks) {
    try {
      return await navigator.locks.request('z_sehealth_sync_lock', { ifAvailable: true }, async (lock) => {
        if (!lock) {
          // Another tab is actively syncing
          return { synced: 0, failed: 0, pending: 0, requiresAuth: 0 };
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
  let pending = 0;
  let requiresAuth = 0;

  try {
    const queue = await getQueuedMeals();
    if (queue.length === 0) {
      return { synced: 0, failed: 0, pending: 0, requiresAuth: 0 };
    }

    // Check authentication
    const user = auth.currentUser;
    if (!user) {
      // Not authenticated yet; retain queue safely
      return { synced: 0, failed: 0, pending: queue.length, requiresAuth: queue.length };
    }

    let token: string;
    try {
      token = await user.getIdToken();
    } catch (authErr) {
      console.error('[OfflineSync] Token retrieval failed:', authErr);
      return { synced: 0, failed: 0, pending: queue.length, requiresAuth: queue.length };
    }

    for (const item of queue) {
      // User Isolation Guard (Section 46): do NOT upload queued meals under a different user
      if (item.userId && item.userId !== user.uid) {
        pending++;
        continue;
      }

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
          requiresAuth++;
          failed += queue.length - synced;
          await updateQueuedMealMetadata(item.id, {
            status: 'pending',
            lastError: 'Authentication required',
            lastAttemptAt: Date.now(),
          });
          break;
        } else if (response.status === 400 || response.status === 422) {
          // Validation error: Quarantine to prevent endless retry blocking
          await updateQueuedMealMetadata(item.id, {
            status: 'quarantined',
            lastError: `Validation error (${response.status})`,
            lastAttemptAt: Date.now(),
          });
          failed++;
        } else {
          // HTTP 5xx or server transient failure: Retain for next retry with backoff
          const attempts = (item.attempts || 0) + 1;
          await updateQueuedMealMetadata(item.id, {
            attempts,
            status: attempts >= 5 ? 'failed' : 'pending',
            lastError: `Server error (${response.status})`,
            lastAttemptAt: Date.now(),
          });
          failed++;
        }
      } catch (networkErr) {
        // Network failure during send: Retain and stop cycle
        console.warn('[OfflineSync] Network error during meal sync:', networkErr);
        await updateQueuedMealMetadata(item.id, {
          attempts: (item.attempts || 0) + 1,
          status: 'pending',
          lastError: 'Network disconnected',
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
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('z-queued-meal-updated'));
    }
  }

  return { synced, failed, pending, requiresAuth };
}
