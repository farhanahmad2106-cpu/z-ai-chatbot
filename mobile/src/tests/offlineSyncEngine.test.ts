/**
 * Z-SeHealth Mobile Offline Sync Engine & Mutation Queue Test Suite
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// 1. Mock React Native and Expo dependencies before any store/service imports
vi.mock('react-native', () => ({
  AppState: {
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  },
  Platform: {
    select: (obj: any) => obj.default ?? obj.ios ?? obj.android,
  },
  StyleSheet: {
    create: (obj: any) => obj,
    absoluteFill: {},
  },
}));

vi.mock('@react-native-community/netinfo', () => ({
  default: {
    addEventListener: vi.fn(() => vi.fn()),
    fetch: vi.fn().mockResolvedValue({ isConnected: true, isInternetReachable: true }),
  },
}));

// In-Memory SQLite Mock Store
interface MockRow {
  id: string;
  user_id: string;
  endpoint: string;
  method: string;
  payload_json: string;
  status: string;
  retry_count: number;
  max_retries: number;
  next_attempt_at: number;
  last_error: string | null;
  last_http_status: number | null;
  created_at: number;
  updated_at: number;
  processing_started_at: number | null;
  quarantine_reason: string | null;
}

let mockQueueRows: MockRow[] = [];

const mockDatabase = {
  execAsync: vi.fn().mockResolvedValue(undefined),
  runAsync: vi.fn(async (sql: string, params: any[] = []) => {
    const trimmed = sql.trim();
    if (trimmed.startsWith('INSERT INTO offline_mutation_queue')) {
      const [
        id, user_id, endpoint, method, payload_json, max_retries,
        created_at, next_attempt_at, updated_at
      ] = params;
      mockQueueRows.push({
        id,
        user_id,
        endpoint,
        method,
        payload_json,
        status: 'pending',
        retry_count: 0,
        max_retries: max_retries ?? 5,
        next_attempt_at: next_attempt_at ?? created_at,
        last_error: null,
        last_http_status: null,
        created_at,
        updated_at,
        processing_started_at: null,
        quarantine_reason: null,
      });
      return { changes: 1 };
    }

    if (trimmed.startsWith('DELETE FROM offline_mutation_queue WHERE id = ?')) {
      const [id] = params;
      const initial = mockQueueRows.length;
      mockQueueRows = mockQueueRows.filter((r) => r.id !== id);
      return { changes: initial - mockQueueRows.length };
    }

    if (trimmed.startsWith('DELETE FROM offline_mutation_queue WHERE user_id = ?')) {
      const [userId] = params;
      const initial = mockQueueRows.length;
      mockQueueRows = mockQueueRows.filter((r) => r.user_id !== userId);
      return { changes: initial - mockQueueRows.length };
    }

    if (trimmed.includes("UPDATE offline_mutation_queue") && trimmed.includes("SET status = 'processing'")) {
      const [processingTime, updatedTime, id] = params;
      const row = mockQueueRows.find((r) => r.id === id);
      if (row) {
        row.status = 'processing';
        row.processing_started_at = processingTime;
        row.updated_at = updatedTime;
        return { changes: 1 };
      }
      return { changes: 0 };
    }

    if (trimmed.includes("UPDATE offline_mutation_queue") && trimmed.includes("SET status = 'quarantined'")) {
      const id = params[params.length - 1];
      const row = mockQueueRows.find((r) => r.id === id);
      if (row) {
        row.status = 'quarantined';
        row.quarantine_reason = params[0];
        row.last_error = params.length === 5 ? params[1] : params[0];
        row.last_http_status = params.length === 5 ? params[2] : null;
        row.processing_started_at = null;
        row.updated_at = params[params.length - 2];
        return { changes: 1 };
      }
      return { changes: 0 };
    }

    if (trimmed.includes("UPDATE offline_mutation_queue") && trimmed.includes("SET status = 'pending'")) {
      if (trimmed.includes("retry_count = ?")) {
        const [nextRetry, nextAttempt, err, status, updated_at, id] = params;
        const row = mockQueueRows.find((r) => r.id === id);
        if (row) {
          row.status = 'pending';
          row.retry_count = nextRetry;
          row.next_attempt_at = nextAttempt;
          row.last_error = err;
          row.last_http_status = status;
          row.processing_started_at = null;
          row.updated_at = updated_at;
          return { changes: 1 };
        }
      } else if (trimmed.includes("WHERE status = 'processing'")) {
        // Crash recovery update
        const [updated_at, threshold] = params;
        let count = 0;
        for (const row of mockQueueRows) {
          if (row.status === 'processing' && (row.processing_started_at === null || row.processing_started_at < threshold)) {
            row.status = 'pending';
            row.processing_started_at = null;
            row.updated_at = updated_at;
            count++;
          }
        }
        return { changes: count };
      } else if (trimmed.includes("WHERE user_id = ? AND status = 'quarantined'")) {
        // Retry all quarantined
        const [nextAttempt, updated_at, userId] = params;
        let count = 0;
        for (const row of mockQueueRows) {
          if (row.user_id === userId && row.status === 'quarantined') {
            row.status = 'pending';
            row.retry_count = 0;
            row.next_attempt_at = nextAttempt;
            row.quarantine_reason = null;
            row.updated_at = updated_at;
            count++;
          }
        }
        return { changes: count };
      } else {
        // 401 or single retry
        const id = params[params.length - 1];
        const row = mockQueueRows.find((r) => r.id === id);
        if (row) {
          row.status = 'pending';
          if (params.length === 3) {
            row.next_attempt_at = params[0];
          }
          row.processing_started_at = null;
          row.updated_at = params[params.length - 2];
          return { changes: 1 };
        }
      }
      return { changes: 0 };
    }

    return { changes: 0 };
  }),
  getAllAsync: vi.fn(async (sql: string, params: any[] = []) => {
    const trimmed = sql.trim();
    if (trimmed.includes("FROM offline_mutation_queue") && trimmed.includes("status IN ('pending', 'failed')")) {
      const [userId, maxNextAttempt] = params;
      return mockQueueRows
        .filter(
          (r) =>
            r.user_id === userId &&
            (r.status === 'pending' || r.status === 'failed') &&
            r.next_attempt_at <= maxNextAttempt
        )
        .sort((a, b) => a.created_at - b.created_at);
    }
    if (trimmed.includes("FROM offline_mutation_queue") && trimmed.includes("GROUP BY status")) {
      const [userId] = params;
      const counts: Record<string, number> = {};
      for (const r of mockQueueRows) {
        if (r.user_id === userId) {
          counts[r.status] = (counts[r.status] || 0) + 1;
        }
      }
      return Object.entries(counts).map(([status, count]) => ({ status, count }));
    }
    if (trimmed.includes("FROM offline_mutation_queue") && trimmed.includes("status = 'quarantined'")) {
      const [userId] = params;
      return mockQueueRows.filter((r) => r.user_id === userId && r.status === 'quarantined');
    }
    return [];
  }),
  getFirstAsync: vi.fn(async () => null),
  withTransactionAsync: vi.fn(async (callback: () => Promise<void>) => {
    await callback();
  }),
  closeAsync: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../services/db', () => ({
  getDatabase: vi.fn(async () => mockDatabase),
  closeDatabase: vi.fn(async () => {}),
}));

// Now import services
import {
  generateUUID,
  calculateBackoffDelayMs,
  enqueueMutation,
  processQueue,
  recoverStaleProcessing,
  getQueueStats,
  retryAllQuarantined,
  quarantineMutation,
  removeMutation,
} from '../services/offlineQueue';
import { useAuthStore } from '../stores/useAuthStore';

describe('Z-SeHealth Mobile Offline Sync Engine', () => {
  beforeEach(() => {
    mockQueueRows = [];
    vi.clearAllMocks();

    useAuthStore.setState({
      userId: 'test_user_uid_123',
      token: 'valid_mock_token_abc',
      email: 'test@zsehealth.app',
      displayName: 'Test User',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Idempotency & UUID v4 Guarantees', () => {
    it('generates valid RFC 4122 UUID v4 identifiers', () => {
      const uuid1 = generateUUID();
      const uuid2 = generateUUID();

      const uuidv4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(uuid1).toMatch(uuidv4Regex);
      expect(uuid2).toMatch(uuidv4Regex);
      expect(uuid1).not.toBe(uuid2);
    });

    it('injects client_sync_id into mutation payload and persists durably before return', async () => {
      const mutation = await enqueueMutation({
        endpoint: '/api/user/log_meal',
        method: 'POST',
        userId: 'test_user_uid_123',
        payload: {
          name: 'Dal Tadka',
          calories: 220,
          protein: 9,
          carbs: 30,
          fat: 6,
        },
      });

      expect(mutation.id).toBeDefined();
      expect(mutation.status).toBe('pending');
      expect(mutation.user_id).toBe('test_user_uid_123');

      const parsedPayload = JSON.parse(mutation.payload_json);
      expect(parsedPayload.client_sync_id).toBe(mutation.id);
      expect(parsedPayload.name).toBe('Dal Tadka');

      // Verify row exists in SQLite table
      expect(mockQueueRows.length).toBe(1);
      expect(mockQueueRows[0].id).toBe(mutation.id);
    });

    it('rejects enqueuing when userId is missing to guarantee user isolation', async () => {
      await expect(
        enqueueMutation({
          endpoint: '/api/user/log_meal',
          method: 'POST',
          userId: '',
          payload: { name: 'Test Food' },
        })
      ).rejects.toThrow(/userId is required/);
    });
  });

  describe('2. Bounded Exponential Backoff & Jitter', () => {
    it('calculates deterministic exponential backoff bounded within [1s, 30.5s]', () => {
      const delay0 = calculateBackoffDelayMs(0);
      const delay1 = calculateBackoffDelayMs(1);
      const delay2 = calculateBackoffDelayMs(2);
      const delay5 = calculateBackoffDelayMs(5);

      expect(delay0).toBeGreaterThanOrEqual(1000);
      expect(delay0).toBeLessThanOrEqual(1500);

      expect(delay1).toBeGreaterThanOrEqual(2000);
      expect(delay1).toBeLessThanOrEqual(2500);

      expect(delay2).toBeGreaterThanOrEqual(4000);
      expect(delay2).toBeLessThanOrEqual(4500);

      // Capped at 30s + 500ms max jitter
      expect(delay5).toBeGreaterThanOrEqual(30000);
      expect(delay5).toBeLessThanOrEqual(30500);
    });
  });

  describe('3. HTTP Error Classification & Status Transitions', () => {
    it('removes mutation from SQLite queue on HTTP 200 OK', async () => {
      await enqueueMutation({
        endpoint: '/api/user/log_meal',
        method: 'POST',
        userId: 'test_user_uid_123',
        payload: { name: 'Paneer Butter Masala' },
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok', message: 'Meal logged' }),
      } as unknown as Response);

      const result = await processQueue('test_user_uid_123');
      expect(result.synced).toBe(1);
      expect(result.failed).toBe(0);
      expect(mockQueueRows.length).toBe(0); // Safely deleted on confirmation
    });

    it('handles idempotent 409 Conflict with "Already synced" as a confirmed success', async () => {
      await enqueueMutation({
        endpoint: '/api/user/log_meal',
        method: 'POST',
        userId: 'test_user_uid_123',
        payload: { name: 'Idli Sambar' },
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ status: 'ok', message: 'Already synced' }),
      } as unknown as Response);

      const result = await processQueue('test_user_uid_123');
      expect(result.synced).toBe(1);
      expect(mockQueueRows.length).toBe(0);
    });

    it('quarantines permanent client errors (HTTP 400 / 422) immediately without endless retries', async () => {
      await enqueueMutation({
        endpoint: '/api/user/log_meal',
        method: 'POST',
        userId: 'test_user_uid_123',
        payload: { invalid_field: true },
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ detail: 'Unprocessable Entity' }),
      } as unknown as Response);

      const result = await processQueue('test_user_uid_123');
      expect(result.quarantined).toBe(1);
      expect(mockQueueRows.length).toBe(1);
      expect(mockQueueRows[0].status).toBe('quarantined');
      expect(mockQueueRows[0].last_http_status).toBe(422);
    });

    it('pauses sync on HTTP 401 Unauthorized without quarantining the mutation', async () => {
      await enqueueMutation({
        endpoint: '/api/user/log_meal',
        method: 'POST',
        userId: 'test_user_uid_123',
        payload: { name: 'Poha' },
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ detail: 'Token expired' }),
      } as unknown as Response);

      const result = await processQueue('test_user_uid_123');
      expect(result.pausedForAuth).toBe(true);
      expect(mockQueueRows.length).toBe(1);
      expect(mockQueueRows[0].status).toBe('pending'); // Retained safely in pending
    });

    it('retries on HTTP 500 server error and respects retry budget', async () => {
      await enqueueMutation({
        endpoint: '/api/user/log_meal',
        method: 'POST',
        userId: 'test_user_uid_123',
        maxRetries: 2,
        payload: { name: 'Upma' },
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ detail: 'Internal Server Error' }),
      } as unknown as Response);

      // Attempt 1: 500 -> retry_count=1, remains pending
      const res1 = await processQueue('test_user_uid_123');
      expect(res1.failed).toBe(1);
      expect(mockQueueRows[0].status).toBe('pending');
      expect(mockQueueRows[0].retry_count).toBe(1);

      // Advance next_attempt_at to allow second attempt
      mockQueueRows[0].next_attempt_at = Date.now() - 100;

      // Attempt 2: 500 -> retry_count=2, reaches maxRetries=2 -> quarantined
      const res2 = await processQueue('test_user_uid_123');
      expect(res2.quarantined).toBe(1);
      expect(mockQueueRows[0].status).toBe('quarantined');
    });

    it('respects Retry-After header on HTTP 429 rate limit', async () => {
      await enqueueMutation({
        endpoint: '/api/user/log_meal',
        method: 'POST',
        userId: 'test_user_uid_123',
        payload: { name: 'Khichdi' },
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers({ 'Retry-After': '10' }),
        json: async () => ({ detail: 'Rate limit exceeded' }),
      } as unknown as Response);

      const now = Date.now();
      const res = await processQueue('test_user_uid_123');
      expect(res.failed).toBe(1);
      expect(mockQueueRows[0].status).toBe('pending');
      expect(mockQueueRows[0].next_attempt_at).toBeGreaterThanOrEqual(now + 9900);
    });
  });

  describe('4. Crash Recovery (Stale Processing Lease)', () => {
    it('recovers orphaned mutations stuck in "processing" state from a crashed session', async () => {
      const now = Date.now();
      mockQueueRows.push({
        id: 'crashed_mutation_001',
        user_id: 'test_user_uid_123',
        endpoint: '/api/user/log_meal',
        method: 'POST',
        payload_json: JSON.stringify({ name: 'Crashed Meal', client_sync_id: 'crashed_mutation_001' }),
        status: 'processing',
        retry_count: 0,
        max_retries: 5,
        next_attempt_at: now,
        last_error: null,
        last_http_status: null,
        created_at: now - 120000,
        updated_at: now - 120000,
        processing_started_at: now - 120000, // 2 minutes ago (stale lease > 60s)
        quarantine_reason: null,
      });

      const recovered = await recoverStaleProcessing();
      expect(recovered).toBe(1);
      expect(mockQueueRows[0].status).toBe('pending');
      expect(mockQueueRows[0].processing_started_at).toBeNull();
      expect(mockQueueRows[0].id).toBe('crashed_mutation_001'); // Never regenerates ID
    });
  });

  describe('5. Strict User Isolation Boundary', () => {
    it('never transmits User A mutations under User B session', async () => {
      // User A enqueues a mutation
      await enqueueMutation({
        endpoint: '/api/user/log_meal',
        method: 'POST',
        userId: 'user_A_uid',
        payload: { name: 'User A Secret Meal' },
      });

      // User B is active
      useAuthStore.setState({
        userId: 'user_B_uid',
        token: 'user_b_token',
      });

      globalThis.fetch = vi.fn();

      const result = await processQueue('user_B_uid');
      expect(result.processed).toBe(0);
      expect(globalThis.fetch).not.toHaveBeenCalled();

      // User A's row remains un-touched
      expect(mockQueueRows[0].status).toBe('pending');
      expect(mockQueueRows[0].user_id).toBe('user_A_uid');
    });

    it('isolates queue stats per user', async () => {
      await enqueueMutation({
        endpoint: '/api/user/log_meal',
        method: 'POST',
        userId: 'user_A',
        payload: { name: 'Meal 1' },
      });
      await enqueueMutation({
        endpoint: '/api/user/log_meal',
        method: 'POST',
        userId: 'user_B',
        payload: { name: 'Meal 2' },
      });

      const statsA = await getQueueStats('user_A');
      const statsB = await getQueueStats('user_B');

      expect(statsA.totalCount).toBe(1);
      expect(statsB.totalCount).toBe(1);
    });
  });

  describe('6. Diagnostics, Dead-Letter Inspection & Manual Management', () => {
    it('retries all quarantined mutations for a user', async () => {
      const item = await enqueueMutation({
        endpoint: '/api/user/log_meal',
        method: 'POST',
        userId: 'test_user_uid_123',
        payload: { name: 'Quarantined Food' },
      });

      await quarantineMutation(item.id, 'Manual quarantine for test');
      expect(mockQueueRows[0].status).toBe('quarantined');

      const count = await retryAllQuarantined('test_user_uid_123');
      expect(count).toBe(1);
      expect(mockQueueRows[0].status).toBe('pending');
      expect(mockQueueRows[0].retry_count).toBe(0);
      expect(mockQueueRows[0].quarantine_reason).toBeNull();
    });

    it('permanently deletes a mutation via removeMutation', async () => {
      const item = await enqueueMutation({
        endpoint: '/api/user/log_meal',
        method: 'POST',
        userId: 'test_user_uid_123',
        payload: { name: 'Discard Food' },
      });

      expect(mockQueueRows.length).toBe(1);
      await removeMutation(item.id);
      expect(mockQueueRows.length).toBe(0);
    });
  });
});
