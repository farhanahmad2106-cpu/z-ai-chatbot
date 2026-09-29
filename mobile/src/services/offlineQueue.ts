/**
 * Z-SeHealth Authoritative Mobile Offline Sync Engine & Mutation Queue
 *
 * Guarantees:
 * - Durable-before-send (transactional SQLite persistence before network dispatch)
 * - RFC 4122 UUID v4 Idempotency (stable across retries, re-auth, restart)
 * - Explicit State Machine (pending -> processing -> success/retry/quarantined)
 * - Automatic Crash Recovery (stale processing lease recovery)
 * - Strict Firebase User Isolation (prevents cross-account mutation replay)
 * - Bounded Exponential Backoff with Jitter
 * - HTTP Status Classification (2xx/409, 401, 400/422, 403, 429, 5xx, Network)
 * - Concurrency Lock (single active replay worker per session)
 * - Credential Security (Zero token storage in SQLite or logs)
 */

import { getDatabase, OfflineMutationRow, MutationStatus, MutationMethod, SQLiteDatabase } from './db';
import { API_BASE_URL } from '../api/client';
import { useAuthStore } from '../stores/useAuthStore';

export const MAX_RETRIES_DEFAULT = 5;
export const STALE_PROCESSING_LEASE_MS = 60000; // 60s lease for processing lock
export const MAX_PAYLOAD_SIZE_BYTES = 1024 * 1024; // 1 MB safety ceiling

export interface EnqueueMutationRequest {
  endpoint: string;
  method: MutationMethod;
  payload: Record<string, unknown>;
  userId: string;
  maxRetries?: number;
}

export interface QueueStats {
  pendingCount: number;
  processingCount: number;
  failedCount: number;
  quarantinedCount: number;
  totalCount: number;
}

export interface ProcessQueueResult {
  processed: number;
  synced: number;
  failed: number;
  quarantined: number;
  pausedForAuth: boolean;
}

let isProcessingQueue = false;

/**
 * Generates an RFC 4122 UUID v4 identifier.
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Computes bounded exponential backoff with random jitter.
 */
export function calculateBackoffDelayMs(retryCount: number): number {
  const baseMs = 1000; // 1s
  const maxMs = 30000; // 30s
  const exponential = Math.min(maxMs, baseMs * Math.pow(2, Math.max(0, retryCount)));
  const jitter = Math.random() * 500; // 0..500ms jitter
  return Math.round(exponential + jitter);
}

/**
 * Validates and serializes a JSON payload safely.
 */
export function serializePayload(payload: Record<string, unknown>): string {
  try {
    const serialized = JSON.stringify(payload);
    if (new Blob([serialized]).size > MAX_PAYLOAD_SIZE_BYTES) {
      throw new Error(`Payload exceeds maximum size of ${MAX_PAYLOAD_SIZE_BYTES} bytes`);
    }
    return serialized;
  } catch (err) {
    throw new Error(`Payload serialization failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Recovers stale mutations stuck in 'processing' state following an app termination or crash.
 */
export async function recoverStaleProcessing(): Promise<number> {
  const db = await getDatabase();
  const threshold = Date.now() - STALE_PROCESSING_LEASE_MS;

  const result = await db.runAsync(
    `UPDATE offline_mutation_queue
     SET status = 'pending',
         processing_started_at = NULL,
         updated_at = ?
     WHERE status = 'processing'
       AND (processing_started_at IS NULL OR processing_started_at < ?)`,
    [Date.now(), threshold]
  );

  if (result.changes > 0) {
    console.log(`[OFFLINE_QUEUE] QUEUE_RECOVERED_STALE_PROCESSING count=${result.changes}`);
  }
  return result.changes;
}

/**
 * Enqueues a mutation into SQLite with durable-before-send guarantee.
 * Assigns an immutable RFC 4122 UUID v4 client_sync_id.
 */
export async function enqueueMutation(request: EnqueueMutationRequest): Promise<OfflineMutationRow> {
  if (!request.userId || !request.userId.trim()) {
    throw new Error('[OFFLINE_QUEUE] Mutation rejected: userId is required for user isolation.');
  }
  if (!request.endpoint || !request.endpoint.startsWith('/')) {
    throw new Error('[OFFLINE_QUEUE] Mutation rejected: endpoint must be an absolute path starting with /');
  }

  const id = generateUUID();
  const now = Date.now();

  // Inject client_sync_id into payload if not already present
  const enrichedPayload = {
    ...request.payload,
    client_sync_id: request.payload.client_sync_id || id,
  };

  const payloadJson = serializePayload(enrichedPayload);
  const maxRetries = request.maxRetries ?? MAX_RETRIES_DEFAULT;

  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO offline_mutation_queue (
      id, user_id, endpoint, method, payload_json, status,
      retry_count, max_retries, next_attempt_at, last_error,
      last_http_status, created_at, updated_at, processing_started_at, quarantine_reason
    ) VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?, NULL, NULL, ?, ?, NULL, NULL)`,
    [id, request.userId.trim(), request.endpoint, request.method, payloadJson, maxRetries, now, now, now]
  );

  console.log(`[OFFLINE_QUEUE] QUEUE_ENQUEUED id=${id} endpoint=${request.endpoint} user_id=${request.userId}`);

  const row: OfflineMutationRow = {
    id,
    user_id: request.userId.trim(),
    endpoint: request.endpoint,
    method: request.method,
    payload_json: payloadJson,
    status: 'pending',
    retry_count: 0,
    max_retries: maxRetries,
    next_attempt_at: now,
    last_error: null,
    last_http_status: null,
    created_at: now,
    updated_at: now,
    processing_started_at: null,
    quarantine_reason: null,
  };

  return row;
}

/**
 * Drains the offline mutation queue sequentially for the authenticated user.
 */
export async function processQueue(forcedUserId?: string): Promise<ProcessQueueResult> {
  if (isProcessingQueue) {
    return { processed: 0, synced: 0, failed: 0, quarantined: 0, pausedForAuth: false };
  }

  isProcessingQueue = true;
  let processed = 0;
  let synced = 0;
  let failed = 0;
  let quarantined = 0;
  let pausedForAuth = false;

  try {
    const db = await getDatabase();

    // 1. Recover stale processing rows from previous crashed sessions
    await recoverStaleProcessing();

    // 2. Resolve current authenticated user
    const currentUserId = forcedUserId || useAuthStore.getState().userId;
    if (!currentUserId) {
      console.log('[OFFLINE_QUEUE] QUEUE_AUTH_PAUSED: No authenticated user session active.');
      return { processed: 0, synced: 0, failed: 0, quarantined: 0, pausedForAuth: true };
    }

    const now = Date.now();

    // 3. Query eligible pending/retryable items for current user (FIFO order)
    const eligibleRows = await db.getAllAsync<OfflineMutationRow>(
      `SELECT * FROM offline_mutation_queue
       WHERE user_id = ?
         AND status IN ('pending', 'failed')
         AND next_attempt_at <= ?
       ORDER BY created_at ASC
       LIMIT 50`,
      [currentUserId, now]
    );

    if (eligibleRows.length === 0) {
      return { processed: 0, synced: 0, failed: 0, quarantined: 0, pausedForAuth: false };
    }

    console.log(`[OFFLINE_QUEUE] QUEUE_PROCESS_START count=${eligibleRows.length} user_id=${currentUserId}`);

    for (const item of eligibleRows) {
      // Re-verify user isolation on each row
      if (item.user_id !== currentUserId) {
        console.warn(`[OFFLINE_QUEUE] User boundary violation skipped: item.user_id=${item.user_id} != active=${currentUserId}`);
        continue;
      }

      // Mark row as processing with lease timestamp
      const processingTime = Date.now();
      await db.runAsync(
        `UPDATE offline_mutation_queue
         SET status = 'processing',
             processing_started_at = ?,
             updated_at = ?
         WHERE id = ? AND status IN ('pending', 'failed')`,
        [processingTime, processingTime, item.id]
      );

      console.log(`[OFFLINE_QUEUE] QUEUE_MUTATION_PROCESSING id=${item.id} endpoint=${item.endpoint}`);
      processed++;

      // Retrieve fresh auth token dynamically
      const token = useAuthStore.getState().token;
      if (!token) {
        console.log(`[OFFLINE_QUEUE] QUEUE_AUTH_PAUSED: Token unavailable during processing id=${item.id}`);
        await db.runAsync(
          `UPDATE offline_mutation_queue
           SET status = 'pending',
               processing_started_at = NULL,
               updated_at = ?
           WHERE id = ?`,
          [Date.now(), item.id]
        );
        pausedForAuth = true;
        break;
      }

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Idempotency-Key': item.id,
        };

        const response = await fetch(`${API_BASE_URL}${item.endpoint}`, {
          method: item.method,
          headers,
          body: item.payload_json,
        });

        const status = response.status;

        if (response.ok || status === 200 || status === 201 || status === 202 || status === 204) {
          // Success: Remove from queue
          await db.runAsync(`DELETE FROM offline_mutation_queue WHERE id = ?`, [item.id]);
          console.log(`[OFFLINE_QUEUE] QUEUE_MUTATION_SUCCESS id=${item.id} status=${status}`);
          synced++;
        } else if (status === 409) {
          // Conflict check: If already synced idempotently, treat as success
          let isAlreadySynced = false;
          try {
            const body = await response.json();
            if (body && (body.message === 'Already synced' || body.status === 'ok')) {
              isAlreadySynced = true;
            }
          } catch {
            // ignore parse failure
          }

          if (isAlreadySynced) {
            await db.runAsync(`DELETE FROM offline_mutation_queue WHERE id = ?`, [item.id]);
            console.log(`[OFFLINE_QUEUE] QUEUE_MUTATION_SUCCESS (Idempotent 409) id=${item.id}`);
            synced++;
          } else {
            // Unhandled conflict: Quarantine
            await quarantineMutationInternal(db, item.id, 'HTTP 409 Conflict', status);
            quarantined++;
          }
        } else if (status === 401) {
          // Auth failed: Pause queue without quarantining
          console.warn(`[OFFLINE_QUEUE] QUEUE_AUTH_PAUSED (401 Unauthorized) id=${item.id}`);
          await db.runAsync(
            `UPDATE offline_mutation_queue
             SET status = 'pending',
                 processing_started_at = NULL,
                 last_error = 'Authentication token expired (401)',
                 last_http_status = 401,
                 updated_at = ?
             WHERE id = ?`,
            [Date.now(), item.id]
          );
          pausedForAuth = true;
          break;
        } else if (status === 400 || status === 422) {
          // Permanent validation error: Quarantine immediately
          const errorMsg = `Permanent client validation error (${status})`;
          await quarantineMutationInternal(db, item.id, errorMsg, status);
          quarantined++;
        } else if (status === 403) {
          // Forbidden: Quarantine
          const errorMsg = `Permanent authorization error (403)`;
          await quarantineMutationInternal(db, item.id, errorMsg, status);
          quarantined++;
        } else if (status === 429) {
          // Rate limit: Respect Retry-After or backoff
          const nextRetry = item.retry_count + 1;
          let delayMs = calculateBackoffDelayMs(nextRetry);
          const retryAfter = response.headers.get('Retry-After');
          if (retryAfter) {
            const parsed = parseInt(retryAfter, 10);
            if (!isNaN(parsed) && parsed > 0) {
              delayMs = parsed * 1000;
            }
          }
          const wasQuarantined = await scheduleRetryInternal(db, item, nextRetry, `Rate limited (429)`, status, delayMs);
          if (wasQuarantined) quarantined++; else failed++;
        } else {
          // 5xx Server error or other transient error: Schedule retry
          const nextRetry = item.retry_count + 1;
          const delayMs = calculateBackoffDelayMs(nextRetry);
          const wasQuarantined = await scheduleRetryInternal(db, item, nextRetry, `Server error (${status})`, status, delayMs);
          if (wasQuarantined) quarantined++; else failed++;
        }
      } catch (networkErr) {
        // Transport error / offline network drop
        const errMsg = networkErr instanceof Error ? networkErr.message : 'Network transport failure';
        const nextRetry = item.retry_count + 1;
        const delayMs = calculateBackoffDelayMs(nextRetry);
        const wasQuarantined = await scheduleRetryInternal(db, item, nextRetry, errMsg, null, delayMs);
        if (wasQuarantined) quarantined++; else failed++;
        console.log(`[OFFLINE_QUEUE] QUEUE_NETWORK_PAUSED id=${item.id} err=${errMsg}`);
        break; // Stop loop on transport failure
      }
    }
  } catch (err) {
    console.error('[OFFLINE_QUEUE] Unexpected error in queue processor:', err);
  } finally {
    isProcessingQueue = false;
    console.log(`[OFFLINE_QUEUE] QUEUE_PROCESS_COMPLETE synced=${synced} failed=${failed} quarantined=${quarantined}`);
  }

  return { processed, synced, failed, quarantined, pausedForAuth };
}

/**
 * Internal helper to schedule retry with exponential backoff or quarantine if budget exhausted.
 */
async function scheduleRetryInternal(
  db: SQLiteDatabase,
  item: OfflineMutationRow,
  nextRetryCount: number,
  errorMessage: string,
  httpStatus: number | null,
  delayMs: number
): Promise<boolean> {
  const now = Date.now();
  if (nextRetryCount >= item.max_retries) {
    await quarantineMutationInternal(
      db,
      item.id,
      `Max retry budget (${item.max_retries}) exhausted: ${errorMessage}`,
      httpStatus
    );
    return true;
  } else {
    const nextAttemptAt = now + delayMs;
    await db.runAsync(
      `UPDATE offline_mutation_queue
       SET status = 'pending',
           retry_count = ?,
           next_attempt_at = ?,
           last_error = ?,
           last_http_status = ?,
           processing_started_at = NULL,
           updated_at = ?
       WHERE id = ?`,
      [nextRetryCount, nextAttemptAt, errorMessage, httpStatus, now, item.id]
    );
    console.log(`[OFFLINE_QUEUE] QUEUE_MUTATION_RETRY id=${item.id} attempt=${nextRetryCount}/${item.max_retries} next_in=${delayMs}ms`);
    return false;
  }
}

/**
 * Internal helper to quarantine a permanently failed mutation.
 */
async function quarantineMutationInternal(
  db: SQLiteDatabase,
  id: string,
  reason: string,
  httpStatus: number | null
): Promise<void> {
  const now = Date.now();
  await db.runAsync(
    `UPDATE offline_mutation_queue
     SET status = 'quarantined',
         quarantine_reason = ?,
         last_error = ?,
         last_http_status = ?,
         processing_started_at = NULL,
         updated_at = ?
     WHERE id = ?`,
    [reason, reason, httpStatus, now, id]
  );
  console.log(`[OFFLINE_QUEUE] QUEUE_MUTATION_QUARANTINED id=${id} reason="${reason}" http_status=${httpStatus}`);
}

/**
 * Manually retries a specific mutation or all failed items.
 */
export async function retryMutation(id: string): Promise<boolean> {
  const db = await getDatabase();
  const now = Date.now();
  const result = await db.runAsync(
    `UPDATE offline_mutation_queue
     SET status = 'pending',
         next_attempt_at = ?,
         processing_started_at = NULL,
         updated_at = ?
     WHERE id = ?`,
    [now, now, id]
  );
  return result.changes > 0;
}

/**
 * Quarantines an individual mutation explicitly.
 */
export async function quarantineMutation(id: string, reason: string): Promise<boolean> {
  const db = await getDatabase();
  const now = Date.now();
  const result = await db.runAsync(
    `UPDATE offline_mutation_queue
     SET status = 'quarantined',
         quarantine_reason = ?,
         processing_started_at = NULL,
         updated_at = ?
     WHERE id = ?`,
    [reason, now, id]
  );
  return result.changes > 0;
}

/**
 * Permanently removes a mutation from the queue.
 */
export async function removeMutation(id: string): Promise<boolean> {
  const db = await getDatabase();
  const result = await db.runAsync(`DELETE FROM offline_mutation_queue WHERE id = ?`, [id]);
  return result.changes > 0;
}

/**
 * Retrieves aggregate queue statistics for the given user.
 */
export async function getQueueStats(userId: string): Promise<QueueStats> {
  if (!userId) {
    return { pendingCount: 0, processingCount: 0, failedCount: 0, quarantinedCount: 0, totalCount: 0 };
  }

  const db = await getDatabase();
  const rows = await db.getAllAsync<{ status: MutationStatus; count: number }>(
    `SELECT status, COUNT(*) as count FROM offline_mutation_queue
     WHERE user_id = ?
     GROUP BY status`,
    [userId]
  );

  let pendingCount = 0;
  let processingCount = 0;
  let failedCount = 0;
  let quarantinedCount = 0;

  for (const row of rows) {
    if (row.status === 'pending') pendingCount += row.count;
    else if (row.status === 'processing') processingCount += row.count;
    else if (row.status === 'failed') failedCount += row.count;
    else if (row.status === 'quarantined') quarantinedCount += row.count;
  }

  return {
    pendingCount,
    processingCount,
    failedCount,
    quarantinedCount,
    totalCount: pendingCount + processingCount + failedCount + quarantinedCount,
  };
}

/**
 * Retrieves quarantined items for inspection in diagnostics UI.
 */
export async function getQuarantinedMutations(userId: string): Promise<OfflineMutationRow[]> {
  if (!userId) return [];
  const db = await getDatabase();
  return db.getAllAsync<OfflineMutationRow>(
    `SELECT * FROM offline_mutation_queue
     WHERE user_id = ? AND status = 'quarantined'
     ORDER BY created_at DESC`,
    [userId]
  );
}

/**
 * Resets quarantined items for a user back to pending status for manual retry.
 */
export async function retryAllQuarantined(userId: string): Promise<number> {
  if (!userId) return 0;
  const db = await getDatabase();
  const now = Date.now();
  const result = await db.runAsync(
    `UPDATE offline_mutation_queue
     SET status = 'pending',
         retry_count = 0,
         next_attempt_at = ?,
         quarantine_reason = NULL,
         updated_at = ?
     WHERE user_id = ? AND status = 'quarantined'`,
    [now, now, userId]
  );
  return result.changes;
}

/**
 * Clears the queue for a user upon logout or explicit user account wipe.
 */
export async function clearQueueForUser(userId: string): Promise<number> {
  if (!userId) return 0;
  const db = await getDatabase();
  const result = await db.runAsync(`DELETE FROM offline_mutation_queue WHERE user_id = ?`, [userId]);
  return result.changes;
}
