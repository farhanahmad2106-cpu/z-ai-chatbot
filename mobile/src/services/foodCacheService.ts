/**
 * Z-SeHealth Offline Food Cache & User Stats Cache Service
 */

import { getDatabase } from './db';
import { fetchWithAuth } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';

export interface CachedFoodItem {
  barcode?: string;
  name: string;
  brand?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  ingredients?: string[];
  is_verified?: boolean;
  additives?: Array<{ code: string; name: string; risk?: string }>;
}

export interface CachedUserStats {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  last_updated: string;
}

/**
 * Retrieves a food item by barcode from the local SQLite cache.
 */
export async function getCachedFoodByBarcode(barcode: string): Promise<CachedFoodItem | null> {
  if (!barcode) return null;
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ data_json: string }>(
      `SELECT data_json FROM offline_food_cache WHERE barcode = ?`,
      [barcode.trim()]
    );

    if (row && row.data_json) {
      return JSON.parse(row.data_json) as CachedFoodItem;
    }
  } catch (err) {
    console.warn('[FoodCacheService] Cache read error for barcode:', barcode, err);
  }
  return null;
}

/**
 * Saves or updates a food item in the local SQLite cache.
 */
export async function setCachedFood(barcode: string, data: CachedFoodItem): Promise<void> {
  if (!barcode) return;
  try {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT OR REPLACE INTO offline_food_cache (barcode, data_json, cached_at)
       VALUES (?, ?, ?)`,
      [barcode.trim(), JSON.stringify(data), Date.now()]
    );
  } catch (err) {
    console.warn('[FoodCacheService] Cache write error for barcode:', barcode, err);
  }
}

/**
 * Fetches food details by barcode with offline SQLite fallback.
 */
export async function getFoodByBarcodeWithFallback(barcode: string): Promise<CachedFoodItem | null> {
  const normalizedBarcode = barcode.trim();
  
  // 1. Check local cache first
  const cached = await getCachedFoodByBarcode(normalizedBarcode);

  // 2. Attempt online network fetch
  try {
    const response = await fetchWithAuth(ENDPOINTS.BARCODE_LOOKUP(normalizedBarcode));
    if (response.ok) {
      const data = await response.json();
      if (data && (data.name || data.product_name)) {
        const item: CachedFoodItem = {
          barcode: normalizedBarcode,
          name: data.name || data.product_name || 'Scanned Food',
          brand: data.brand || data.brands || '',
          calories: Number(data.calories || data.nutriments?.['energy-kcal_100g'] || 0),
          protein: Number(data.protein || data.nutriments?.proteins_100g || 0),
          carbs: Number(data.carbs || data.nutriments?.carbohydrates_100g || 0),
          fat: Number(data.fat || data.nutriments?.fat_100g || 0),
          ingredients: Array.isArray(data.ingredients)
            ? data.ingredients.map((i: unknown) => (typeof i === 'string' ? i : (i as { name: string })?.name || ''))
            : [],
          is_verified: data.is_verified ?? true,
          additives: data.additives || [],
        };

        // Cache the freshly fetched item
        await setCachedFood(normalizedBarcode, item);
        return item;
      }
    }
  } catch (err) {
    console.log('[FoodCacheService] Network lookup failed, relying on local cache:', err);
  }

  // 3. Return cached item if network failed or returned 404
  return cached;
}

/**
 * Gets cached daily user stats from local SQLite.
 */
export async function getCachedUserStats(userId: string): Promise<CachedUserStats | null> {
  if (!userId) return null;
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ stats_json: string }>(
      `SELECT stats_json FROM offline_user_stats_cache WHERE user_id = ?`,
      [userId]
    );
    if (row && row.stats_json) {
      return JSON.parse(row.stats_json) as CachedUserStats;
    }
  } catch (err) {
    console.warn('[FoodCacheService] Error reading user stats cache:', err);
  }
  return null;
}

/**
 * Sets cached daily user stats in local SQLite.
 */
export async function setCachedUserStats(userId: string, stats: CachedUserStats): Promise<void> {
  if (!userId) return;
  try {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT OR REPLACE INTO offline_user_stats_cache (user_id, stats_json, updated_at)
       VALUES (?, ?, ?)`,
      [userId, JSON.stringify(stats), Date.now()]
    );
  } catch (err) {
    console.warn('[FoodCacheService] Error writing user stats cache:', err);
  }
}
