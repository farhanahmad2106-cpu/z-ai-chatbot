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
export const OFFLINE_LEASE_STORE = 'sync_leases';
export const OFFLINE_DB_VERSION = 2;
export const MAX_SYNC_RETRIES = 5;
export const LEASE_DURATION_MS = 15000; // 15s cross-tab lease duration

export interface QueuedMealIngredient {
  name: string;
}

export interface QueuedMealLog {
  id: string; // client_sync_id UUID (stable across retries)
  name: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  ingredients?: Array<{
    name: string;
  }>;
  timestamp: number;
  retryCount: number;
  nextAttemptAt?: number;
  lastError?: string;
  // Security & context fields
  userId?: string; // Binds queue record to user UID preventing User A -> User B cross-account leakage (Section 46)
  foodId?: string;
  brand?: string;
  status?: 'pending' | 'syncing' | 'failed' | 'quarantined';
  attempts?: number; // legacy alias synchronized with retryCount
  lastAttemptAt?: number;
  createdAt?: number;
}

export type NewQueuedMealLog = Omit<
  QueuedMealLog,
  'id' | 'retryCount' | 'timestamp'
>;

export interface SyncResult {
  synced: number;
  failed: number;
  pending: number;
  requiresAuth: number;
}

export interface SyncLeaseRecord {
  name: string;
  ownerId: string;
  acquiredAt: number;
  expiresAt: number;
}

let isSyncingInMemory = false;
let sessionTabId: string | null = null;

/**
 * Unique stable identifier for the current browser execution tab.
 */
export function getTabId(): string {
  if (typeof sessionStorage !== 'undefined') {
    try {
      let id = sessionStorage.getItem('z_sehealth_sync_tab_id');
      if (!id) {
        id = generateUUID();
        sessionStorage.setItem('z_sehealth_sync_tab_id', id);
      }
      return id;
    } catch {
      // Storage restricted
    }
  }
  if (!sessionTabId) {
    sessionTabId = generateUUID();
  }
  return sessionTabId;
}

export function resetTabId(id?: string | null): void {
  sessionTabId = id ?? null;
}

// BroadcastChannel for instant cross-tab coordination where supported
let syncChannel: BroadcastChannel | null = null;
if (typeof BroadcastChannel !== 'undefined') {
  try {
    syncChannel = new BroadcastChannel('z_sehealth_sync_channel');
    syncChannel.onmessage = (event) => {
      if (event.data?.type === 'QUEUE_UPDATED' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('z-queued-meal-updated'));
      } else if (event.data?.type === 'SYNC_COMPLETED' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('z-queued-meal-synced', { detail: event.data.payload }));
      }
    };
  } catch {
    syncChannel = null;
  }
}

function notifyQueueUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('z-queued-meal-updated'));
  }
  try {
    syncChannel?.postMessage({ type: 'QUEUE_UPDATED' });
  } catch {
    // Channel closed or unavailable
  }
}

/**
 * Computes bounded exponential backoff delay with random jitter.
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
export function generateUUID(): string {
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
 * Opens or initializes the offline IndexedDB database safely with migration support.
 */
export function openOfflineDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const idb: IDBFactory | undefined =
      typeof window !== 'undefined' && window.indexedDB
        ? window.indexedDB
        : typeof globalThis !== 'undefined' && (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB
        ? (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB
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
      if (!db.objectStoreNames.contains(OFFLINE_LEASE_STORE)) {
        db.createObjectStore(OFFLINE_LEASE_STORE, { keyPath: 'name' });
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
 * Acquires a cross-tab synchronization lease in IndexedDB (Section 15 fallback).
 * Recovers safely from stale orphaned leases if expired.
 */
export async function acquireIndexedDBLease(
  leaseName: string = 'z_sehealth_sync_lock',
  durationMs: number = LEASE_DURATION_MS
): Promise<boolean> {
  try {
    const db = await openOfflineDB();
    if (!db.objectStoreNames.contains(OFFLINE_LEASE_STORE)) {
      db.close();
      return true; // Store not configured in legacy mock, allow execution
    }

    const tabId = getTabId();
    const now = Date.now();

    return new Promise((resolve) => {
      try {
        const tx = db.transaction([OFFLINE_LEASE_STORE], 'readwrite');
        const store = tx.objectStore(OFFLINE_LEASE_STORE);
        const getReq = store.get(leaseName);

        getReq.onsuccess = () => {
          const currentLease = getReq.result as SyncLeaseRecord | undefined;
          if (currentLease && currentLease.ownerId !== tabId && currentLease.expiresAt > now) {
            // Another tab holds an unexpired active lease
            db.close();
            resolve(false);
            return;
          }

          // Lease is unowned, held by this tab, or expired (stale lease recovery)
          const newLease: SyncLeaseRecord = {
            name: leaseName,
            ownerId: tabId,
            acquiredAt: now,
            expiresAt: now + durationMs,
          };

          const putReq = store.put(newLease);
          putReq.onerror = () => {
            db.close();
            resolve(false);
          };
        };

        getReq.onerror = () => {
          db.close();
          resolve(false);
        };

        tx.oncomplete = () => {
          db.close();
          resolve(true);
        };
        tx.onerror = () => {
          db.close();
          resolve(false);
        };
      } catch {
        db.close();
        resolve(false);
      }
    });
  } catch {
    return false;
  }
}

/**
 * Safely releases a cross-tab lease in IndexedDB if held by this tab.
 */
export async function releaseIndexedDBLease(
  leaseName: string = 'z_sehealth_sync_lock'
): Promise<void> {
  try {
    const db = await openOfflineDB();
    if (!db.objectStoreNames.contains(OFFLINE_LEASE_STORE)) {
      db.close();
      return;
    }

    const tabId = getTabId();
    return new Promise((resolve) => {
      try {
        const tx = db.transaction([OFFLINE_LEASE_STORE], 'readwrite');
        const store = tx.objectStore(OFFLINE_LEASE_STORE);
        const getReq = store.get(leaseName);

        getReq.onsuccess = () => {
          const currentLease = getReq.result as SyncLeaseRecord | undefined;
          if (currentLease && currentLease.ownerId === tabId) {
            store.delete(leaseName);
          }
        };

        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          resolve();
        };
      } catch {
        db.close();
        resolve();
      }
    });
  } catch {
    // Non-fatal lease release failure
  }
}

/**
 * Enqueues a meal into the local IndexedDB queue when offline.
 * Binds meal to the current user ID and assigns a stable client_sync_id UUID.
 */
export async function queueOfflineMeal(
  meal: NewQueuedMealLog
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
    retryCount: 0,
    attempts: 0,
    createdAt: now,
  };

  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([OFFLINE_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(OFFLINE_STORE_NAME);
      const request = store.add(record);

      request.onsuccess = () => {
        notifyQueueUpdated();
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
 * Retrieves all pending queued meals from IndexedDB (ordered oldest first).
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
          // Filter out quarantined items from active queue and sort FIFO by timestamp
          const active = items
            .filter((i) => i.status !== 'quarantined')
            .sort((a, b) => a.timestamp - b.timestamp);
          resolve(active);
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
        notifyQueueUpdated();
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
        notifyQueueUpdated();
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
 * Updates a queued meal's metadata (e.g. retryCount, nextAttemptAt, or quarantined status).
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
 * Marks a queued meal for a future bounded retry with backoff.
 */
export async function markMealRetry(
  id: string,
  error: string,
  nextAttemptAt: number
): Promise<void> {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([OFFLINE_STORE_NAME], 'readwrite');
      const store = tx.objectStore(OFFLINE_STORE_NAME);
      const req = store.get(id);

      req.onsuccess = () => {
        const item = req.result as QueuedMealLog | undefined;
        if (!item) {
          resolve();
          return;
        }
        const nextRetries = (item.retryCount ?? item.attempts ?? 0) + 1;
        const updated: QueuedMealLog = {
          ...item,
          retryCount: nextRetries,
          attempts: nextRetries,
          lastError: error,
          nextAttemptAt,
          lastAttemptAt: Date.now(),
          status: nextRetries >= MAX_SYNC_RETRIES ? 'failed' : 'pending',
        };
        const putReq = store.put(updated);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      };
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch (err) {
    console.error('[OfflineSync] Failed to mark meal retry:', err);
  }
}

/**
 * Synchronizes queued meals to the backend server upon network restoration.
 *
 * Guarantees:
 * - Single-concurrency lock:
 *   1. Web Locks API (navigator.locks.request) if available.
 *   2. IndexedDB lease table fallback with owner ID, lease duration, and stale-lease recovery.
 *   3. In-memory mutex guard.
 * - User Isolation (Section 46): Meals queued by User A will never sync into User B's account.
 * - Fresh authentication token extracted directly from Firebase Auth; never stored in IndexedDB.
 * - HTTP 2xx: Removes record from IndexedDB and increments synced count.
 * - HTTP 401/403: Halts sync, keeps records safe in queue, and alerts for re-authentication.
 * - HTTP 400/422: Quarantines invalid item to prevent infinite blocking of subsequent items.
 * - HTTP 429: Respects Retry-After header with exponential backoff.
 * - HTTP 5xx or Network Error: Keeps record in queue and increments retry counter with backoff.
 */
export async function syncQueuedMealsToServer(): Promise<SyncResult> {
  if (isSyncingInMemory) {
    return { synced: 0, failed: 0, pending: 0, requiresAuth: 0 };
  }

  // 1. Primary mechanism: Web Locks API if supported
  if (typeof navigator !== 'undefined' && 'locks' in navigator && (navigator as unknown as { locks?: { request: (...args: unknown[]) => unknown } }).locks?.request) {
    try {
      return (await (navigator as unknown as { locks: { request: (name: string, options: unknown, callback: (lock: unknown) => Promise<unknown>) => Promise<unknown> } }).locks.request('z_sehealth_sync_lock', { ifAvailable: true }, async (lock: unknown) => {
        if (!lock) {
          // Another tab is actively syncing via Web Locks
          return { synced: 0, failed: 0, pending: 0, requiresAuth: 0 };
        }
        return await executeSyncCycle();
      })) as SyncResult;
    } catch {
      // Fallback to IndexedDB lease below if Web Locks throws
    }
  }

  // 2. Cross-tab fallback: Short-lived IndexedDB lease with stale lock recovery
  const leaseAcquired = await acquireIndexedDBLease('z_sehealth_sync_lock');
  if (!leaseAcquired) {
    return { synced: 0, failed: 0, pending: 0, requiresAuth: 0 };
  }

  try {
    return await executeSyncCycle();
  } finally {
    await releaseIndexedDBLease('z_sehealth_sync_lock');
  }
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

    const now = Date.now();

    for (const item of queue) {
      // User Isolation Guard (Section 46): do NOT upload queued meals under a different user
      if (item.userId && item.userId !== user.uid) {
        pending++;
        continue;
      }

      // Respect bounded retry backoff
      if (item.nextAttemptAt && item.nextAttemptAt > now) {
        pending++;
        continue;
      }

      try {
        const payload: Record<string, unknown> = {
          name: item.name,
          ingredients: item.ingredients || [],
          client_sync_id: item.id, // Stable UUID client_sync_id generated once
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
          // HTTP 2xx: Success or idempotent deduplication confirmed
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
        } else if (response.status === 400 || response.status === 404 || response.status === 422) {
          // Validation error: Quarantine to prevent endless retry blocking
          await updateQueuedMealMetadata(item.id, {
            status: 'quarantined',
            lastError: `Validation error (${response.status})`,
            lastAttemptAt: Date.now(),
          });
          failed++;
        } else if (response.status === 429) {
          // Rate limit: Respect Retry-After header if present, otherwise exponential backoff
          const nextRetries = (item.retryCount ?? item.attempts ?? 0) + 1;
          let delayMs = getBackoffDelayMs(nextRetries);
          const retryAfterHeader = response.headers?.get?.('Retry-After');
          if (retryAfterHeader) {
            const parsedSeconds = parseInt(retryAfterHeader, 10);
            if (!isNaN(parsedSeconds) && parsedSeconds > 0) {
              delayMs = parsedSeconds * 1000;
            }
          }
          await markMealRetry(item.id, `Rate limited (429)`, Date.now() + delayMs);
          failed++;
        } else {
          // HTTP 5xx or server transient failure: Retain for next retry with backoff
          const nextRetries = (item.retryCount ?? item.attempts ?? 0) + 1;
          const delayMs = getBackoffDelayMs(nextRetries);
          await markMealRetry(item.id, `Server error (${response.status})`, Date.now() + delayMs);
          failed++;
        }
      } catch (networkErr) {
        // Network failure during send: Retain and schedule retry
        console.warn('[OfflineSync] Network error during meal sync:', networkErr);
        const nextRetries = (item.retryCount ?? item.attempts ?? 0) + 1;
        const delayMs = getBackoffDelayMs(nextRetries);
        await markMealRetry(item.id, 'Network disconnected', Date.now() + delayMs);
        failed += queue.length - synced;
        break;
      }
    }
  } catch (error) {
    console.error('[OfflineSync] Sync cycle encountered error:', error);
  } finally {
    isSyncingInMemory = false;
    notifyQueueUpdated();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('z-queued-meal-synced', {
          detail: { synced, failed, pending, requiresAuth },
        })
      );
    }
    try {
      syncChannel?.postMessage({
        type: 'SYNC_COMPLETED',
        payload: { synced, failed, pending, requiresAuth },
      });
    } catch {
      // ignore
    }
  }

  return { synced, failed, pending, requiresAuth };
}
