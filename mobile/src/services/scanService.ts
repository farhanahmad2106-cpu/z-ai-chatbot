import { fetchWithAuth } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';

export interface ScanPayload {
  barcode?: string;
  image: Blob;
  metadata?: any;
}

export async function analyzeScan(payload: ScanPayload) {
  const formData = new FormData();
  if (payload.barcode) formData.append('barcode', payload.barcode);
  formData.append('image', payload.image as any);
  
  return fetchWithAuth(ENDPOINTS.SCAN_ANALYZE, {
    method: 'POST',
    body: formData,
  }).then(r => r.json());
}
