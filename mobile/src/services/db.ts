/**
 * Z-SeHealth Mobile Offline SQLite Database & Migration Engine
 *
 * Database: z_sehealth_mobile_offline.db
 * Provides durable-before-send mutation queue, schema migrations,
 * and offline caching for regional foods & user statistics.
 */

import * as SQLite from 'expo-sqlite';

export type SQLiteDatabase = SQLite.SQLiteDatabase;
export const DB_NAME = 'z_sehealth_mobile_offline.db';
export const CURRENT_SCHEMA_VERSION = 1;

export type MutationStatus = 'pending' | 'processing' | 'failed' | 'quarantined';
export type MutationMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface OfflineMutationRow {
  id: string; // client_sync_id (RFC 4122 UUID v4)
  user_id: string;
  endpoint: string;
  method: MutationMethod;
  payload_json: string;
  status: MutationStatus;
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

export interface OfflineFoodCacheRow {
  barcode: string;
  data_json: string;
  cached_at: number;
}

export interface OfflineUserStatsCacheRow {
  user_id: string;
  stats_json: string;
  updated_at: number;
}

let dbInstance: SQLite.SQLiteDatabase | null = null;
let dbInitPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Migration definition interface
 */
interface Migration {
  version: number;
  description: string;
  up: (db: SQLite.SQLiteDatabase) => Promise<void>;
}

/**
 * Initial fallback regional Indian foods seeded on database creation
 */
const REGIONAL_FALLBACK_FOODS = [
  {
    barcode: '8901030383853',
    name: 'Masala Oats - Homestyle',
    brand: 'Saffola',
    calories: 146,
    protein: 3.5,
    carbs: 24.5,
    fat: 3.8,
    ingredients: ['Rolled Oats', 'Spices & Condiments', 'Dehydrated Vegetables', 'Salt'],
    is_verified: true,
  },
  {
    barcode: '8901262010046',
    name: 'Amul Taaza Toned Milk',
    brand: 'Amul',
    calories: 58,
    protein: 3.0,
    carbs: 4.7,
    fat: 3.0,
    ingredients: ['Toned Milk', 'Vitamin A', 'Vitamin D'],
    is_verified: true,
  },
  {
    barcode: '8901725181222',
    name: 'Moong Dal (Yellow Split)',
    brand: 'Tata Sampann',
    calories: 348,
    protein: 24.0,
    carbs: 59.0,
    fat: 1.2,
    ingredients: ['Unpolished Yellow Moong Dal'],
    is_verified: true,
  },
  {
    barcode: '8901499008458',
    name: 'Idli Rava / Rice Rava',
    brand: 'MTR',
    calories: 350,
    protein: 7.0,
    carbs: 78.0,
    fat: 0.5,
    ingredients: ['Rice Semolina'],
    is_verified: true,
  },
  {
    barcode: '8901063012218',
    name: 'Paneer Fresh Block',
    brand: 'Mother Dairy',
    calories: 289,
    protein: 18.3,
    carbs: 2.5,
    fat: 22.8,
    ingredients: ['Pasteurised Milk', 'Citric Acid'],
    is_verified: true,
  },
];

/**
 * Schema migrations registry
 */
const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'Initial mutation queue, indexes, and offline cache tables',
    up: async (db) => {
      // 1. Mutation queue table
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS offline_mutation_queue (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          endpoint TEXT NOT NULL,
          method TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          status TEXT NOT NULL,
          retry_count INTEGER NOT NULL DEFAULT 0,
          max_retries INTEGER NOT NULL DEFAULT 5,
          next_attempt_at INTEGER NOT NULL,
          last_error TEXT,
          last_http_status INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          processing_started_at INTEGER,
          quarantine_reason TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_offline_status_attempt
        ON offline_mutation_queue(status, next_attempt_at);

        CREATE INDEX IF NOT EXISTS idx_offline_user_status
        ON offline_mutation_queue(user_id, status);

        CREATE INDEX IF NOT EXISTS idx_offline_created
        ON offline_mutation_queue(created_at);

        -- 2. Offline food & barcode cache table
        CREATE TABLE IF NOT EXISTS offline_food_cache (
          barcode TEXT PRIMARY KEY,
          data_json TEXT NOT NULL,
          cached_at INTEGER NOT NULL
        );

        -- 3. Offline user stats cache table
        CREATE TABLE IF NOT EXISTS offline_user_stats_cache (
          user_id TEXT PRIMARY KEY,
          stats_json TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);

      // 4. Seed regional fallback items
      const now = Date.now();
      for (const food of REGIONAL_FALLBACK_FOODS) {
        await db.runAsync(
          `INSERT OR IGNORE INTO offline_food_cache (barcode, data_json, cached_at) VALUES (?, ?, ?)`,
          [food.barcode, JSON.stringify(food), now]
        );
      }
    },
  },
];

/**
 * Initializes and returns the SQLite database instance with migrations applied.
 */
export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  if (dbInitPromise) {
    return dbInitPromise;
  }

  dbInitPromise = (async () => {
    try {
      const db = await SQLite.openDatabaseAsync(DB_NAME);

      // Create migration tracking table
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          description TEXT NOT NULL,
          applied_at INTEGER NOT NULL
        );
      `);

      // Read applied migrations
      const appliedRows = await db.getAllAsync<{ version: number }>(
        'SELECT version FROM schema_migrations ORDER BY version ASC'
      );
      const appliedVersions = new Set(appliedRows.map((r) => r.version));

      // Apply pending migrations transactionally
      for (const migration of MIGRATIONS) {
        if (!appliedVersions.has(migration.version)) {
          console.log(`[DB] Applying migration v${migration.version}: ${migration.description}`);
          await db.withTransactionAsync(async () => {
            await migration.up(db);
            await db.runAsync(
              'INSERT INTO schema_migrations (version, description, applied_at) VALUES (?, ?, ?)',
              [migration.version, migration.description, Date.now()]
            );
          });
        }
      }

      dbInstance = db;
      return db;
    } catch (err) {
      dbInitPromise = null;
      console.error('[DB] Database initialization / migration failed:', err);
      throw err;
    }
  })();

  return dbInitPromise;
}

/**
 * Closes and resets the active database connection (useful for tests and user reset).
 */
export async function closeDatabase(): Promise<void> {
  if (dbInstance) {
    try {
      await dbInstance.closeAsync();
    } catch (e) {
      console.warn('[DB] Error during close:', e);
    }
    dbInstance = null;
    dbInitPromise = null;
  }
}
