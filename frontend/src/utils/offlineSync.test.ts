import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  queueOfflineMeal,
  getQueuedMeals,
  getQueuedMealCount,
  clearQueuedMeal,
  clearAllQueuedMeals,
  syncQueuedMealsToServer,
  markMealRetry,
  acquireIndexedDBLease,
  releaseIndexedDBLease,
  getBackoffDelayMs,
  type QueuedMealLog,
} from './offlineSync';

// Mock Firebase auth
vi.mock('../firebase', () => ({
  auth: {
    currentUser: {
      uid: 'test-user-123',
      getIdToken: vi.fn().mockResolvedValue('mock-test-firebase-token'),
    },
  },
}));

describe('offlineSync - IndexedDB Offline Queue and Synchronization', () => {
  let memoryStore: Map<string, QueuedMealLog>;
  let leaseStore: Map<string, SyncLeaseRecord>;

  beforeEach(() => {
    memoryStore = new Map<string, QueuedMealLog>();
    leaseStore = new Map<string, SyncLeaseRecord>();

    const createMockReq = (result: unknown, tx?: unknown) => {
      const req: Record<string, unknown> = {
        result,
        error: null,
        onsuccess: null,
        onerror: null,
      };
      queueMicrotask(() => {
        if (req.onsuccess) req.onsuccess({ target: req });
        if (tx && tx.oncomplete) tx.oncomplete();
      });
      return req;
    };

    let currentTx: unknown = null;

    const mockObjectStore = {
      add: vi.fn((item: QueuedMealLog) => {
        memoryStore.set(item.id, item);
        return createMockReq(item.id, currentTx);
      }),
      put: vi.fn((item: QueuedMealLog) => {
        memoryStore.set(item.id, item);
        return createMockReq(item.id, currentTx);
      }),
      get: vi.fn((key: string) => {
        return createMockReq(memoryStore.get(key), currentTx);
      }),
      getAll: vi.fn(() => {
        return createMockReq(Array.from(memoryStore.values()), currentTx);
      }),
      delete: vi.fn((key: string) => {
        memoryStore.delete(key);
        return createMockReq(undefined, currentTx);
      }),
      clear: vi.fn(() => {
        memoryStore.clear();
        return createMockReq(undefined, currentTx);
      }),
      count: vi.fn(() => {
        return createMockReq(memoryStore.size, currentTx);
      }),
    };

    const mockLeaseStore = {
      add: vi.fn((lease: SyncLeaseRecord) => {
        leaseStore.set(lease.name, lease);
        return createMockReq(lease.name, currentTx);
      }),
      put: vi.fn((lease: SyncLeaseRecord) => {
        leaseStore.set(lease.name, lease);
        return createMockReq(lease.name, currentTx);
      }),
      get: vi.fn((name: string) => {
        return createMockReq(leaseStore.get(name), currentTx);
      }),
      delete: vi.fn((name: string) => {
        leaseStore.delete(name);
        return createMockReq(undefined, currentTx);
      }),
      clear: vi.fn(() => {
        leaseStore.clear();
        return createMockReq(undefined, currentTx);
      }),
    };

    const mockTransaction = {
      objectStore: vi.fn((storeName: string) => {
        if (storeName === 'sync_leases') return mockLeaseStore;
        return mockObjectStore;
      }),
      oncomplete: null,
      onerror: null,
      abort: vi.fn(),
    };
    currentTx = mockTransaction;

    const mockDB = {
      objectStoreNames: {
        contains: vi.fn((name: string) => name === 'pending_meal_logs' || name === 'sync_leases'),
      },
      createObjectStore: vi.fn(() => mockObjectStore),
      transaction: vi.fn(() => mockTransaction),
      close: vi.fn(),
    };

    const mockIndexedDB = {
      open: vi.fn(() => {
        const req: Record<string, unknown> = {
          result: mockDB,
          error: null,
          onsuccess: null,
          onerror: null,
          onupgradeneeded: null,
        };
        queueMicrotask(() => {
          if (req.onsuccess) {
            req.onsuccess({ target: req });
          }
        });
        return req;
      }),
    };

    vi.stubGlobal('indexedDB', mockIndexedDB);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('queues an offline meal with generated id, retryCount: 0, and timestamp', async () => {
    const meal = await queueOfflineMeal({
      name: 'Paneer Bhurji',
      ingredients: [{ name: 'Paneer' }, { name: 'Onions' }, { name: 'Tomatoes' }],
      calories: 320,
      protein: 18,
      carbs: 8,
      fat: 22,
    });

    expect(meal).toBeDefined();
    expect(meal.id).toBeDefined();
    expect(meal.name).toBe('Paneer Bhurji');
    expect(meal.calories).toBe(320);
    expect(meal.status).toBe('pending');
    expect(meal.retryCount).toBe(0);
    expect(meal.attempts).toBe(0);
    expect(meal.timestamp).toBeGreaterThan(0);

    const count = await getQueuedMealCount();
    expect(count).toBe(1);

    const queued = await getQueuedMeals();
    expect(queued.length).toBe(1);
    expect(queued[0].name).toBe('Paneer Bhurji');
  });

  it('correctly counts and clears individual queued meals', async () => {
    const meal1 = await queueOfflineMeal({ name: 'Meal 1', ingredients: [] });
    const meal2 = await queueOfflineMeal({ name: 'Meal 2', ingredients: [] });

    let count = await getQueuedMealCount();
    expect(count).toBe(2);

    await clearQueuedMeal(meal1.id);
    count = await getQueuedMealCount();
    expect(count).toBe(1);

    const remaining = await getQueuedMeals();
    expect(remaining[0].id).toBe(meal2.id);

    await clearAllQueuedMeals();
    count = await getQueuedMealCount();
    expect(count).toBe(0);
  });

  it('updates meal retry metadata and transitions to failed state upon hitting MAX_SYNC_RETRIES', async () => {
    const meal = await queueOfflineMeal({ name: 'Failing Meal', ingredients: [] });

    await markMealRetry(meal.id, 'Connection timeout', Date.now() + 5000);
    let queued = await getQueuedMeals();
    expect(queued[0].retryCount).toBe(1);
    expect(queued[0].lastError).toBe('Connection timeout');
    expect(queued[0].status).toBe('pending');

    // Simulate 4 more retries
    await markMealRetry(meal.id, 'Retry 2', Date.now() + 5000);
    await markMealRetry(meal.id, 'Retry 3', Date.now() + 5000);
    await markMealRetry(meal.id, 'Retry 4', Date.now() + 5000);
    await markMealRetry(meal.id, 'Retry 5', Date.now() + 5000);

    queued = await getQueuedMeals();
    expect(queued[0].retryCount).toBe(5);
    expect(queued[0].status).toBe('failed');
  });

  it('coordinates multi-tab synchronization via IndexedDB lease fallback', async () => {
    // Tab A acquires lease
    const acquiredA = await acquireIndexedDBLease('z_sehealth_sync_lock', 15000);
    expect(acquiredA).toBe(true);

    // Tab B tries to acquire same lease with different tab ID
    const origSessionStorage = globalThis.sessionStorage;
    const mockStorage = {
      getItem: vi.fn(() => 'tab-b-different-id'),
      setItem: vi.fn(),
    };
    vi.stubGlobal('sessionStorage', mockStorage);

    const acquiredB = await acquireIndexedDBLease('z_sehealth_sync_lock', 15000);
    expect(acquiredB).toBe(false);

    // Stale lease recovery: if lease has expired in the past, Tab B should acquire it
    leaseStore.set('z_sehealth_sync_lock', {
      name: 'z_sehealth_sync_lock',
      ownerId: 'tab-a-old',
      acquiredAt: Date.now() - 30000,
      expiresAt: Date.now() - 15000, // Expired
    });

    const acquiredBAfterExpiry = await acquireIndexedDBLease('z_sehealth_sync_lock', 15000);
    expect(acquiredBAfterExpiry).toBe(true);

    // Clean up
    await releaseIndexedDBLease('z_sehealth_sync_lock');
    vi.stubGlobal('sessionStorage', origSessionStorage);
  });

  it('coordinates multi-tab synchronization via Web Locks API when available', async () => {
    await queueOfflineMeal({ name: 'Web Locks Test Meal', ingredients: [] });

    // Mock Web Locks where lock is contested by another tab (lock callback passed null)
    const mockContestedLocks = {
      request: vi.fn(async (_name: string, _options: unknown, callback: (arg: unknown) => Promise<unknown>) => {
        return await callback(null); // Contested: another tab holds lock
      }),
    };
    vi.stubGlobal('navigator', { locks: mockContestedLocks });

    const contestedResult = await syncQueuedMealsToServer();
    expect(contestedResult.synced).toBe(0);
    expect(contestedResult.failed).toBe(0);
    expect(mockContestedLocks.request).toHaveBeenCalledWith(
      'z_sehealth_sync_lock',
      { ifAvailable: true },
      expect.any(Function)
    );

    // Mock Web Locks where lock is granted
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ status: 'ok' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const mockGrantedLocks = {
      request: vi.fn(async (_name: string, _options: unknown, callback: (arg: unknown) => Promise<unknown>) => {
        return await callback({ name: 'z_sehealth_sync_lock' }); // Granted
      }),
    };
    vi.stubGlobal('navigator', { locks: mockGrantedLocks });

    const grantedResult = await syncQueuedMealsToServer();
    expect(grantedResult.synced).toBe(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Clean up global navigator stub
    vi.stubGlobal('navigator', {});
  });

  it('synchronizes queued meals to backend when online and auth token is valid', async () => {
    await queueOfflineMeal({ name: 'Dal Tadka', ingredients: [], calories: 220, protein: 11 });
    await queueOfflineMeal({ name: 'Brown Rice', ingredients: [], calories: 150, carbs: 32 });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        status: 'success',
        new_stats: { calories: 370, protein: 11, carbs: 32, fat: 0 },
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await syncQueuedMealsToServer();

    expect(result.synced).toBe(2);
    expect(result.failed).toBe(0);

    // Verify fetch was called with Authorization Bearer header
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers['Authorization']).toBe('Bearer mock-test-firebase-token');

    // Queue should now be empty
    const remainingCount = await getQueuedMealCount();
    expect(remainingCount).toBe(0);
  });

  it('retains queued meals and increments retryCount when server returns network failure or 500 error', async () => {
    await queueOfflineMeal({ name: 'Chole Bhature', ingredients: [] });

    const mockFetch = vi.fn().mockRejectedValue(new Error('Network disconnected'));
    vi.stubGlobal('fetch', mockFetch);

    const result = await syncQueuedMealsToServer();

    expect(result.synced).toBe(0);
    expect(result.failed).toBe(1);

    const queued = await getQueuedMeals();
    expect(queued.length).toBe(1);
    expect(queued[0].name).toBe('Chole Bhature');
    expect(queued[0].retryCount).toBe(1);
    expect(queued[0].lastError).toBe('Network disconnected');
  });

  it('respects 429 Rate Limited Retry-After header for backoff', async () => {
    await queueOfflineMeal({ name: 'Rate Limited Meal', ingredients: [] });

    const mockHeaders = new Headers();
    mockHeaders.set('Retry-After', '12');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: mockHeaders,
      json: vi.fn().mockResolvedValue({ detail: 'Rate limited' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await syncQueuedMealsToServer();
    expect(result.failed).toBe(1);

    const queued = await getQueuedMeals();
    expect(queued[0].retryCount).toBe(1);
    expect(queued[0].nextAttemptAt).toBeGreaterThan(Date.now() + 10000);
  });

  it('quarantines invalid payloads (400 / 422) to prevent poison pill loops', async () => {
    await queueOfflineMeal({ name: 'Corrupt Food Payload', ingredients: [] });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: vi.fn().mockResolvedValue({ detail: 'Unprocessable Entity' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await syncQueuedMealsToServer();

    expect(result.synced).toBe(0);
    expect(result.failed).toBe(1);

    // Should be filtered out from active pending queue
    const count = await getQueuedMealCount();
    expect(count).toBe(0);
  });

  it('calculates exponential backoff delay within bounded range with jitter', () => {
    // Attempt 0: base 1000ms + [0, 500) jitter
    const delay0 = getBackoffDelayMs(0);
    expect(delay0).toBeGreaterThanOrEqual(1000);
    expect(delay0).toBeLessThan(1600);

    // Attempt 1: 2000ms + [0, 500) jitter
    const delay1 = getBackoffDelayMs(1);
    expect(delay1).toBeGreaterThanOrEqual(2000);
    expect(delay1).toBeLessThan(2600);

    // Attempt 10: capped at 30,000ms max + [0, 500) jitter
    const delay10 = getBackoffDelayMs(10);
    expect(delay10).toBeGreaterThanOrEqual(30000);
    expect(delay10).toBeLessThan(30600);
  });

  it('preserves client_sync_id across retries for server-side idempotency and handles Already Synced responses', async () => {
    const meal = await queueOfflineMeal({
      name: 'Idempotent Roti',
      ingredients: [{ name: 'Wheat Flour' }],
      calories: 120,
    });

    // Server returns idempotent acknowledgment (status: 200, message: Already synced)
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ status: 'ok', message: 'Already synced' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await syncQueuedMealsToServer();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(requestBody.client_sync_id).toBe(meal.id);
    expect(requestBody.name).toBe('Idempotent Roti');
    expect(result.synced).toBe(1);

    // Queue item should be removed
    const remaining = await getQueuedMealCount();
    expect(remaining).toBe(0);
  });

  it('enforces User Isolation (Section 46) so User A queued meal is not synced to User B account', async () => {
    // Queue a meal bound explicitly to user-alpha
    await queueOfflineMeal({
      name: 'Alpha Secret Salad',
      ingredients: [],
      userId: 'user-alpha-123',
    });

    // Mock auth with user-beta
    const { auth } = await import('../firebase');
    const originalUser = auth.currentUser;
    (auth as unknown as { currentUser: unknown }).currentUser = {
      uid: 'user-beta-456',
      getIdToken: vi.fn().mockResolvedValue('token-beta'),
    };

    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const result = await syncQueuedMealsToServer();

    // User A's meal should NOT be dispatched under User B
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.synced).toBe(0);
    expect(result.pending).toBe(1);

    // Restore user
    (auth as unknown as { currentUser: unknown }).currentUser = originalUser;
  });

  it('stops retry cycle and flags requiresAuth when server returns 401 Unauthorized', async () => {
    await queueOfflineMeal({ name: 'Expired Token Meal', ingredients: [] });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: vi.fn().mockResolvedValue({ detail: 'Token expired' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await syncQueuedMealsToServer();

    expect(result.synced).toBe(0);
    expect(result.requiresAuth).toBe(1);

    // Item must remain in queue waiting for re-authentication
    const remaining = await getQueuedMeals();
    expect(remaining.length).toBe(1);
    expect(remaining[0].lastError).toBe('Authentication required');
  });
});
