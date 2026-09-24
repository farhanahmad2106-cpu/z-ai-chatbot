import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  queueOfflineMeal,
  getQueuedMeals,
  getQueuedMealCount,
  clearQueuedMeal,
  clearAllQueuedMeals,
  syncQueuedMealsToServer,
  type QueuedMealLog,
} from './offlineSync';

// Mock Firebase auth
vi.mock('../firebase', () => ({
  auth: {
    currentUser: {
      getIdToken: vi.fn().mockResolvedValue('mock-test-firebase-token'),
    },
  },
}));

describe('offlineSync - IndexedDB Offline Queue and Synchronization', () => {
  let memoryStore: Map<string, QueuedMealLog>;

  beforeEach(() => {
    memoryStore = new Map<string, QueuedMealLog>();

    const mockIDBRequest = (result: any) => {
      const req: any = {
        result,
        error: null,
        onsuccess: null,
        onerror: null,
      };
      queueMicrotask(() => {
        if (req.onsuccess) req.onsuccess({ target: req });
      });
      return req;
    };

    const mockObjectStore = {
      add: vi.fn((item: QueuedMealLog) => {
        memoryStore.set(item.id, item);
        return mockIDBRequest(item.id);
      }),
      put: vi.fn((item: QueuedMealLog) => {
        memoryStore.set(item.id, item);
        return mockIDBRequest(item.id);
      }),
      get: vi.fn((key: string) => {
        return mockIDBRequest(memoryStore.get(key));
      }),
      getAll: vi.fn(() => {
        return mockIDBRequest(Array.from(memoryStore.values()));
      }),
      delete: vi.fn((key: string) => {
        memoryStore.delete(key);
        return mockIDBRequest(undefined);
      }),
      clear: vi.fn(() => {
        memoryStore.clear();
        return mockIDBRequest(undefined);
      }),
      count: vi.fn(() => {
        return mockIDBRequest(memoryStore.size);
      }),
      createIndex: vi.fn(),
    };

    const mockTransaction = {
      objectStore: vi.fn(() => mockObjectStore),
      oncomplete: null,
      onerror: null,
    };

    const mockDB = {
      objectStoreNames: {
        contains: vi.fn((name: string) => name === 'pending_meal_logs'),
      },
      createObjectStore: vi.fn(() => mockObjectStore),
      transaction: vi.fn(() => mockTransaction),
      close: vi.fn(),
    };

    const mockIndexedDB = {
      open: vi.fn(() => {
        const req: any = {
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

  it('queues an offline meal with generated id and timestamp', async () => {
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
    expect(meal.attempts).toBe(0);

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

  it('retains queued meals when server returns network failure or 500 error', async () => {
    await queueOfflineMeal({ name: 'Chole Bhature', ingredients: [] });

    const mockFetch = vi.fn().mockRejectedValue(new Error('Network disconnected'));
    vi.stubGlobal('fetch', mockFetch);

    const result = await syncQueuedMealsToServer();

    expect(result.synced).toBe(0);
    expect(result.failed).toBe(1);

    const queued = await getQueuedMeals();
    expect(queued.length).toBe(1);
    expect(queued[0].name).toBe('Chole Bhature');
    expect(queued[0].attempts).toBe(1);
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

    // Should be removed from pending active queue
    const count = await getQueuedMealCount();
    expect(count).toBe(0);
  });

  it('calculates exponential backoff delay within bounded range with jitter', async () => {
    const { getBackoffDelayMs } = await import('./offlineSync');
    
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

  it('preserves client_sync_id across retries for server-side idempotency', async () => {
    const meal = await queueOfflineMeal({
      name: 'Idempotent Roti',
      ingredients: [{ name: 'Wheat Flour' }],
      calories: 120,
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ status: 'ok' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await syncQueuedMealsToServer();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(requestBody.client_sync_id).toBe(meal.id);
    expect(requestBody.name).toBe('Idempotent Roti');
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
    (auth as any).currentUser = {
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
    (auth as any).currentUser = originalUser;
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
