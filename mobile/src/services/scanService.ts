/**
 * Z-SeHealth Scan & OCR Service
 */

import { fetchWithAuth } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';

export interface ScanAnalysisResult {
  product_name?: string;
  brand?: string;
  ingredients?: Array<{ name: string; is_allergen?: boolean; category?: string }>;
  additives?: Array<{
    code: string;
    name: string;
    fssai_regulatory_status?: string;
    zsehealth_risk_tier?: string;
    is_fssai_approved?: boolean;
    penalty_points?: number;
    regulatory_conditions?: string;
    risk?: string;
  }>;
  safety_score?: number;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  allergens?: string[];
  is_verified?: boolean;
  status?: string;
  detail?: string;
}

export interface AnalyzeScanOptions {
  imageUri: string;
  barcode?: string;
}

/**
 * Dispatches a back-of-pack captured photo to POST /api/scan/analyze as multipart form-data.
 */
export async function analyzeBackOfPack(options: AnalyzeScanOptions): Promise<ScanAnalysisResult> {
  const formData = new FormData();

  if (options.barcode && options.barcode.trim()) {
    formData.append('barcode', options.barcode.trim());
  }

  const filename = options.imageUri.split('/').pop() || 'scan.jpg';
  const match = /\.(\w+)$/.exec(filename);
  const type = match ? `image/${match[1].toLowerCase() === 'jpg' ? 'jpeg' : match[1].toLowerCase()}` : 'image/jpeg';

  // React Native multipart file object convention
  formData.append('image', {
    uri: options.imageUri,
    name: filename,
    type,
  } as unknown as Blob);

  const response = await fetchWithAuth(ENDPOINTS.SCAN_ANALYZE, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    let errorDetail = `Scan analysis failed with status ${response.status}`;
    try {
      const errorBody = await response.json();
      if (errorBody && errorBody.detail) {
        errorDetail = typeof errorBody.detail === 'string' ? errorBody.detail : JSON.stringify(errorBody.detail);
      }
    } catch {
      // ignore
    }
    throw new Error(errorDetail);
  }

  return response.json();
}
